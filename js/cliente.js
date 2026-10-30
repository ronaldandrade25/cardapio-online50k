// Cardápio do cliente: catálogo, sacola, upsell, cupom, fidelidade, checkout,
// modo mesa (QR Code) e acompanhamento de pedidos em tempo real.
import { db } from './db.js';
import { DEMO } from './config.js';
import { semear } from './seed.js';
import {
  moeda, esc, soDigitos, mascaraTelefone, hojeISO, statusLoja, aplicarTema, mesclarConfig,
  toast, modal, registrarSW, STATUS, PAGAMENTOS, DIAS, fluxoStatus, debounce
} from './utils.js';

const $ = s => document.querySelector(s);
const E = {
  cfg: mesclarConfig(null),
  cats: [],
  prods: [],
  adic: {},
  bairros: [],
  busca: '',
  mesa: null,
  mesaDoc: null,
  sacola: [],
  cupom: null,
  carregado: { cats: false, prods: false }
};

/* ================= Utilidades locais ================= */
const precoAtual = p => (p.precoPromo && p.precoPromo < p.preco ? p.precoPromo : p.preco);
const urlSegura = u => String(u || '').replace(/["'()\\\s]/g, '');
const fotoHTML = (p, cls = '') => p.foto
  ? `<div class="foto ${cls}" style="background-image:url('${urlSegura(p.foto)}')" role="img" aria-label="${esc(p.nome)}"></div>`
  : `<div class="foto ${cls}" aria-hidden="true">${esc(p.emoji || '🍽️')}</div>`;
const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const r2 = v => Math.round(v * 100) / 100;
const lojaAberta = () => statusLoja(E.cfg).aberto;

function precoHTML(p) {
  if (p.precoPromo && p.precoPromo < p.preco) return `<s>${moeda(p.preco)}</s><span class="promo">${moeda(p.precoPromo)}</span>`;
  return moeda(p.preco);
}
function selosHTML(p) {
  const cor = { 'Mais vendido': 'pri', 'Promoção': 'ok', 'Novo': 'info', 'Picante': 'danger', 'Vegano': 'ok', 'Mais pedido': 'pri' };
  return (p.selos || []).length ? `<div class="selos">${p.selos.map(s => `<span class="badge badge-${cor[s] || 'warn'}">${esc(s)}</span>`).join('')}</div>` : '';
}

/* ================= Sacola (localStorage) ================= */
function carregarSacola() {
  try { E.sacola = JSON.parse(localStorage.getItem('co_sacola')) || []; } catch { E.sacola = []; }
  try { E.cupom = JSON.parse(localStorage.getItem('co_cupom')); } catch { E.cupom = null; }
}
function salvarSacola() {
  localStorage.setItem('co_sacola', JSON.stringify(E.sacola));
  localStorage.setItem('co_cupom', JSON.stringify(E.cupom));
  renderBarra();
}
const subtotal = () => r2(E.sacola.reduce((s, i) => s + i.preco * i.qtd, 0));
const qtdItens = () => E.sacola.reduce((s, i) => s + i.qtd, 0);

function adicionarItem(item) {
  const chave = item.produtoId + '|' + JSON.stringify(item.adicionais) + '|' + item.obs;
  const ex = E.sacola.find(i => i.chave === chave);
  if (ex) ex.qtd += item.qtd;
  else E.sacola.push({ ...item, chave });
  salvarSacola();
  const b = $('#barra-sacola');
  b.classList.remove('pula'); void b.offsetWidth; b.classList.add('pula');
}

function renderBarra() {
  const q = qtdItens();
  $('#barra-sacola').classList.toggle('oculto', q === 0);
  $('#bs-qtd').textContent = q;
  $('#bs-total').textContent = moeda(subtotal());
}

/* ================= Tela de abertura ================= */
// Some quando configuração, categorias e produtos chegaram (mínimo de 900 ms para o efeito aparecer; trava de 8 s).
const splash = { t0: Date.now(), falta: new Set(['cfg', 'cats', 'prods']) };
function fecharSplash() {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('some')) return;
  setTimeout(() => { el.classList.add('some'); setTimeout(() => el.remove(), 600); }, Math.max(0, 900 - (Date.now() - splash.t0)));
}
function splashPronto(parte) {
  splash.falta.delete(parte);
  if (!splash.falta.size) fecharSplash();
}
setTimeout(fecharSplash, 8000);

/* ================= Cabeçalho, rodapé, SEO ================= */
function renderLoja() {
  const c = E.cfg;
  aplicarTema(c.tema);
  $('#nome-loja').textContent = c.nome;
  $('#slogan').textContent = c.slogan || '';
  const logo = $('#logo');
  if (c.logo) { logo.style.backgroundImage = `url('${urlSegura(c.logo)}')`; logo.innerHTML = ''; }
  if (c.capa) {
    const capa = $('#capa'), src = urlSegura(c.capa);
    capa.style.backgroundImage = `url('${src}')`;
    // O banner assume a proporção da própria imagem (sem cortar), limitada pelo CSS
    const img = new Image();
    img.onload = () => { if (img.naturalWidth && img.naturalHeight) capa.style.setProperty('--capa-ratio', img.naturalWidth + ' / ' + img.naturalHeight); };
    img.src = src;
  }
  try { localStorage.setItem('co_splash', JSON.stringify({ pri: c.tema?.primaria, fundo: c.tema?.fundo, logo: c.logo && /^(https:|data:image)/.test(c.logo) ? c.logo : '' })); } catch { /* sem armazenamento */ }
  splashPronto('cfg');
  renderStatus();

  const ent = c.entrega;
  $('#meta-entrega').innerHTML = ent.delivery ? `<i class="ti ti-motorbike"></i>${esc(ent.tempo)}` : (ent.retirada ? '<i class="ti ti-building-store"></i>Somente retirada' : '');
  $('#meta-minimo').innerHTML = ent.delivery && ent.minimo ? `<i class="ti ti-receipt"></i>Mínimo ${moeda(ent.minimo)}` : '';

  const zap = soDigitos(c.whatsapp);
  $('#rodape').innerHTML = `
    <strong style="color:var(--txt)">${esc(c.nome)}</strong>
    ${c.endereco ? `<span><i class="ti ti-map-pin"></i>${esc(c.endereco)}</span>` : ''}
    ${c.telefone ? `<a href="tel:${soDigitos(c.telefone)}"><i class="ti ti-phone"></i>${esc(c.telefone)}</a>` : ''}
    ${zap ? `<a href="https://wa.me/55${zap}" target="_blank" rel="noopener"><i class="ti ti-brand-whatsapp"></i>WhatsApp</a>` : ''}
    ${c.instagram ? `<a href="https://instagram.com/${esc(c.instagram.replace('@', ''))}" target="_blank" rel="noopener"><i class="ti ti-brand-instagram"></i>${esc(c.instagram)}</a>` : ''}
    <small style="color:var(--txt3)">Cardápio Online · Peça pelo app, rápido e sem complicação.</small>`;
  atualizarSEO();
}

function renderStatus() {
  const st = statusLoja(E.cfg);
  const b = $('#status-loja');
  b.className = `badge ${st.aberto ? 'badge-ok' : 'badge-danger'}`;
  b.innerHTML = `<i class="ti ti-point-filled"></i>${esc(st.texto)}`;
}

function setMeta(sel, attr, val) {
  const el = document.querySelector(sel);
  if (el && val) el.setAttribute(attr, val);
}
function atualizarSEO(produto) {
  const c = E.cfg;
  const titulo = produto ? `${produto.nome} — ${c.nome}` : (c.seo.titulo || `${c.nome} — cardápio online`);
  const desc = produto ? (produto.descricao || c.descricao) : (c.seo.descricao || c.descricao);
  document.title = titulo;
  setMeta('meta[name="description"]', 'content', desc);
  setMeta('meta[property="og:title"]', 'content', titulo);
  setMeta('meta[property="og:description"]', 'content', desc);
  setMeta('meta[property="og:site_name"]', 'content', c.nome);
  setMeta('meta[property="og:url"]', 'content', location.href);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: c.nome,
    description: c.descricao,
    url: location.origin + '/',
    telephone: c.telefone || undefined,
    address: c.endereco || undefined,
    servesCuisine: 'Lanches',
    hasMenu: {
      '@type': 'Menu',
      hasMenuSection: E.cats.map(cat => ({
        '@type': 'MenuSection',
        name: cat.nome,
        hasMenuItem: E.prods.filter(p => p.categoriaId === cat.id).map(p => ({
          '@type': 'MenuItem', name: p.nome, description: p.descricao,
          offers: { '@type': 'Offer', price: precoAtual(p), priceCurrency: 'BRL' }
        }))
      }))
    }
  };
  $('#ld-json').textContent = JSON.stringify(ld);
}

