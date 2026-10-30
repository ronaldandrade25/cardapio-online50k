// Funções compartilhadas entre cardápio, acompanhamento e painel admin.

export const moeda = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const soDigitos = s => String(s || '').replace(/\D/g, '');

export function mascaraTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const hojeISO = (d = new Date()) => {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const dataBR = iso => (iso ? iso.split('-').reverse().join('/') : '');
export const horaBR = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const dataHoraBR = ms => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const inicioDoDia = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function tempoDesde(ms) {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h${String(min % 60).padStart(2, '0')}`;
}

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

/* ---------------- Pedidos ---------------- */
export const STATUS = {
  novo: { nome: 'Recebido', cor: 'info', icone: 'ti-receipt' },
  preparo: { nome: 'Em preparo', cor: 'warn', icone: 'ti-chef-hat' },
  pronto: { nome: 'Pronto', cor: 'ok', icone: 'ti-circle-check' },
  entrega: { nome: 'Saiu para entrega', cor: 'info', icone: 'ti-motorbike' },
  entregue: { nome: 'Finalizado', cor: 'ok', icone: 'ti-check' },
  cancelado: { nome: 'Cancelado', cor: 'danger', icone: 'ti-x' }
};
export const TIPOS = { delivery: 'Delivery', retirada: 'Retirada', mesa: 'Mesa' };
export const PAGAMENTOS = {
  dinheiro: 'Dinheiro',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  pix: 'Pix',
  vale: 'Vale-refeição'
};

/** Sequência de status de acordo com o tipo de pedido */
export function fluxoStatus(tipo) {
  if (tipo === 'delivery') return ['novo', 'preparo', 'entrega', 'entregue'];
  return ['novo', 'preparo', 'pronto', 'entregue'];
}

/* ---------------- Loja: horário automático ---------------- */
export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const minutos = hhmm => { const [h, m] = (hhmm || '00:00').split(':').map(Number); return h * 60 + m; };

/** Retorna { aberto, texto } considerando horários (inclusive que viram a madrugada) e pausa manual. */
export function statusLoja(cfg, agora = new Date()) {
  if (!cfg) return { aberto: false, texto: '' };
  if (cfg.pausado) return { aberto: false, texto: cfg.mensagemPausa || 'Fechado no momento' };
  const h = cfg.horarios || {};
  const dia = agora.getDay();
  const ontem = (dia + 6) % 7;
  const m = agora.getHours() * 60 + agora.getMinutes();

  const hoje = h[dia];
  if (hoje?.ativo) {
    const a = minutos(hoje.abre), f = minutos(hoje.fecha);
    if (a < f ? m >= a && m < f : m >= a) return { aberto: true, texto: `Aberto até ${hoje.fecha}` };
  }
  const ant = h[ontem];
  if (ant?.ativo && minutos(ant.fecha) <= minutos(ant.abre) && m < minutos(ant.fecha)) {
    return { aberto: true, texto: `Aberto até ${ant.fecha}` };
  }
  if (hoje?.ativo && m < minutos(hoje.abre)) return { aberto: false, texto: `Fechado · abre hoje às ${hoje.abre}` };
  for (let i = 1; i <= 7; i++) {
    const d = (dia + i) % 7;
    if (h[d]?.ativo) return { aberto: false, texto: `Fechado · abre ${i === 1 ? 'amanhã' : DIAS[d].toLowerCase()} às ${h[d].abre}` };
  }
  return { aberto: false, texto: 'Fechado' };
}

/* ---------------- Tema com as cores da marca ---------------- */
function luminancia(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function aplicarTema(tema = {}) {
  const root = document.documentElement;
  const pri = /^#[0-9a-f]{6}$/i.test(tema.primaria) ? tema.primaria : '#EA580C';
  const sec = /^#[0-9a-f]{6}$/i.test(tema.secundaria) ? tema.secundaria : '#1F2937';
  root.style.setProperty('--pri', pri);
  root.style.setProperty('--on-pri', luminancia(pri) > 0.45 ? '#111827' : '#ffffff');
  root.style.setProperty('--sec', sec);
  root.style.setProperty('--on-sec', luminancia(sec) > 0.45 ? '#111827' : '#ffffff');
  if (tema.fundo === 'escuro' || tema.fundo === 'claro') root.dataset.theme = tema.fundo;
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', pri);
}

/* ---------------- Interface: toast, modal, confirmação ---------------- */
export function toast(msg, tipo = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('sai'), 3200);
  setTimeout(() => t.remove(), 3600);
}

/** Abre um modal. Retorna { el, fechar }. */
export function modal(html, { classe = '', aoFechar } = {}) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal ${classe}" role="dialog" aria-modal="true">
    <button class="modal-x" aria-label="Fechar"><i class="ti ti-x"></i></button>${html}</div>`;
  document.body.appendChild(fundo);
  document.body.classList.add('sem-rolagem');
  requestAnimationFrame(() => fundo.classList.add('on'));
  const fechar = () => {
    fundo.classList.remove('on');
    document.removeEventListener('keydown', esc);
    setTimeout(() => {
      fundo.remove();
      if (!document.querySelector('.modal-fundo')) document.body.classList.remove('sem-rolagem');
    }, 200);
    aoFechar?.();
  };
  const esc = e => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc);
  fundo.addEventListener('click', e => { if (e.target === fundo) fechar(); });
  fundo.querySelector('.modal-x').onclick = fechar;
  return { el: fundo.querySelector('.modal'), fechar };
}

