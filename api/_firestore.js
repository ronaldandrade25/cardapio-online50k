// Leitura pública do Firestore via REST (usada pelas funções da Vercel).
// Configure na Vercel: Settings › Environment Variables › FIREBASE_PROJECT_ID e FIREBASE_API_KEY
const PROJETO = process.env.FIREBASE_PROJECT_ID;
const CHAVE = process.env.FIREBASE_API_KEY;

function valor(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, valor(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valor);
  return null;
}

async function lerDoc(caminho) {
  if (!PROJETO || !CHAVE) return null;
  const url = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents/${caminho}?key=${CHAVE}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, valor(v)]));
}

const limparId = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

module.exports = { lerDoc, limparId };
