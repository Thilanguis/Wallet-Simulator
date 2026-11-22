/* Inspect the pixels inside an OCR price box for a line through the digits. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.WishPhotoInk = api;
})(globalThis, function () {
  function inspect(image, box) {
    if (!image?.data || !box || ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) return { struck: false };

    const left = Math.max(0, Math.floor(box.x0));
    const right = Math.min(image.width, Math.ceil(box.x1));
    const top = Math.max(0, Math.floor(box.y0));
    const bottom = Math.min(image.height, Math.ceil(box.y1));
    const width = right - left, height = bottom - top;
    if (width < 20 || height < 7 || width < height * 1.4) return { struck: false };

    // Sample above and below the text so the same test works on light and dark themes.
    const background = [];
    const margin = Math.max(1, Math.round(height * .15));
    for (const y of [Math.max(0, top - margin), Math.min(image.height - 1, bottom + margin)]) {
      for (let k = 0; k < 9; k++) {
        const offset = 4 * (y * image.width + left + Math.floor(k * (width - 1) / 8));
        background.push([image.data[offset], image.data[offset + 1], image.data[offset + 2]]);
      }
    }
    const median = (channel) => background.map(pixel => pixel[channel]).sort((a, b) => a - b)[Math.floor(background.length / 2)];
    const [red, green, blue] = [0, 1, 2].map(median);
    const runLengths = [];
    const gapTolerance = Math.min(2, Math.floor(width / 35));

    for (let y = top; y < bottom; y++) {
      let first = -1, last = -1, longest = 0;
      for (let x = left; x < right; x++) {
        const offset = 4 * (y * image.width + x);
        const contrast = Math.abs(image.data[offset] - red) + Math.abs(image.data[offset + 1] - green) + Math.abs(image.data[offset + 2] - blue);
        if (contrast < 150) continue;
        if (last < 0 || x - last > gapTolerance + 1) first = x;
        last = x;
        longest = Math.max(longest, last - first + 1);
      }
      runLengths.push(longest);
    }

    // A strike spans most of the price and peaks well inside the glyphs, with
    // the ordinary separated letter strokes still visible above and below it.
    const flank = Math.max(2, Math.round(height * .18));
    for (let row = Math.ceil(height * .26); row < Math.floor(height * .74); row++) {
      const run = runLengths[row];
      const before = runLengths[row - flank], after = runLengths[row + flank];
      if (before && after && run >= width * .61 && run - Math.max(before, after) >= width * .24) {
        return { struck: true };
      }
    }
    return { struck: false };
  }

  return { inspect };
});
