// Serve a foto do produto (salva comprimida no Firestore) como imagem real,
// para que WhatsApp/Facebook consigam exibi-la na prévia do link.
const { lerDoc, limparId } = require('./_firestore');

module.exports = async (req, res) => {
  const id = limparId(req.query.id);
  let p = null;
  try { p = id ? await lerDoc(`produtos/${id}`) : null; } catch { /* sem imagem */ }
  const m = /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(p?.foto || '');
  if (!m) return res.redirect(302, '/assets/og-image.png');
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.status(200).send(Buffer.from(m[2], 'base64'));
};