/* ================= Cardápio ================= */
function renderCardapio() {
  if (!E.carregado.cats || !E.carregado.prods) return;
  const termo = normalizar(E.busca);
  const cats = E.cats.filter(c => c.ativo !== false);
  const visiveis = E.prods.filter(p => !termo || normalizar(p.nome + ' ' + p.descricao).includes(termo));

  // Destaques
  const dest = E.prods.filter(p => p.disponivel !== false && ((p.selos || []).some(s => ['Mais vendido', 'Promoção', 'Novo', 'Mais pedido'].includes(s)) || p.precoPromo));
  $('#destaques').classList.toggle('oculto', !!termo || dest.length === 0);
  $('#lista-destaques').innerHTML = dest.slice(0, 10).map(p => `
    <button class="dest" data-prod="${p.id}">
      ${fotoHTML(p)}
      <div class="dt">${selosHTML(p)}<strong>${esc(p.nome)}</strong><span class="preco">${precoHTML(p)}</span></div>
    </button>`).join('');

  const secoes = cats.map(c => {
    const ps = visiveis.filter(p => p.categoriaId === c.id);
    if (!ps.length) return '';
    return `<section aria-labelledby="cat-${c.id}">
      <h2 class="titulo-sec" id="cat-${c.id}">${esc(c.emoji || '')} ${esc(c.nome)}</h2>
      <div class="grade-prod">${ps.map(p => `
        <button class="prod ${p.disponivel === false ? 'esgotado' : ''}" data-prod="${p.id}">
          <div class="pt">
            ${selosHTML(p)}
            <h3>${esc(p.nome)}</h3>
            <p class="desc">${esc(p.descricao)}</p>
            <span class="preco">${p.disponivel === false ? '<span class="badge">Esgotado</span>' : precoHTML(p)}</span>
          </div>
          ${fotoHTML(p)}
        </button>`).join('')}</div>
    </section>`;
  }).join('');

  $('#secoes').innerHTML = secoes || `<div class="vazio"><i class="ti ti-search"></i>Nada encontrado para “${esc(E.busca)}”.</div>`;
  $('#cats').innerHTML = cats.filter(c => visiveis.some(p => p.categoriaId === c.id))
    .map(c => `<button class="cat" data-cat="${c.id}">${esc(c.nome)}</button>`).join('');
  observarSecoes();
  atualizarSEO();
}

