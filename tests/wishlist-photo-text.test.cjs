const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readPhotoText } = require('../js/wishlist-product.js');

test('uses generic page clues to recognize the product, unknown seller and checkout currency', () => {
  const from = (text) => {
    const { title, store, price, currency } = readPhotoText(text);
    return { title, store, price, currency };
  };
  assert.deepEqual(from('north-pine.ca\nWas $160.00 Now $119.99\nProduct: Trail Day Pack\nInstallments: $30.00'), {
    title: 'Trail Day Pack',
    store: 'North-pine',
    price: 119.99,
    currency: 'CAD',
  });
  assert.deepEqual(from('Loja: Ateliê Breu\nBolsa de lona\nDe R$ 499,90 por R$ 349,90\nFrete: R$ 19,90'), {
    title: 'Bolsa de lona',
    store: 'Ateliê Breu',
    price: 349.9,
    currency: 'BRL',
  });
  assert.deepEqual(from('Store: River Studio\nProduct: Walnut Desk Tray\nUSD 1,050.99\nTax: USD 8.50'), {
    title: 'Walnut Desk Tray',
    store: 'River Studio',
    price: 1050.99,
    currency: 'USD',
  });
  assert.deepEqual(from('Atelier Aurore\nThéière en céramique\nPrix régulier : 1 299,90 €\nPrix actuel : 1 049,90 €\nLivraison : 8,50 €'), {
    title: 'Théière en céramique',
    store: '',
    price: 1049.9,
    currency: 'EUR',
  });
  assert.deepEqual(from('Store: Hako\nProduct: Bento Box\nJPY 12,800'), {
    title: 'Bento Box',
    store: 'Hako',
    price: 12800,
    currency: 'JPY',
  });
});

test('does not turn ambiguous prices, shipping, old prices or ambiguous dollars into a suggestion', () => {
  for (const [text, issue] of [
    ['Canvas Overnight Bag\nCAD 125.00\nCAD 199.00', 'ambiguous'],
    ['Canvas Overnight Bag\nUSD 125.00 – 199.00', 'ambiguous'],
    ['Travel Bag\n$24.50\nShipping to Canada', 'currency'],
    ['Desk lamp\nShipping: USD 4.00\nRegular price: USD 75.99\n4 installments of USD 15.00\nTax: USD 2.50', null],
    ['Desk lamp\nR$ 29,99 por mês', null],
    ['Store: Arco Joias\nProduct: Aurora Necklace\nPrice not displayed', null],
  ]) {
    const result = readPhotoText(text);
    assert.equal(result.price, null, text);
    assert.equal(result.currency, null, text);
    assert.equal(result.priceIssue, issue, text);
  }
});

test('differentiates contextual discounts and accepts split OCR digits without guessing a currency', () => {
  const result = readPhotoText('YesStyle\nMedicube - Pink Collagen Cream\nC A S$ 33. 46\nCA$ 47.60 29% OFF');
  assert.equal(result.price, 33.46);
  assert.equal(result.currency, 'CAD');
  assert.deepEqual(result.excludedPrices, [{ price: 47.6, currency: 'CAD' }]);
  assert.equal(readPhotoText('Product: Trail Boots\n$149.00', 'https://arbitrary-shop.ca/products/boots').price, 149);
  assert.equal(readPhotoText('Product: Trail Boots\n$149.00', 'https://arbitrary-shop.com/products/boots').price, null);
});

test('reads separated currency lines and parentheses indicating old prices', () => {
  const split = readPhotoText('Store: Halo\nProduct: Table Lamp\nYour price:\n49.50\nUSD');
  assert.equal(split.price, 49.50);
  assert.equal(split.currency, 'USD');
  const old = readPhotoText('Product: Table Lamp\nCAD 40.99 CAD 70.99 (regular price)');
  assert.equal(old.price, 40.99);
  assert.equal(old.currency, 'CAD');
});
test('keeps a readable amount for confirmation and excludes a visually crossed out price', () => {
  const caption = "Currency: CAD\nProduct: Shampoo\n$19.00 $29.00";
  const onlyDollar = readPhotoText('Product: Shampoo\n$19.00', '', { keepUnconfirmedAmount: true });
  assert.equal(onlyDollar.price, 19);
  assert.equal(onlyDollar.currency, null);
  assert.equal(onlyDollar.priceIssue, 'currency');

  const ambiguous = readPhotoText(caption, '', { keepUnconfirmedAmount: true });
  assert.equal(ambiguous.price, null);
  assert.equal(ambiguous.priceIssue, 'ambiguous');

  const confirmed = readPhotoText(caption, '', {
    keepUnconfirmedAmount: true,
    isStruck: (line, start, end) => line === 2 && start === 7 && end === 13,
  });
  assert.equal(confirmed.price, 19);
  assert.equal(confirmed.currency, 'CAD');
  assert.deepEqual(confirmed.excludedPrices, [{ price: 29, currency: 'CAD' }]);
});
