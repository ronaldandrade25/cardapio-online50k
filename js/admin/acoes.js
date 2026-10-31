// Ações sobre pedidos usadas em Pedidos e Mesas: mudar status, finalizar, cancelar, imprimir.
import { db, inc } from '../db.js';
import { store } from './app.js';
import { conectada, imprimirBluetooth } from './impressora.js';
import { moeda, esc, STATUS, TIPOS, PAGAMENTOS, fluxoStatus, dataHoraBR, mascaraTelefone, toast } from '../utils.js';

export function proximoStatus(p) {
  const f = fluxoStatus(p.tipo);
  const i = f.indexOf(p.status);
  return i >= 0 && i < f.length - 1 ? f[i + 1] : null;
}

export const rotuloAcao = {
  preparo: 'Aceitar e preparar',
  pronto: 'Marcar pronto',
  entrega: 'Saiu para entrega',
  entregue: 'Finalizar'
};

export async function mudarStatus(p, status, extra = {}) {
  const historico = [...(p.historico || []), { status, em: Date.now() }];
  await db.update('pedidos', p.id, { status, historico, ...extra });
  if (status === 'entregue') await contabilizar(p);
}

/** Ao finalizar: soma ponto de fidelidade, atualiza cadastro do cliente e conta uso do cupom (uma única vez). */
async function contabilizar(p) {
  if (p.contabilizado) return;
  const tel = p.cliente?.telefone;
  try {
    if (tel) {
      const meta = store.cfg.fidelidade.meta || 10;
      const pontos = 1 - (p.usouFidelidade ? meta : 0);
      await db.set('fidelidade', tel, { pontos: inc(pontos), nome: p.cliente.nome, atualizadoEm: Date.now() }, true);
      await db.set('clientes', tel, {
        nome: p.cliente.nome, telefone: tel, pedidos: inc(1), totalGasto: inc(p.total),
        ultimoPedido: Date.now(), ...(p.endereco ? { endereco: p.endereco } : {})
      }, true);
    }
    if (p.cupom) await db.update('cupons', p.cupom, { usos: inc(1) }).catch(() => {});
    await db.update('pedidos', p.id, { contabilizado: true });
  } catch (e) {
    console.error('Falha ao contabilizar pedido', e);
  }
}

export async function cancelar(p, motivo) {
  await mudarStatus(p, 'cancelado', { motivoCancelamento: motivo || '' });
  toast(`Pedido #${p.numero} cancelado`);
}

export function enderecoTexto(e) {
  if (!e) return '';
  return `${e.rua}, ${e.numero}${e.complemento ? ' - ' + e.complemento : ''} · ${e.bairro}${e.referencia ? ` (ref.: ${e.referencia})` : ''}`;
}

export function pagamentoTexto(p) {
  if (!p.pagamento) return p.tipo === 'mesa' ? 'Na conta da mesa' : '—';
  const f = PAGAMENTOS[p.pagamento.forma] || p.pagamento.forma;
  if (p.pagamento.forma !== 'dinheiro') return f;
  return p.pagamento.troco ? `${f} · troco para ${moeda(p.pagamento.troco)} (levar ${moeda(p.pagamento.troco - p.total)})` : `${f} · sem troco`;
}

/** Comanda para impressora térmica (58/80 mm) */
export function imprimir(p) {
  const c = store.cfg;
  if (conectada()) {
    imprimirBluetooth(p, c).catch(() => { toast('Falha na impressora Bluetooth. Imprimindo pelo navegador.', 'erro'); imprimirNavegador(p); });
    return;
  }
  imprimirNavegador(p);
}

function imprimirNavegador(p) {
  const c = store.cfg;
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) { toast('Permita pop-ups para imprimir', 'erro'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido #${p.numero}</title>
  <style>
    @page { margin: 0; size: 80mm auto; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 4mm; color: #000; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
    .c { text-align: center; } .g { font-size: 18px; font-weight: bold; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 1px 0; }
    td:last-child { text-align: right; white-space: nowrap; } .s { font-size: 11px; padding-left: 10px; }
  </style></head><body>
  <h1>${esc(c.nome)}</h1>
  <div class="c">${dataHoraBR(p.criadoEm)}</div><hr>
  <div class="c g">PEDIDO #${p.numero}</div>
  <div class="c"><b>${esc(TIPOS[p.tipo].toUpperCase())}${p.mesa ? ' ' + esc(p.mesa) : ''}</b></div><hr>
  ${p.cliente?.nome ? `<div>Cliente: ${esc(p.cliente.nome)}</div>` : ''}
  ${p.cliente?.telefone ? `<div>Tel: ${esc(mascaraTelefone(p.cliente.telefone))}</div>` : ''}
  ${p.endereco ? `<div>End: ${esc(enderecoTexto(p.endereco))}</div>` : ''}
  <hr><table>
  ${p.itens.map(i => `<tr><td>${i.qtd}x ${esc(i.nome)}</td><td>${moeda(i.preco * i.qtd)}</td></tr>
    ${(i.adicionais || []).map(a => `<tr><td class="s" colspan="2">+ ${esc(a.nome)}</td></tr>`).join('')}
    ${i.obs ? `<tr><td class="s" colspan="2">OBS: ${esc(i.obs)}</td></tr>` : ''}`).join('')}
  </table><hr><table>
  <tr><td>Subtotal</td><td>${moeda(p.subtotal)}</td></tr>
  ${p.taxa ? `<tr><td>Entrega</td><td>${moeda(p.taxa)}</td></tr>` : ''}
  ${p.desconto ? `<tr><td>Desconto ${esc(p.cupom || '')}</td><td>-${moeda(p.desconto)}</td></tr>` : ''}
  ${p.descontoFidelidade ? `<tr><td>Fidelidade</td><td>-${moeda(p.descontoFidelidade)}</td></tr>` : ''}
  <tr><td><b>TOTAL</b></td><td><b>${moeda(p.total)}</b></td></tr></table><hr>
  <div>Pagamento: ${esc(pagamentoTexto(p))}</div>
  ${p.obs ? `<hr><div>OBS: ${esc(p.obs)}</div>` : ''}
  <hr><div class="c">Obrigado pela preferência!</div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}<\/script>
  </body></html>`);
  w.document.close();
}

export const statusBadge = s => `<span class="badge badge-${STATUS[s]?.cor || ''}">${STATUS[s]?.nome || s}</span>`;