let obs;
function observarSecoes() {
  obs?.disconnect();
  obs = new IntersectionObserver(ents => {
    ents.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id.replace('cat-', '');
        document.querySelectorAll('.cat').forEach(b => b.classList.toggle('on', b.dataset.cat === id));
        document.querySelector(`.cat[data-cat="${id}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
    });
  }, { rootMargin: '-140px 0px -60% 0px' });
  document.querySelectorAll('.titulo-sec[id^="cat-"]').forEach(h => obs.observe(h));
}

/* ================= Produto ================= */
function abrirProduto(id) {
  const p = E.prods.find(x => x.id === id);
  if (!p) return;
  const grupos = (p.adicionais || []).map(g => ({ id: g, ...E.adic[g] })).filter(g => g.nome);
  history.replaceState(null, '', `${location.pathname}?p=${id}`);
  atualizarSEO(p);
  const esgotado = p.disponivel === false;

  const m = modal(`
    ${fotoHTML(p, 'g')}
    <div class="mp-corpo">
      ${selosHTML(p)}
      <h2>${esc(p.nome)}</h2>
      <p class="mp-desc">${esc(p.descricao)}</p>
      <p class="preco" style="font-size:18px">${precoHTML(p)}</p>
      <div class="compart-prod">
        <button class="btn btn-s" data-comp><i class="ti ti-share"></i>Compartilhar</button>
      </div>
      ${grupos.map(g => `
        <div class="grupo" data-grupo="${g.id}" data-min="${g.min || 0}" data-max="${g.max || 0}">
          <div class="grupo-cab">
            <div><strong>${esc(g.nome)}</strong>
            <small>${g.min > 0 ? `Escolha ${g.min === g.max ? g.min : `de ${g.min} a ${g.max}`}` : g.max ? `Até ${g.max} ${g.max > 1 ? 'opções' : 'opção'}` : 'Opcional'}</small></div>
            ${g.min > 0 ? '<span class="badge badge-sec" style="background:var(--sec);color:var(--on-sec)">Obrigatório</span>' : ''}
          </div>
          ${(g.opcoes || []).map((o, i) => `
            <label class="adic">
              <span class="an">${esc(o.nome)}</span>
              ${o.preco ? `<span class="ap">+ ${moeda(o.preco)}</span>` : ''}
              <input type="${g.max === 1 ? 'radio' : 'checkbox'}" name="g_${g.id}" value="${i}">
            </label>`).join('')}
        </div>`).join('')}
      <label class="campo" style="margin-top:18px"><span>Alguma observação?</span>
        <textarea id="mp-obs" maxlength="140" placeholder="Ex.: sem cebola, maionese à parte"></textarea>
      </label>
    </div>
    <div class="mp-rodape">
      ${esgotado ? '<button class="btn btn-l btn-bloco" disabled>Produto esgotado</button>' : `
      <div class="qtd"><button data-menos aria-label="Diminuir">−</button><span id="mp-qtd">1</span><button data-mais aria-label="Aumentar">+</button></div>
      <button class="btn btn-pri btn-l" data-add><span>Adicionar</span><span id="mp-total"></span></button>`}
    </div>`, {
    classe: 'modal-prod',
    aoFechar: () => { history.replaceState(null, '', location.pathname); atualizarSEO(); }
  });

  let qtd = 1;
  const el = m.el;
  const escolhidos = () => grupos.flatMap(g =>
    [...el.querySelectorAll(`[name="g_${g.id}"]:checked`)].map(inp => ({ grupo: g.nome, ...g.opcoes[+inp.value] })));
  const atualizar = () => {
    const unit = precoAtual(p) + escolhidos().reduce((s, a) => s + (a.preco || 0), 0);
    const t = el.querySelector('#mp-total');
    if (t) t.textContent = moeda(unit * qtd);
    el.querySelector('#mp-qtd') && (el.querySelector('#mp-qtd').textContent = qtd);
    // limita o máximo de opções por grupo
    grupos.forEach(g => {
      if (g.max > 1) {
        const marc = el.querySelectorAll(`[name="g_${g.id}"]:checked`).length;
        el.querySelectorAll(`[name="g_${g.id}"]:not(:checked)`).forEach(i => { i.disabled = marc >= g.max; });
      }
    });
    return unit;
  };
  atualizar();
  el.addEventListener('change', () => { el.querySelectorAll('.grupo').forEach(g => g.style.outline = ''); atualizar(); });
  el.querySelector('[data-comp]').onclick = () => compartilharProduto(p);
  if (esgotado) return;
  el.querySelector('[data-menos]').onclick = () => { if (qtd > 1) { qtd--; atualizar(); } };
  el.querySelector('[data-mais]').onclick = () => { if (qtd < 50) { qtd++; atualizar(); } };
  el.querySelector('[data-add]').onclick = () => {
    for (const g of grupos) {
      const n = el.querySelectorAll(`[name="g_${g.id}"]:checked`).length;
      if (n < (g.min || 0)) {
        const box = el.querySelector(`[data-grupo="${g.id}"]`);
        box.style.outline = '2px solid var(--danger)';
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast(`Escolha uma opção em “${g.nome}”`, 'erro');
        return;
      }
    }
    const unit = atualizar();
    adicionarItem({
      produtoId: p.id, nome: p.nome, emoji: p.emoji || '', foto: p.foto ? '' : '', categoriaId: p.categoriaId,
      preco: r2(unit), qtd,
      adicionais: escolhidos().map(a => ({ grupo: a.grupo, nome: a.nome, preco: a.preco || 0 })),
      obs: el.querySelector('#mp-obs').value.trim()
    });
    m.fechar();
    toast(`${p.nome} adicionado à sacola`);
  };
}

/* ================= Compartilhar ================= */
function linkProduto(p) {
  // Em produção na Vercel, /p/ID gera a prévia com foto e preço (Open Graph) no WhatsApp.
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  return DEMO || local ? `${location.origin}/?p=${p.id}` : `${location.origin}/p/${p.id}`;
}
function compartilharProduto(p) {
  compartilhar({ titulo: p.nome, texto: `${p.nome} por ${moeda(precoAtual(p))} no ${E.cfg.nome}`, url: linkProduto(p) });
}
async function compartilhar({ titulo, texto, url }) {
  if (navigator.share) {
    try { await navigator.share({ title: titulo, text: texto, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const m = modal(`<h2>Compartilhar</h2>
    <label class="campo"><span>Link</span><input readonly value="${esc(url)}"></label>
    <div class="linha-btns" style="justify-content:flex-start">
      <a class="btn btn-ok" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto + ' ' + url)}"><i class="ti ti-brand-whatsapp"></i>WhatsApp</a>
      <button class="btn" data-copiar><i class="ti ti-copy"></i>Copiar link</button>
    </div>`, { classe: 'modal-p' });
  m.el.querySelector('[data-copiar]').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copiado'); } catch { m.el.querySelector('input').select(); }
  };
}

/* ================= Upsell inteligente ================= */
function sugestoes() {
  if (!E.cfg.upsell.ativo) return [];
  const naSacola = new Set(E.sacola.map(i => i.produtoId));
  const catsNaSacola = new Set(E.sacola.map(i => i.categoriaId));
  return E.prods
    .filter(p => p.upsell && p.disponivel !== false && !naSacola.has(p.id))
    // prioriza categorias que ainda não estão na sacola (ex.: tem lanche mas não tem bebida)
    .sort((a, b) => (catsNaSacola.has(a.categoriaId) ? 1 : 0) - (catsNaSacola.has(b.categoriaId) ? 1 : 0) || (a.ordem ?? 0) - (b.ordem ?? 0))
    .slice(0, 6);
}
function temObrigatorio(p) {
  return (p.adicionais || []).some(g => (E.adic[g]?.min || 0) > 0);
}

/* ================= Cupom ================= */
async function validarCupom(codigo) {
  const c = await db.get('cupons', codigo.toUpperCase().trim());
  if (!c || !c.ativo) return { erro: 'Cupom inválido.' };
  if (c.validade && c.validade < hojeISO()) return { erro: 'Este cupom expirou.' };
  if (c.limite && (c.usos || 0) >= c.limite) return { erro: 'Este cupom já atingiu o limite de usos.' };
  return { cupom: { codigo: c.id, tipo: c.tipo, valor: c.valor, minimo: c.minimo || 0, descricao: c.descricao || '' } };
}

/* ================= Cálculo do pedido ================= */
function calcular({ tipo, bairro, fid } = {}) {
  const sub = subtotal();
  const taxa = tipo === 'delivery' && bairro ? Number(bairro.taxa) || 0 : 0;
  let descCupom = 0;
  let avisoCupom = '';
  if (E.cupom) {
    if (sub < E.cupom.minimo) avisoCupom = `Cupom ${E.cupom.codigo} vale para pedidos a partir de ${moeda(E.cupom.minimo)}.`;
    else if (E.cupom.tipo === 'percentual') descCupom = sub * E.cupom.valor / 100;
    else if (E.cupom.tipo === 'valor') descCupom = Math.min(E.cupom.valor, sub);
    else if (E.cupom.tipo === 'frete') descCupom = taxa;
  }
  let descFid = 0;
  if (fid) descFid = E.cfg.fidelidade.tipo === 'percentual' ? sub * E.cfg.fidelidade.valor / 100 : Math.min(E.cfg.fidelidade.valor, sub);
  const total = Math.max(0, sub + taxa - descCupom - descFid);
  return { sub: r2(sub), taxa: r2(taxa), descCupom: r2(descCupom), descFid: r2(descFid), total: r2(total), avisoCupom };
}

/* ================= Sacola e checkout ================= */
let mSacola = null;
function abrirSacola() {
  mSacola = modal('<div id="sac"></div>', { aoFechar: () => { mSacola = null; } });
  renderSacola();
}

function renderSacola() {
  if (!mSacola) return;
  const box = mSacola.el.querySelector('#sac');
  if (!E.sacola.length) {
    box.innerHTML = `<h2>Sua sacola</h2><div class="vazio"><i class="ti ti-shopping-bag"></i>Sua sacola está vazia.</div>
      <button class="btn btn-pri btn-l btn-bloco" data-fechar>Ver cardápio</button>`;
    box.querySelector('[data-fechar]').onclick = () => mSacola.fechar();
    return;
  }
  const ups = sugestoes();
  const t = calcular();
  const st = statusLoja(E.cfg);
  box.innerHTML = `
    <h2>Sua sacola</h2>
    ${E.sacola.map((i, idx) => `
      <div class="sacola-item">
        <div class="foto" aria-hidden="true">${esc(i.emoji || '🍽️')}</div>
        <div class="si">
          <strong>${esc(i.nome)}</strong>
          ${i.adicionais.length ? `<div class="det">${i.adicionais.map(a => esc(a.nome)).join(', ')}</div>` : ''}
          ${i.obs ? `<div class="det">Obs.: ${esc(i.obs)}</div>` : ''}
          <div class="linha">
            <div class="qtd p"><button data-menos="${idx}" aria-label="Diminuir">${i.qtd === 1 ? '<i class="ti ti-trash"></i>' : '−'}</button><span>${i.qtd}</span><button data-mais="${idx}" aria-label="Aumentar">+</button></div>
            <strong>${moeda(i.preco * i.qtd)}</strong>
          </div>
        </div>
      </div>`).join('')}

    ${ups.length ? `<div class="upsell">
      <h3><i class="ti ti-sparkles" style="color:var(--pri)"></i> ${esc(E.cfg.upsell.titulo)}</h3>
      <div class="carrossel">${ups.map(p => `
        <div class="up-card">${fotoHTML(p)}
          <div class="ut"><strong>${esc(p.nome)}</strong><span class="preco" style="padding:0">${precoHTML(p)}</span>
          <button class="btn btn-s" data-up="${p.id}"><i class="ti ti-plus"></i>Adicionar</button></div>
        </div>`).join('')}</div></div>` : ''}

    <div class="cupom-linha">
      ${E.cupom
        ? `<div class="aviso aviso-ok" style="flex:1;margin:0"><i class="ti ti-discount-2"></i><span><strong>${esc(E.cupom.codigo)}</strong> ${esc(E.cupom.descricao)}</span></div>
           <button class="btn" data-rem-cupom>Remover</button>`
        : `<input class="inp" id="cupom" placeholder="Cupom de desconto" maxlength="20" aria-label="Cupom de desconto">
           <button class="btn" data-cupom>Aplicar</button>`}
    </div>
    <p class="msg-erro" id="cupom-erro"></p>
    ${t.avisoCupom ? `<div class="aviso aviso-warn"><i class="ti ti-alert-circle"></i>${esc(t.avisoCupom)}</div>` : ''}

    <div class="totais">
      <div><span>Subtotal</span><span>${moeda(t.sub)}</span></div>
      ${t.descCupom ? `<div class="desc-v"><span>Desconto do cupom</span><span>− ${moeda(t.descCupom)}</span></div>` : ''}
      <div class="total"><span>Total</span><span>${moeda(t.total)}</span></div>
      <small style="color:var(--txt3)">${E.mesa ? '' : 'Taxa de entrega calculada na próxima etapa.'}</small>
    </div>
    ${st.aberto ? '' : `<div class="aviso aviso-warn"><i class="ti ti-clock"></i>Estamos fechados agora (${esc(st.texto)}). Você pode montar a sacola e pedir quando abrirmos.</div>`}
    <div class="linha-btns">
      <button class="btn btn-ghost" data-fechar>Continuar comprando</button>
      <button class="btn btn-pri btn-l" data-avancar ${st.aberto ? '' : 'disabled'}>${E.mesa ? 'Revisar pedido' : 'Continuar'} <i class="ti ti-arrow-right"></i></button>
    </div>`;

  box.querySelectorAll('[data-menos]').forEach(b => b.onclick = () => {
    const i = E.sacola[+b.dataset.menos];
    if (--i.qtd <= 0) E.sacola.splice(+b.dataset.menos, 1);
    salvarSacola(); renderSacola();
  });
  box.querySelectorAll('[data-mais]').forEach(b => b.onclick = () => {
    E.sacola[+b.dataset.mais].qtd++;
    salvarSacola(); renderSacola();
  });
  box.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
    const p = E.prods.find(x => x.id === b.dataset.up);
    if (temObrigatorio(p)) { abrirProduto(p.id); return; }
    adicionarItem({ produtoId: p.id, nome: p.nome, emoji: p.emoji || '', categoriaId: p.categoriaId, preco: precoAtual(p), qtd: 1, adicionais: [], obs: '' });
    renderSacola();
  });
  box.querySelector('[data-fechar]').onclick = () => mSacola.fechar();
  box.querySelector('[data-avancar]').onclick = () => renderCheckout();
  box.querySelector('[data-rem-cupom]')?.addEventListener('click', () => { E.cupom = null; salvarSacola(); renderSacola(); });
  const aplicar = async () => {
    const cod = box.querySelector('#cupom').value;
    if (!cod.trim()) { box.querySelector('#cupom-erro').textContent = 'Digite o código do cupom.'; return; }
    const r = await validarCupom(cod);
    if (r.erro) { box.querySelector('#cupom-erro').textContent = r.erro; return; }
    E.cupom = r.cupom; salvarSacola(); renderSacola(); toast('Cupom aplicado');
  };
  box.querySelector('[data-cupom]')?.addEventListener('click', aplicar);
  box.querySelector('#cupom')?.addEventListener('keydown', e => { if (e.key === 'Enter') aplicar(); });
}

function dadosCliente() {
  try { return JSON.parse(localStorage.getItem('co_cliente')) || {}; } catch { return {}; }
}

function renderCheckout() {
  const box = mSacola.el.querySelector('#sac');
  const c = E.cfg;
  const cli = dadosCliente();
  const mesa = E.mesa;
  const tipos = [];
  if (c.entrega.delivery) tipos.push(['delivery', 'Entrega', 'ti-motorbike']);
  if (c.entrega.retirada) tipos.push(['retirada', 'Retirar no local', 'ti-building-store']);
  const pags = Object.entries(PAGAMENTOS).filter(([k]) => c.pagamentos[k]);
  const bairros = E.bairros.filter(b => b.ativo !== false);
  const end = cli.endereco || {};

  box.innerHTML = `
    <h2><button class="btn btn-ghost btn-ico btn-s" data-voltar aria-label="Voltar"><i class="ti ti-arrow-left"></i></button> Finalizar pedido</h2>
    <form id="form-ck" novalidate>
      ${mesa ? `<div class="aviso aviso-info" style="margin:0 0 16px"><i class="ti ti-armchair"></i>Pedido para a <strong>Mesa ${esc(mesa)}</strong>. O pagamento é feito ao pedir a conta.</div>` : `
      <div class="sec-checkout">
        <h3>Como você quer receber?</h3>
        <div class="opcoes">${tipos.map(([v, n, ic], i) => `
          <label class="opcao"><input type="radio" name="tipo" value="${v}" ${i === 0 ? 'checked' : ''}><span><i class="ti ${ic}"></i>${n}</span></label>`).join('')}
        </div>
      </div>`}

      <div class="sec-checkout">
        <h3>Seus dados</h3>
        <div class="grade2">
          <label class="campo"><span>Nome${mesa ? ' (opcional)' : ''}</span><input name="nome" autocomplete="name" value="${esc(cli.nome || '')}" ${mesa ? '' : 'required'} maxlength="60"></label>
          ${mesa ? '' : `<label class="campo"><span>WhatsApp</span><input name="telefone" inputmode="tel" autocomplete="tel" value="${esc(cli.telefone || '')}" required placeholder="(11) 98765-4321"></label>`}
        </div>
        ${mesa || !c.fidelidade.ativo ? '' : '<div id="fid-box"></div>'}
      </div>

      ${mesa ? '' : `
      <div class="sec-checkout" id="sec-end">
        <h3>Endereço de entrega</h3>
        <label class="campo"><span>Bairro</span>
          <select name="bairro" required>
            <option value="">Selecione o bairro</option>
            ${bairros.map(b => `<option value="${b.id}" ${end.bairroId === b.id ? 'selected' : ''}>${esc(b.nome)} — ${Number(b.taxa) ? moeda(b.taxa) : 'grátis'}</option>`).join('')}
          </select>
          ${bairros.length ? '' : '<small>Nenhum bairro cadastrado para entrega.</small>'}
        </label>
        <div class="grade3" style="grid-template-columns:2fr 1fr">
          <label class="campo"><span>Rua</span><input name="rua" autocomplete="address-line1" value="${esc(end.rua || '')}" required maxlength="100"></label>
          <label class="campo"><span>Número</span><input name="numero" value="${esc(end.numero || '')}" required maxlength="10"></label>
        </div>
        <div class="grade2">
          <label class="campo"><span>Complemento</span><input name="complemento" value="${esc(end.complemento || '')}" maxlength="60" placeholder="Apto, bloco…"></label>
          <label class="campo"><span>Ponto de referência</span><input name="referencia" value="${esc(end.referencia || '')}" maxlength="80"></label>
        </div>
      </div>

      <div class="sec-checkout">
        <h3>Forma de pagamento <small style="font-weight:500;color:var(--txt3)">· você paga ao receber</small></h3>
        <div class="opcoes" id="pags">${pags.map(([k, n]) => `
          <label class="opcao"><input type="radio" name="pagamento" value="${k}" required><span>${esc(n)}</span></label>`).join('')}
        </div>
        <p class="msg-erro" id="erro-pag"></p>
        <div id="troco-box" class="oculto" style="margin-top:12px">
          <span class="rotulo">Precisa de troco?</span>
          <div class="opcoes" style="margin-top:6px">
            <label class="opcao"><input type="radio" name="precisaTroco" value="nao" checked><span>Não preciso</span></label>
            <label class="opcao"><input type="radio" name="precisaTroco" value="sim"><span>Sim</span></label>
          </div>
          <label class="campo oculto" id="troco-valor" style="margin-top:10px"><span>Troco para quanto?</span>
            <input name="troco" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Ex.: 100">
          </label>
        </div>
      </div>`}

      <label class="campo"><span>Observação do pedido (opcional)</span><textarea name="obs" maxlength="200" placeholder="Ex.: interfone com defeito, ligar ao chegar"></textarea></label>

      <div class="totais" id="ck-totais"></div>
      <div id="ck-aviso"></div>
      <button class="btn btn-pri btn-l btn-bloco" style="margin-top:14px" type="submit" id="btn-enviar"><i class="ti ti-send"></i>Enviar pedido</button>
    </form>`;

  const f = box.querySelector('#form-ck');
  let fid = null; // { pontos } do telefone
  let usarFid = false;

  const tipoAtual = () => (mesa ? 'mesa' : f.tipo?.value || 'retirada');
  const bairroAtual = () => E.bairros.find(b => b.id === f.bairro?.value);

  const atualizar = () => {
    const tipo = tipoAtual();
    if (!mesa) {
      box.querySelector('#sec-end').classList.toggle('oculto', tipo !== 'delivery');
      const din = f.pagamento?.value === 'dinheiro';
      box.querySelector('#troco-box').classList.toggle('oculto', !din);
      box.querySelector('#troco-valor').classList.toggle('oculto', !(din && f.precisaTroco.value === 'sim'));
    }
    const t = calcular({ tipo, bairro: bairroAtual(), fid: usarFid });
    box.querySelector('#ck-totais').innerHTML = `
      <div><span>Subtotal</span><span>${moeda(t.sub)}</span></div>
      ${tipo === 'delivery' ? `<div><span>Taxa de entrega</span><span>${bairroAtual() ? (t.taxa ? moeda(t.taxa) : 'Grátis') : '—'}</span></div>` : ''}
      ${t.descCupom ? `<div class="desc-v"><span>Cupom ${esc(E.cupom.codigo)}</span><span>− ${moeda(t.descCupom)}</span></div>` : ''}
      ${t.descFid ? `<div class="desc-v"><span>Recompensa fidelidade</span><span>− ${moeda(t.descFid)}</span></div>` : ''}
      <div class="total"><span>Total</span><span>${moeda(t.total)}</span></div>`;
    const min = c.entrega.minimo || 0;
    box.querySelector('#ck-aviso').innerHTML = tipo === 'delivery' && t.sub < min
      ? `<div class="aviso aviso-warn"><i class="ti ti-alert-circle"></i>O pedido mínimo para entrega é ${moeda(min)}. Faltam ${moeda(min - t.sub)}.</div>` : '';
    return t;
  };

  const renderFid = () => {
    const fb = box.querySelector('#fid-box');
    if (!fb) return;
    const meta = c.fidelidade.meta || 10;
    if (!fid) { fb.innerHTML = ''; return; }
    const pontos = fid.pontos || 0;
    const pode = pontos >= meta;
    fb.innerHTML = `<div class="fid">
      <strong><i class="ti ti-gift"></i> Programa de fidelidade</strong>
      <div class="fid-barra"><i style="width:${Math.min(100, pontos / meta * 100)}%"></i></div>
      <small>${pode ? `Você completou ${meta} pedidos e ganhou <strong>${esc(c.fidelidade.descricao)}</strong>.` : `${pontos} de ${meta} pedidos. Faltam ${meta - pontos} para ganhar ${esc(c.fidelidade.descricao)}.`}</small>
      ${pode ? `<label class="chk"><input type="checkbox" id="usar-fid" ${usarFid ? 'checked' : ''}><span>Usar minha recompensa neste pedido</span></label>` : ''}
    </div>`;
    fb.querySelector('#usar-fid')?.addEventListener('change', e => { usarFid = e.target.checked; atualizar(); });
  };

  const buscarFid = debounce(async () => {
    const tel = soDigitos(f.telefone?.value);
    if (!c.fidelidade.ativo || tel.length < 10) { fid = null; usarFid = false; renderFid(); atualizar(); return; }
    fid = (await db.get('fidelidade', tel).catch(() => null)) || { pontos: 0 };
    renderFid();
  }, 400);

  f.telefone?.addEventListener('input', e => { e.target.value = mascaraTelefone(e.target.value); buscarFid(); });
  if (f.telefone?.value) buscarFid();
  f.addEventListener('change', atualizar);
  box.querySelector('[data-voltar]').onclick = renderSacola;
  atualizar();

  f.onsubmit = async ev => {
    ev.preventDefault();
    f.querySelectorAll('.campo.erro').forEach(x => x.classList.remove('erro'));
    box.querySelector('#erro-pag') && (box.querySelector('#erro-pag').textContent = '');
    const tipo = tipoAtual();
    const obrig = ['nome', 'telefone'].filter(n => f[n] && f[n].required);
    if (tipo === 'delivery') obrig.push('bairro', 'rua', 'numero');
    let primeiroErro = null;
    for (const n of obrig) {
      if (!f[n].value.trim() || (n === 'telefone' && soDigitos(f[n].value).length < 10)) {
        f[n].closest('.campo').classList.add('erro');
        primeiroErro ||= f[n];
      }
    }
    if (!mesa && !f.pagamento.value) {
      box.querySelector('#erro-pag').textContent = 'Escolha a forma de pagamento.';
      primeiroErro ||= box.querySelector('#pags');
    }
    const t = atualizar();
    let troco = null;
    if (!mesa && f.pagamento.value === 'dinheiro' && f.precisaTroco.value === 'sim') {
      troco = Number(f.troco.value);
      if (!troco || troco <= t.total) {
        f.troco.closest('.campo').classList.add('erro');
        toast(`O troco precisa ser maior que ${moeda(t.total)}`, 'erro');
        primeiroErro ||= f.troco;
      }
    }
    if (primeiroErro) { primeiroErro.scrollIntoView({ behavior: 'smooth', block: 'center' }); primeiroErro.focus?.(); return; }
    if (tipo === 'delivery' && t.sub < (c.entrega.minimo || 0)) { toast('Pedido abaixo do mínimo para entrega', 'erro'); return; }
    if (!lojaAberta()) { toast('A loja fechou. Tente novamente quando abrirmos.', 'erro'); return; }

    const btn = box.querySelector('#btn-enviar');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2"></i>Enviando…';
    const b = bairroAtual();
    const agora = Date.now();
    const pedido = {
      status: 'novo',
      tipo,
      mesa: mesa || null,
      cliente: { nome: f.nome.value.trim() || (mesa ? `Mesa ${mesa}` : ''), telefone: mesa ? '' : soDigitos(f.telefone.value) },
      endereco: tipo === 'delivery' ? {
        bairro: b.nome, bairroId: b.id, rua: f.rua.value.trim(), numero: f.numero.value.trim(),
        complemento: f.complemento.value.trim(), referencia: f.referencia.value.trim()
      } : null,
      itens: E.sacola.map(i => ({ produtoId: i.produtoId, nome: i.nome, qtd: i.qtd, preco: i.preco, adicionais: i.adicionais, obs: i.obs })),
      subtotal: t.sub, taxa: t.taxa, desconto: t.descCupom, descontoFidelidade: t.descFid, total: t.total,
      cupom: E.cupom && t.descCupom ? E.cupom.codigo : null,
      usouFidelidade: !!t.descFid,
      pagamento: mesa ? null : { forma: f.pagamento.value, troco },
      obs: f.obs.value.trim(),
      criadoEm: agora,
      historico: [{ status: 'novo', em: agora }]
    };
    try {
      const { id, numero } = await db.criarPedido(pedido);
      if (!mesa) {
        localStorage.setItem('co_cliente', JSON.stringify({
          nome: pedido.cliente.nome, telefone: mascaraTelefone(pedido.cliente.telefone),
          endereco: pedido.endereco || dadosCliente().endereco
        }));
      }
      const meus = meusPedidos();
      meus.unshift({ id, numero, em: agora });
      localStorage.setItem('co_meus_pedidos', JSON.stringify(meus.slice(0, 20)));
      E.sacola = []; E.cupom = null; salvarSacola();
      mSacola.fechar();
      if (mesa) { toast(`Pedido #${numero} enviado para a cozinha`); acompanhar(id); }
      else location.href = `/pedido.html?id=${id}`;
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i>Enviar pedido';
      toast('Não foi possível enviar. Verifique sua internet e tente de novo.', 'erro');
    }
  };
}

