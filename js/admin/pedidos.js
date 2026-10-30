// Pedidos em tempo real (kanban): aceitar, avançar status, cancelar, imprimir.
import { store, onStore } from './app.js';
import { proximoStatus, rotuloAcao, mudarStatus, cancelar, imprimir, enderecoTexto, pagamentoTexto, statusBadge } from './acoes.js';
import { moeda, esc, TIPOS, tempoDesde, dataHoraBR, horaBR, mascaraTelefone, modal, inicioDoDia, soDigitos } from '../utils.js';

const COLUNAS = [
  ['novo', 'Novos', s => s === 'novo'],
  ['preparo', 'Em preparo', s => s === 'preparo'],
  ['pronto', 'Prontos / em entrega', s => s === 'pronto' || s === 'entrega'],
  ['fim', 'Finalizados hoje', s => s === 'entregue' || s === 'cancelado']
];

export function render(el) {
  let filtro = 'todos';
  el.innerHTML = `
    <div class="barra-acoes">
      <div class="opcoes" id="filtro-tipo">
        ${[['todos', 'Todos'], ['delivery', 'Delivery'], ['retirada', 'Retirada'], ['mesa', 'Mesa']].map(([v, n], i) =>
          `<label class="opcao"><input type="radio" name="ft" value="${v}" ${i === 0 ? 'checked' : ''}><span>${n}</span></label>`).join('')}
      </div>
    </div>
    <div class="kanban" id="kanban"></div>`;

  el.querySelector('#filtro-tipo').onchange = e => { filtro = e.target.value; desenhar(); };

  function desenhar() {
    const hoje = inicioDoDia();
    const lista = store.pedidos.filter(p => filtro === 'todos' || p.tipo === filtro);
    el.querySelector('#kanban').innerHTML = COLUNAS.map(([k, nome, f]) => {
      const ps = lista.filter(p => f(p.status) && (k !== 'fim' || p.criadoEm >= hoje));
      if (k !== 'fim') ps.sort((a, b) => a.criadoEm - b.criadoEm);
      return `<div class="coluna">
        <div class="coluna-cab"><span>${nome}</span><span class="badge">${ps.length}</span></div>
        ${ps.map(cartao).join('') || '<p class="vazio" style="padding:20px 0;font-size:13px">Nenhum pedido</p>'}
      </div>`;
    }).join('');
  }

  function cartao(p) {
    const min = (Date.now() - p.criadoEm) / 60000;
    const ativo = !['entregue', 'cancelado'].includes(p.status);
    const prox = proximoStatus(p);
    return `<div class="ped ${p.status === 'novo' ? 'novo' : ''}" data-id="${p.id}">
      <div class="ped-cab"><strong>#${p.numero}</strong>
        <span class="badge ${p.tipo === 'mesa' ? 'badge-info' : p.tipo === 'delivery' ? 'badge-pri' : ''}">${TIPOS[p.tipo]}${p.mesa ? ' ' + esc(p.mesa) : ''}</span>
        <span class="ped-tempo ${ativo && min > 40 ? 'atraso' : ''}">${ativo ? tempoDesde(p.criadoEm) : horaBR(p.criadoEm)}</span>
      </div>
      <div class="ped-cli">${esc(p.cliente?.nome || '')}${p.endereco ? ` · ${esc(p.endereco.bairro)}` : ''}</div>
      <ul class="ped-itens">${p.itens.slice(0, 4).map(i => `<li>${i.qtd}× ${esc(i.nome)}</li>`).join('')}${p.itens.length > 4 ? `<li>+ ${p.itens.length - 4} itens</li>` : ''}</ul>
      <div class="ped-rod"><strong>${moeda(p.total)}</strong>
        ${ativo && prox ? `<button class="btn btn-s ${p.status === 'novo' ? 'btn-pri' : ''}" data-avancar="${p.id}">${rotuloAcao[prox]}</button>` : statusBadge(p.status)}
      </div>
    </div>`;
  }

  el.addEventListener('click', async e => {
    const av = e.target.closest('[data-avancar]');
    if (av) {
      e.stopPropagation();
      const p = store.pedidos.find(x => x.id === av.dataset.avancar);
      av.disabled = true;
      await mudarStatus(p, proximoStatus(p));
      return;
    }
    const c = e.target.closest('.ped');
    if (c) detalhe(c.dataset.id);
  });

  desenhar();
  const parar = onStore(desenhar);
  const relogio = setInterval(desenhar, 30000);
  // abre direto um pedido: #/pedidos?id=...
  const idHash = new URLSearchParams(location.hash.split('?')[1]).get('id');
  if (idHash) setTimeout(() => detalhe(idHash), 100);
  return () => { parar(); clearInterval(relogio); };
}

