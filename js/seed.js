// Cardápio de exemplo. Carregado automaticamente no modo demo
// e disponível no painel (Loja › Dados de exemplo) quando usar o Firebase.
import { db } from './db.js';
import { DEMO } from './config.js';
import { CONFIG_PADRAO, hojeISO } from './utils.js';

const categorias = [
  ['lanches', 'Lanches', '🍔'],
  ['combos', 'Combos', '🍟'],
  ['porcoes', 'Porções', '🍗'],
  ['bebidas', 'Bebidas', '🥤'],
  ['sobremesas', 'Sobremesas', '🍨']
];

const adicionais = [
  ['extras', 'Turbine seu lanche', 0, 4, [['Bacon extra', 5], ['Cheddar cremoso', 4], ['Ovo', 2.5], ['Blend 90g extra', 8]]],
  ['ponto', 'Ponto da carne', 1, 1, [['Mal passado', 0], ['Ao ponto', 0], ['Bem passado', 0]]],
  ['bebida-combo', 'Escolha a bebida', 1, 1, [['Coca-Cola lata', 0], ['Guaraná lata', 0], ['Suco natural', 3]]],
  ['molhos', 'Molhos', 0, 2, [['Barbecue', 0], ['Maionese da casa', 0], ['Mostarda e mel', 1.5]]]
];

const produtos = [
  ['lanches', 'X-Bacon artesanal', 'Pão brioche, blend bovino 180g, bacon crocante, queijo prato e maionese da casa.', 32.9, null, '🍔', ['Mais vendido'], ['ponto', 'extras'], true],
  ['lanches', 'Smash duplo', 'Dois smash burgers de 90g, cheddar derretido e cebola caramelizada.', 29.9, 26.9, '🍔', ['Promoção'], ['extras'], false],
  ['lanches', 'X-Salada', 'Blend 150g, queijo, alface, tomate e maionese da casa.', 24.9, null, '🥪', [], ['ponto', 'extras'], false],
  ['lanches', 'Chicken crispy', 'Sobrecoxa empanada crocante, coleslaw e molho picante.', 27.9, null, '🍗', ['Picante'], ['extras'], false],
  ['lanches', 'Veggie burger', 'Hambúrguer de grão-de-bico, rúcula, tomate seco e maionese verde.', 28.9, null, '🥗', ['Vegano'], [], false],
  ['combos', 'Combo clássico', 'X-Bacon + batata média + bebida.', 44.9, null, '🍟', ['Mais pedido'], ['ponto', 'bebida-combo'], false],
  ['combos', 'Combo casal', '2 X-Salada + batata grande + 2 bebidas.', 79.9, 74.9, '👫', ['Promoção'], ['bebida-combo'], false],
  ['porcoes', 'Batata frita', 'Porção 400g com sal e páprica.', 19.9, null, '🍟', [], ['molhos'], true],
  ['porcoes', 'Batata com cheddar e bacon', 'Porção 400g coberta com cheddar cremoso e bacon.', 29.9, null, '🧀', [], [], true],
  ['porcoes', 'Onion rings', '12 anéis de cebola empanados.', 22.9, null, '🧅', ['Novo'], ['molhos'], true],
  ['bebidas', 'Refrigerante lata', 'Coca-Cola, Coca Zero ou Guaraná — 350 ml.', 6.5, null, '🥤', [], [], true],
  ['bebidas', 'Suco natural', 'Laranja, limão ou maracujá — 500 ml.', 9.9, null, '🍹', [], [], true],
  ['bebidas', 'Água mineral', 'Com ou sem gás — 500 ml.', 4.5, null, '💧', [], [], true],
  ['sobremesas', 'Brownie com sorvete', 'Brownie de chocolate meio amargo com bola de sorvete de creme.', 16.9, null, '🍫', [], [], true],
  ['sobremesas', 'Milkshake', 'Ovomaltine, Nutella ou morango — 400 ml.', 18.9, null, '🥤', ['Mais vendido'], [], true]
];

