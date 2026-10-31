// Painel administrativo: login, menu, rotas, dados compartilhados e alertas sonoros.
import { db, auth } from '../db.js';
import { DEMO } from '../config.js';
import { semear } from '../seed.js';
import { impressaoAutomatica, conectada, reconectar } from './impressora.js';
import { aplicarTema, mesclarConfig, statusLoja, bip, liberarSom, somLiberado, toast, esc, registrarSW } from '../utils.js';

const $ = s => document.querySelector(s);

/* ================= Estado compartilhado ================= */
export const store = { cfg: mesclarConfig(null), user: null, pedidos: [], mesas: [] };
const ouvintes = new Set();
/** Registra uma função chamada sempre que pedidos, mesas ou config mudam. Retorna função para cancelar. */
export function onStore(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
const emitir = () => ouvintes.forEach(fn => { try { fn(store); } catch (e) { console.error(e); } });

export const salvarConfig = dados => db.set('config', 'loja', dados, true);

/* ================= Rotas ================= */
const ROTAS = {
  dashboard: { nome: 'Dashboard', icone: 'ti-layout-dashboard', perfis: ['dono'], mod: () => import('./dashboard.js') },
  pedidos: { nome: 'Pedidos', icone: 'ti-receipt', perfis: ['dono', 'atendente'], mod: () => import('./pedidos.js'), cont: () => store.pedidos.filter(p => p.status === 'novo').length },
  mesas: { nome: 'Mesas e QR Code', icone: 'ti-armchair', perfis: ['dono', 'atendente'], mod: () => import('./mesas.js'), cont: () => store.mesas.filter(m => m.chamado).length },
  cardapio: { nome: 'Cardápio', icone: 'ti-tools-kitchen-2', perfis: ['dono', 'atendente'], mod: () => import('./cardapio.js') },
  cupons: { nome: 'Cupons', icone: 'ti-discount-2', perfis: ['dono'], mod: () => import('./cupons.js') },
  clientes: { nome: 'Clientes e fidelidade', icone: 'ti-heart-handshake', perfis: ['dono'], mod: () => import('./clientes.js') },
  financeiro: { nome: 'Financeiro', icone: 'ti-wallet', perfis: ['dono'], mod: () => import('./financeiro.js') },
  entrega: { nome: 'Entrega', icone: 'ti-motorbike', perfis: ['dono'], mod: () => import('./entrega.js') },
  loja: { nome: 'Configurações', icone: 'ti-settings', perfis: ['dono'], mod: () => import('./loja.js') }
};
export const ABAS_PAINEL = Object.entries(ROTAS).map(([k, r]) => [k, r.nome, r.perfis.includes('atendente')]);
// Dono vê tudo; atendente vê as abas liberadas no cadastro (sem lista, usa o padrão: Pedidos, Mesas e Cardápio)
const podeVer = (k, r) => store.user?.perfil === 'dono' || (Array.isArray(store.user?.abas) ? store.user.abas.includes(k) : r.perfis.includes(store.user?.perfil));
const permitidas = () => Object.entries(ROTAS).filter(([k, r]) => podeVer(k, r));

function renderMenu() {
  const atual = rotaAtual();
  $('#menu').innerHTML = permitidas().map(([k, r]) => `
    <a href="#/${k}" class="${k === atual ? 'on' : ''}"><i class="ti ${r.icone}"></i>${r.nome}<span class="cont">${r.cont?.() || ''}</span></a>`).join('');
}
const rotaAtual = () => {
  const r = location.hash.replace('#/', '').split('?')[0];
  const ok = permitidas().map(([k]) => k);
  return ok.includes(r) ? r : ok[0];
};

let limpar = null;
async function navegar() {
  const k = rotaAtual();
  const r = ROTAS[k];
  limpar?.();
  limpar = null;
  $('#titulo-sec').textContent = r.nome;
  renderMenu();
  $('#app').classList.remove('menu-aberto');
  const el = $('#conteudo');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const mod = await r.mod();
    if (rotaAtual() !== k) return;
    el.innerHTML = '';
    limpar = mod.render(el) || null;
  } catch (e) {
    console.error(e);
    el.innerHTML = '<div class="vazio"><i class="ti ti-alert-triangle"></i>Não foi possível carregar esta seção.</div>';
  }
  window.scrollTo(0, 0);
}

