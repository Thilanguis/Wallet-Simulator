const test = require('node:test');
const assert = require('node:assert/strict');
const { read, readItemDetails } = require('../js/wishlist-photo-list.js');

function line(text, x, y, width = Math.max(48, text.length * 9), height = 22) {
  return { text, bbox: {x0: x, y0: y, x1: x + width, y1: y + height}, confidence: 94 };
}

function projected(rows) {
  return rows.map(({title, store, price, currency, priceIssue}) => [title, store, price, currency, priceIssue]);
}

test('separate amounts aligned on the right span categories and ignore controls and summaries', () => {
  const noisy = {
    ...line('a Produto 3', 327, 1057, 218, 70),
    words: [
      {...line('a', 327, 1108, 11), confidence: 0},
      line('Produto', 403, 1057, 95),
      line('3', 507, 1057, 12),
    ],
  };
  const lines = [
    line('Meus Produtos', 147, 70),
    line('Categoria de Produtos A', 143, 265),
    line('Produto 1', 403, 413), line('R$10.00', 1228, 414),
    line('Inserir descrição', 403, 467), line('Quantidade 1', 405, 536),
    line('Produto 2', 403, 655), line('R$8.00', 1240, 656),
    line('Categoria de Produtos B', 143, 891),
    noisy, line('R$6.00', 1240, 1054),
    line('Categoria de Produtos C', 143, 1245),
    line('Produto 4', 403, 1413), line('R$12.00', 1228, 1412),
    line('Produto 5', 403, 1637), line('R$14.00', 1228, 1630),
    line('Total dos produtos', 403, 1746), line('R$50.00', 1228, 1746),
  ];
  const rows = read({lines});
  assert.deepEqual(projected(rows), [10, 8, 6, 12, 14].map((price, index) => [
    'Produto ' + (index + 1), '', price, 'BRL', null,
  ]));
});

test('left-aligned and nearby stacked prices pair with the item and its printed seller', () => {
  const rows = read({lines: [
    line('Loja: Cosméticos do Norte', 20, 20),
    line('CA$ 12.50', 18, 77), line('Shampoo hidratante', 242, 78),
    line('Condicionador reconstrutor', 242, 165),
    line('CA$ 18,45', 242, 197),
    line('Loja: Farmácia da Praça', 20, 250),
    line('R$ 32,00', 18, 295), line('Máscara nutritiva', 242, 293),
    line('Vendido por Botica Verde', 242, 322),
    line('Frete R$ 10,00', 242, 420),
  ]});
  assert.deepEqual(projected(rows), [
    ['Shampoo hidratante', 'Cosméticos do Norte', 12.5, 'CAD', null],
    ['Condicionador reconstrutor', 'Cosméticos do Norte', 18.45, 'CAD', null],
    ['Máscara nutritiva', 'Botica Verde', 32, 'BRL', null],
  ]);
});

test('text-only OCR keeps explicit rows with missing price and never guesses between competing prices', () => {
  const rows = read({text: [
    'Products',
    'Product: Rose Moisturizer was USD 24.00 now USD 16.00',
    'Product: Daily Conditioner CAD 15.00 CAD 19.00',
    'Product: Oat Shampoo',
    'Product: Hair Treatment $23.00',
    'Shipping USD 8.00',
    'Subtotal USD 47.00',
  ].join('\n')});
  assert.deepEqual(projected(rows), [
    ['Rose Moisturizer', '', 16, 'USD', null],
    ['Daily Conditioner', '', null, null, 'ambiguous'],
    ['Oat Shampoo', '', null, null, null],
    ['Hair Treatment', '', 23, null, 'currency'],
  ]);
});

test('a single product with an old price and summary stays on the single-product path', () => {
  const rows = read({lines: [
    line('Creamy sunscreen', 120, 220),
    line('Now €15.50', 118, 256),
    line('Original price €23.00', 120, 278),
    line('Shipping €3.00', 120, 335),
  ]});
  assert.deepEqual(rows, []);
});


test('a labeled bare amount uses an explicit currency and leaves unknown amounts empty', () => {
  const rows = read({text: [
    'Currency: CAD',
    'Product: Rose Lotion Price: 24.50',
    'Product: Oat Shampoo',
  ].join('\n')});
  assert.deepEqual(projected(rows), [
    ['Rose Lotion', '', 24.50, 'CAD', null],
    ['Oat Shampoo', '', null, null, null],
  ]);
  assert.deepEqual(projected(read({text: 'Product: Rose Lotion\nProduct: Oat Shampoo'})), [
    ['Rose Lotion', '', null, null, null],
    ['Oat Shampoo', '', null, null, null],
  ]);
});