/* ================= Acompanhamento em tempo real ================= */
function meusPedidos() {
  try { return JSON.parse(localStorage.getItem('co_meus_pedidos')) || []; } catch { return []; }
}
const pedidosAtivos = {};
function acompanharPedidos() {
  const limite = Date.now() - 12 * 3600e3;
  meusPedidos().filter(p => p.em > limite).slice(0, 6).forEach(p => acompanhar(p.id));
}
function acompanhar(id) {
  db.watchDoc('pedidos', id, d => {
    const anterior = pedidosAtivos[id]?.status;
    pedidosAtivos[id] = d;
    if (anterior && d && anterior !== d.status) toast(`Pedido #${d.numero}: ${STATUS[d.status]?.nome}`);
    renderAcompanhar();
  });
}
function renderAcompanhar() {
  const ativos = Object.entries(pedidosAtivos)
    .filter(([, d]) => d && !['entregue', 'cancelado'].includes(d.status))
    .sort((a, b) => b[1].criadoEm - a[1].criadoEm);
  const box = $('#acompanhar');
  box.classList.toggle('oculto', !ativos.length);
  box.innerHTML = ativos.map(([id, d]) => {
    const fl = fluxoStatus(d.tipo);
    const pct = Math.max(8, fl.indexOf(d.status) / (fl.length - 1) * 100);
    const s = STATUS[d.status];
    return `<a class="ped-ativo" href="/pedido.html?id=${id}">
      <span class="ico"><i class="ti ${s.icone} ${d.status === 'novo' ? 'pulso' : ''}"></i></span>
      <span class="tx"><strong>Pedido #${d.numero}${d.mesa ? ` · Mesa ${esc(d.mesa)}` : ''}</strong>
      <span>${s.nome}</span><span class="barra"><i style="width:${pct}%"></i></span></span>
      <i class="ti ti-chevron-right" aria-hidden="true"></i></a>`;
  }).join('');
}

