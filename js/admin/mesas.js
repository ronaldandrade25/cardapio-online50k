// Mesas: chamados de garçom/conta em tempo real, conta da mesa e QR Codes para imprimir.
import { db } from '../db.js';
import { store, onStore } from './app.js';
import { mudarStatus, imprimir, statusBadge } from './acoes.js';
import { detalhe } from './pedidos.js';
import { moeda, esc, PAGAMENTOS, tempoDesde, modal, confirmar, toast } from '../utils.js';

export function qrDataURL(texto, cel = 8) {
  const qr = window.qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createDataURL(cel, 2);
}
export const urlMesa = n => `${location.origin}/?mesa=${encodeURIComponent(n)}`;

const pedidosDaMesa = id => store.pedidos.filter(p => p.tipo === 'mesa' && String(p.mesa) === String(id) && p.status !== 'cancelado' && !p.contaFechada);

export function render(el) {
  let aba = 'mesas';
  el.innerHTML = `
    <div class="abas"><button data-aba="mesas" class="on">Mesas</button><button data-aba="qr">QR Codes</button></div>
    <div id="area"></div>`;
  el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => {
    aba = b.dataset.aba;
    el.querySelectorAll('[data-aba]').forEach(x => x.classList.toggle('on', x === b));
    desenhar();
  });

  function desenhar() {
    const area = el.querySelector('#area');
    if (aba === 'qr') return desenharQR(area);
    const mesas = store.mesas;
    area.innerHTML = `
      <div class="barra-acoes"><p style="color:var(--txt2);font-size:14px">Chamados e pedidos das mesas aparecem aqui em tempo real.</p><span class="espaco"></span>
        <button class="btn btn-pri" data-nova><i class="ti ti-plus"></i>Nova mesa</button></div>
      <div class="mesas">${mesas.map(m => {
        const ps = pedidosDaMesa(m.id);
        const total = ps.reduce((s, p) => s + p.total, 0);
        const cls = m.chamado ? 'chamando' : ps.length ? 'ocupada' : '';
        return `<div class="card mesa ${cls}" style="${m.ativa === false ? 'opacity:.5' : ''}">
          <h3><i class="ti ti-armchair"></i>Mesa ${esc(m.numero)}</h3>
          ${m.chamado ? `<span class="badge badge-danger"><i class="ti ti-bell-ringing"></i>${m.chamado === 'conta' ? 'Pediu a conta' : 'Chamou o garçom'} · ${tempoDesde(m.chamadoEm)}</span>` : ''}
          ${m.chamado === 'conta' && m.contaPagamento ? `<span class="mv">Vai pagar com ${esc(PAGAMENTOS[m.contaPagamento.forma] || '')}${m.contaPagamento.troco ? ` · troco p/ ${moeda(m.contaPagamento.troco)}` : ''}</span>` : ''}
          <span class="mv">${ps.length ? `${ps.length} pedido(s) · <strong>${moeda(total)}</strong>` : m.ativa === false ? 'Desativada' : 'Livre'}</span>
          <div class="linha-btns">
            ${m.chamado ? `<button class="btn btn-s btn-ok" data-atender="${m.id}"><i class="ti ti-check"></i>Atendido</button>` : ''}
            <button class="btn btn-s" data-conta="${m.id}">${ps.length ? 'Ver conta' : 'Opções'}</button>
          </div>
        </div>`;
      }).join('') || '<div class="vazio">Nenhuma mesa cadastrada.</div>'}</div>`;

    area.querySelector('[data-nova]').onclick = async () => {
      const n = Math.max(0, ...store.mesas.map(m => Number(m.numero) || 0)) + 1;
      await db.set('mesas', String(n), { numero: n, ativa: true, chamado: null, chamadoEm: null });
      toast(`Mesa ${n} criada`);
    };
    area.querySelectorAll('[data-atender]').forEach(b => b.onclick = () =>
      db.update('mesas', b.dataset.atender, { chamado: null, chamadoEm: null }));
    area.querySelectorAll('[data-conta]').forEach(b => b.onclick = () => conta(b.dataset.conta));
  }

  function desenharQR(area) {
    area.innerHTML = `
      <div class="barra-acoes"><p style="color:var(--txt2);font-size:14px">Cada mesa tem um QR Code próprio: o cliente escaneia, pede e acompanha o status no celular.</p>
        <span class="espaco"></span><button class="btn btn-pri" data-imprimir-qr><i class="ti ti-printer"></i>Imprimir todos</button></div>
      <div class="qr-grade">${store.mesas.filter(m => m.ativa !== false).map(m => `
        <div class="card qr-card"><img src="${qrDataURL(urlMesa(m.numero), 5)}" alt="QR Code da mesa ${esc(m.numero)}" style="image-rendering:pixelated">
        <strong>Mesa ${esc(m.numero)}</strong><a href="${urlMesa(m.numero)}" target="_blank" rel="noopener" style="font-size:12px">Abrir link</a></div>`).join('')}</div>`;
    area.querySelector('[data-imprimir-qr]').onclick = imprimirQRs;
  }

  function conta(id) {
    const m0 = store.mesas.find(x => x.id === id);
    let parar = null;
    const mod = modal('<div id="ct"></div>', { aoFechar: () => parar?.() });
    const desenharConta = () => {
      const m = store.mesas.find(x => x.id === id) || m0;
      const ps = pedidosDaMesa(id);
      const total = ps.reduce((s, p) => s + p.total, 0);
      const abertos = ps.filter(p => p.status !== 'entregue').length;
      mod.el.querySelector('#ct').innerHTML = `
        <h2>Mesa ${esc(m.numero)}</h2>
        ${ps.length ? `<table class="tabela">${ps.map(p => `
          <tr data-ped="${p.id}" style="cursor:pointer"><td>#${p.numero} · ${p.itens.map(i => `${i.qtd}× ${esc(i.nome)}`).join(', ')}</td>
          <td>${statusBadge(p.status)}</td><td class="num">${moeda(p.total)}</td></tr>`).join('')}
          <tr><td colspan="2"><strong>Total da mesa</strong></td><td class="num"><strong>${moeda(total)}</strong></td></tr></table>
          ${m.contaPagamento ? `<p style="margin-top:10px;color:var(--txt2)">Cliente vai pagar com ${esc(PAGAMENTOS[m.contaPagamento.forma] || '')}${m.contaPagamento.troco ? ` · troco para ${moeda(m.contaPagamento.troco)}` : ''}</p>` : ''}
          ${abertos ? `<div class="aviso aviso-warn" style="margin-top:10px;padding:10px;border-radius:8px;background:var(--warn-bg);color:var(--warn)">${abertos} pedido(s) ainda não servido(s).</div>` : ''}`
        : '<p class="vazio">Nenhum pedido aberto nesta mesa.</p>'}
        <div class="linha-btns">
          <button class="btn btn-ghost" data-ativa style="margin-right:auto">${m.ativa === false ? 'Reativar mesa' : 'Desativar mesa'}</button>
          ${ps.length ? '' : '<button class="btn btn-ghost" data-excluir style="color:var(--danger)">Excluir</button>'}
          ${ps.length ? '<button class="btn" data-imp><i class="ti ti-printer"></i>Imprimir conta</button><button class="btn btn-ok" data-fechar-conta><i class="ti ti-cash"></i>Fechar conta</button>' : ''}
        </div>`;
      const e = mod.el;
      e.querySelectorAll('[data-ped]').forEach(r => r.onclick = () => detalhe(r.dataset.ped));
      e.querySelector('[data-ativa]').onclick = () => db.update('mesas', id, { ativa: m.ativa === false });
      e.querySelector('[data-excluir]')?.addEventListener('click', async () => {
        if (await confirmar(`Excluir a mesa ${m.numero}? O QR Code dela deixará de funcionar.`, { ok: 'Excluir', perigo: true })) {
          await db.remove('mesas', id); mod.fechar();
        }
      });
      e.querySelector('[data-imp]')?.addEventListener('click', () => {
        const itens = ps.flatMap(p => p.itens);
        imprimir({ numero: `Mesa ${m.numero}`, tipo: 'mesa', mesa: m.numero, criadoEm: Date.now(), cliente: {}, itens,
          subtotal: total, total, taxa: 0, desconto: 0, pagamento: m.contaPagamento || null, obs: 'Conta da mesa' });
      });
      e.querySelector('[data-fechar-conta]')?.addEventListener('click', async () => {
        if (!await confirmar(`Fechar a conta da mesa ${m.numero} no valor de ${moeda(total)}?`, { ok: 'Fechar conta' })) return;
        for (const p of ps) {
          if (p.status !== 'entregue') await mudarStatus(p, 'entregue');
          await db.update('pedidos', p.id, { contaFechada: true, pagamento: m.contaPagamento || { forma: 'dinheiro', troco: null } });
        }
        await db.update('mesas', id, { chamado: null, chamadoEm: null, contaPagamento: null });
        toast(`Conta da mesa ${m.numero} fechada`);
        mod.fechar();
      });
    };
    desenharConta();
    parar = onStore(desenharConta);
  }

  desenhar();
  const parar = onStore(() => { if (aba === 'mesas') desenhar(); });
  const t = setInterval(() => { if (aba === 'mesas') desenhar(); }, 30000);
  return () => { parar(); clearInterval(t); };
}

function imprimirQRs() {
  const w = window.open('', '_blank');
  if (!w) { toast('Permita pop-ups para imprimir', 'erro'); return; }
  const nome = esc(store.cfg.nome);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR Codes das mesas</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; }
    .g { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; padding: 10mm; }
    .c { border: 2px dashed #999; border-radius: 12px; padding: 8mm; text-align: center; page-break-inside: avoid; }
    .c img { width: 55mm; height: 55mm; image-rendering: pixelated; }
    h2 { margin: 0 0 4mm; font-size: 16pt; } h1 { font-size: 26pt; margin: 4mm 0 0; } p { margin: 2mm 0 0; color: #444; }
  </style></head><body><div class="g">
  ${store.mesas.filter(m => m.ativa !== false).map(m => `<div class="c"><h2>${nome}</h2>
    <img src="${qrDataURL(urlMesa(m.numero), 10)}" alt=""><h1>Mesa ${esc(m.numero)}</h1>
    <p>Aponte a câmera do celular para ver o cardápio e pedir</p></div>`).join('')}
  </div><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
