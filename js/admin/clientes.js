// Clientes (cadastro automático ao finalizar pedidos) e programa de fidelidade.
import { db, inc } from '../db.js';
import { store, onStore, salvarConfig } from './app.js';
import { moeda, esc, dataHoraBR, mascaraTelefone, toast, modal } from '../utils.js';
import { baixarCSV } from './financeiro.js';

export function render(el) {
  let clientes = [], fid = {}, busca = '';
  el.innerHTML = `
    <section class="card form-sec" id="cfg-fid"></section>
    <div class="barra-acoes">
      <input class="inp" id="busca" placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente">
      <span class="espaco"></span>
      <button class="btn" data-csv><i class="ti ti-download"></i>Exportar CSV</button>
    </div>
    <div class="card tabela-wrap"><table class="tabela"><thead><tr><th>Cliente</th><th>WhatsApp</th><th class="num">Pedidos</th><th class="num">Total gasto</th><th>Fidelidade</th><th>Último pedido</th><th></th></tr></thead>
    <tbody id="tb"></tbody></table></div>`;

  function desenharCfg() {
    const f = store.cfg.fidelidade;
    const box = el.querySelector('#cfg-fid');
    if (box.contains(document.activeElement)) return;
    box.innerHTML = `
      <div class="linha-cfg" style="padding-top:0"><div><h2><i class="ti ti-gift"></i> Programa de fidelidade</h2>
        <small>A cada pedido finalizado o cliente ganha 1 ponto (pelo WhatsApp). Ao atingir a meta, ele pode usar a recompensa no checkout.</small></div>
        <label class="switch"><input type="checkbox" name="ativo" ${f.ativo ? 'checked' : ''}><i></i></label></div>
      <form class="grade3" style="margin-top:12px" novalidate>
        <label class="campo"><span>Meta (nº de pedidos)</span><input name="meta" type="number" min="2" max="100" value="${f.meta}"></label>
        <label class="campo"><span>Tipo de recompensa</span><select name="tipo"><option value="valor" ${f.tipo === 'valor' ? 'selected' : ''}>Desconto em R$</option><option value="percentual" ${f.tipo === 'percentual' ? 'selected' : ''}>Desconto em %</option></select></label>
        <label class="campo"><span>Valor</span><input name="valor" type="number" step="0.01" min="0" value="${f.valor}"></label>
        <label class="campo" style="grid-column:1/-1"><span>Como aparece para o cliente</span><input name="descricao" maxlength="60" value="${esc(f.descricao)}"></label>
        <div style="grid-column:1/-1"><button class="btn btn-pri">Salvar programa</button></div>
      </form>`;
    const form = box.querySelector('form');
    box.querySelector('[name=ativo]').onchange = e => salvarConfig({ fidelidade: { ...store.cfg.fidelidade, ativo: e.target.checked } });
    form.onsubmit = async e => {
      e.preventDefault();
      const meta = Math.round(Number(form.meta.value));
      const valor = Number(form.valor.value);
      if (!(meta >= 2) || !(valor > 0)) { toast('Informe meta (mín. 2) e valor maiores que zero', 'erro'); return; }
      await salvarConfig({ fidelidade: { ...store.cfg.fidelidade, meta, tipo: form.tipo.value, valor, descricao: form.descricao.value.trim() || (form.tipo.value === 'valor' ? `${moeda(valor)} de desconto` : `${valor}% de desconto`) } });
      toast('Programa de fidelidade salvo');
    };
  }

  function desenhar() {
    const t = busca.toLowerCase();
    const meta = store.cfg.fidelidade.meta;
    const lista = clientes.filter(c => !t || c.nome?.toLowerCase().includes(t) || c.id.includes(t.replace(/\D/g, '') || '§'));
    el.querySelector('#tb').innerHTML = lista.map(c => {
      const pts = fid[c.id]?.pontos || 0;
      return `<tr>
        <td><strong>${esc(c.nome)}</strong>${c.endereco ? `<br><small style="color:var(--txt3)">${esc(c.endereco.bairro)}</small>` : ''}</td>
        <td><a href="https://wa.me/55${c.id}" target="_blank" rel="noopener">${esc(mascaraTelefone(c.id))}</a></td>
        <td class="num">${c.pedidos || 0}</td>
        <td class="num">${moeda(c.totalGasto)}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="barra-h" style="width:80px;margin:0"><i style="width:${Math.min(100, pts / meta * 100)}%"></i></div>
          <small>${pts}/${meta}</small>${pts >= meta ? ' <span class="badge badge-ok">Recompensa</span>' : ''}</div></td>
        <td>${c.ultimoPedido ? dataHoraBR(c.ultimoPedido) : '—'}</td>
        <td class="acoes"><button class="btn btn-ghost btn-s" data-pts="${c.id}">Ajustar pontos</button></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="vazio">Os clientes aparecem aqui quando um pedido com WhatsApp é finalizado.</td></tr>';
    el.querySelectorAll('[data-pts]').forEach(b => b.onclick = () => ajustar(b.dataset.pts));
  }

  function ajustar(tel) {
    const atual = fid[tel]?.pontos || 0;
    const m = modal(`<h2>Ajustar pontos</h2><p style="color:var(--txt2);margin-bottom:12px">${esc(clientes.find(c => c.id === tel)?.nome || '')} tem ${atual} ponto(s).</p>
      <label class="campo"><span>Novo saldo de pontos</span><input type="number" min="0" id="pts" value="${atual}"></label>
      <div class="linha-btns"><button class="btn" data-c>Cancelar</button><button class="btn btn-pri" data-s>Salvar</button></div>`, { classe: 'modal-p' });
    m.el.querySelector('[data-c]').onclick = m.fechar;
    m.el.querySelector('[data-s]').onclick = async () => {
      const novo = Math.max(0, Math.round(Number(m.el.querySelector('#pts').value) || 0));
      await db.set('fidelidade', tel, { pontos: inc(novo - atual), atualizadoEm: Date.now() }, true);
      m.fechar(); toast('Pontos atualizados');
    };
  }

  el.querySelector('#busca').oninput = e => { busca = e.target.value; desenhar(); };
  el.querySelector('[data-csv]').onclick = () => baixarCSV('clientes.csv',
    [['Nome', 'WhatsApp', 'Pedidos', 'Total gasto', 'Pontos', 'Bairro', 'Último pedido'],
      ...clientes.map(c => [c.nome, mascaraTelefone(c.id), c.pedidos || 0, (c.totalGasto || 0).toFixed(2).replace('.', ','), fid[c.id]?.pontos || 0, c.endereco?.bairro || '', c.ultimoPedido ? dataHoraBR(c.ultimoPedido) : ''])]);

  desenharCfg();
  const paradas = [
    db.watch('clientes', { orderBy: ['ultimoPedido', 'desc'] }, l => { clientes = l; desenhar(); }),
    db.watch('fidelidade', {}, l => { fid = Object.fromEntries(l.map(f => [f.id, f])); desenhar(); }),
    onStore(() => { desenharCfg(); desenhar(); })
  ];
  return () => paradas.forEach(p => p());
}
