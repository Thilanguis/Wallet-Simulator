const test = require('node:test');
const assert = require('node:assert/strict');
const { inspect } = require('../js/wishlist-photo-ink');

const box = { x0: 12, y0: 7, x1: 76, y1: 27 };

function pricePixels({ background, ink, decoration, text = true }) {
  const width = 96, height = 36, data = new Uint8ClampedArray(width * height * 4);
  const line = (y, x0, x1, color) => {
    for (let x = x0; x < x1; x++) data.set([...color, 255], 4 * (y * width + x));
  };
  for (let y = 0; y < height; y++) line(y, 0, width, background);
  if (text) {
    // An approximation of separate numeral stems with short horizontal strokes.
    for (let x = 12; x < 76; x += 11) {
      for (let y = 8; y < 26; y++) line(y, x, x + ([8, 16, 25].includes(y) ? 7 : 2), ink);
    }
  }
  if (decoration != null) line(decoration, 12, 76, ink);
  return { data, width, height };
}

test('recognizes strike-through ink on light and dark backgrounds', () => {
  for (const [background, ink] of [
    [[250, 250, 249], [45, 45, 46]],
    [[26, 25, 28], [204, 218, 224]],
  ]) {
    assert.deepEqual(inspect(pricePixels({ background, ink, decoration: 16 }), box), { struck: true });
  }
});

test('does not confuse lettering or an underline with a strike through the price', () => {
  const colors = { background: [250, 250, 249], ink: [125, 24, 30] };
  for (const decoration of [undefined, 26]) {
    assert.deepEqual(inspect(pricePixels({ ...colors, decoration }), box), { struck: false });
  }
  assert.deepEqual(inspect(pricePixels({ ...colors, decoration: 16, text: false }), box), { struck: false });
  assert.deepEqual(inspect(null, box), { struck: false });
});