export function detalhe(id) {
  const p0 = store.pedidos.find(x => x.id === id);
  if (!p0) return;
  let parar = null;
  const m = modal('<div id="det"></div>', { classe: 'modal-g', aoFechar: () => parar?.() });
  const desenhar = () => {
    const p = store.pedidos.find(x => x.id === id);
    if (!p) return;
    const prox = proximoStatus(p);
    const ativo = !['entregue', 'cancelado'].includes(p.status);
    const tel = soDigitos(p.cliente?.telefone);
    m.el.querySelector('#det').innerHTML = `
      <h2>Pedido #${p.numero} ${statusBadge(p.status)}</h2>
      <div class="det-grade">
        <div><small>Tipo</small>${TIPOS[p.tipo]}${p.mesa ? ' ' + esc(p.mesa) : ''}</div>
        <div><small>Recebido</small>${dataHoraBR(p.criadoEm)}</div>
        <div><small>Cliente</small>${esc(p.cliente?.nome || '—')}${tel ? `<br><a href="https://wa.me/55${tel}" target="_blank" rel="noopener">${esc(mascaraTelefone(tel))}</a>` : ''}</div>
        <div><small>Pagamento</small>${esc(pagamentoTexto(p))}</div>
        ${p.endereco ? `<div style="grid-column:1/-1"><small>Endereço</small>${esc(enderecoTexto(p.endereco))}</div>` : ''}
        ${p.obs ? `<div style="grid-column:1/-1"><small>Observação</small>${esc(p.obs)}</div>` : ''}
        ${p.motivoCancelamento ? `<div style="grid-column:1/-1"><small>Motivo do cancelamento</small>${esc(p.motivoCancelamento)}</div>` : ''}
      </div>
      <table class="tabela">
        ${p.itens.map(i => `<tr><td><strong>${i.qtd}×</strong> ${esc(i.nome)}
          ${i.adicionais?.length ? `<br><small style="color:var(--txt2)">+ ${i.adicionais.map(a => esc(a.nome)).join(', ')}</small>` : ''}
          ${i.obs ? `<br><small style="color:var(--warn)">Obs.: ${esc(i.obs)}</small>` : ''}</td>
          <td class="num">${moeda(i.preco * i.qtd)}</td></tr>`).join('')}
        <tr><td>Subtotal</td><td class="num">${moeda(p.subtotal)}</td></tr>
        ${p.taxa ? `<tr><td>Taxa de entrega</td><td class="num">${moeda(p.taxa)}</td></tr>` : ''}
        ${p.desconto ? `<tr><td>Cupom ${esc(p.cupom || '')}</td><td class="num">− ${moeda(p.desconto)}</td></tr>` : ''}
        ${p.descontoFidelidade ? `<tr><td>Recompensa fidelidade</td><td class="num">− ${moeda(p.descontoFidelidade)}</td></tr>` : ''}
        <tr><td><strong>Total</strong></td><td class="num"><strong>${moeda(p.total)}</strong></td></tr>
      </table>
      <div class="linha-btns">
        ${ativo ? '<button class="btn btn-ghost" data-cancelar style="color:var(--danger);margin-right:auto"><i class="ti ti-x"></i>Cancelar pedido</button>' : ''}
        <button class="btn" data-imprimir><i class="ti ti-printer"></i>Imprimir</button>
        ${ativo && prox ? `<button class="btn btn-pri" data-prox>${rotuloAcao[prox]}</button>` : ''}
      </div>`;
    const el = m.el;
    el.querySelector('[data-imprimir]').onclick = () => imprimir(p);
    el.querySelector('[data-prox]')?.addEventListener('click', async () => {
      await mudarStatus(p, prox);
      if (prox === 'entregue') m.fechar();
    });
    el.querySelector('[data-cancelar]')?.addEventListener('click', () => {
      const c = modal(`<h2>Cancelar pedido #${p.numero}</h2>
        <label class="campo"><span>Motivo (o cliente verá esta mensagem)</span>
        <select id="mot"><option>Produto em falta</option><option>Fora da área de entrega</option><option>Loja fechando</option><option>Solicitado pelo cliente</option><option>Outro</option></select></label>
        <div class="linha-btns"><button class="btn" data-n>Voltar</button><button class="btn btn-perigo" data-s>Cancelar pedido</button></div>`, { classe: 'modal-p' });
      c.el.querySelector('[data-n]').onclick = c.fechar;
      c.el.querySelector('[data-s]').onclick = async () => { await cancelar(p, c.el.querySelector('#mot').value); c.fechar(); m.fechar(); };
    });
  };
  desenhar();
  parar = onStore(desenhar);
}
