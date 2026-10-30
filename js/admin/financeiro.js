// Financeiro: resumo do mês, contas a pagar e contas a receber (com parcelas, recorrência e CSV).
import { db } from '../db.js';
import { moeda, esc, modal, confirmar, toast, hojeISO, dataBR } from '../utils.js';

const CATS = {
  contas_pagar: ['Fornecedores', 'Insumos', 'Aluguel', 'Contas de consumo', 'Salários', 'Impostos', 'Manutenção', 'Marketing', 'Outros'],
  contas_receber: ['Eventos', 'Cartões', 'Convênios', 'Fiado', 'Outros']
};

export function baixarCSV(nome, linhas) {
  const csv = linhas.map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const mesAtual = () => hojeISO().slice(0, 7);
const somaMes = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(a, m - 1 + n, 1); const ult = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); return hojeISO(new Date(x.getFullYear(), x.getMonth(), Math.min(d, ult))); };
const nomeMes = ym => { const s = new Date(ym + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };

function situacao(c) {
  const hoje = hojeISO();
  if (c.pago) return ['Pago', 'ok'];
  if (c.vencimento < hoje) return ['Vencida', 'danger'];
  if (c.vencimento === hoje) return ['Vence hoje', 'warn'];
  return ['Em aberto', 'info'];
}

export function render(el) {
  const E = { aba: 'resumo', mes: mesAtual(), filtro: 'todas', busca: '', contas_pagar: [], contas_receber: [], vendas: [] };
  el.innerHTML = `
    <div class="abas">
      <button data-aba="resumo" class="on">Resumo</button>
      <button data-aba="contas_pagar">Contas a pagar</button>
      <button data-aba="contas_receber">Contas a receber</button>
    </div>
    <div class="barra-acoes">
      <button class="btn btn-ico" data-mes="-1" aria-label="Mês anterior"><i class="ti ti-chevron-left"></i></button>
      <strong id="nome-mes" style="min-width:150px;text-align:center"></strong>
      <button class="btn btn-ico" data-mes="1" aria-label="Próximo mês"><i class="ti ti-chevron-right"></i></button>
      <span class="espaco"></span>
      <span id="acoes-aba" style="display:flex;gap:8px;flex-wrap:wrap"></span>
    </div>
    <div id="area"></div>`;

  el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => {
    E.aba = b.dataset.aba; E.filtro = 'todas';
    el.querySelectorAll('[data-aba]').forEach(x => x.classList.toggle('on', x === b));
    desenhar();
  });
  el.querySelectorAll('[data-mes]').forEach(b => b.onclick = () => {
    E.mes = somaMes(E.mes + '-01', +b.dataset.mes).slice(0, 7);
    carregarVendas();
    desenhar();
  });

  async function carregarVendas() {
    const [a, m] = E.mes.split('-').map(Number);
    const ini = new Date(a, m - 1, 1).getTime(), fim = new Date(a, m, 1).getTime();
    const l = await db.list('pedidos', { where: [['criadoEm', '>=', ini], ['criadoEm', '<', fim]] }).catch(() => []);
    E.vendas = l.filter(p => p.status === 'entregue');
    if (E.aba === 'resumo') desenhar();
  }

  function desenhar() {
    el.querySelector('#nome-mes').textContent = nomeMes(E.mes);
    if (E.aba === 'resumo') resumo(); else lista(E.aba);
  }

  /* ---------------- Resumo ---------------- */
  function resumo() {
    const doMes = (c, campo) => (c[campo] || '').startsWith(E.mes);
    const soma = arr => arr.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const vendas = E.vendas.reduce((s, p) => s + p.total, 0);
    const pagas = E.contas_pagar.filter(c => c.pago && doMes(c, 'pagoEm'));
    const aPagar = E.contas_pagar.filter(c => !c.pago && doMes(c, 'vencimento'));
    const recebidas = E.contas_receber.filter(c => c.pago && doMes(c, 'pagoEm'));
    const aReceber = E.contas_receber.filter(c => !c.pago && doMes(c, 'vencimento'));
    const hoje = hojeISO();
    const vencPagar = E.contas_pagar.filter(c => !c.pago && c.vencimento < hoje);
    const vencReceber = E.contas_receber.filter(c => !c.pago && c.vencimento < hoje);
    const saldo = vendas + soma(recebidas) - soma(pagas);
    const previsto = saldo + soma(aReceber) - soma(aPagar);
    const em7 = hojeISO(new Date(Date.now() + 7 * 86400e3));
    const proximas = [...E.contas_pagar.map(c => ({ ...c, col: 'pagar' })), ...E.contas_receber.map(c => ({ ...c, col: 'receber' }))]
      .filter(c => !c.pago && c.vencimento <= em7).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const porCat = {};
    [...pagas, ...aPagar].forEach(c => { porCat[c.categoria || 'Outros'] = (porCat[c.categoria || 'Outros'] || 0) + Number(c.valor); });
    const maxCat = Math.max(1, ...Object.values(porCat));

    el.querySelector('#acoes-aba').innerHTML = '';
    el.querySelector('#area').innerHTML = `
      <div class="metricas">
        <div class="card metrica"><small><i class="ti ti-shopping-cart"></i>Vendas do cardápio</small><strong>${moeda(vendas)}</strong><span class="sub">${E.vendas.length} pedidos finalizados</span></div>
        <div class="card metrica ok"><small><i class="ti ti-arrow-down-left"></i>Recebido</small><strong>${moeda(soma(recebidas))}</strong><span class="sub">A receber: ${moeda(soma(aReceber))}</span></div>
        <div class="card metrica danger"><small><i class="ti ti-arrow-up-right"></i>Pago</small><strong>${moeda(soma(pagas))}</strong><span class="sub">A pagar: ${moeda(soma(aPagar))}</span></div>
        <div class="card metrica ${saldo >= 0 ? 'ok' : 'danger'}"><small><i class="ti ti-scale"></i>Saldo realizado</small><strong>${moeda(saldo)}</strong><span class="sub">Previsto no mês: ${moeda(previsto)}</span></div>
      </div>
      ${vencPagar.length || vencReceber.length ? `<div class="card painel" style="border-color:var(--danger)">
        <strong style="color:var(--danger)"><i class="ti ti-alert-triangle"></i> Atenção:</strong>
        ${vencPagar.length ? `${vencPagar.length} conta(s) a pagar vencida(s) (${moeda(soma(vencPagar))})` : ''}
        ${vencPagar.length && vencReceber.length ? ' · ' : ''}
        ${vencReceber.length ? `${vencReceber.length} conta(s) a receber atrasada(s) (${moeda(soma(vencReceber))})` : ''}
      </div>` : ''}
      <div class="grade-painel">
        <div class="card painel"><h2 style="margin-bottom:10px">Vencimentos até os próximos 7 dias</h2>
          <div class="tabela-wrap"><table class="tabela">${proximas.map(c => {
            const [s, cor] = situacao(c);
            return `<tr><td>${dataBR(c.vencimento)}</td><td>${esc(c.descricao)}<br><small style="color:var(--txt3)">${esc(c.pessoa || '')}</small></td>
              <td><span class="badge ${c.col === 'pagar' ? 'badge-danger' : 'badge-ok'}">${c.col === 'pagar' ? 'Pagar' : 'Receber'}</span></td>
              <td><span class="badge badge-${cor}">${s}</span></td><td class="num">${moeda(c.valor)}</td></tr>`;
          }).join('') || '<tr><td class="vazio">Nada vencendo. Tudo em dia.</td></tr>'}</table></div></div>
        <div class="card painel"><h2 style="margin-bottom:10px">Despesas do mês por categoria</h2>
          <ul class="ranking">${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li><div style="flex:1">${esc(k)}<div class="barra-h"><i style="width:${v / maxCat * 100}%"></i></div></div><strong>${moeda(v)}</strong></li>`).join('') || '<li class="vazio">Sem despesas no mês.</li>'}</ul>
        </div>
      </div>`;
  }

  /* ---------------- Listas ---------------- */
  function lista(col) {
    const pagar = col === 'contas_pagar';
    const hoje = hojeISO();
    el.querySelector('#acoes-aba').innerHTML = `
      <button class="btn" data-csv><i class="ti ti-download"></i>CSV</button>
      <button class="btn btn-pri" data-nova><i class="ti ti-plus"></i>${pagar ? 'Nova conta a pagar' : 'Nova conta a receber'}</button>`;
    el.querySelector('[data-nova]').onclick = () => editar(col);

    const todas = E[col];
    let itens = E.filtro === 'vencidas'
      ? todas.filter(c => !c.pago && c.vencimento < hoje)
      : todas.filter(c => c.vencimento.startsWith(E.mes));
    if (E.filtro === 'pendentes') itens = itens.filter(c => !c.pago);
    if (E.filtro === 'pagas') itens = itens.filter(c => c.pago);
    const t = E.busca.toLowerCase();
    if (t) itens = itens.filter(c => (c.descricao + ' ' + (c.pessoa || '') + ' ' + (c.categoria || '')).toLowerCase().includes(t));
    itens.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const total = itens.reduce((s, c) => s + Number(c.valor), 0);
    const aberto = itens.filter(c => !c.pago).reduce((s, c) => s + Number(c.valor), 0);

    el.querySelector('[data-csv]').onclick = () => baixarCSV(`${pagar ? 'contas-a-pagar' : 'contas-a-receber'}-${E.mes}.csv`,
      [['Vencimento', 'Descrição', 'Categoria', pagar ? 'Fornecedor' : 'Cliente', 'Valor', 'Situação', 'Pago em', 'Observação'],
        ...itens.map(c => [dataBR(c.vencimento), c.descricao, c.categoria, c.pessoa, Number(c.valor).toFixed(2).replace('.', ','), situacao(c)[0], dataBR(c.pagoEm), c.obs])]);

    el.querySelector('#area').innerHTML = `
      <div class="barra-acoes">
        <div class="opcoes">${[['todas', 'Todas do mês'], ['pendentes', 'Em aberto'], ['pagas', pagar ? 'Pagas' : 'Recebidas'], ['vencidas', 'Vencidas (todas)']].map(([v, n]) =>
          `<label class="opcao"><input type="radio" name="fil" value="${v}" ${E.filtro === v ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
        <input class="inp" id="bf" placeholder="Buscar" value="${esc(E.busca)}" aria-label="Buscar contas">
      </div>
      <div class="metricas">
        <div class="card metrica"><small>Total listado</small><strong>${moeda(total)}</strong></div>
        <div class="card metrica ${pagar ? 'danger' : 'warn'}"><small>${pagar ? 'Falta pagar' : 'Falta receber'}</small><strong>${moeda(aberto)}</strong></div>
        <div class="card metrica ok"><small>${pagar ? 'Já pago' : 'Já recebido'}</small><strong>${moeda(total - aberto)}</strong></div>
      </div>
      <div class="card tabela-wrap"><table class="tabela"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>${pagar ? 'Fornecedor' : 'Cliente'}</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
      ${itens.map(c => {
        const [s, cor] = situacao(c);
        return `<tr><td>${dataBR(c.vencimento)}</td>
          <td><strong>${esc(c.descricao)}</strong>${c.recorrente ? ' <i class="ti ti-repeat" title="Recorrente mensal"></i>' : ''}${c.obs ? `<br><small style="color:var(--txt3)">${esc(c.obs)}</small>` : ''}</td>
          <td>${esc(c.categoria || '')}</td><td>${esc(c.pessoa || '')}</td>
          <td class="num"><strong>${moeda(c.valor)}</strong></td>
          <td><span class="badge badge-${cor}">${s}</span>${c.pago && c.pagoEm ? `<br><small style="color:var(--txt3)">${dataBR(c.pagoEm)}</small>` : ''}</td>
          <td class="acoes">
            <button class="btn btn-s ${c.pago ? 'btn-ghost' : 'btn-ok'}" data-pagar="${c.id}">${c.pago ? 'Desfazer' : pagar ? 'Pagar' : 'Receber'}</button>
            <button class="btn btn-ghost btn-ico btn-s" data-edit="${c.id}" aria-label="Editar"><i class="ti ti-edit"></i></button>
            <button class="btn btn-ghost btn-ico btn-s" data-del="${c.id}" aria-label="Excluir"><i class="ti ti-trash"></i></button></td></tr>`;
      }).join('') || `<tr><td colspan="7" class="vazio">Nenhuma conta ${E.filtro === 'vencidas' ? 'vencida' : 'neste mês'}.</td></tr>`}
      </tbody></table></div>`;

    const a = el.querySelector('#area');
    a.querySelectorAll('[name=fil]').forEach(i => i.onchange = () => { E.filtro = i.value; lista(col); });
    a.querySelector('#bf').oninput = e => {
      E.busca = e.target.value;
      const pos = e.target.selectionStart;
      lista(col);
      const novo = el.querySelector('#bf'); novo.focus(); novo.setSelectionRange(pos, pos);
    };
    a.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editar(col, E[col].find(c => c.id === b.dataset.edit)));
    a.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const c = E[col].find(x => x.id === b.dataset.del);
      if (await confirmar(`Excluir “${c.descricao}” de ${moeda(c.valor)}?`, { ok: 'Excluir', perigo: true })) { await db.remove(col, c.id); toast('Conta excluída'); }
    });
    a.querySelectorAll('[data-pagar]').forEach(b => b.onclick = () => baixa(col, E[col].find(c => c.id === b.dataset.pagar)));
  }

  async function baixa(col, c) {
    if (c.pago) {
      await db.update(col, c.id, { pago: false, pagoEm: '' });
      toast('Baixa desfeita');
      return;
    }
    const m = modal(`<h2>${col === 'contas_pagar' ? 'Registrar pagamento' : 'Registrar recebimento'}</h2>
      <p style="margin-bottom:12px">${esc(c.descricao)} · <strong>${moeda(c.valor)}</strong></p>
      <label class="campo"><span>Data</span><input type="date" id="dt" value="${hojeISO()}"></label>
      ${c.recorrente ? '<p class="aviso aviso-info" style="padding:10px;border-radius:8px;background:var(--info-bg);color:var(--info);font-size:13px">Conta recorrente: a do próximo mês será criada automaticamente.</p>' : ''}
      <div class="linha-btns"><button class="btn" data-c>Cancelar</button><button class="btn btn-ok" data-s>Confirmar</button></div>`, { classe: 'modal-p' });
    m.el.querySelector('[data-c]').onclick = m.fechar;
    m.el.querySelector('[data-s]').onclick = async () => {
      await db.update(col, c.id, { pago: true, pagoEm: m.el.querySelector('#dt').value || hojeISO() });
      if (c.recorrente && !c.proximaGerada) {
        const { id, ...dados } = c;
        await db.add(col, { ...dados, vencimento: somaMes(c.vencimento, 1), pago: false, pagoEm: '', proximaGerada: false, criadoEm: Date.now() });
        await db.update(col, c.id, { proximaGerada: true });
      }
      m.fechar();
      toast(col === 'contas_pagar' ? 'Pagamento registrado' : 'Recebimento registrado');
    };
  }

  function editar(col, c = null) {
    const pagar = col === 'contas_pagar';
    const novo = !c;
    c ||= { vencimento: hojeISO(), categoria: CATS[col][0] };
    const m = modal(`<h2>${novo ? (pagar ? 'Nova conta a pagar' : 'Nova conta a receber') : 'Editar conta'}</h2>
      <form novalidate>
        <label class="campo"><span>Descrição</span><input name="descricao" required maxlength="80" value="${esc(c.descricao || '')}"></label>
        <div class="grade2">
          <label class="campo"><span>Valor (R$)</span><input name="valor" type="number" step="0.01" min="0.01" required value="${c.valor ?? ''}"></label>
          <label class="campo"><span>Vencimento</span><input name="vencimento" type="date" required value="${c.vencimento}"></label>
          <label class="campo"><span>Categoria</span><input name="categoria" list="dl-cat" value="${esc(c.categoria || '')}"><datalist id="dl-cat">${CATS[col].map(x => `<option value="${x}">`).join('')}</datalist></label>
          <label class="campo"><span>${pagar ? 'Fornecedor' : 'Cliente'}</span><input name="pessoa" maxlength="60" value="${esc(c.pessoa || '')}"></label>
        </div>
        <label class="campo"><span>Observação</span><input name="obs" maxlength="120" value="${esc(c.obs || '')}"></label>
        ${novo ? `<label class="campo"><span>Parcelas</span><input name="parcelas" type="number" min="1" max="48" value="1"><small>Cria uma conta por mês com o mesmo valor</small></label>` : ''}
        <label class="chk"><input type="checkbox" name="recorrente" ${c.recorrente ? 'checked' : ''}><span>Recorrente todo mês (ex.: aluguel, energia)</span></label>
        <div class="linha-btns"><button type="button" class="btn" data-c>Cancelar</button><button class="btn btn-pri">Salvar</button></div>
      </form>`);
    const f = m.el.querySelector('form');
    m.el.querySelector('[data-c]').onclick = m.fechar;
    f.onsubmit = async e => {
      e.preventDefault();
      let ok = true;
      for (const n of ['descricao', 'valor', 'vencimento']) {
        if (!f[n].value.trim() || (n === 'valor' && !(Number(f.valor.value) > 0))) { f[n].closest('.campo').classList.add('erro'); ok = false; }
      }
      if (!ok) return;
      const dados = {
        descricao: f.descricao.value.trim(), valor: Math.round(Number(f.valor.value) * 100) / 100, vencimento: f.vencimento.value,
        categoria: f.categoria.value.trim() || 'Outros', pessoa: f.pessoa.value.trim(), obs: f.obs.value.trim(), recorrente: f.recorrente.checked
      };
      if (!novo) { await db.update(col, c.id, dados); }
      else {
        const n = Math.min(48, Math.max(1, Number(f.parcelas.value) || 1));
        for (let i = 0; i < n; i++) {
          await db.add(col, {
            ...dados, descricao: n > 1 ? `${dados.descricao} (${i + 1}/${n})` : dados.descricao,
            vencimento: somaMes(dados.vencimento, i), pago: false, pagoEm: '', criadoEm: Date.now()
          });
        }
      }
      m.fechar();
      toast('Conta salva');
    };
  }

  carregarVendas();
  desenhar();
  const paradas = ['contas_pagar', 'contas_receber'].map(col => db.watch(col, {}, l => { E[col] = l; desenhar(); }));
  return () => paradas.forEach(p => p());
}
