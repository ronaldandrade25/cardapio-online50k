// Entrega: delivery/retirada, tempos, pedido mínimo e taxas por bairro.
import { db } from '../db.js';
import { store, salvarConfig } from './app.js';
import { moeda, esc, modal, confirmar, toast } from '../utils.js';

export function render(el) {
  const e = store.cfg.entrega;
  el.innerHTML = `
    <form class="card form-sec" id="f-ent" novalidate>
      <h2>Modalidades</h2><p>Defina como o cliente pode receber o pedido.</p>
      <div class="linha-cfg"><div><strong><i class="ti ti-motorbike"></i> Delivery</strong><small>Entrega no endereço do cliente</small></div><label class="switch"><input type="checkbox" name="delivery" ${e.delivery ? 'checked' : ''}><i></i></label></div>
      <div class="linha-cfg"><div><strong><i class="ti ti-building-store"></i> Retirada no local</strong><small>O cliente busca no balcão</small></div><label class="switch"><input type="checkbox" name="retirada" ${e.retirada ? 'checked' : ''}><i></i></label></div>
      <div class="grade3" style="margin-top:14px">
        <label class="campo"><span>Tempo de entrega</span><input name="tempo" value="${esc(e.tempo)}" placeholder="30–45 min"></label>
        <label class="campo"><span>Tempo para retirada</span><input name="tempoRetirada" value="${esc(e.tempoRetirada)}" placeholder="20 min"></label>
        <label class="campo"><span>Pedido mínimo (delivery)</span><input name="minimo" type="number" step="0.01" min="0" value="${e.minimo || ''}"></label>
      </div>
      <button class="btn btn-pri">Salvar</button>
    </form>
    <section class="card form-sec">
      <div class="painel-cab"><div><h2>Bairros atendidos e taxas</h2><p style="color:var(--txt2);font-size:14px">O cliente escolhe o bairro e a taxa entra no total automaticamente.</p></div>
        <button class="btn btn-pri" data-novo><i class="ti ti-plus"></i>Novo bairro</button></div>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Bairro</th><th class="num">Taxa</th><th>Tempo</th><th>Ativo</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>
    </section>`;

  const f = el.querySelector('#f-ent');
  f.onsubmit = async ev => {
    ev.preventDefault();
    if (!f.delivery.checked && !f.retirada.checked) { toast('Deixe ao menos uma modalidade ativa', 'erro'); return; }
    await salvarConfig({ entrega: { delivery: f.delivery.checked, retirada: f.retirada.checked, tempo: f.tempo.value.trim(), tempoRetirada: f.tempoRetirada.value.trim(), minimo: Number(f.minimo.value) || 0 } });
    toast('Configurações de entrega salvas');
  };

  let bairros = [];
  const desenhar = () => {
    el.querySelector('#tb').innerHTML = bairros.map(b => `<tr><td><strong>${esc(b.nome)}</strong></td>
      <td class="num">${Number(b.taxa) ? moeda(b.taxa) : '<span class="badge badge-ok">Grátis</span>'}</td><td>${esc(b.tempo || '')}</td>
      <td><label class="switch"><input type="checkbox" data-at="${b.id}" ${b.ativo !== false ? 'checked' : ''}><i></i></label></td>
      <td class="acoes"><button class="btn btn-ghost btn-ico btn-s" data-edit="${b.id}" aria-label="Editar"><i class="ti ti-edit"></i></button>
      <button class="btn btn-ghost btn-ico btn-s" data-del="${b.id}" aria-label="Excluir"><i class="ti ti-trash"></i></button></td></tr>`).join('')
      || '<tr><td colspan="5" class="vazio">Cadastre os bairros que você atende.</td></tr>';
    el.querySelectorAll('[data-at]').forEach(i => i.onchange = () => db.update('bairros', i.dataset.at, { ativo: i.checked }));
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editar(bairros.find(x => x.id === b.dataset.edit)));
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const x = bairros.find(y => y.id === b.dataset.del);
      if (await confirmar(`Excluir o bairro ${x.nome}?`, { ok: 'Excluir', perigo: true })) await db.remove('bairros', x.id);
    });
  };
  el.querySelector('[data-novo]').onclick = () => editar();

  function editar(b = {}) {
    const m = modal(`<h2>${b.id ? 'Editar bairro' : 'Novo bairro'}</h2><form novalidate>
      <label class="campo"><span>Nome do bairro</span><input name="nome" required maxlength="60" value="${esc(b.nome || '')}"></label>
      <div class="grade2"><label class="campo"><span>Taxa (R$)</span><input name="taxa" type="number" step="0.01" min="0" value="${b.taxa ?? ''}"><small>0 = entrega grátis</small></label>
      <label class="campo"><span>Tempo estimado</span><input name="tempo" value="${esc(b.tempo || '')}" placeholder="30–45 min"></label></div>
      <div class="linha-btns"><button type="button" class="btn" data-c>Cancelar</button><button class="btn btn-pri">Salvar</button></div></form>`, { classe: 'modal-p' });
    const fm = m.el.querySelector('form');
    m.el.querySelector('[data-c]').onclick = m.fechar;
    fm.onsubmit = async ev => {
      ev.preventDefault();
      if (!fm.nome.value.trim()) { fm.nome.closest('.campo').classList.add('erro'); return; }
      const d = { nome: fm.nome.value.trim(), taxa: Number(fm.taxa.value) || 0, tempo: fm.tempo.value.trim() };
      if (b.id) await db.update('bairros', b.id, d); else await db.add('bairros', { ...d, ativo: true });
      m.fechar(); toast('Bairro salvo');
    };
  }

  return db.watch('bairros', { orderBy: ['nome'] }, l => { bairros = l; desenhar(); });
}
