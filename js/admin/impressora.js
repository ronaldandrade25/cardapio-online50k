// Impressora térmica Bluetooth (BLE, comandos ESC/POS) via Web Bluetooth. A configuração fica neste aparelho.
import { moeda, dataHoraBR, TIPOS, PAGAMENTOS } from '../utils.js';

// Serviços BLE mais comuns em impressoras térmicas 58/80 mm
const SERVICOS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb'
];
const LS_AUTO = 'co_imp_auto', LS_NOME = 'co_imp_nome', LS_LARGURA = 'co_imp_larg';

let dispositivo = null, caracteristica = null;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach(fn => fn());

export const suportaBluetooth = () => !!navigator.bluetooth;
export const conectada = () => !!caracteristica && !!dispositivo?.gatt?.connected;
export const nomeImpressora = () => dispositivo?.name || localStorage.getItem(LS_NOME) || '';
export const onImpressora = fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); };

export const impressaoAutomatica = () => localStorage.getItem(LS_AUTO) === '1';
export const setImpressaoAutomatica = v => localStorage.setItem(LS_AUTO, v ? '1' : '0');
/** Colunas da comanda: 32 (papel 58 mm) ou 48 (papel 80 mm). */
export const colunas = () => Number(localStorage.getItem(LS_LARGURA)) || 32;
export const setColunas = n => localStorage.setItem(LS_LARGURA, String(n));

async function ligar(dev) {
  dispositivo = dev;
  dev.removeEventListener('gattserverdisconnected', aoDesconectar);
  dev.addEventListener('gattserverdisconnected', aoDesconectar);
  const server = await dev.gatt.connect();
  caracteristica = null;
  for (const s of await server.getPrimaryServices()) {
    for (const c of await s.getCharacteristics()) {
      if (c.properties.write || c.properties.writeWithoutResponse) { caracteristica = c; break; }
    }
    if (caracteristica) break;
  }
  if (!caracteristica) throw new Error('Esta impressora não aceita impressão por Bluetooth LE.');
  localStorage.setItem(LS_NOME, dev.name || '');
  avisar();
}
function aoDesconectar() { caracteristica = null; avisar(); }

/** Abre o seletor do navegador para escolher e parear a impressora. */
export async function conectar() {
  if (!suportaBluetooth()) throw new Error('Este navegador não suporta Bluetooth. Use o Chrome no Android ou no computador.');
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICOS });
  await ligar(dev);
}

export function desconectar() {
  if (dispositivo?.gatt?.connected) dispositivo.gatt.disconnect();
  caracteristica = null; dispositivo = null;
  localStorage.removeItem(LS_NOME);
  avisar();
}

/** Tenta reconectar sozinho à impressora já autorizada (nem todo navegador permite). */
export async function reconectar() {
  if (conectada() || !navigator.bluetooth?.getDevices) return;
  try {
    const nome = localStorage.getItem(LS_NOME);
    const devs = await navigator.bluetooth.getDevices();
    const dev = devs.find(d => d.name === nome) || devs[0];
    if (dev) await ligar(dev);
  } catch { /* segue sem impressora */ }
}

async function enviar(bytes) {
  if (!conectada()) await ligar(dispositivo); // tenta reabrir a conexão se caiu
  const semResp = caracteristica.properties.writeWithoutResponse;
  for (let i = 0; i < bytes.length; i += 100) {
    const parte = bytes.slice(i, i + 100);
    if (semResp) await caracteristica.writeValueWithoutResponse(parte); else await caracteristica.writeValue(parte);
    await new Promise(r => setTimeout(r, 25));
  }
}

/* ---------- Comanda ESC/POS ---------- */
const ESC = 0x1b, GS = 0x1d;
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');

function montar(p, cfg) {
  const L = colunas();
  const out = [ESC, 0x40]; // inicializa
  const txt = s => { for (const ch of semAcento(s)) out.push(ch.charCodeAt(0)); };
  const lin = (s = '') => { txt(s); out.push(0x0a); };
  const alinhar = n => out.push(ESC, 0x61, n);
  const negrito = on => out.push(ESC, 0x45, on ? 1 : 0);
  const grande = on => out.push(GS, 0x21, on ? 0x11 : 0);
  const sep = () => lin('-'.repeat(L));
  const dupla = (a, b) => { const e = semAcento(a), d = semAcento(b); lin(e.slice(0, Math.max(0, L - d.length - 1)).padEnd(L - d.length) + d); };

  alinhar(1); negrito(true); lin(cfg.nome); negrito(false);
  lin(dataHoraBR(p.criadoEm)); sep();
  grande(true); lin(`PEDIDO #${p.numero}`); grande(false);
  negrito(true); lin(`${TIPOS[p.tipo] || p.tipo}${p.mesa ? ' ' + p.mesa : ''}`.toUpperCase()); negrito(false);
  alinhar(0); sep();
  if (p.cliente?.nome) lin(`Cliente: ${p.cliente.nome}`);
  if (p.cliente?.telefone) lin(`Tel: ${p.cliente.telefone}`);
  if (p.endereco) {
    const e = p.endereco;
    lin(`End: ${e.rua}, ${e.numero}${e.complemento ? ' - ' + e.complemento : ''} - ${e.bairro}${e.referencia ? ' (ref.: ' + e.referencia + ')' : ''}`);
  }
  sep();
  for (const i of p.itens || []) {
    dupla(`${i.qtd}x ${i.nome}`, moeda(i.preco * i.qtd));
    for (const a of i.adicionais || []) lin(`  + ${a.nome}`);
    if (i.obs) lin(`  OBS: ${i.obs}`);
  }
  sep();
  dupla('Subtotal', moeda(p.subtotal));
  if (p.taxa) dupla('Entrega', moeda(p.taxa));
  if (p.desconto) dupla(`Desconto ${p.cupom || ''}`.trim(), '-' + moeda(p.desconto));
  if (p.descontoFidelidade) dupla('Fidelidade', '-' + moeda(p.descontoFidelidade));
  negrito(true); dupla('TOTAL', moeda(p.total)); negrito(false);
  sep();
  const forma = p.pagamento ? (PAGAMENTOS[p.pagamento.forma] || p.pagamento.forma) : (p.tipo === 'mesa' ? 'Na conta da mesa' : '-');
  lin(`Pagamento: ${forma}${p.pagamento?.forma === 'dinheiro' && p.pagamento.troco ? ' - troco para ' + moeda(p.pagamento.troco) : ''}`);
  if (p.obs) { sep(); lin(`OBS: ${p.obs}`); }
  sep(); alinhar(1); lin('Obrigado pela preferencia!');
  out.push(0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00); // avanço e corte (ignorado se não houver guilhotina)
  return new Uint8Array(out);
}

/** Imprime a comanda na impressora Bluetooth. Lança erro se não houver impressora conectada. */
export async function imprimirBluetooth(p, cfg) {
  if (!dispositivo) throw new Error('Nenhuma impressora conectada.');
  await enviar(montar(p, cfg));
}

/** Página de teste para conferir a conexão e a largura do papel. */
export async function imprimirTeste(cfg) {
  await imprimirBluetooth({
    numero: 'TESTE', tipo: 'retirada', criadoEm: Date.now(), cliente: { nome: 'Teste de impressão' },
    itens: [{ qtd: 1, nome: 'Item de teste', preco: 10 }], subtotal: 10, total: 10
  }, cfg);
}
