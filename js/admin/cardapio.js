// Cardápio: produtos (foto, preço, promoção, selos, adicionais, upsell, esgotado), categorias e grupos de adicionais.
import { db } from '../db.js';
import { semear } from '../seed.js';
import { moeda, esc, modal, confirmar, toast, comprimirImagem } from '../utils.js';

const SELOS = ['Mais vendido', 'Promoção', 'Novo', 'Vegano', 'Picante', 'Mais pedido'];
const urlSegura = u => String(u || '').replace(/["'()\\\s]/g, '');

export function render(el) {
  const E = { prods: [], cats: [], adic: [], aba: 'produtos', busca: '', cat: '' };
  el.innerHTML = `
    <div class="abas">
      <button data-aba="produtos" class="on">Produtos</button>
      <button data-aba="categorias">Categorias</button>
      <button data-aba="adicionais">Adicionais e opções</button>
    </div>
    <div id="area"></div>`;
  el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => {
    E.aba = b.dataset.aba;
    el.querySelectorAll('[data-aba]').forEach(x => x.classList.toggle('on', x === b));
    desenhar(true);
  });

  const paradas = [
    db.watch('produtos', { orderBy: ['ordem'] }, l => { E.prods = l; desenhar(); }),
    db.watch('categorias', { orderBy: ['ordem'] }, l => { E.cats = l; desenhar(); }),
    db.watch('adicionais', {}, l => { E.adic = l.sort((a, b) => a.nome.localeCompare(b.nome)); desenhar(); })
  ];
  const area = () => el.querySelector('#area');
  const nomeCat = id => E.cats.find(c => c.id === id)?.nome || '—';

  function desenhar(trocouAba) {
    if (E.aba === 'produtos') desenharProdutos(trocouAba);
    else if (E.aba === 'categorias') desenharCategorias();
    else desenharAdicionais();
  }

  /* ---------------- Produtos ---------------- */
  function desenharProdutos(montar) {
    if (montar || !area().querySelector('#tb-prod')) {
      area().innerHTML = `
        <div class="barra-acoes">
          <input class="inp" id="b-prod" placeholder="Buscar produto" value="${esc(E.busca)}" aria-label="Buscar produto">
          <select class="inp" id="f-cat" style="max-width:220px" aria-label="Filtrar por categoria"></select>
          <span class="espaco"></span>
          <button class="btn btn-pri" data-novo><i class="ti ti-plus"></i>Novo produto</button>
        </div>
        <div class="card tabela-wrap"><table class="tabela"><thead><tr>
          <th>Produto</th><th>Categoria</th><th class="num">Preço</th><th>Disponível</th><th></th></tr></thead>
          <tbody id="tb-prod"></tbody></table></div>`;
      area().querySelector('#b-prod').oninput = e => { E.busca = e.target.value.toLowerCase(); linhas(); };
      area().querySelector('#f-cat').onchange = e => { E.cat = e.target.value; linhas(); };
      area().querySelector('[data-novo]').onclick = () => editarProduto();
    }
    area().querySelector('#f-cat').innerHTML = `<option value="">Todas as categorias</option>` +
      E.cats.map(c => `<option value="${c.id}" ${E.cat === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
    linhas();
  }

  function linhas() {
    const tb = area().querySelector('#tb-prod');
    if (!tb) return;
    const ps = E.prods.filter(p => (!E.cat || p.categoriaId === E.cat) && (!E.busca || p.nome.toLowerCase().includes(E.busca)));
    tb.innerHTML = ps.map(p => `<tr>
      <td><div class="prod-nome"><div class="mini-foto" style="${p.foto ? `background-image:url('${urlSegura(p.foto)}')` : ''}">${p.foto ? '' : esc(p.emoji || '🍽️')}</div>
        <div><strong>${esc(p.nome)}</strong><small>${(p.selos || []).map(esc).join(' · ')}${p.upsell ? ' · <i class="ti ti-sparkles"></i> sugestão' : ''}</small></div></div></td>
      <td>${esc(nomeCat(p.categoriaId))}</td>
      <td class="num">${p.precoPromo ? `<s style="color:var(--txt3)">${moeda(p.preco)}</s><br><strong style="color:var(--ok)">${moeda(p.precoPromo)}</strong>` : moeda(p.preco)}</td>
      <td><label class="switch" title="Disponível / esgotado"><input type="checkbox" data-disp="${p.id}" ${p.disponivel !== false ? 'checked' : ''}><i></i></label></td>
      <td class="acoes">
        <button class="btn btn-ghost btn-ico btn-s" data-edit="${p.id}" aria-label="Editar"><i class="ti ti-edit"></i></button>
        <button class="btn btn-ghost btn-ico btn-s" data-dup="${p.id}" aria-label="Duplicar"><i class="ti ti-copy"></i></button>
        <button class="btn btn-ghost btn-ico btn-s" data-del="${p.id}" aria-label="Excluir"><i class="ti ti-trash"></i></button>
      </td></tr>`).join('') || (E.prods.length
      ? '<tr><td colspan="5" class="vazio">Nenhum produto encontrado.</td></tr>'
      : '<tr><td colspan="5" class="vazio">Nenhum produto cadastrado.<br><button class="btn btn-pri" data-exemplo style="margin-top:10px"><i class="ti ti-database-import"></i>Carregar categorias e produtos de exemplo</button></td></tr>');

    tb.querySelector('[data-exemplo]')?.addEventListener('click', async () => {
      try { await semear({ soCardapio: true }); toast('Categorias e produtos de exemplo carregados'); } catch { toast('Não foi possível carregar. Confira as regras do Firestore.', 'erro'); }
    });

    tb.querySelectorAll('[data-disp]').forEach(i => i.onchange = () => {
      db.update('produtos', i.dataset.disp, { disponivel: i.checked });
      toast(i.checked ? 'Produto disponível' : 'Produto marcado como esgotado');
    });
    tb.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editarProduto(E.prods.find(p => p.id === b.dataset.edit)));
    tb.querySelectorAll('[data-dup]').forEach(b => b.onclick = async () => {
      const { id, ...p } = E.prods.find(x => x.id === b.dataset.dup);
      await db.add('produtos', { ...p, nome: p.nome + ' (cópia)', ordem: E.prods.length, criadoEm: Date.now() });
      toast('Produto duplicado');
    });
    tb.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const p = E.prods.find(x => x.id === b.dataset.del);
      if (await confirmar(`Excluir “${p.nome}”? Para tirar do cardápio temporariamente, use o botão de disponível.`, { ok: 'Excluir', perigo: true })) {
        await db.remove('produtos', p.id); toast('Produto excluído');
      }
    });
  }

  function editarProduto(p = {}) {
    if (!E.cats.length) { toast('Crie uma categoria antes', 'erro'); return; }
    let foto = p.foto || '';
    const m = modal(`<h2>${p.id ? 'Editar produto' : 'Novo produto'}</h2>
      <form id="fp" novalidate>
        <div class="img-up" style="margin-bottom:14px">
          <div class="img-prev" id="prev"></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <label class="btn btn-s"><i class="ti ti-upload"></i>Enviar foto<input type="file" accept="image/*" id="arq" hidden></label>
            <button type="button" class="btn btn-s btn-ghost" data-url><i class="ti ti-link"></i>Usar link de imagem</button>
            <button type="button" class="btn btn-s btn-ghost" data-rem-foto style="color:var(--danger)">Remover foto</button>
          </div>
        </div>
        <div class="grade2">
          <label class="campo"><span>Nome</span><input name="nome" required maxlength="80" value="${esc(p.nome || '')}"></label>
          <label class="campo"><span>Categoria</span><select name="categoriaId">${E.cats.map(c => `<option value="${c.id}" ${p.categoriaId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
        </div>
        <label class="campo"><span>Descrição</span><textarea name="descricao" maxlength="300">${esc(p.descricao || '')}</textarea></label>
        <div class="grade3">
          <label class="campo"><span>Preço (R$)</span><input name="preco" type="number" step="0.01" min="0" required value="${p.preco ?? ''}"></label>
          <label class="campo"><span>Preço promocional</span><input name="precoPromo" type="number" step="0.01" min="0" value="${p.precoPromo ?? ''}"><small>Deixe vazio se não houver</small></label>
          <label class="campo"><span>Emoji (sem foto)</span><input name="emoji" maxlength="4" value="${esc(p.emoji || '🍔')}"></label>
        </div>
        <div class="campo"><span>Selos</span><div class="chips">${SELOS.map(s => `<label><input type="checkbox" name="selos" value="${s}" ${(p.selos || []).includes(s) ? 'checked' : ''}><span>${s}</span></label>`).join('')}</div></div>
        <div class="campo"><span>Grupos de adicionais</span>
          ${E.adic.length ? `<div class="chips">${E.adic.map(a => `<label><input type="checkbox" name="adicionais" value="${a.id}" ${(p.adicionais || []).includes(a.id) ? 'checked' : ''}><span>${esc(a.nome)}</span></label>`).join('')}</div>` : '<small>Crie grupos na aba “Adicionais e opções”.</small>'}
        </div>
        <div class="linha-cfg"><div><strong><i class="ti ti-sparkles"></i> Sugerir na sacola (upsell)</strong><small>Aparece em “Que tal completar seu pedido?”</small></div>
          <label class="switch"><input type="checkbox" name="upsell" ${p.upsell ? 'checked' : ''}><i></i></label></div>
        <div class="linha-cfg"><div><strong>Disponível</strong><small>Desligue quando acabar o estoque</small></div>
          <label class="switch"><input type="checkbox" name="disponivel" ${p.disponivel !== false ? 'checked' : ''}><i></i></label></div>
        <div class="linha-btns"><button type="button" class="btn" data-cancelar>Cancelar</button><button class="btn btn-pri">Salvar</button></div>
      </form>`);
    const f = m.el.querySelector('#fp');
    const prev = () => {
      const el2 = m.el.querySelector('#prev');
      el2.style.backgroundImage = foto ? `url('${urlSegura(foto)}')` : '';
      el2.innerHTML = foto ? '' : '<i class="ti ti-photo"></i>';
    };
    prev();
    m.el.querySelector('#arq').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try { foto = await comprimirImagem(file); prev(); } catch { toast('Não foi possível ler a imagem', 'erro'); }
    };
    m.el.querySelector('[data-url]').onclick = () => {
      const u = prompt('Cole o link (https://…) da imagem:', foto.startsWith('http') ? foto : '');
      if (u && /^https:\/\//.test(u)) { foto = u.trim(); prev(); }
    };
    m.el.querySelector('[data-rem-foto]').onclick = () => { foto = ''; prev(); };
    m.el.querySelector('[data-cancelar]').onclick = m.fechar;
    f.onsubmit = async e => {
      e.preventDefault();
      const preco = Number(f.preco.value);
      const promo = f.precoPromo.value ? Number(f.precoPromo.value) : null;
      if (!f.nome.value.trim()) { f.nome.closest('.campo').classList.add('erro'); f.nome.focus(); return; }
      if (!(preco >= 0) || f.preco.value === '') { f.preco.closest('.campo').classList.add('erro'); f.preco.focus(); return; }
      if (promo !== null && promo >= preco) { toast('O preço promocional deve ser menor que o preço normal', 'erro'); return; }
      const dados = {
        nome: f.nome.value.trim(), categoriaId: f.categoriaId.value, descricao: f.descricao.value.trim(),
        preco, precoPromo: promo, emoji: f.emoji.value.trim(), foto,
        selos: [...f.querySelectorAll('[name=selos]:checked')].map(i => i.value),
        adicionais: [...f.querySelectorAll('[name=adicionais]:checked')].map(i => i.value),
        upsell: f.upsell.checked, disponivel: f.disponivel.checked
      };
      try {
        if (p.id) await db.update('produtos', p.id, dados);
        else await db.add('produtos', { ...dados, ordem: E.prods.length, criadoEm: Date.now() });
        toast('Produto salvo');
        m.fechar();
      } catch (err) {
        console.error(err);
        toast('Não foi possível salvar. A foto pode estar grande demais.', 'erro');
      }
    };
  }

  /* ---------------- Categorias ---------------- */
  function desenharCategorias() {
    area().innerHTML = `
      <div class="barra-acoes"><p style="color:var(--txt2);font-size:14px">Use as setas para definir a ordem no cardápio.</p><span class="espaco"></span>
        <button class="btn btn-pri" data-nova><i class="ti ti-plus"></i>Nova categoria</button></div>
      <div class="card tabela-wrap"><table class="tabela"><thead><tr><th>Ordem</th><th>Categoria</th><th class="num">Produtos</th><th>Visível</th><th></th></tr></thead><tbody>
      ${E.cats.map((c, i) => `<tr>
        <td><button class="btn btn-ghost btn-ico btn-s" data-sobe="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir"><i class="ti ti-arrow-up"></i></button>
            <button class="btn btn-ghost btn-ico btn-s" data-desce="${i}" ${i === E.cats.length - 1 ? 'disabled' : ''} aria-label="Descer"><i class="ti ti-arrow-down"></i></button></td>
        <td><strong>${esc(c.emoji || '')} ${esc(c.nome)}</strong></td>
        <td class="num">${E.prods.filter(p => p.categoriaId === c.id).length}</td>
        <td><label class="switch"><input type="checkbox" data-vis="${c.id}" ${c.ativo !== false ? 'checked' : ''}><i></i></label></td>
        <td class="acoes"><button class="btn btn-ghost btn-ico btn-s" data-edit="${c.id}" aria-label="Editar"><i class="ti ti-edit"></i></button>
          <button class="btn btn-ghost btn-ico btn-s" data-del="${c.id}" aria-label="Excluir"><i class="ti ti-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhuma categoria.</td></tr>'}
      </tbody></table></div>`;
    const a = area();
    a.querySelector('[data-nova]').onclick = () => editarCategoria();
    a.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editarCategoria(E.cats.find(c => c.id === b.dataset.edit)));
    a.querySelectorAll('[data-vis]').forEach(i => i.onchange = () => db.update('categorias', i.dataset.vis, { ativo: i.checked }));
    const trocar = async (i, j) => {
      const lista = [...E.cats];
      [lista[i], lista[j]] = [lista[j], lista[i]];
      await Promise.all(lista.map((c, k) => c.ordem !== k ? db.update('categorias', c.id, { ordem: k }) : null));
    };
    a.querySelectorAll('[data-sobe]').forEach(b => b.onclick = () => trocar(+b.dataset.sobe, +b.dataset.sobe - 1));
    a.querySelectorAll('[data-desce]').forEach(b => b.onclick = () => trocar(+b.dataset.desce, +b.dataset.desce + 1));
    a.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const c = E.cats.find(x => x.id === b.dataset.del);
      if (E.prods.some(p => p.categoriaId === c.id)) { toast('Mova ou exclua os produtos desta categoria antes', 'erro'); return; }
      if (await confirmar(`Excluir a categoria “${c.nome}”?`, { ok: 'Excluir', perigo: true })) await db.remove('categorias', c.id);
    });
  }

  function editarCategoria(c = {}) {
    const m = modal(`<h2>${c.id ? 'Editar categoria' : 'Nova categoria'}</h2>
      <form novalidate><div class="grade3" style="grid-template-columns:3fr 1fr">
        <label class="campo"><span>Nome</span><input name="nome" required maxlength="40" value="${esc(c.nome || '')}"></label>
        <label class="campo"><span>Emoji</span><input name="emoji" maxlength="4" value="${esc(c.emoji || '')}"></label></div>
        <div class="linha-btns"><button type="button" class="btn" data-c>Cancelar</button><button class="btn btn-pri">Salvar</button></div></form>`, { classe: 'modal-p' });
    const f = m.el.querySelector('form');
    m.el.querySelector('[data-c]').onclick = m.fechar;
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.nome.value.trim()) { f.nome.closest('.campo').classList.add('erro'); return; }
      const d = { nome: f.nome.value.trim(), emoji: f.emoji.value.trim() };
      if (c.id) await db.update('categorias', c.id, d);
      else await db.add('categorias', { ...d, ordem: E.cats.length, ativo: true });
      m.fechar();
      toast('Categoria salva');
    };
  }

  /* ---------------- Adicionais ---------------- */
  function desenharAdicionais() {
    area().innerHTML = `
      <div class="barra-acoes"><p style="color:var(--txt2);font-size:14px">Grupos como “Ponto da carne” ou “Turbine seu lanche”. Depois, vincule ao produto.</p><span class="espaco"></span>
        <button class="btn btn-pri" data-novo><i class="ti ti-plus"></i>Novo grupo</button></div>
      <div class="card tabela-wrap"><table class="tabela"><thead><tr><th>Grupo</th><th>Regra</th><th>Opções</th><th></th></tr></thead><tbody>
      ${E.adic.map(g => `<tr><td><strong>${esc(g.nome)}</strong></td>
        <td>${g.min > 0 ? `<span class="badge badge-warn">Obrigatório</span> ` : ''}${g.min || 0} a ${g.max || '∞'}</td>
        <td style="font-size:13px;color:var(--txt2)">${(g.opcoes || []).map(o => esc(o.nome) + (o.preco ? ` (+${moeda(o.preco)})` : '')).join(', ')}</td>
        <td class="acoes"><button class="btn btn-ghost btn-ico btn-s" data-edit="${g.id}" aria-label="Editar"><i class="ti ti-edit"></i></button>
          <button class="btn btn-ghost btn-ico btn-s" data-del="${g.id}" aria-label="Excluir"><i class="ti ti-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Nenhum grupo.</td></tr>'}
      </tbody></table></div>`;
    const a = area();
    a.querySelector('[data-novo]').onclick = () => editarGrupo();
    a.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editarGrupo(E.adic.find(g => g.id === b.dataset.edit)));
    a.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const g = E.adic.find(x => x.id === b.dataset.del);
      if (await confirmar(`Excluir o grupo “${g.nome}”? Ele será removido dos produtos.`, { ok: 'Excluir', perigo: true })) {
        await db.remove('adicionais', g.id);
        for (const p of E.prods.filter(p => (p.adicionais || []).includes(g.id))) {
          await db.update('produtos', p.id, { adicionais: p.adicionais.filter(x => x !== g.id) });
        }
      }
    });
  }

  function editarGrupo(g = { opcoes: [{ nome: '', preco: 0 }] }) {
    const m = modal(`<h2>${g.id ? 'Editar grupo' : 'Novo grupo de adicionais'}</h2>
      <form novalidate>
        <label class="campo"><span>Nome do grupo</span><input name="nome" required maxlength="50" value="${esc(g.nome || '')}" placeholder="Ex.: Turbine seu lanche"></label>
        <div class="grade2">
          <label class="campo"><span>Mínimo de escolhas</span><input name="min" type="number" min="0" value="${g.min ?? 0}"><small>1 ou mais = obrigatório</small></label>
          <label class="campo"><span>Máximo de escolhas</span><input name="max" type="number" min="1" value="${g.max ?? 1}"><small>1 = escolha única</small></label>
        </div>
        <span class="rotulo">Opções</span>
        <div class="opcoes-lista" id="ops" style="margin-top:6px"></div>
        <button type="button" class="btn btn-s" data-add-op><i class="ti ti-plus"></i>Adicionar opção</button>
        <div class="linha-btns"><button type="button" class="btn" data-c>Cancelar</button><button class="btn btn-pri">Salvar</button></div>
      </form>`);
    const ops = m.el.querySelector('#ops');
    const linha = (o = { nome: '', preco: 0 }) => {
      const d = document.createElement('div');
      d.className = 'opc-linha';
      d.innerHTML = `<input class="inp" placeholder="Nome da opção" value="${esc(o.nome)}" data-n aria-label="Nome da opção">
        <input class="inp" type="number" step="0.01" min="0" placeholder="+ R$" value="${o.preco || ''}" data-p aria-label="Preço adicional">
        <button type="button" class="btn btn-ghost btn-ico" aria-label="Remover opção"><i class="ti ti-x"></i></button>`;
      d.querySelector('button').onclick = () => d.remove();
      ops.appendChild(d);
    };
    (g.opcoes || []).forEach(linha);
    m.el.querySelector('[data-add-op]').onclick = () => linha();
    m.el.querySelector('[data-c]').onclick = m.fechar;
    const f = m.el.querySelector('form');
    f.onsubmit = async e => {
      e.preventDefault();
      const opcoes = [...ops.children].map(d => ({ nome: d.querySelector('[data-n]').value.trim(), preco: Number(d.querySelector('[data-p]').value) || 0 })).filter(o => o.nome);
      const min = Math.max(0, Number(f.min.value) || 0);
      const max = Math.max(1, Number(f.max.value) || 1);
      if (!f.nome.value.trim()) { f.nome.closest('.campo').classList.add('erro'); return; }
      if (!opcoes.length) { toast('Adicione pelo menos uma opção', 'erro'); return; }
      if (min > max) { toast('O mínimo não pode ser maior que o máximo', 'erro'); return; }
      const d = { nome: f.nome.value.trim(), min, max, opcoes };
      if (g.id) await db.update('adicionais', g.id, d); else await db.add('adicionais', d);
      m.fechar();
      toast('Grupo salvo');
    };
  }

  return () => paradas.forEach(p => p());
}
