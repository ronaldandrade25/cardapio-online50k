// Acompanhamento do pedido em tempo real (status atualiza sozinho).
import { db } from './db.js';
import { moeda, esc, soDigitos, aplicarTema, mesclarConfig, STATUS, TIPOS, PAGAMENTOS, fluxoStatus, horaBR, bip, registrarSW } from './utils.js';

const $ = s => document.querySelector(s);
const id = new URLSearchParams(location.search).get('id');
let cfg = mesclarConfig(null);
let ultimoStatus = null;

const mensagens = {
  novo: 'Recebemos seu pedido. Já já ele vai para a cozinha.',
  preparo: 'Seu pedido está sendo preparado com carinho.',
  pronto: 'Seu pedido está pronto!',
  entrega: 'Seu pedido saiu para entrega. Fique de olho!',
  entregue: 'Pedido finalizado. Bom apetite!',
  cancelado: 'Este pedido foi cancelado.'
};

function render(p) {
  if (!p) {
    $('#conteudo').innerHTML = '<div class="vazio"><i class="ti ti-receipt-off"></i>Pedido não encontrado.</div>';
    return;
  }
  $('#titulo').textContent = `Pedido #${p.numero}`;
  document.title = `Pedido #${p.numero} · ${STATUS[p.status]?.nome} — ${cfg.nome}`;
  const s = STATUS[p.status];
  const fluxo = fluxoStatus(p.tipo);
  const idx = fluxo.indexOf(p.status);
  const hist = Object.fromEntries((p.historico || []).map(h => [h.status, h.em]));
  const nomes = { ...Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.nome])), pronto: p.tipo === 'mesa' ? 'Pronto para servir' : 'Pronto para retirada', entregue: p.tipo === 'delivery' ? 'Entregue' : 'Finalizado' };
  const zap = soDigitos(cfg.whatsapp);
  const pag = p.pagamento;

  $('#conteudo').innerHTML = `
    <div class="card status-grande">
      <div class="ico"><i class="ti ${s.icone} ${p.status === 'novo' ? 'pulso' : ''}"></i></div>
      <h2>${esc(nomes[p.status])}</h2>
      <p>${esc(p.status === 'cancelado' && p.motivoCancelamento ? `Motivo: ${p.motivoCancelamento}` : mensagens[p.status])}</p>
      ${p.status !== 'cancelado' && p.status !== 'entregue' ? `<p style="font-size:13px;margin-top:8px">${p.tipo === 'delivery' ? `Previsão: ${esc(cfg.entrega.tempo)}` : p.tipo === 'retirada' ? `Retirada em cerca de ${esc(cfg.entrega.tempoRetirada)}` : ''}</p>` : ''}
    </div>

    ${p.status === 'cancelado' ? '' : `<div class="card bloco"><ol class="linha-tempo">
      ${fluxo.map((st, i) => `<li class="${i <= idx ? 'feito' : ''} ${i === idx ? 'atual' : ''}">
        <span class="pt">${i <= idx ? '<i class="ti ti-check"></i>' : ''}</span>
        <div><strong>${esc(nomes[st])}</strong>${hist[st] ? `<small>${horaBR(hist[st])}</small>` : ''}</div></li>`).join('')}
    </ol></div>`}

    <div class="card bloco">
      <h3>Resumo · ${TIPOS[p.tipo]}${p.mesa ? ` ${esc(p.mesa)}` : ''}</h3>
      ${p.itens.map(i => `<div class="item-res"><div>${i.qtd}× ${esc(i.nome)}
        ${i.adicionais?.length ? `<small>${i.adicionais.map(a => esc(a.nome)).join(', ')}</small>` : ''}
        ${i.obs ? `<small>Obs.: ${esc(i.obs)}</small>` : ''}</div><span>${moeda(i.preco * i.qtd)}</span></div>`).join('')}
      <div class="totais">
        <div><span>Subtotal</span><span>${moeda(p.subtotal)}</span></div>
        ${p.taxa ? `<div><span>Entrega</span><span>${moeda(p.taxa)}</span></div>` : ''}
        ${p.desconto ? `<div class="desc-v"><span>Cupom ${esc(p.cupom || '')}</span><span>− ${moeda(p.desconto)}</span></div>` : ''}
        ${p.descontoFidelidade ? `<div class="desc-v"><span>Fidelidade</span><span>− ${moeda(p.descontoFidelidade)}</span></div>` : ''}
        <div class="total"><span>Total</span><span>${moeda(p.total)}</span></div>
      </div>
      ${pag ? `<p style="margin-top:10px;font-size:14px;color:var(--txt2)"><i class="ti ti-cash"></i> ${esc(PAGAMENTOS[pag.forma] || pag.forma)} na ${p.tipo === 'delivery' ? 'entrega' : 'retirada'}${pag.troco ? ` · troco para ${moeda(pag.troco)}` : ''}</p>` : ''}
      ${p.endereco ? `<p style="margin-top:6px;font-size:14px;color:var(--txt2)"><i class="ti ti-map-pin"></i> ${esc(`${p.endereco.rua}, ${p.endereco.numero}${p.endereco.complemento ? ' - ' + p.endereco.complemento : ''} · ${p.endereco.bairro}`)}</p>` : ''}
    </div>

    <div class="linha-btns" style="justify-content:stretch">
      ${zap ? `<a class="btn btn-ok" style="flex:1" target="_blank" rel="noopener" href="https://wa.me/55${zap}?text=${encodeURIComponent(`Olá! Sobre o meu pedido #${p.numero}`)}"><i class="ti ti-brand-whatsapp"></i>Falar com a loja</a>` : ''}
      <a class="btn btn-pri" style="flex:1" href="/"><i class="ti ti-tools-kitchen-2"></i>Voltar ao cardápio</a>
    </div>`;

  if (ultimoStatus && ultimoStatus !== p.status) {
    bip(2);
    navigator.vibrate?.([200, 100, 200]);
  }
  ultimoStatus = p.status;
}

registrarSW();
if (!id) render(null);
else {
  db.watchDoc('config', 'loja', d => { cfg = mesclarConfig(d); aplicarTema(cfg.tema); });
  db.watchDoc('pedidos', id, render);
}
