// Clientes (cadastro automático ao finalizar pedidos) e programa de fidelidade.
import { db, inc } from '../db.js';
import { store, onStore, salvarConfig, cadastrarClientes } from './app.js';
import { moeda, esc, dataHoraBR, mascaraTelefone, soDigitos, toast, modal } from '../utils.js';
import { baixarCSV } from './financeiro.js';

export function render(el) {
  let clientes = [], fid = {}, busca = '';
  el.innerHTML = `
    <section class="card form-sec" id="cfg-fid"></section>
    <div class="barra-acoes">
      <input class="inp" id="busca" placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente">
      <span class="espaco"></span>
      <button class="btn" data-csv><i class="ti ti-download"></i>Exportar CSV</button>
      <button class="btn btn-pri" data-novo><i class="ti ti-user-plus"></i>Cadastrar cliente</button>
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

  function cadastrar() {
    const m = modal(`<h2>Cadastrar cliente</h2><form novalidate>
      <label class="campo"><span>Nome</span><input name="nome" required maxlength="80"></label>
      <label class="campo"><span>WhatsApp</span><input name="telefone" inputmode="tel" required placeholder="(11) 98765-4321"></label>
      <div class="grade2">
        <label class="campo"><span>Rua e número</span><input name="rua" maxlength="100"></label>
        <label class="campo"><span>Bairro</span><input name="bairro" maxlength="60"></label>
      </div>
      <p class="msg-erro" id="cl-erro"></p>
      <div class="linha-btns"><button type="button" class="btn" data-c>Cancelar</button><button class="btn btn-pri">Salvar</button></div></form>`, { classe: 'modal-p' });
    const f = m.el.querySelector('form');
    m.el.querySelector('[data-c]').onclick = m.fechar;
    f.telefone.oninput = e => { e.target.value = mascaraTelefone(e.target.value); };
    f.onsubmit = async ev => {
      ev.preventDefault();
      const tel = soDigitos(f.telefone.value);
      if (!f.nome.value.trim() || tel.length < 10) { m.el.querySelector('#cl-erro').textContent = 'Informe o nome e um WhatsApp válido com DDD.'; return; }
      const rua = f.rua.value.trim(), bairro = f.bairro.value.trim();
      try {
        await db.set('clientes', tel, { nome: f.nome.value.trim(), telefone: tel, criadoEm: Date.now(), ...(rua || bairro ? { endereco: { rua, bairro } } : {}) }, true);
        m.fechar(); toast('Cliente cadastrado');
      } catch { m.el.querySelector('#cl-erro').textContent = 'Não foi possível salvar. Confira as regras do Firestore.'; }
    };
  }

  el.querySelector('[data-novo]').onclick = cadastrar;
  el.querySelector('#busca').oninput = e => { busca = e.target.value; desenhar(); };
  el.querySelector('[data-csv]').onclick = () => baixarCSV('clientes.csv',
    [['Nome', 'WhatsApp', 'Pedidos', 'Total gasto', 'Pontos', 'Bairro', 'Último pedido'],
      ...clientes.map(c => [c.nome, mascaraTelefone(c.id), c.pedidos || 0, (c.totalGasto || 0).toFixed(2).replace('.', ','), fid[c.id]?.pontos || 0, c.endereco?.bairro || '', c.ultimoPedido ? dataHoraBR(c.ultimoPedido) : ''])]);

  desenharCfg();
  cadastrarClientes(); // garante o cadastro dos pedidos já carregados
  const paradas = [
    // sem orderBy no servidor: o Firestore esconde documentos que não têm o campo ordenado
    db.watch('clientes', {}, l => { clientes = l.sort((a, b) => (b.ultimoPedido || b.criadoEm || 0) - (a.ultimoPedido || a.criadoEm || 0)); desenhar(); }),
    db.watch('fidelidade', {}, l => { fid = Object.fromEntries(l.map(f => [f.id, f])); desenhar(); }),
    onStore(() => { desenharCfg(); desenhar(); })
  ];
  return () => paradas.forEach(p => p());
}
