// /p/ID → página leve com Open Graph do produto (foto, nome, preço) para prévias no WhatsApp,
// que em seguida redireciona o visitante para o cardápio com o produto aberto.
const { lerDoc, limparId } = require('./_firestore');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const moeda = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

module.exports = async (req, res) => {
  const id = limparId(req.query.id);
  const destino = `/?p=${id}`;
  if (!id) return res.redirect(302, '/');

  let p = null, loja = null;
  try { [p, loja] = await Promise.all([lerDoc(`produtos/${id}`), lerDoc('config/loja')]); } catch { /* segue sem prévia */ }
  if (!p) return res.redirect(302, destino);

  const host = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const preco = p.precoPromo && p.precoPromo < p.preco ? p.precoPromo : p.preco;
  const nomeLoja = loja?.nome || 'Cardápio Online';
  const titulo = `${p.nome} · ${moeda(preco)} — ${nomeLoja}`;
  const desc = p.descricao || `Peça agora pelo cardápio online do ${nomeLoja}.`;
  const img = /^https:\/\//.test(p.foto || '') ? p.foto : p.foto ? `${host}/api/imagem?id=${id}` : `${host}/assets/og-image.png`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="${esc(nomeLoja)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(host + '/p/' + id)}">
<meta property="product:price:amount" content="${Number(preco).toFixed(2)}">
<meta property="product:price:currency" content="BRL">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${esc(host + destino)}">
<meta http-equiv="refresh" content="0;url=${esc(destino)}">
</head><body><script>location.replace(${JSON.stringify(destino)})</script>
<a href="${esc(destino)}">Ver ${esc(p.nome)} no cardápio</a></body></html>`);
};