/* ================= Alertas: som + notificação ================= */
let somAtivo = localStorage.getItem('co_som') === '1';
const vistos = new Set();
let primeiraCarga = true;

function atualizarBtnSom() {
  const b = $('#btn-som');
  const on = somAtivo && somLiberado();
  b.classList.toggle('on', on);
  b.innerHTML = on ? '<i class="ti ti-volume"></i><span>Som ativo</span>' : '<i class="ti ti-volume-off"></i><span>Ativar som</span>';
}

function notificar(titulo, corpo) {
  if (somAtivo) bip(3);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(titulo, { body: corpo, icon: '/assets/icon-192.png', tag: titulo }); } catch { /* sem suporte */ }
  }
}

/** Cadastra o cliente assim que o pedido chega (não depende de finalizar). Contagem de pedidos/gasto continua ao finalizar. */
const clientesRegistrados = new Set();
function cadastrarClientes() {
  const feitos = new Set();
  for (const p of store.pedidos) { // do mais recente para o mais antigo
    const tel = p.cliente?.telefone;
    if (!tel || feitos.has(tel)) continue;
    feitos.add(tel);
    if (clientesRegistrados.has(p.id)) continue;
    clientesRegistrados.add(p.id);
    db.set('clientes', tel, {
      nome: p.cliente.nome, telefone: tel, ultimoPedido: p.criadoEm, ...(p.endereco ? { endereco: p.endereco } : {})
    }, true).catch(e => { clientesRegistrados.delete(p.id); console.error('Falha ao cadastrar cliente', e); });
  }
}

function verificarNovidades() {
  cadastrarClientes();
  const novos = store.pedidos.filter(p => p.status === 'novo');
  for (const p of novos) {
    if (!vistos.has(p.id)) {
      vistos.add(p.id);
      if (!primeiraCarga) {
        notificar(`Novo pedido #${p.numero}`, `${p.cliente?.nome || ''} · ${p.tipo === 'mesa' ? 'Mesa ' + p.mesa : p.tipo}`);
        toast(`Novo pedido #${p.numero}`);
        if (impressaoAutomatica() && conectada()) import('./acoes.js').then(m => m.imprimir(p));
      }
    }
  }
  primeiraCarga = false;
  const qtd = novos.length + store.mesas.filter(m => m.chamado).length;
  document.title = (qtd ? `(${qtd}) ` : '') + 'Painel — ' + store.cfg.nome;
}

// Repete o alerta enquanto houver pedido não aceito ou mesa chamando
setInterval(() => {
  if (!somAtivo || !store.user) return;
  if (store.pedidos.some(p => p.status === 'novo') || store.mesas.some(m => m.chamado)) bip(2);
}, 8000);

/* ================= Loja aberta/pausada ================= */
function renderLojaToggle() {
  const st = statusLoja(store.cfg);
  const sw = $('#sw-loja');
  sw.checked = !store.cfg.pausado;
  $('#txt-loja').textContent = store.cfg.pausado ? 'Pausada' : st.aberto ? 'Aberta' : 'Fechada (horário)';
  $('#txt-loja').style.color = st.aberto ? 'var(--ok)' : 'var(--danger)';
}

/* ================= Início ================= */
let mesasAntes = {};
function iniciarPainel(u) {
  store.user = u;
  $('#tela-login').classList.add('oculto');
  $('#app').classList.remove('oculto');
  $('#lat-user').textContent = `${u.nome || u.email} · ${u.perfil === 'dono' ? 'Dono' : 'Atendente'}`;

  db.watchDoc('config', 'loja', d => {
    store.cfg = mesclarConfig(d);
    aplicarTema(store.cfg.tema);
    $('#lat-loja').textContent = store.cfg.nome;
    if (store.cfg.logo) { $('#lat-logo').style.backgroundImage = `url('${store.cfg.logo.replace(/["'()\s\\]/g, '')}')`; $('#lat-logo').innerHTML = ''; }
    renderLojaToggle();
    emitir();
  });
  db.watch('pedidos', { where: [['criadoEm', '>=', Date.now() - 2 * 86400e3]], orderBy: ['criadoEm', 'desc'] }, l => {
    store.pedidos = l;
    verificarNovidades();
    renderMenu();
    emitir();
  });
  db.watch('mesas', { orderBy: ['numero'] }, l => {
    for (const m of l) {
      if (m.chamado && mesasAntes[m.id] !== m.chamado && Object.keys(mesasAntes).length) {
        notificar(`Mesa ${m.numero}`, m.chamado === 'conta' ? 'Pediu a conta' : 'Chamou o garçom');
        toast(`Mesa ${m.numero}: ${m.chamado === 'conta' ? 'pediu a conta' : 'chamou o garçom'}`);
      }
    }
    mesasAntes = Object.fromEntries(l.map(m => [m.id, m.chamado || null]));
    store.mesas = l;
    verificarNovidades();
    renderMenu();
    emitir();
  });

  reconectar();
  window.addEventListener('hashchange', navegar);
  navegar();
  setInterval(renderLojaToggle, 60000);
}

