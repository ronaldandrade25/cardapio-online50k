// Cupons de desconto: percentual, valor fixo ou frete grátis, com mínimo, validade e limite de usos.
import { db } from '../db.js';
import { moeda, esc, modal, confirmar, toast, hojeISO, dataBR } from '../utils.js';

const TIPOS_CUPOM = { percentual: 'Percentual (%)', valor: 'Valor fixo (R$)', frete: 'Frete grátis' };

export function render(el) {
  let cupons = [];
  el.innerHTML = `
    <div class="barra-acoes"><p style="color:var(--txt2);font-size:14px">O cliente digita o código na sacola. O uso é contado quando o pedido é finalizado.</p><span class="espaco"></span>
      <button class="btn btn-pri" data-novo><i class="ti ti-plus"></i>Novo cupom</button></div>
    <div class="card tabela-wrap"><table class="tabela"><thead><tr><th>Código</th><th>Desconto</th><th class="num">Mínimo</th><th>Validade</th><th class="num">Usos</th><th>Ativo</th><th></th></tr></thead>
    <tbody id="tb"></tbody></table></div>`;
  el.querySelector('[data-novo]').onclick = () => editar();

  const desenhar = () => {
    const hoje = hojeISO();
    el.querySelector('#tb').innerHTML = cupons.map(c => {
      const expirado = c.validade && c.validade < hoje;
      const esgotado = c.limite && (c.usos || 0) >= c.limite;
      return `<tr>
        <td><strong style="font-family:monospace;font-size:15px">${esc(c.id)}</strong><br><small style="color:var(--txt3)">${esc(c.descricao || '')}</small></td>
        <td>${c.tipo === 'percentual' ? `${c.valor}%` : c.tipo === 'valor' ? moeda(c.valor) : 'Frete grátis'}</td>
        <td class="num">${c.minimo ? moeda(c.minimo) : '—'}</td>
        <td>${c.validade ? dataBR(c.validade) : 'Sem validade'} ${expirado ? '<span class="badge badge-danger">Expirado</span>' : ''}</td>
        <td class="num">${c.usos || 0}${c.limite ? ` / ${c.limite}` : ''} ${esgotado ? '<span class="badge badge-warn">Esgotado</span>' : ''}</td>
        <td><label class="switch"><input type="checkbox" data-ativo="${esc(c.id)}" ${c.ativo ? 'checked' : ''}><i></i></label></td>
        <td class="acoes"><button class="btn btn-ghost btn-ico btn-s" data-edit="${esc(c.id)}" aria-label="Editar"><i class="ti ti-edit"></i></button>
          <button class="btn btn-ghost btn-ico btn-s" data-del="${esc(c.id)}" aria-label="Excluir"><i class="ti ti-trash"></i></button></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="vazio">Nenhum cupom criado.</td></tr>';
    el.querySelectorAll('[data-ativo]').forEach(i => i.onchange = () => db.update('cupons', i.dataset.ativo, { ativo: i.checked }));
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editar(cupons.find(c => c.id === b.dataset.edit)));
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (await confirmar(`Excluir o cupom ${b.dataset.del}?`, { ok: 'Excluir', perigo: true })) await db.remove('cupons', b.dataset.del);
    });
  };

  function editar(c = { tipo: 'percentual', ativo: true }) {
    const m = modal(`<h2>${c.id ? 'Editar cupom' : 'Novo cupom'}</h2>
      <form novalidate>
        <div class="grade2">
          <label class="campo"><span>Código</span><input name="codigo" required maxlength="20" value="${esc(c.id || '')}" ${c.id ? 'readonly' : ''} style="text-transform:uppercase;font-family:monospace" placeholder="BEMVINDO10"></label>
          <label class="campo"><span>Tipo</span><select name="tipo">${Object.entries(TIPOS_CUPOM).map(([k, n]) => `<option value="${k}" ${c.tipo === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <label class="campo"><span>Descrição (aparece para o cliente)</span><input name="descricao" maxlength="60" value="${esc(c.descricao || '')}" placeholder="10% off acima de R$ 40"></label>
        <div class="grade2">
          <label class="campo" id="c-valor"><span>Valor do desconto</span><input name="valor" type="number" step="0.01" min="0" value="${c.valor ?? ''}"></label>
          <label class="campo"><span>Pedido mínimo (R$)</span><input name="minimo" type="number" step="0.01" min="0" value="${c.minimo || ''}"></label>
          <label class="campo"><span>Válido até</span><input name="validade" type="date" value="${c.validade || ''}"><small>Vazio = sem validade</small></label>
          <label class="campo"><span>Limite de usos</span><input name="limite" type="number" min="0" value="${c.limite || ''}"><small>Vazio = ilimitado</small></label>
        </div>
        <div class="linha-btns"><button type="button" class="btn" data-c>Cancelar</button><button class="btn btn-pri">Salvar</button></div>
      </form>`);
    const f = m.el.querySelector('form');
    const tipo = () => m.el.querySelector('#c-valor').classList.toggle('oculto', f.tipo.value === 'frete');
    f.tipo.onchange = tipo; tipo();
    m.el.querySelector('[data-c]').onclick = m.fechar;
    f.onsubmit = async e => {
      e.preventDefault();
      const codigo = f.codigo.value.trim().toUpperCase().replace(/\s+/g, '');
      const valor = Number(f.valor.value) || 0;
      if (!/^[A-Z0-9_-]{3,20}$/.test(codigo)) { f.codigo.closest('.campo').classList.add('erro'); toast('Use de 3 a 20 letras ou números no código', 'erro'); return; }
      if (f.tipo.value !== 'frete' && valor <= 0) { f.valor.closest('.campo').classList.add('erro'); return; }
      if (f.tipo.value === 'percentual' && valor > 100) { toast('O percentual vai até 100', 'erro'); return; }
      if (!c.id && await db.get('cupons', codigo)) { toast('Já existe um cupom com esse código', 'erro'); return; }
      await db.set('cupons', codigo, {
        tipo: f.tipo.value, valor, descricao: f.descricao.value.trim(), minimo: Number(f.minimo.value) || 0,
        validade: f.validade.value, limite: Number(f.limite.value) || 0, usos: c.usos || 0, ativo: c.ativo !== false
      });
      m.fechar();
      toast('Cupom salvo');
    };
  }

  return db.watch('cupons', {}, l => { cupons = l.sort((a, b) => a.id.localeCompare(b.id)); desenhar(); });
}
