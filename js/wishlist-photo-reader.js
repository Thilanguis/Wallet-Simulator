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

  async function recognizeWishPhoto(photo, url, recognize, isCurrent) {
    const source = await wishPhotoOcrSource(photo).catch(() => photo.file);
    const first = await recognize(source, undefined, { tessedit_pageseg_mode: '3' }, { layout: true })
      .catch(() => null);
    let inspector;
    async function readList(result) {
      if (!result || Number.isFinite(result.confidence) && result.confidence < 45) return [];
      if (result.lines?.length) inspector ||= wishPhotoPriceInspector(source).catch(() => null);
      return WishPhotoList.read(result, url, { inspectPrice: await inspector });
    }
    const products = await readList(first);
    const parse = ({ text, confidence }) => {
      if (Number.isFinite(confidence) && confidence < 45) return WishProduct.readPhotoText('', url);
      return WishProduct.readPhotoText(text, url, { keepUnconfirmedAmount: true });
    };
    const primary = parse(first || {});
    const suggestion = { ...primary };
    if (!isCurrent()) return suggestion;
    if (!products.length && primary.title && primary.store && primary.price != null && primary.currency && (first?.lines?.length || 0) < 5) return suggestion;

    const alternatives = [];
    async function tryRegion(image, full = false) {
      if (!isCurrent()) return;
      try {
        const result = await recognize(image, undefined, { tessedit_pageseg_mode: '11' }, { layout: full });
        if (full) {
          const products = await readList(result);
          if (products.length > 1) return products;
        }
        alternatives.push(parse(result));
      } catch {
        // Other OCR attempts can fail independently of the opened image.
      }
    }
    const sparseProducts = await tryRegion(source, true) || [];
    if (products.length || sparseProducts.length) {
      // The sparse pass often sees more rows in a wide table. Compare by
      // product name so contradictory values still require review.
      const [best, alternate] = sparseProducts.length >= products.length ? [sparseProducts, products] : [products, sparseProducts];
      return { products: best.map(item => {
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
      }) };
    }
    if (isCurrent() && (!primary.title || (primary.price == null && !primary.priceIssue)) &&
        !alternatives.some(result => result.title && result.price != null)) {
      try {
        const bitmap = await decodeWishPhoto(photo.file);
        try {
          const portrait = (bitmap.naturalHeight ?? bitmap.height) > (bitmap.naturalWidth ?? bitmap.width);
          // Use overlapping halves when text is too small or split among columns.
          const regions = portrait
            ? [{ x: 0, y: 0, w: 1, h: .62 }, { x: 0, y: .38, w: 1, h: .62 }]
            : [{ x: 0, y: 0, w: .62, h: 1 }, { x: .38, y: 0, w: .62, h: 1 }];
          for (const region of regions) {
            if (!isCurrent()) break;
            const canvas = drawWishPhoto(bitmap, 1800, region, 2, 12);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            canvas.width = canvas.height = 0;
            if (blob) await tryRegion(blob);
          }
        } finally {
          bitmap.close?.();
        }
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

  function photoProductKey(title) {
    return (title || '').trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('pt-BR');
  }
  root.WishPhotoReader = { prepareWishPhoto, recognizeWishPhoto, photoProductKey };
})(globalThis);