export async function semear({ completo = true, soCardapio = false } = {}) {
  const cfg = structuredClone(CONFIG_PADRAO);
  // No modo demo a loja fica aberta o dia todo para facilitar os testes (ajuste em Configurações › Horários)
  if (DEMO) for (let d = 0; d < 7; d++) cfg.horarios[d] = { ativo: true, abre: '00:00', fecha: '23:59' };
  if (!soCardapio) await db.set('config', 'loja', cfg);

  for (const [i, [id, nome, emoji]] of categorias.entries()) {
    await db.set('categorias', id, { nome, emoji, ordem: i, ativo: true });
  }
  for (const [id, nome, min, max, opcoes] of adicionais) {
    await db.set('adicionais', id, { nome, min, max, opcoes: opcoes.map(([n, p]) => ({ nome: n, preco: p })) });
  }
  for (const [i, [cat, nome, descricao, preco, precoPromo, emoji, selos, adic, upsell]] of produtos.entries()) {
    await db.set('produtos', 'exemplo-' + (i + 1), {
      categoriaId: cat, nome, descricao, preco, precoPromo, emoji, selos, adicionais: adic,
      upsell, disponivel: true, foto: '', ordem: i, criadoEm: Date.now()
    });
  }
  if (soCardapio) return;
  const bairros = [['Centro', 5, '25–35 min'], ['Jardim América', 7, '30–45 min'], ['Vila Nova', 8, '35–50 min'], ['Industrial', 10, '40–55 min']];
  for (const [nome, taxa, tempo] of bairros) await db.add('bairros', { nome, taxa, tempo, ativo: true });

  for (let n = 1; n <= 10; n++) await db.set('mesas', String(n), { numero: n, ativa: true, chamado: null, chamadoEm: null });

  await db.set('cupons', 'PRIMEIRA10', { tipo: 'percentual', valor: 10, minimo: 30, validade: '', limite: 0, usos: 0, ativo: true, descricao: '10% off acima de R$ 30' });
  await db.set('cupons', 'FRETEGRATIS', { tipo: 'frete', valor: 0, minimo: 50, validade: '', limite: 0, usos: 0, ativo: true, descricao: 'Entrega grátis acima de R$ 50' });

  if (completo) {
    const d = (dias) => { const x = new Date(); x.setDate(x.getDate() + dias); return hojeISO(x); };
    const contas = [
      ['contas_pagar', { descricao: 'Aluguel do ponto', categoria: 'Aluguel', valor: 3200, vencimento: d(5), pessoa: 'Imobiliária Centro', recorrente: true }],
      ['contas_pagar', { descricao: 'Fornecedor de carnes', categoria: 'Fornecedores', valor: 1850.4, vencimento: d(-1), pessoa: 'Frigorífico Boa Carne', recorrente: false }],
      ['contas_pagar', { descricao: 'Energia elétrica', categoria: 'Contas de consumo', valor: 690, vencimento: d(0), pessoa: 'Concessionária', recorrente: true }],
      ['contas_pagar', { descricao: 'Embalagens', categoria: 'Insumos', valor: 420, vencimento: d(-8), pessoa: 'Embala Tudo', recorrente: false, pago: true, pagoEm: d(-8) }],
      ['contas_receber', { descricao: 'Evento corporativo (50 lanches)', categoria: 'Eventos', valor: 1750, vencimento: d(3), pessoa: 'Empresa XYZ', recorrente: false }],
      ['contas_receber', { descricao: 'Repasse maquininha', categoria: 'Cartões', valor: 2310.75, vencimento: d(1), pessoa: 'Operadora de cartão', recorrente: false }]
    ];
    for (const [col, c] of contas) await db.add(col, { pago: false, pagoEm: '', obs: '', ...c, criadoEm: Date.now() });
  }
}
