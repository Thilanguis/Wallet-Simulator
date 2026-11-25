(function (root) {
  function drawWishPhoto(bitmap, max, crop = { x: 0, y: 0, w: 1, h: 1 }, maxScale = 1, padding = 0) {
    const width = bitmap.naturalWidth ?? bitmap.width;
    const height = bitmap.naturalHeight ?? bitmap.height;
    const w = width * crop.w, h = height * crop.h;
    const scale = Math.min(maxScale, max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    const outputWidth = Math.max(1, Math.round(w * scale));
    const outputHeight = Math.max(1, Math.round(h * scale));
    canvas.width = outputWidth + 2 * padding;
    canvas.height = outputHeight + 2 * padding;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, width * crop.x, height * crop.y, w, h, padding, padding, outputWidth, outputHeight);
    return canvas;
  }
  function compressWishPhoto(bitmap, crop) {
    // Small embedded thumbnail. Never reject a whole wishlist for an arbitrary
    // cumulative photo budget; the Firebase document limit still applies.
    for (const [max, quality] of [[320, 0.68], [240, 0.60], [180, 0.55], [128, 0.50], [96, 0.45], [72, 0.40]]) {
      const data = drawWishPhoto(bitmap, max, crop).toDataURL('image/jpeg', quality);
      if (WishProduct.savedImageUrl(data)) return data;
    }
    throw new Error('Não foi possível compactar esta foto. Tente um recorte menor ou adicione o produto pelo link.');
  }
  async function decodeWishPhoto(file) {
    try {
      return await createImageBitmap(file);
    } catch {
      const image = new Image();
      const url = URL.createObjectURL(file);
      try {
        image.src = url;
        await image.decode();
        return image;
      } catch {
        throw new Error('Não foi possível abrir esta foto. Tente selecionar o arquivo novamente ou use outro print em JPG ou PNG.');
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
  async function recoverPickedPhoto(file) {
    const image = await decodeWishPhoto(file);
    try {
      const canvas = drawWishPhoto(image, 1550);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return blob ? new File([blob], file.name, { type: blob.type }) : null;
    } finally {
      image.close?.();
    }
  }
  async function copyPickedPhoto(file) {
    const extension = file.name.match(/\.(jpe?g|png|webp|bmp)$/i)?.[1].toLowerCase();
    const type = !file.type || file.type === 'application/octet-stream'
      ? extension && 'image/' + (extension === 'jpg' ? 'jpeg' : extension)
      : file.type;
    if (!/^image\/(?:jpeg|png|webp|bmp)$/.test(type) || file.size > 12 * 1024 * 1024) return { warning: 'Escolha uma foto JPG, PNG, WebP ou BMP de até 12 MB.' };
    try {
      // Keep a readable copy before resetting the picker or starting OCR.
      const bytes = await Promise.resolve().then(() => file.arrayBuffer()).catch(() => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.onabort = () => reject();
        reader.readAsArrayBuffer(file);
      }));
      return { file: new File([bytes], file.name, { type }) };
    } catch {
      const recovered = await recoverPickedPhoto(file).catch(() => null);
      if (recovered) return { file: recovered };
      return { warning: 'O navegador não conseguiu ler este arquivo. Use Procurar em Arquivos e selecione a foto em Imagens ou Downloads.' };
    }
  }
  async function prepareWishPhoto(file) {
    const copied = await copyPickedPhoto(file);
    if (!copied.file) return copied;
    try {
      const bitmap = await decodeWishPhoto(copied.file);
      try {
        return {
          file: copied.file,
          imageUrl: compressWishPhoto(bitmap),
          width: bitmap.naturalWidth ?? bitmap.width,
          height: bitmap.naturalHeight ?? bitmap.height,
        };
      } finally {
        bitmap.close?.();
      }
    } catch (error) {
      return { warning: error.message };
    }
  }

  async function wishPhotoOcrSource(photo) {
    // Messaging apps often compress tall screenshots until letters look alike.
    if (photo.width >= 700 || photo.height < 1.5 * photo.width || photo.height >= 2200) return photo.file;
    const bitmap = await decodeWishPhoto(photo.file);
    let canvas;
    try {
      canvas = drawWishPhoto(bitmap, 2750, undefined, 2);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return blob ? new File([blob], photo.file.name, { type: blob.type }) : photo.file;
    } finally {
      bitmap.close?.();
      if (canvas) canvas.width = canvas.height = 0;
    }
  }

  async function wishPhotoPriceInspector(source) {
    const bitmap = await decodeWishPhoto(source);
    let canvas;
    try {
      canvas = drawWishPhoto(bitmap, 2200);
      const scaleX = canvas.width / (bitmap.naturalWidth ?? bitmap.width);
      const scaleY = canvas.height / (bitmap.naturalHeight ?? bitmap.height);
      const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      return ({ x0, x1, y0, y1 }) => WishPhotoInk.inspect(image, {
        x0: x0 * scaleX, x1: x1 * scaleX, y0: y0 * scaleY, y1: y1 * scaleY,
      });
    } finally {
      bitmap.close?.();
      if (canvas) canvas.width = canvas.height = 0;
    }
  }

  function checkoutWindow(bitmap) {
    // A bright order sheet over a darker background is a useful crop hint.
    const preview = drawWishPhoto(bitmap, 360);
    const {width, height} = preview;
    if (width < 220 || height < 260) return null;
    const pixels = preview.getContext('2d').getImageData(0, 0, width, height).data;
    function differentPixels(above, below) {
      let changed = 0, sampled = 0;
      for (let x = Math.floor(width * .10); x < width * .95; x += 4) {
        const a = (above * width + x) * 4, b = (below * width + x) * 4;
        const difference = Math.abs(pixels[a] - pixels[b]) + Math.abs(pixels[a+1] - pixels[b+1]) + Math.abs(pixels[a+2] - pixels[b+2]);
        if (difference > 75) changed++;
        sampled++;
      }
      return changed / sampled;
    }
    const acrossPage = y => differentPixels(y - 5, y + 10) > .74 &&
      differentPixels(y - 14, y - 5) < .24;
    function brightRow(y) {
      let bright = 0;
      for (let x = Math.floor(width * .52); x < width * .95; x += 3) {
        const i = (y * width + x) * 4;
        if (Math.min(pixels[i], pixels[i+1], pixels[i+2]) > 238) bright++;
      }
      return bright > width * .095;
    }
    for (let y = Math.round(height * .10); y < height * .5; y++) {
      if (!acrossPage(y) || brightRow(y - 4) || !brightRow(y) || !brightRow(y + 5) || !brightRow(y + 12)) continue;
      let bottom = height;
      for (let end = height - 1; end > y + height * .4; end--) {
        if (brightRow(end)) { bottom = end + 1; break; }
      }
      if (bottom - y > height * .47) return { top: y / height, bottom: bottom / height };
    }
    // A dark or tinted panel is also a useful boundary when its surface
    // has a sustained contrast with the page behind it.
    const tones = Array.from({ length: height }, (_, y) => {
      const samples = [];
      for (let x = Math.floor(width * .52); x < width * .95; x += 5) {
        const i = (y * width + x) * 4;
        samples.push((pixels[i] + pixels[i+1] + pixels[i+2]) / 3);
      }
      return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    });
    for (let y = Math.round(height * .10); y < height * .5; y++) {
      const surface = tones[y + 5];
      if (!acrossPage(y) || Math.abs(tones[y - 4] - surface) < 30 || Math.abs(tones[y + 12] - surface) > 12 ||
          Math.abs(tones[y + 24] - surface) > 12) continue;
      let end = height - 1;
      while (end > y + .47 * height && Math.abs(tones[end] - surface) > 15) end--;
      if (end - y > .47 * height) return { top: y / height, bottom: (end + 1) / height, dark: surface < 115 };
    }
    return null;
  }

  function cartPrice(text, { allowShortPrefix = false } = {}) {
    const label = text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');
    // OCR can see "$" as S and thin decimal points as whitespace.
    const prefix = allowShortPrefix ? /(?:CA[$S§]?|A(?=\d))\s*/i : /CA[$S§]+\s*/i;
    const matched = prefix.exec(label);
    if (!matched) return null;
    const digits = label.slice(matched.index + matched[0].length).replace(/^\$\s*/, '');
    const translate = value => value.toUpperCase().replace(/[OTABSI]/g, c => ({O:'0',T:'7',A:'4',B:'8',S:'5',I:'1'}[c]));
    const decimal = digits.match(/^([0-9OTABSI]{1,4})(?:\s*[.,a]\s*|\s+)([0-9OI]{2})(?:1(?=\s|:|$))?(?![\d%])/i);
    if (decimal) return Number(translate(decimal[1]) + '.' + translate(decimal[2]));
    const compact = digits.match(/^(\d{3,6})(?![\d%])/);
    return compact ? Number(compact[1]) / 100 : null;
  }

  function reconcileCartDigits(candidates, readings, drop) {
    const observed = readings.map(text => text.replace(/\D/g, ''));
    const numeric = readings.flatMap((text, index) => {
      const decimal = text.match(/^(\d{1,3})[., ](\d{2})\d?$/);
      if (decimal) return [Number(decimal[1] + '.' + decimal[2])];
      return drop && index === readings.length - 1 && /^\d{3,4}$/.test(text) ? [Number(text) / 100] : [];
    });
    const ranked = [...new Set([...candidates,...numeric].filter(value => value > 0))].map(value => {
      const digits = value.toFixed(2).replace('.', '');
      const score = observed.reduce((total, text) => total + (text === digits ? 3 :
        text.length === digits.length + 1 && (text.startsWith(digits) || text.endsWith(digits)) ? 2 : 0), 0);
      return { value, score };
    }).sort((a,b) => b.score-a.score);
    return ranked[0]?.score >= 4 && ranked[0].score > (ranked[1]?.score || 0) ? ranked[0].value : null;
  }

  function checkoutInk(bitmap) {
    const canvas = drawWishPhoto(bitmap, 2200);
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  }

  function orangeStrength(data, i) {
    const r = data[i], g = data[i+1], b = data[i+2];
    return r - g > 11 && r - b > 18 && g - b < 95 ? Math.min(r - b, 255 - b) : 0;
  }

  function priceBand(image, top, bottom) {
    const {width, height, data} = image;
    const bands = [];
    for (let y = Math.max(0, Math.round(top * height)); y < Math.min(height, Math.round(bottom * height)); y++) {
      let ink = 0;
      for (let x = Math.round(width * .113); x <= Math.round(width * .26); x++) {
        if (orangeStrength(data, (y * width + x) * 4) > 22) ink++;
      }
      if (ink < width * .009) continue;
      const previous = bands.at(-1);
      if (previous && y - previous.bottom <= 3) {
        previous.bottom = y;
        previous.ink += ink;
      } else bands.push({top:y,bottom:y,ink});
    }
    const last = bands.filter(band => band.bottom - band.top >= height * .0035 && band.ink > width * .09).at(-1);
    return last && {y:Math.max(top, (last.top - 4) / height), bottom:Math.min(bottom, (last.bottom + 5) / height)};
  }

  function horizontalPriceBounds(image, band) {
    const {width, height, data} = image;
    let first = -1, last = -1;
    for (let x = Math.round(width * .112); x < width * .32; x++) {
      let ink = 0;
      for (let y = Math.round(band.y * height); y < Math.round(band.bottom * height); y++) {
        if (orangeStrength(data, (y * width + x) * 4) > 22) ink++;
      }
      if (ink >= 2) {
        if (first >= 0 && x - last > width * .010 && last - first > width * .033) break;
        if (first < 0) first = x;
        last = x;
      }
    }
    return first < 0 ? {x:.112,w:.215} : {
      x: Math.max(.108, (first - 3) / width), w: (last - first + 8) / width,
    };
  }

  function enhancePrice(canvas) {
    const context = canvas.getContext('2d');
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const {data} = image;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.max(0, Math.min(255, (Math.min(data[i], data[i+1], data[i+2]) - 83) * 1.63));
      data[i] = data[i+1] = data[i+2] = gray;
    }
    context.putImageData(image, 0, 0);
  }

  function checkoutTitle(heading, ink, crop, scale, photo) {
    const {width, height, data} = ink;
    const y0 = Math.max(0, Math.round((crop.y + heading.bbox.y0 / scale / photo.height) * height));
    const y1 = Math.min(height, Math.round((crop.y + heading.bbox.y1 / scale / photo.height) * height));
    let right = 0;
    for (let x = Math.round(width * .115); x < width * .205; x++) {
      let red = 0;
      for (let y = y0; y < y1; y++) {
        const i = (y * width + x) * 4;
        if (data[i+1] < 105 && data[i] - data[i+1] > 35) red++;
      }
      if (red > Math.max(2, (y1-y0) * .35)) right = x;
    }
    const clean = right > width * .155 && heading.words?.length ? heading.words.filter(word =>
      crop.x + word.bbox.x0 / scale / photo.width > right / width - .002).map(word => word.text).join(' ') : heading.text;
    return (clean || heading.text).replace(/^[^\p{L}\d]+/u, '').replace(/^bl.ck\s*friday\s+/iu, '').trim();
  }

  async function recognizeCheckout(photo, url, recognize, current) {
    if (photo.width < 580 || !current()) return [];
    const bitmap = await decodeWishPhoto(photo.file);
    try {
      const sheet = checkoutWindow(bitmap);
      if (!sheet) return [];
      const top = sheet.top + .029;
      const crop = {x:.112, y:top, w:.87, h:sheet.bottom-top};
      const canvas = drawWishPhoto(bitmap, 3300, crop, 3);
      const scale = canvas.height / (photo.height * crop.h);
      if (sheet.dark) {
        const ctx = canvas.getContext('2d');
        ctx.filter = 'invert(1)';
        ctx.drawImage(canvas, 0, 0);
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      canvas.width = canvas.height = 0;
      if (!blob || !current()) return [];
      const found = await recognize(blob, undefined, {tessedit_pageseg_mode:'6'}, {layout:true});
      const lines = (found.lines || []).filter(line => line.text?.trim() && line.bbox);
      const sellers = lines.flatMap((line, index) => {
        const seller = line.text.match(/\b(?:sold by|vendido por|vendu par)\s+(.+)/iu);
        return seller ? [{index, name:seller[1].trim()}] : [];
      });
      const ink = checkoutInk(bitmap);
      const imageBox = box => ({
        x0: (crop.x + box.x0 / scale / photo.width) * ink.width,
        x1: (crop.x + box.x1 / scale / photo.width) * ink.width,
        y0: (crop.y + box.y0 / scale / photo.height) * ink.height,
        y1: (crop.y + box.y1 / scale / photo.height) * ink.height,
      });
      const blockOptions = {
        allowNoSeller: true,
        cleanHeading: part => checkoutTitle({ ...part, bbox: part.box }, ink, crop, scale, photo),
        inspectPrice: box => WishPhotoInk.inspect(ink, imageBox(box)),
      };
      async function readBlocks() {
        const reviewed = [];
        for (const line of lines) {
          if (!current()) return [];
          const firstPrice = line.words?.find(word => /(?:CA[$S]|[$€£¥])[^\s]*[\dIOTS]/iu.test(word.text));
          if (!firstPrice || WishProduct.readPhotoText(firstPrice.text, url, { keepUnconfirmedAmount: true }).price != null ||
              blockOptions.inspectPrice(firstPrice.bbox).struck) {
            reviewed.push(line);
            continue;
          }
          const box = imageBox(firstPrice.bbox);
          const x = Math.max(0, (box.x0 - 3) / ink.width), y = Math.max(0, (box.y0 - 4) / ink.height);
          const w = Math.min(1 - x, (box.x1 + 5) / ink.width - x);
          const h = Math.min(1 - y, (box.y1 + 5) / ink.height - y);
          async function readStrip(offset = 0, whitelist) {
            if (!current()) return '';
            const sample = drawWishPhoto(bitmap, 1200, { x: x + w * offset, y, w: w * (1 - offset), h }, 5, 16);
            const strip = await new Promise(resolve => sample.toBlob(resolve, 'image/png'));
            sample.width = sample.height = 0;
            if (!strip || !current()) return '';
            const options = { tessedit_pageseg_mode: '7' };
            if (whitelist) options.tessedit_char_whitelist = whitelist;
            const read = await recognize(strip, undefined, options).catch(() => null);
            return read?.text?.trim() || '';
          }
          const parsed = value => WishProduct.readPhotoText(value, url, { keepUnconfirmedAmount: true }).price;
          let text = await readStrip();
          const marker = firstPrice.text.match(/^(?:CA[$S]|US[$S]|R[$S]|[$€£¥])/iu)?.[0];
          if (parsed(text) == null && marker) {
            const readings = [];
            for (const offset of [.4, .46, .52]) {
              const digits = await readStrip(offset, '0123456789., ');
              const decimal = digits.match(/^(\d{1,4})[.,]\s*(\d{2})$/);
              if (decimal) readings.push(decimal[1] + '.' + decimal[2]);
            }
            const originalCents = firstPrice.text.match(/[.,](\d{2})$/)?.[1];
            const candidates = readings.filter(value => !originalCents || value.endsWith('.' + originalCents));
            const agreed = candidates.find((value, index) => candidates.indexOf(value) < index);
            if (agreed) text = marker.replace(/S$/i, '$') + agreed;
          }
          if (parsed(text) != null) {
            const words = line.words.map(word => word === firstPrice ? { ...word, text } : word);
            reviewed.push({ ...line, text: words.map(word => word.text).join(' '), words });
          } else reviewed.push(line);
        }
        return WishPhotoList.readBlocks({ lines: reviewed }, url, blockOptions);
      }
      if (sellers.length < 2 || sheet.dark) return await readBlocks();
      const items = [];
      for (const [position, seller] of sellers.entries()) {
        if (!current()) break;
        const heading = lines[seller.index-1];
        const following = lines[sellers[position+1]?.index-1];
        // The product title sits directly above its seller. Navigation or
        // delivery labels elsewhere in the image cannot create a product.
        if (!heading || lines[seller.index].bbox.y0 - heading.bbox.y0 > 40 * scale) continue;
        const title = checkoutTitle(heading, ink, crop, scale, photo);
        if (title.length < 8) continue;
        const sellerY = top + lines[seller.index].bbox.y0 / scale / photo.height;
        const bottom = following ? top + (following.bbox.y0 / scale - 5) / photo.height : sheet.bottom;
        const band = priceBand(ink, sellerY + .024, bottom);
        let price = null;
        if (band && current()) {
          const bounds = horizontalPriceBounds(ink, band);
          const base = { ...bounds, y:band.y, h:band.bottom-band.y };
          const output = async (region, enhance, whitelist, orangeOnly = false, scale = 5) => {
            const strip = drawWishPhoto(bitmap, 1550, region, scale, 18);
            if (orangeOnly) {
              const context = strip.getContext('2d');
              const pixels = context.getImageData(0, 0, strip.width, strip.height);
              for (let i = 0; i < pixels.data.length; i += 4) {
                const shade = 255 - Math.min(255, orangeStrength(pixels.data, i) * 3);
                pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = shade;
              }
              context.putImageData(pixels, 0, 0);
            } else if (enhance) enhancePrice(strip);
            const sample = await new Promise(resolve => strip.toBlob(resolve, 'image/png'));
            strip.width = strip.height = 0;
            if (!sample || !current()) return '';
            const options = {tessedit_pageseg_mode:'7'};
            if (whitelist) options.tessedit_char_whitelist = whitelist;
            const reading = await recognize(sample, undefined, options).catch(() => null);
            return reading?.text || '';
          };
          const enhanced = await output(base, true);
          const raw = await output(base, false, '0123456789CA$S., ');
          const first = cartPrice(enhanced);
          const second = cartPrice(raw, {allowShortPrefix:true});
          if (first != null && first === second) price = first;
          else {
            const details = lines.slice(seller.index+1, following ? sellers[position+1].index-1 : undefined);
            const drop = details.some(line => /price\s*drop/i.test(line.text));
            const lowest = /lowest/i.test(enhanced) || details.some(line => /30d\s*lowest/i.test(line.text));
            if (!lowest) {
              // Removing the currency and sale badge gives another view of
              // the same printed digits. Require agreement across recrops.
              const anchors = drop ? [.147,.151,.155] : [.133,.136,.139];
              const numeric = [];
              for (const x of anchors) numeric.push((await output({
                x, y:base.y-.002, w:.042, h:base.h+.004,
              }, false, '0123456789., ')).trim());
              price = reconcileCartDigits([first, second], numeric, drop);
              if (price == null && drop && (first != null || second != null)) {
                // In narrow checkout rows the neighbouring gray amount can
                // reach the numeric crop. Re-read only the coloured digits.
                const masked = await output(base, false, '0123456789CA$S., ', true);
                const confirmed = cartPrice(masked, { allowShortPrefix: true });
                if (confirmed != null && (confirmed === first || confirmed === second)) price = confirmed;
                if (price == null && first != null && second != null && first !== second) {
                  const votes = new Map();
                  for (const [left, top, bottom] of [[.018, .0016, .0016], [.020, .0023, .0016], [.022, 0, .0016]]) {
                    const w = base.w - left - .005, h = base.h - top - bottom;
                    if (w <= 0 || h <= 0) continue;
                    const region = { x: base.x + left, y: base.y + top, w, h };
                    const reading = await output(region, false, '0123456789CA$S., ', false, 8);
                    const candidate = cartPrice(reading, { allowShortPrefix: true }) ??
                      (/^\d{1,3}[.,]\d{2}$/.test(reading.trim()) ? Number(reading.trim().replace(',', '.')) : null);
                    if (candidate === first || candidate === second) votes.set(candidate, (votes.get(candidate) || 0) + 1);
                  }
                  price = [...votes].find(([, count]) => count >= 2)?.[0] ?? null;
                }
              }
            }
            if (price == null && first == null && !lowest) {
              // Accept a complete decimal only when the isolated current-price
              // crop contains one amount and no competing currency reading.
              const strict = raw.trim().match(/^(CA[$S]\s*\d{1,4}[.,]\s*\d{2})$/i);
              if (strict) price = cartPrice(strict[1]);
            }
            if (price == null && lowest) {
              // With the longer sale label, the currency-aligned view is
              // stronger than a fixed numeric crop.
              const candidates = [first, second].filter(value => value != null);
              const strict = raw.match(/CA[$S]\s*\d{1,4}[.,]\s*\d{2}(?:\D|$)/i);
              if (strict) price = cartPrice(strict[0]);
              else if (candidates.length === 1 && /CA\$\d{1,4}[., ]\s*\d{2}/i.test(enhanced)) price = candidates[0];
            }
          }
        }
        items.push({title: title.slice(0, 300), store: seller.name.slice(0, 150), price: price ?? null,
          currency: price != null ? 'CAD' : null, priceIssue: null});
      }
      if (items.filter(item => item.price != null).length < 2) return await readBlocks();
      const blocks = WishPhotoList.readBlocks(found, url, blockOptions);
      const confirmed = new Map(blocks.filter(item => item.price != null).map(item => [photoProductKey(item.title), item]));
      return items.map(item => {
        const other = confirmed.get(photoProductKey(item.title));
        return item.price == null && other ? other : item;
      });
    } finally {
      bitmap.close?.();
    }
  }

  function mergePhotoProduct(item, alternate) {
    const matches = alternate.filter(other => photoProductKey(other.title) === photoProductKey(item.title));
    const match = matches.length === 1 ? matches[0] : null;
    if (!match) return item;
    const conflict = item.priceIssue === 'ambiguous' || match.priceIssue === 'ambiguous' ||
      (item.price != null && match.price != null && item.price !== match.price) ||
      (item.currency && match.currency && item.currency !== match.currency);
    if (conflict) return { ...item, price: null, currency: null, priceIssue: 'ambiguous' };
    const price = item.price ?? match.price;
    const currency = item.currency || match.currency;
    if (price != null && [...(item.excludedPrices || []), ...(match.excludedPrices || [])]
      .some(excluded => excluded.price === price && (!excluded.currency || !currency || excluded.currency === currency))) {
      return { ...item, price: null, currency: null, priceIssue: 'ambiguous' };
    }
    return { ...item, store: item.store || match.store, price, currency,
      priceIssue: price != null && !currency ? 'currency' : null };
  }

  async function readLongPhoto(photo, url, recognize, current) {
    // Upscale a scrolling screenshot in overlapping strips so the middle
    // does not lose small text when the full image is resized for OCR.
    const count = Math.min(6, Math.ceil(photo.height / (photo.width * 1.65)));
    const overlap = .18 / count;
    const bitmap = await decodeWishPhoto(photo.file);
    const rows = [];
    try {
      for (let index = 0; index < count && current(); index++) {
        const y = Math.max(0, index / count - overlap);
        const h = Math.min(1, (index + 1) / count + overlap) - y;
        const canvas = drawWishPhoto(bitmap, 2400, { x: 0, y, w: 1, h }, 3);
        const source = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        canvas.width = canvas.height = 0;
        if (!source || !current()) continue;
        const reading = await recognize(source, undefined, { tessedit_pageseg_mode: '11' }, { layout: true }).catch(() => null);
        if (!reading || !current()) continue;
        const inspectPrice = await wishPhotoPriceInspector(source).catch(() => null);
        const products = WishPhotoList.read(reading, url, { inspectPrice });
        const sameRow = (left, right) => photoProductKey(left.title) === photoProductKey(right.title) &&
          left.price === right.price && left.currency === right.currency;
        let shared = Math.min(rows.length, products.length);
        while (shared && !products.slice(0, shared).every((item, i) => sameRow(rows[rows.length - shared + i], item))) shared--;
        rows.push(...products.slice(shared));
      }
    } finally {
      bitmap.close?.();
    }
    return rows;
  }


  async function normalizedPhotoRegion(source, region, max = 2300) {
    const bitmap = await decodeWishPhoto(source);
    let canvas;
    try {
      canvas = drawWishPhoto(bitmap, max, region, 3, 12);
      const ctx = canvas.getContext('2d');
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0, samples = 0;
      for (let y = 18; y < canvas.height - 12; y += 13) {
        for (let x = 18; x < canvas.width - 12; x += 17) {
          const i = (y * canvas.width + x) * 4;
          if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 360) dark++;
          samples++;
        }
      }
      ctx.filter = (dark > samples / 2 ? 'invert(1) ' : '') + 'grayscale(1) contrast(1.2)';
      ctx.drawImage(canvas, 0, 0);
      return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    } finally {
      bitmap.close?.();
      if (canvas) canvas.width = canvas.height = 0;
    }
  }

  async function readDetailColumn(source, reading, url, recognize, current) {
    const initial = WishPhotoList.readItemDetails(reading, url);
    const boxes = WishPhotoList.detailPriceBoxes(reading);
    if (boxes.length < 2 || !current()) return initial;
    const x0 = Math.min(...boxes.map(box => box.x0));
    const height = Math.max(...boxes.map(box => box.y1 - box.y0));
    // Keep separate price columns intact. A single aligned column can be
    // read without thumbnails, icons, or text from adjacent panes.
    if (Math.max(...boxes.map(box => box.x0)) - x0 > height * 1.5) return initial;
    const bitmap = await decodeWishPhoto(source);
    const width = bitmap.naturalWidth ?? bitmap.width;
    const fullHeight = bitmap.naturalHeight ?? bitmap.height;
    bitmap.close?.();
    const x = Math.max(0, x0 - height * 1.4) / width;
    const top = Math.max(0, Math.min(...boxes.map(box => box.y0)) - height * 15) / fullHeight;
    const bottom = Math.min(fullHeight, Math.max(...boxes.map(box => box.y1)) + height * 2) / fullHeight;
    if (x >= .8 || bottom <= top) return initial;
    const cropped = await normalizedPhotoRegion(source, { x, y: top, w: 1 - x, h: bottom - top }, 2700);
    if (!cropped || !current()) return initial;
    const reviewed = await recognize(cropped, undefined, { tessedit_pageseg_mode: '6' }, { layout: true });
    const alternate = WishPhotoList.readItemDetails(reviewed, url);
    const score = rows => rows.length + rows.filter(row => row.price != null).length;
    return alternate.length >= initial.length && score(alternate) >= score(initial) ? alternate : initial;
  }

  async function readWishPhoto(photo, url, recognize, isCurrent) {
    const longPhoto = photo.height >= 1800 && photo.height >= photo.width * 3;
    const checkout = longPhoto ? [] : await recognizeCheckout(photo, url, recognize, isCurrent).catch(() => []);
    if (checkout.length) return {products: checkout};
    const source = await wishPhotoOcrSource(photo).catch(() => photo.file);
    const first = await recognize(source, undefined, { tessedit_pageseg_mode: '3' }, { layout: true })
      .catch(() => null);
    const details = await readDetailColumn(source, first, url, recognize, isCurrent)
      .catch(() => WishPhotoList.readItemDetails(first, url));
    if (details.length) return { products: details };
    let inspector;
    async function readList(result) {
      if (!result || Number.isFinite(result.confidence) && result.confidence < 45) return [];
      if (result.lines?.length) inspector ||= wishPhotoPriceInspector(source).catch(() => null);
      const options = { inspectPrice: await inspector };
      const products = WishPhotoList.read(result, url, options);
      return products.length ? products : WishPhotoList.readBlocks(result, url, options);
    }
    const products = await readList(first);
    const parse = ({ text, confidence }) => {
      if (Number.isFinite(confidence) && confidence < 45) return WishProduct.readPhotoText('', url);
      return WishProduct.readPhotoText(text, url, { keepUnconfirmedAmount: true });
    };
    const primary = parse(first || {});
    const suggestion = { ...primary };
    if (!isCurrent()) return suggestion;
    if (!longPhoto && !products.length && primary.title && primary.store && primary.price != null && primary.currency && (first?.lines?.length || 0) < 5) return suggestion;

    const alternatives = [];
    async function tryRegion(image, full = false) {
      if (!isCurrent()) return;
      try {
        const result = await recognize(image, undefined, { tessedit_pageseg_mode: '11' }, { layout: full });
        if (full) {
          const products = WishPhotoList.readItemDetails(result, url);
          if (products.length) return products;
          const structured = await readList(result);
          if (structured.length > 1) return structured;
        }
        alternatives.push(parse(result));
      } catch {
        // Other OCR attempts can fail independently of the opened image.
      }
    }
    const sparseProducts = await tryRegion(source, true) || [];
    if (isCurrent() && longPhoto) {
      const strips = await readLongPhoto(photo, url, recognize, isCurrent).catch(() => []);
      const priced = rows => rows.filter(item => item.price != null).length;
      const best = priced(sparseProducts) > priced(products) ? sparseProducts : products;
      const keys = new Set(strips.map(item => photoProductKey(item.title)));
      if (strips.length >= 2 && priced(strips) > priced(best) && best.every(item => keys.has(photoProductKey(item.title)))) {
        return { products: strips.map(item => mergePhotoProduct(item, best)) };
      }
    }
    if (products.length || sparseProducts.length) {
      // The sparse pass often sees more rows in a wide table. Compare by
      // product name so contradictory values still require review.
      const [best, alternate] = sparseProducts.length >= products.length ? [sparseProducts, products] : [products, sparseProducts];
      return { products: best.map(item => mergePhotoProduct(item, alternate)) };
    }
    if (isCurrent() && (!primary.title || (primary.price == null && !primary.priceIssue)) &&
        !alternatives.some(result => result.title && result.price != null)) {
      try {
        const portrait = photo.height > photo.width;
        // Use overlapping halves when text is too small or split among columns.
        const regions = portrait
          ? [{ x: 0, y: 0, w: 1, h: .62 }, { x: 0, y: .38, w: 1, h: .62 }]
          : [{ x: 0, y: 0, w: .62, h: 1 }, { x: .38, y: 0, w: .62, h: 1 }];
        const recovered = [];
        for (const region of regions) {
          if (!isCurrent()) break;
          const blob = await normalizedPhotoRegion(photo.file, region);
          if (!blob) continue;
          const reading = await recognize(blob, undefined, { tessedit_pageseg_mode: '11' }, { layout: true }).catch(() => null);
          if (!reading) continue;
          const inspectPrice = await wishPhotoPriceInspector(blob).catch(() => null);
          const structured = WishPhotoList.readItemDetails(reading, url);
          const found = structured.length ? structured : WishPhotoList.read(reading, url, { inspectPrice });
          for (const item of found) {
            const key = photoProductKey(item.title);
            const index = recovered.findIndex(other => photoProductKey(other.title) === key);
            if (index < 0) recovered.push(item);
            else recovered[index] = mergePhotoProduct(recovered[index], [item]);
          }
          alternatives.push(parse(reading));
        }
        if (recovered.length > 1) return { products: recovered };
      } catch {
        // The full-image reading and preview remain available if crops fail.
      }
    }
    const textFields = (key) => [...new Set(alternatives.map(item => item[key]).filter(Boolean))];
    for (const key of ['title', 'store']) {
      const values = textFields(key);
      if (!suggestion[key] && values.length === 1) suggestion[key] = values[0];
    }
    // A crop cannot settle a conflict visible in the original print or turn an
    // old price, shipping charge or installment into the current price.
    if (suggestion.price == null && !primary.priceIssue) {
      const excluded = [primary, ...alternatives].flatMap(item => item.excludedPrices);
      const observed = alternatives.filter(item => item.price != null &&
        !excluded.some(other => other.price === item.price && (!other.currency || other.currency === item.currency)));
      const firstPrice = observed[0];
      if (firstPrice && !alternatives.some(item => item.priceIssue === 'ambiguous') &&
          observed.every(item => item.price === firstPrice.price && item.currency === firstPrice.currency)) {
        suggestion.price = firstPrice.price;
        suggestion.currency = firstPrice.currency;
        suggestion.priceIssue = firstPrice.priceIssue;
      } else if (observed.length) suggestion.priceIssue = 'ambiguous';
      else suggestion.priceIssue = alternatives.find(item => item.priceIssue)?.priceIssue;
    }
    return first || alternatives.length ? suggestion : { failed: true };
  }

  async function recognizeWishPhoto(photo, url, recognize, isCurrent) {
    const result = await readWishPhoto(photo, url, recognize, isCurrent);
    const withDefault = item => item.price != null && !item.currency && item.priceIssue !== 'ambiguous'
      ? { ...item, currency: 'CAD', priceIssue: null, assumedCurrency: true } : item;
    return result.products ? { ...result, products: result.products.map(withDefault) } : withDefault(result);
  }

  function photoProductKey(title) {
    return (title || '').trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('pt-BR');
  }
  root.WishPhotoReader = { prepareWishPhoto, recognizeWishPhoto, photoProductKey };
})(globalThis);