test('stacked cart cards read full headings across metadata and exclude visually crossed prices', () => {
  const amounts = (y, text, first, second) => ({
    ...line(text, 120, y, 178),
    words: [line(first, 120, y, 70), line(second, 220, y, 74)],
  });
  const lines = [
    line('Search', 30, 30),
    line('Alba Beauty', 120, 105),
    line('Peptide Hydrating Serum', 120, 133),
    line('for Sensitive Skin', 120, 160),
    line('Size 30 mL', 120, 186),
    line('ITEM 2697425', 242, 186),
    amounts(223, '$29.00 $19.25', '$29.00', '$19.25'),
    line('Remove', 130, 262),
    line('Juniper Goods', 121, 350),
    line('Oat Calming Cleanser', 120, 375),
    line('JL', 30, 398, 12, 6),
    line('Free of Fragrance', 120, 405),
    line('Size 120 mL', 120, 423),
    amounts(460, '$12.00 $18-00', '$12.00', '$18-00'),
    line('Estimated Total (2 items)', 20, 555), line('$31.25', 390, 555),
  ];
  const rows = read({ lines }, '', {
    inspectPrice: box => ({ struck: (box.y0 === 223 && box.x0 === 120) || (box.y0 === 460 && box.x0 === 220) }),
  });
  assert.deepEqual(projected(rows), [
    ['Alba Beauty Peptide Hydrating Serum for Sensitive Skin', '', 19.25, null, 'currency'],
    ['Juniper Goods Oat Calming Cleanser Free of Fragrance', '', 12, null, 'currency'],
  ]);
  assert.deepEqual(projected(read({ lines })), [
    ['Alba Beauty Peptide Hydrating Serum for Sensitive Skin', '', null, null, 'ambiguous'],
    ['Juniper Goods Oat Calming Cleanser Free of Fragrance', '', null, null, 'ambiguous'],
  ]);
  const unreadablePrices = read({ lines }, '', { inspectPrice: () => ({ struck: true }) });
  assert.equal(unreadablePrices.length, 2);
  assert.ok(unreadablePrices.every(item => item.title && item.price === null));
});

test('two grid columns need separate headings and keep competing prices in the same card', () => {
  const lines = [
    line('Loja: Casa Verde', 20, 20),
    line('Bamboo Comb', 40, 110),
    line('Oat Shampoo', 315, 110),
    line('for Everyday Use', 40, 137),
    line('Hydrating Formula', 315, 137),
    line('R$ 9,80', 40, 176, 74),
    line('R$ 14,25', 315, 176, 76), line('R$ 19,90', 412, 176, 80),
    line('Estimated Total', 39, 260), line('R$ 24,05', 400, 260, 81),
  ];
  assert.deepEqual(projected(read({ lines })), [
    ['Bamboo Comb for Everyday Use', 'Casa Verde', 9.8, 'BRL', null],
    ['Oat Shampoo Hydrating Formula', 'Casa Verde', null, null, 'ambiguous'],
  ]);

  // Two distant prices can still belong to one product when the other column has no heading.
  const missingHeading = lines.filter(item => item.text !== 'Oat Shampoo' && item.text !== 'Hydrating Formula');
  assert.deepEqual(read({ lines: missingHeading }), []);
});

test('repeated price columns keep staggered titles and prices in their own cards', () => {
  const lines = [
    line('Loja: Casa Aurora', 58, 49),
    line('Amber Face Oil', 78, 381, 200, 21),
    line('Silky Body Lotion', 593, 396, 220, 27),
    line('R$ 45,90', 80, 418, 119, 29),
    line('with Oat Extract', 592, 430, 205, 21),
    line('R$ 61,50', 594, 467, 119, 29),
    line('Cotton Travel Pouch', 593, 765, 261, 21),
    line('Vanilla Candle', 78, 786, 184, 21),
    line('R$ 29,75', 594, 802, 119, 29),
    line('Glass Jar', 79, 820, 122, 21),
    line('R$ 37,20', 80, 857, 119, 29),
  ];
  const rows = new Map(read({ lines }).map(item => [item.title, item.price]));
  assert.deepEqual(rows, new Map([
    ['Amber Face Oil', 45.9],
    ['Silky Body Lotion with Oat Extract', 61.5],
    ['Cotton Travel Pouch', 29.75],
    ['Vanilla Candle Glass Jar', 37.2],
  ]));
});

test('detail rows keep the unit amount, zero and quantity across different labels', () => {
  const lowConfidence = (text, y) => ({ ...line(text, 20, y, 75, 18), confidence: 21 });
  const rows = readItemDetails({ lines: [
    line('Moeda: CAD', 20, 3),
    line('Repair Kit', 20, 44), line('Travel Edition', 20, 68),
    line('ITEM 1234876', 20, 94),
    lowConfidence('Qty: 3', 120), line('Price: $12.50', 20, 145), line('$37.50', 520, 145),
    line('Oat Cream Sample', 20, 210),
    line('SKU 3679876', 20, 234), line('Final Sale: No returns', 20, 260),
    lowConfidence('Quantité: 1', 285), line('Prix unitaire : S0.00 $0.00', 20, 310),
    line('Hibiscus Gift Set', 20, 380), line('Código: 5678987', 20, 407),
    lowConfidence('Qtd: 2', 433), line('Preço unitário: não legível', 20, 458),
    line('Total CAD 37.50', 20, 510),
  ] });
  assert.deepEqual(rows.map(({title, price, currency, quantity}) => [title, price, currency, quantity]), [
    ['Repair Kit Travel Edition', 12.50, 'CAD', 3],
    ['Oat Cream Sample', 0, 'CAD', 1],
    ['Hibiscus Gift Set', null, null, 2],
  ]);
});