/* ================= Modo mesa (QR Code) ================= */
function iniciarMesa() {
  db.watchDoc('mesas', String(E.mesa), d => {
    E.mesaDoc = d;
    if (!d || d.ativa === false) {
      $('#mesa-box').classList.remove('oculto');
      $('#mesa-box').innerHTML = `<div class="aviso aviso-warn"><i class="ti ti-alert-circle"></i>Mesa ${esc(E.mesa)} não encontrada. Peça ajuda ao atendente.</div>`;
      return;
    }
    renderMesa();
  });
}
function renderMesa() {
  const d = E.mesaDoc;
  const box = $('#mesa-box');
  box.classList.remove('oculto');
  const chamado = d.chamado;
  box.innerHTML = `<div class="mesa-card">
    <i class="ti ti-armchair" aria-hidden="true"></i>
    <div class="mt"><strong>Mesa ${esc(d.numero ?? E.mesa)}</strong><small>Peça por aqui. Levamos até você.</small></div>
    <button class="btn ${chamado === 'garcom' ? 'ativo' : ''}" data-garcom><i class="ti ti-bell-ringing"></i>${chamado === 'garcom' ? 'Garçom a caminho' : 'Chamar garçom'}</button>
    <button class="btn ${chamado === 'conta' ? 'ativo' : ''}" data-conta><i class="ti ti-receipt"></i>${chamado === 'conta' ? 'Conta solicitada' : 'Pedir a conta'}</button>
  </div>`;
  box.querySelector('[data-garcom]').onclick = async () => {
    if (chamado === 'garcom') return toast('O garçom já foi chamado');
    await db.update('mesas', String(E.mesa), { chamado: 'garcom', chamadoEm: Date.now() });
    toast('Garçom chamado');
  };
  box.querySelector('[data-conta]').onclick = () => pedirConta();
}
function pedirConta() {
  const pags = Object.entries(PAGAMENTOS).filter(([k]) => E.cfg.pagamentos[k]);
  const m = modal(`<h2>Pedir a conta</h2>
    <form id="f-conta" novalidate>
      <span class="rotulo">Como vai pagar?</span>
      <div class="opcoes" style="margin:6px 0 4px">${pags.map(([k, n]) => `<label class="opcao"><input type="radio" name="forma" value="${k}"><span>${esc(n)}</span></label>`).join('')}</div>
      <p class="msg-erro" id="e-forma"></p>
      <div id="t-box" class="oculto" style="margin-top:10px">
        <span class="rotulo">Precisa de troco?</span>
        <div class="opcoes" style="margin-top:6px">
          <label class="opcao"><input type="radio" name="pt" value="nao" checked><span>Não</span></label>
          <label class="opcao"><input type="radio" name="pt" value="sim"><span>Sim</span></label>
        </div>
        <label class="campo oculto" id="t-val" style="margin-top:10px"><span>Troco para quanto?</span><input name="troco" type="number" min="0" step="0.01" inputmode="decimal"></label>
      </div>
      <button class="btn btn-pri btn-l btn-bloco" style="margin-top:16px">Pedir a conta</button>
    </form>`, { classe: 'modal-p' });
  const f = m.el.querySelector('form');
  f.onchange = () => {
    m.el.querySelector('#t-box').classList.toggle('oculto', f.forma.value !== 'dinheiro');
    m.el.querySelector('#t-val').classList.toggle('oculto', !(f.forma.value === 'dinheiro' && f.pt.value === 'sim'));
  };
  f.onsubmit = async e => {
    e.preventDefault();
    if (!f.forma.value) { m.el.querySelector('#e-forma').textContent = 'Escolha a forma de pagamento.'; return; }
    const troco = f.forma.value === 'dinheiro' && f.pt.value === 'sim' ? Number(f.troco.value) || null : null;
    if (f.forma.value === 'dinheiro' && f.pt.value === 'sim' && !troco) { f.troco.closest('.campo').classList.add('erro'); return; }
    await db.update('mesas', String(E.mesa), { chamado: 'conta', chamadoEm: Date.now(), contaPagamento: { forma: f.forma.value, troco } });
    m.fechar();
    toast('Conta solicitada. Já vamos até sua mesa.');
  };
}