function telaLogin(msg) {
  $('#app').classList.add('oculto');
  $('#tela-login').classList.remove('oculto');
  if (DEMO) $('#login-demo').classList.remove('oculto');
  if (msg) $('#login-erro').textContent = msg;
}

function configurarLogin() {
  const f = $('#form-login');
  $('#btn-esqueci').onclick = async () => {
    const email = f.email.value.trim();
    if (!email) { $('#login-erro').textContent = 'Digite seu e-mail para receber o link de redefinição.'; return; }
    try { await auth.redefinirSenha(email); toast('Enviamos um link para seu e-mail'); } catch { $('#login-erro').textContent = 'Não foi possível enviar o e-mail.'; }
  };
  f.onsubmit = async e => {
    e.preventDefault();
    $('#login-erro').textContent = '';
    const email = f.email.value.trim(), senha = f.senha.value;
    if (!email || senha.length < 6) { $('#login-erro').textContent = 'Informe e-mail e senha (mínimo 6 caracteres).'; return; }
    const b = $('#btn-login');
    b.disabled = true;
    try {
      await auth.login(email, senha);
    } catch (err) {
      const c = err.code || '';
      $('#login-erro').textContent =
        c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') ? 'E-mail ou senha incorretos.'
          : c.includes('too-many-requests') ? 'Muitas tentativas. Aguarde alguns minutos.'
            : err.message || 'Não foi possível entrar.';
    } finally { b.disabled = false; }
  };
}

/* Tela de abertura: some quando o login foi verificado (mínimo de 900 ms para o efeito aparecer; trava de 8 s) */
const t0 = Date.now();
function fecharSplash() {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('some')) return;
  setTimeout(() => { el.classList.add('some'); setTimeout(() => el.remove(), 600); }, Math.max(0, 900 - (Date.now() - t0)));
}
setTimeout(fecharSplash, 8000);

async function iniciar() {
  registrarSW();
  configurarLogin();
  if (DEMO) {
    document.body.insertAdjacentHTML('beforeend', '<div class="tag-demo">Modo demo</div>');
    if (!(await db.get('config', 'loja'))) await semear();
  }
  $('#btn-sair').onclick = () => auth.logout();
  $('#btn-menu').onclick = () => $('#app').classList.add('menu-aberto');
  $('#lat-fundo').onclick = () => $('#app').classList.remove('menu-aberto');
  $('#btn-som').onclick = async () => {
    if (somAtivo && somLiberado()) {
      somAtivo = false;
    } else {
      await liberarSom();
      somAtivo = true;
      bip(1);
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    }
    localStorage.setItem('co_som', somAtivo ? '1' : '0');
    atualizarBtnSom();
  };
  // O navegador só libera áudio após um clique: o primeiro clique em qualquer lugar reativa o som salvo
  document.addEventListener('click', async () => { if (somAtivo && !somLiberado()) { await liberarSom(); atualizarBtnSom(); } }, { once: true });
  atualizarBtnSom();

  $('#sw-loja').onchange = async e => {
    await salvarConfig({ pausado: !e.target.checked });
    toast(e.target.checked ? 'Loja reaberta (segue o horário de funcionamento)' : 'Loja pausada: novos pedidos bloqueados');
  };

  auth.onChange(u => {
    fecharSplash();
    if (!u) return telaLogin();
    if (u.semAcesso) {
      telaLogin('Sua conta não tem acesso ao painel. Peça ao dono para cadastrar você em Configurações › Equipe.');
      auth.logout();
      return;
    }
    iniciarPainel(u);
  });
}

iniciar();

