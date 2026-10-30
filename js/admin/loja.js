// Configurações: dados da loja, horários automáticos, cores da marca, pagamentos, upsell, SEO, equipe e ferramentas.
import { db, auth } from '../db.js';
import { DEMO } from '../config.js';
import { semear } from '../seed.js';
import { store, onStore, salvarConfig } from './app.js';
import { qrDataURL } from './mesas.js';
import { esc, DIAS, PAGAMENTOS, statusLoja, aplicarTema, comprimirImagem, toast, modal, confirmar } from '../utils.js';

const ABAS = [['dados', 'Dados da loja'], ['horarios', 'Horários'], ['aparencia', 'Cores da marca'], ['pagamentos', 'Pagamentos'], ['vendas', 'Upsell e SEO'], ['equipe', 'Equipe'], ['ferramentas', 'Link e QR do cardápio']];
const PALETAS = [['#EA580C', '#1F2937'], ['#DC2626', '#111827'], ['#16A34A', '#14532D'], ['#2563EB', '#0F172A'], ['#9333EA', '#1E1B4B'], ['#CA8A04', '#292524'], ['#DB2777', '#1F2937'], ['#0D9488', '#134E4A']];
const urlSegura = u => String(u || '').replace(/["'()\\\s]/g, '');

export function render(el) {
  let aba = new URLSearchParams(location.hash.split('?')[1]).get('aba') || 'dados';
  el.innerHTML = `<div class="abas">${ABAS.map(([k, n]) => `<button data-aba="${k}" class="${k === aba ? 'on' : ''}">${n}</button>`).join('')}</div><div id="area"></div>`;
  el.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => {
    aba = b.dataset.aba;
    el.querySelectorAll('[data-aba]').forEach(x => x.classList.toggle('on', x === b));
    desenhar();
  });
  const area = () => el.querySelector('#area');
  let pararEquipe = null;

  function desenhar() {
    pararEquipe?.(); pararEquipe = null;
    ({ dados, horarios, aparencia, pagamentos, vendas, equipe, ferramentas })[aba]();
  }

  /* ---------------- Dados ---------------- */
  function dados() {
    const c = store.cfg;
    let logo = c.logo, capa = c.capa;
    area().innerHTML = `<form class="card form-sec" novalidate>
      <h2>Identidade</h2><p>Aparece no topo do cardápio e nas buscas.</p>
      <div class="img-up" style="margin-bottom:16px">
        <div><span class="rotulo">Logo</span><div class="img-prev" id="pv-logo" style="margin-top:6px"></div>
          <label class="btn btn-s" style="margin-top:8px"><i class="ti ti-upload"></i>Enviar<input type="file" accept="image/*" hidden data-img="logo"></label></div>
        <div><span class="rotulo">Capa</span><div class="img-prev larga" id="pv-capa" style="margin-top:6px"></div>
          <label class="btn btn-s" style="margin-top:8px"><i class="ti ti-upload"></i>Enviar<input type="file" accept="image/*" hidden data-img="capa"></label>
          <button type="button" class="btn btn-s btn-ghost" data-rem-capa>Remover</button></div>
      </div>
      <div class="grade2">
        <label class="campo"><span>Nome da loja</span><input name="nome" required maxlength="60" value="${esc(c.nome)}"></label>
        <label class="campo"><span>Slogan</span><input name="slogan" maxlength="80" value="${esc(c.slogan)}"></label>
      </div>
      <label class="campo"><span>Descrição</span><textarea name="descricao" maxlength="300">${esc(c.descricao)}</textarea></label>
      <div class="grade2">
        <label class="campo"><span>Telefone</span><input name="telefone" value="${esc(c.telefone)}" placeholder="(11) 3333-4444"></label>
        <label class="campo"><span>WhatsApp</span><input name="whatsapp" value="${esc(c.whatsapp)}" placeholder="(11) 98765-4321"><small>Botão “Falar com a loja” no acompanhamento</small></label>
        <label class="campo"><span>Endereço</span><input name="endereco" value="${esc(c.endereco)}"></label>
        <label class="campo"><span>Instagram</span><input name="instagram" value="${esc(c.instagram)}" placeholder="@sualoja"></label>
      </div>
      <button class="btn btn-pri">Salvar</button>
    </form>`;
    const prev = () => {
      const pl = area().querySelector('#pv-logo'), pc = area().querySelector('#pv-capa');
      pl.style.backgroundImage = logo ? `url('${urlSegura(logo)}')` : ''; pl.innerHTML = logo ? '' : '<i class="ti ti-photo"></i>';
      pc.style.backgroundImage = capa ? `url('${urlSegura(capa)}')` : ''; pc.innerHTML = capa ? '' : '<i class="ti ti-photo"></i>';
    };
    prev();
    area().querySelectorAll('[data-img]').forEach(i => i.onchange = async ev => {
      const file = ev.target.files[0];
      if (!file) return;
      const url = await comprimirImagem(file, i.dataset.img === 'logo' ? 400 : 1400, 0.8);
      if (i.dataset.img === 'logo') logo = url; else capa = url;
      prev();
    });
    area().querySelector('[data-rem-capa]').onclick = () => { capa = ''; prev(); };
    const f = area().querySelector('form');
    f.onsubmit = async ev => {
      ev.preventDefault();
      if (!f.nome.value.trim()) { f.nome.closest('.campo').classList.add('erro'); return; }
      const d = Object.fromEntries(['nome', 'slogan', 'descricao', 'telefone', 'whatsapp', 'endereco', 'instagram'].map(k => [k, f[k].value.trim()]));
      try { await salvarConfig({ ...d, logo, capa }); toast('Dados salvos'); } catch { toast('Não foi possível salvar. Tente imagens menores.', 'erro'); }
    };
  }

  /* ---------------- Horários ---------------- */
  function horarios() {
    const c = store.cfg;
    const st = statusLoja(c);
    area().innerHTML = `<form class="card form-sec" novalidate>
      <h2>Horário de funcionamento</h2>
      <p>O cardápio abre e fecha sozinho nesses horários. Para virar a madrugada, coloque o fechamento menor que a abertura (ex.: 18:00 às 00:30).</p>
      <p><span class="badge ${st.aberto ? 'badge-ok' : 'badge-danger'}">Agora: ${esc(st.texto)}</span></p>
      ${DIAS.map((d, i) => {
        const h = c.horarios[i] || { ativo: false, abre: '18:00', fecha: '23:00' };
        return `<div class="horario-linha"><strong>${d}</strong>
          <label class="switch"><input type="checkbox" name="at${i}" ${h.ativo ? 'checked' : ''}><i></i></label>
          <input type="time" name="ab${i}" value="${h.abre}" aria-label="${d}: abre">
          <input type="time" name="fe${i}" value="${h.fecha}" aria-label="${d}: fecha"></div>`;
      }).join('')}
      <h2 style="margin-top:20px">Pausa manual</h2>
      <p>Use o botão “Loja” no topo do painel para pausar na hora (ex.: cozinha cheia). Mensagem exibida ao cliente:</p>
      <label class="campo"><input name="mensagemPausa" value="${esc(c.mensagemPausa)}" placeholder="Voltamos em 30 minutos!" aria-label="Mensagem de pausa"></label>
      <button class="btn btn-pri">Salvar horários</button>
    </form>`;
    const f = area().querySelector('form');
    f.onsubmit = async ev => {
      ev.preventDefault();
      const hs = {};
      DIAS.forEach((_, i) => { hs[i] = { ativo: f[`at${i}`].checked, abre: f[`ab${i}`].value || '00:00', fecha: f[`fe${i}`].value || '23:59' }; });
      await salvarConfig({ horarios: hs, mensagemPausa: f.mensagemPausa.value.trim() });
      toast('Horários salvos');
    };
  }

  /* ---------------- Aparência ---------------- */
  function aparencia() {
    const t = { ...store.cfg.tema };
    area().innerHTML = `<div class="card form-sec">
      <h2>Cores da marca</h2><p>O cardápio, os botões e o app instalado usam estas cores.</p>
      <span class="rotulo">Sugestões</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 16px">${PALETAS.map(([p, s]) => `
        <button type="button" class="btn btn-ico" data-pal="${p},${s}" aria-label="Paleta ${p}" style="background:linear-gradient(135deg,${p} 50%,${s} 50%);border:2px solid var(--borda)"></button>`).join('')}</div>
      <div class="grade3">
        <label class="campo"><span>Cor principal</span><span style="display:flex;gap:8px"><input type="color" id="cp" value="${t.primaria}"><input class="inp" id="cpt" value="${t.primaria}" maxlength="7"></span></label>
        <label class="campo"><span>Cor secundária</span><span style="display:flex;gap:8px"><input type="color" id="cs" value="${t.secundaria}"><input class="inp" id="cst" value="${t.secundaria}" maxlength="7"></span></label>
        <label class="campo"><span>Fundo</span><select id="fundo"><option value="auto">Automático (do celular)</option><option value="claro">Sempre claro</option><option value="escuro">Sempre escuro</option></select></label>
      </div>
      <span class="rotulo">Prévia</span>
      <div class="cores-prev" style="margin:6px 0 16px"><div class="cp-topo"></div><div class="cp-corpo">
        <span class="btn btn-pri btn-s">Adicionar</span><span class="btn btn-sec btn-s">Mesa 5</span><span class="badge badge-pri">Mais vendido</span></div></div>
      <button class="btn btn-pri" data-salvar>Salvar cores</button>
    </div>`;
    const a = area();
    a.querySelector('#fundo').value = t.fundo || 'auto';
    const aplicar = () => {
      a.querySelector('#cp').value = t.primaria; a.querySelector('#cpt').value = t.primaria;
      a.querySelector('#cs').value = t.secundaria; a.querySelector('#cst').value = t.secundaria;
      aplicarTema(t);
    };
    a.querySelectorAll('[data-pal]').forEach(b => b.onclick = () => { [t.primaria, t.secundaria] = b.dataset.pal.split(','); aplicar(); });
    a.querySelector('#cp').oninput = e => { t.primaria = e.target.value; aplicar(); };
    a.querySelector('#cs').oninput = e => { t.secundaria = e.target.value; aplicar(); };
    a.querySelector('#cpt').onchange = e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { t.primaria = e.target.value; aplicar(); } };
    a.querySelector('#cst').onchange = e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { t.secundaria = e.target.value; aplicar(); } };
    a.querySelector('#fundo').onchange = e => { t.fundo = e.target.value; aplicar(); };
    a.querySelector('[data-salvar]').onclick = async () => { await salvarConfig({ tema: t }); toast('Cores salvas'); };
  }

  /* ---------------- Pagamentos ---------------- */
  function pagamentos() {
    const p = store.cfg.pagamentos;
    area().innerHTML = `<div class="card form-sec">
      <h2>Formas de pagamento</h2>
      <p>O pagamento é sempre feito na entrega ou na retirada. O cliente só escolhe a forma e, se for dinheiro, informa se precisa de troco.</p>
      ${Object.entries(PAGAMENTOS).map(([k, n]) => `<div class="linha-cfg"><strong>${n}</strong><label class="switch"><input type="checkbox" data-pag="${k}" ${p[k] ? 'checked' : ''}><i></i></label></div>`).join('')}
    </div>`;
    area().querySelectorAll('[data-pag]').forEach(i => i.onchange = async () => {
      const novo = { ...store.cfg.pagamentos, [i.dataset.pag]: i.checked };
      if (!Object.values(novo).some(Boolean)) { i.checked = true; toast('Deixe ao menos uma forma ativa', 'erro'); return; }
      await salvarConfig({ pagamentos: novo });
      toast('Formas de pagamento atualizadas');
    });
  }

  /* ---------------- Upsell e SEO ---------------- */
  function vendas() {
    const c = store.cfg;
    area().innerHTML = `
      <form class="card form-sec" id="f-up" novalidate>
        <div class="linha-cfg" style="padding-top:0"><div><h2><i class="ti ti-sparkles"></i> Upsell inteligente</h2>
          <small>Na sacola, sugere produtos marcados como “sugestão”, priorizando categorias que o cliente ainda não escolheu (ex.: tem lanche mas não tem bebida).</small></div>
          <label class="switch"><input type="checkbox" name="ativo" ${c.upsell.ativo ? 'checked' : ''}><i></i></label></div>
        <label class="campo" style="margin-top:12px"><span>Título da sugestão</span><input name="titulo" maxlength="50" value="${esc(c.upsell.titulo)}"></label>
        <button class="btn btn-pri">Salvar upsell</button>
      </form>
      <form class="card form-sec" id="f-seo" novalidate>
        <h2><i class="ti ti-world-search"></i> SEO e compartilhamento</h2>
        <p>Como o cardápio aparece no Google e ao compartilhar o link.</p>
        <label class="campo"><span>Título da página</span><input name="titulo" maxlength="65" value="${esc(c.seo.titulo)}" placeholder="${esc(c.nome)} — cardápio online"><small>Até 60 caracteres</small></label>
        <label class="campo"><span>Descrição</span><textarea name="descricao" maxlength="160" placeholder="${esc(c.descricao)}">${esc(c.seo.descricao)}</textarea><small>Até 155 caracteres</small></label>
        <span class="rotulo">Prévia no Google</span>
        <div class="card" style="padding:14px;margin:6px 0 16px;max-width:600px">
          <div style="font-size:12px;color:var(--txt3)">${esc(location.host)}</div>
          <div id="sv-t" style="color:#1a0dab;font-size:18px"></div><div id="sv-d" style="font-size:13px;color:var(--txt2)"></div>
        </div>
        <p style="font-size:13px">A imagem de prévia do link (WhatsApp, Instagram) é o arquivo <code>assets/og-image.png</code> (1200×630). Links de produtos geram prévia própria com foto e preço quando publicados na Vercel.</p>
        <button class="btn btn-pri">Salvar SEO</button>
      </form>`;
    const fu = area().querySelector('#f-up');
    fu.onsubmit = async ev => { ev.preventDefault(); await salvarConfig({ upsell: { ativo: fu.ativo.checked, titulo: fu.titulo.value.trim() || 'Que tal completar seu pedido?' } }); toast('Upsell salvo'); };
    const fs = area().querySelector('#f-seo');
    const pv = () => {
      area().querySelector('#sv-t').textContent = fs.titulo.value || `${c.nome} — cardápio online`;
      area().querySelector('#sv-d').textContent = fs.descricao.value || c.descricao;
    };
    fs.oninput = pv; pv();
    fs.onsubmit = async ev => { ev.preventDefault(); await salvarConfig({ seo: { ...c.seo, titulo: fs.titulo.value.trim(), descricao: fs.descricao.value.trim() } }); toast('SEO salvo'); };
  }

  /* ---------------- Equipe ---------------- */
  function equipe() {
    area().innerHTML = `<div class="card form-sec">
      <div class="painel-cab"><div><h2>Equipe</h2><p style="color:var(--txt2);font-size:14px">Atendentes veem Pedidos, Mesas e Cardápio. O dono vê tudo, inclusive o financeiro.</p></div>
        <button class="btn btn-pri" data-novo><i class="ti ti-user-plus"></i>Adicionar pessoa</button></div>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th></th></tr></thead><tbody id="tb-eq"></tbody></table></div></div>`;
    area().querySelector('[data-novo]').onclick = novoMembro;
    pararEquipe = db.watch('equipe', {}, l => {
      const tb = area().querySelector('#tb-eq');
      if (!tb) return;
      tb.innerHTML = l.map(u => `<tr><td><strong>${esc(u.nome)}</strong>${u.id === store.user.uid ? ' <span class="badge">você</span>' : ''}</td><td>${esc(u.email)}</td>
        <td><span class="badge ${u.perfil === 'dono' ? 'badge-pri' : ''}">${u.perfil === 'dono' ? 'Dono' : 'Atendente'}</span></td>
        <td class="acoes">${u.id !== store.user.uid ? `<button class="btn btn-ghost btn-s" data-rem="${u.id}" style="color:var(--danger)">Remover acesso</button>` : ''}</td></tr>`).join('');
      tb.querySelectorAll('[data-rem]').forEach(b => b.onclick = async () => {
        const u = l.find(x => x.id === b.dataset.rem);
        if (await confirmar(`Remover o acesso de ${u.nome} ao painel?`, { ok: 'Remover', perigo: true })) { await db.remove('equipe', u.id); toast('Acesso removido'); }
      });
    });
  }
  function novoMembro() {
    const m = modal(`<h2>Adicionar pessoa à equipe</h2><form novalidate>
      <label class="campo"><span>Nome</span><input name="nome" required></label>
      <label class="campo"><span>E-mail</span><input name="email" type="email" required></label>
      <label class="campo"><span>Senha inicial</span><input name="senha" type="text" minlength="6" required><small>Mínimo 6 caracteres. A pessoa pode trocar em “Esqueci a senha”.</small></label>
      <label class="campo"><span>Perfil</span><select name="perfil"><option value="atendente">Atendente</option><option value="dono">Dono (acesso total)</option></select></label>
      <p class="msg-erro" id="eq-erro"></p>
      <div class="linha-btns"><button type="button" class="btn" data-c>Cancelar</button><button class="btn btn-pri">Adicionar</button></div></form>`, { classe: 'modal-p' });
    const f = m.el.querySelector('form');
    m.el.querySelector('[data-c]').onclick = m.fechar;
    f.onsubmit = async ev => {
      ev.preventDefault();
      if (!f.nome.value.trim() || !/\S+@\S+\.\S+/.test(f.email.value) || f.senha.value.length < 6) { m.el.querySelector('#eq-erro').textContent = 'Preencha nome, e-mail válido e senha com 6+ caracteres.'; return; }
      try {
        await auth.criarMembro(f.nome.value.trim(), f.email.value.trim(), f.senha.value, f.perfil.value);
        m.fechar(); toast('Pessoa adicionada');
      } catch (err) {
        m.el.querySelector('#eq-erro').textContent = (err.code || '').includes('email-already-in-use') ? 'Este e-mail já tem conta.' : 'Não foi possível criar o acesso.';
      }
    };
  }

  /* ---------------- Ferramentas ---------------- */
  function ferramentas() {
    const url = location.origin + '/';
    area().innerHTML = `
      <div class="card form-sec">
        <h2>Link do seu cardápio</h2><p>Coloque na bio do Instagram, no WhatsApp Business e no Google Meu Negócio.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="inp" readonly value="${esc(url)}" style="flex:1;min-width:220px" aria-label="Link do cardápio">
          <button class="btn" data-copiar><i class="ti ti-copy"></i>Copiar</button></div>
        <div style="display:flex;gap:16px;align-items:center;margin-top:16px;flex-wrap:wrap">
          <img src="${qrDataURL(url, 6)}" alt="QR Code do cardápio" style="width:150px;image-rendering:pixelated;border-radius:8px;background:#fff;padding:6px">
          <div><strong>QR Code para delivery e balcão</strong><p style="color:var(--txt2);font-size:14px;margin:4px 0 10px">Para mesas, use os QR Codes individuais em Mesas › QR Codes.</p>
            <a class="btn btn-s" download="qrcode-cardapio.gif" href="${qrDataURL(url, 16)}"><i class="ti ti-download"></i>Baixar QR Code</a></div>
        </div>
      </div>
      <div class="card form-sec">
        <h2>Dados de exemplo</h2><p>Carrega categorias, produtos, adicionais, bairros, 10 mesas, cupons e contas de exemplo. Útil para conhecer o sistema.</p>
        <button class="btn" data-seed><i class="ti ti-database-import"></i>Carregar dados de exemplo</button>
        <button class="btn btn-pri" data-seed-cardapio><i class="ti ti-tools-kitchen-2"></i>Carregar só categorias e produtos</button>
        <p style="color:var(--txt2);font-size:13px;margin-top:8px">“Só categorias e produtos” não mexe nos dados da loja, logo e banner. Pode clicar mais de uma vez sem duplicar.</p>
        ${DEMO ? '<button class="btn btn-ghost" data-limpar style="color:var(--danger)"><i class="ti ti-trash"></i>Apagar dados do modo demo</button>' : ''}
      </div>`;
    const a = area();
    a.querySelector('[data-copiar]').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copiado'); } catch { a.querySelector('input').select(); } };
    a.querySelector('[data-seed]').onclick = async () => {
      if (!await confirmar('Carregar os dados de exemplo? Isso adiciona produtos ao seu cardápio e redefine as configurações da loja.', { ok: 'Carregar' })) return;
      await semear(); toast('Dados de exemplo carregados');
    };
    a.querySelector('[data-seed-cardapio]').onclick = async () => {
      if (!await confirmar('Carregar 5 categorias, 15 produtos de exemplo e os adicionais? Os dados da loja, logo e banner não serão alterados.', { ok: 'Carregar' })) return;
      try { await semear({ soCardapio: true }); toast('Produtos de exemplo carregados'); } catch { toast('Não foi possível carregar. Confira as regras do Firestore.', 'erro'); }
    };
    a.querySelector('[data-limpar]')?.addEventListener('click', async () => {
      if (!await confirmar('Apagar todos os dados do modo demo neste navegador?', { ok: 'Apagar', perigo: true })) return;
      localStorage.removeItem('co_db_v1'); location.reload();
    });
  }

  desenhar();
  const parar = onStore(() => {
    // redesenha só abas sem formulário em edição
    if (['pagamentos'].includes(aba)) desenhar();
  });
  return () => { parar(); pararEquipe?.(); aplicarTema(store.cfg.tema); };
}