/* ================= Informações da loja ================= */
function abrirInfo() {
  const c = E.cfg;
  const hoje = new Date().getDay();
  const pags = Object.entries(PAGAMENTOS).filter(([k]) => c.pagamentos[k]).map(([, n]) => n);
  modal(`<h2>${esc(c.nome)}</h2>
    ${c.descricao ? `<p style="color:var(--txt2);margin-bottom:14px">${esc(c.descricao)}</p>` : ''}
    <h3 style="font-size:15px;margin-bottom:6px">Horário de funcionamento</h3>
    <table class="horarios-tab">${DIAS.map((d, i) => {
      const h = c.horarios[i];
      return `<tr class="${i === hoje ? 'hoje' : ''}"><td>${d}</td><td>${h?.ativo ? `${h.abre} às ${h.fecha}` : 'Fechado'}</td></tr>`;
    }).join('')}</table>
    <h3 style="font-size:15px;margin:16px 0 6px">Pagamento na entrega</h3>
    <p style="color:var(--txt2)">${pags.map(esc).join(' · ') || '—'}</p>
    ${c.entrega.delivery && E.bairros.length ? `<h3 style="font-size:15px;margin:16px 0 6px">Taxas de entrega</h3>
    <table class="horarios-tab">${E.bairros.filter(b => b.ativo !== false).map(b => `<tr><td>${esc(b.nome)}</td><td>${Number(b.taxa) ? moeda(b.taxa) : 'Grátis'}</td></tr>`).join('')}</table>` : ''}
    ${c.endereco ? `<p style="margin-top:16px"><i class="ti ti-map-pin"></i> ${esc(c.endereco)}</p>` : ''}`);
}