export function confirmar(msg, { ok = 'Confirmar', perigo = false } = {}) {
  return new Promise(res => {
    let resp = false;
    const m = modal(`<p class="confirma-txt">${esc(msg)}</p>
      <div class="linha-btns"><button class="btn" data-n>Cancelar</button>
      <button class="btn ${perigo ? 'btn-perigo' : 'btn-pri'}" data-s>${esc(ok)}</button></div>`,
    { classe: 'modal-p', aoFechar: () => res(resp) });
    m.el.querySelector('[data-n]').onclick = () => m.fechar();
    m.el.querySelector('[data-s]').onclick = () => { resp = true; m.fechar(); };
  });
}

/* ---------------- Imagens ---------------- */
/**
 * Reduz e comprime a imagem no navegador (WebP, máx. 800px).
 * O resultado (~30–80 KB) é salvo direto no Firestore, sem precisar do Firebase Storage
 * (que exige plano pago para projetos novos).
 */
export function comprimirImagem(file, max = 800, qualidade = 0.78) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      let url = c.toDataURL('image/webp', qualidade);
      if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', qualidade);
      res(url);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

/* ---------------- Som de alerta ---------------- */
let ctx;
export function bip(vezes = 3) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    for (let i = 0; i < vezes; i++) {
      const t = ctx.currentTime + i * 0.35;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(i % 2 ? 660 : 880, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.3);
    }
  } catch { /* navegador sem áudio */ }
}
export const somLiberado = () => ctx?.state === 'running';
export function liberarSom() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  return ctx.resume();
}

/* ---------------- PWA ---------------- */
export function registrarSW(caminho = '/sw.js') {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register(caminho).catch(() => {});
  }
}

/** Configuração padrão da loja (usada no 1º acesso e como fallback) */
export const CONFIG_PADRAO = {
  nome: 'Cardápio Online',
  slogan: 'Lanches artesanais feitos na hora',
  descricao: 'Peça online: lanches, porções, bebidas e sobremesas com entrega rápida.',
  logo: '',
  capa: '',
  telefone: '',
  whatsapp: '',
  endereco: '',
  instagram: '',
  tema: { primaria: '#EA580C', secundaria: '#1F2937', fundo: 'auto' },
  horarios: {
    0: { ativo: true, abre: '18:00', fecha: '23:30' },
    1: { ativo: false, abre: '18:00', fecha: '23:00' },
    2: { ativo: true, abre: '18:00', fecha: '23:00' },
    3: { ativo: true, abre: '18:00', fecha: '23:00' },
    4: { ativo: true, abre: '18:00', fecha: '23:00' },
    5: { ativo: true, abre: '18:00', fecha: '00:30' },
    6: { ativo: true, abre: '18:00', fecha: '00:30' }
  },
  pausado: false,
  mensagemPausa: '',
  entrega: { delivery: true, retirada: true, tempo: '30–45 min', tempoRetirada: '20 min', minimo: 20 },
  pagamentos: { dinheiro: true, credito: true, debito: true, pix: true, vale: false },
  fidelidade: { ativo: true, meta: 10, tipo: 'valor', valor: 20, descricao: 'R$ 20 de desconto' },
  upsell: { ativo: true, titulo: 'Que tal completar seu pedido?' },
  seo: { titulo: '', descricao: '', imagem: '' }
};

export function mesclarConfig(cfg) {
  const p = structuredClone(CONFIG_PADRAO);
  if (!cfg) return p;
  const out = { ...p, ...cfg };
  for (const k of ['tema', 'entrega', 'pagamentos', 'fidelidade', 'upsell', 'seo']) out[k] = { ...p[k], ...(cfg[k] || {}) };
  out.horarios = { ...p.horarios, ...(cfg.horarios || {}) };
  return out;
}