/* ================= Início ================= */
async function iniciar() {
  registrarSW();
  carregarSacola();
  renderBarra();

  if (DEMO) {
    document.body.insertAdjacentHTML('beforeend', '<div class="tag-demo">Modo demo</div>');
    if (!(await db.get('config', 'loja'))) await semear();
  }

  const q = new URLSearchParams(location.search);
  if (q.get('mesa')) {
    sessionStorage.setItem('co_mesa', soDigitos(q.get('mesa')) || q.get('mesa'));
    history.replaceState(null, '', location.pathname);
  }
  E.mesa = sessionStorage.getItem('co_mesa');
  const abrirP = q.get('p');

  db.watchDoc('config', 'loja', d => { E.cfg = mesclarConfig(d); renderLoja(); renderCardapio(); });
  db.watch('categorias', { orderBy: ['ordem'] }, l => { E.cats = l; E.carregado.cats = true; renderCardapio(); splashPronto('cats'); });
  db.watch('adicionais', {}, l => { E.adic = Object.fromEntries(l.map(a => [a.id, a])); });
  db.watch('bairros', { orderBy: ['nome'] }, l => { E.bairros = l; });
  let abriu = false;
  db.watch('produtos', { orderBy: ['ordem'] }, l => {
    E.prods = l; E.carregado.prods = true; renderCardapio(); splashPronto('prods');
    if (abrirP && !abriu) { abriu = true; setTimeout(() => abrirProduto(abrirP), 150); }
  });
  if (E.mesa) iniciarMesa();
  acompanharPedidos();

  $('#busca').addEventListener('input', debounce(e => { E.busca = e.target.value; renderCardapio(); }, 200));
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-prod]');
    if (p) abrirProduto(p.dataset.prod);
    const c = e.target.closest('[data-cat]');
    if (c) document.getElementById('cat-' + c.dataset.cat)?.scrollIntoView({ behavior: 'smooth' });
  });
  $('#barra-sacola').onclick = abrirSacola;
  $('#btn-info').onclick = abrirInfo;
  $('#btn-compartilhar-loja').onclick = () => compartilhar({ titulo: E.cfg.nome, texto: `Confira o cardápio do ${E.cfg.nome}`, url: location.origin + '/' });
  setInterval(renderStatus, 60000);
}

iniciar();
