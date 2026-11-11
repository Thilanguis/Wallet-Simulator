/* Read-only product suggestions: no scripts from a merchant are executed. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.WishProduct = api;
})(globalThis, function () {
  const photoLimit = 20 * 1024;
  function store(host, site = '') {
    const known = { pandora: 'Pandora', amazon: 'Amazon', shein: 'Shein', yesstyle: 'YesStyle', coach: 'Coach' };
    for (const [domain, name] of Object.entries(known)) if (host.split('.').includes(domain)) return name;
    if (site && !site.includes('.') && site.length < 80) return site.trim();
    const parts = host.replace(/^www\./, '').split('.');
    const name = parts.at(-2) === 'com' || parts.at(-2) === 'co' ? parts.at(-3) : parts.at(-2);
    return (name || host).replace(/^./, (c) => c.toUpperCase());
  }
  function imageUrl(value, base) {
    if (typeof value !== 'string' || !value.trim() || value.length > 4096) return null;
    try {
      const url = new URL(value, base);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch {}
    return null;
  }
  function savedImageUrl(value) {
    if (typeof value === 'string' && value.length <= photoLimit && /^data:image\/jpeg;base64,\/[A-Za-z0-9+/]+=*$/.test(value)) return value;
    return imageUrl(value);
  }
  function readPhotoText(text, productUrl = '', { skipDiscountLines = false } = {}) {
    const lines = String(text).split(/\r?\n/).map((line) => line.trim()
      // In screenshots, Tesseract sometimes reads the dollar sign as S.
      .replace(/^C\s*A\s*(?:S\s*\$?|\$)\s*(\d+[.,])\s*(\d{2})(?!\d)/i, (_, amount, cents) => 'CA$ ' + amount + cents)).filter(Boolean);
    const domain = lines.map((line) => line.match(/\b([\w.-]+\.(?:com\.br|co\.uk|com|net|ca))\b/i)?.[1]).find(Boolean);
    let host = domain || '';
    try { host = new URL(productUrl).hostname || host; } catch {}
    const brand = lines.join(' ').match(/\b(Pandora|Amazon|Shein|YesStyle|Coach|Shopee|AliExpress|Mercado Livre|Browns Shoes|MICHI|Sephora|Zara|Temu|Nike|Adidas)\b/i)?.[0] || '';
    const explicitStore = lines.map((line) => line.match(/^(?:loja|store|vendido por|sold by)\s*:\s*(.+)$/i)?.[1]).find(Boolean);
    const storeName = explicitStore || (host ? store(host.toLowerCase(), brand) : brand);
    const region = /^ca\.|\.ca$/i.test(host) || /\b(?:Canada|Canadá|Québec|Ontario)\b/i.test(text) ? 'CAD'
      : /^us\./i.test(host) || /\b(?:United States|USA)\b/i.test(text) ? 'USD'
      : /\.br$/i.test(host) ? 'BRL' : null;
    const money = /(?:(CAD|USD|BRL|EUR|GBP|AUD|CA\$|C\$|US\$|R\$|A\$|€|£|\$)\s*\$?\s*([\d.,]+)|([\d.,]+)\s*(CAD|USD|BRL|EUR|GBP|AUD|€|£))/gi;
    const codes = { 'CA$': 'CAD', 'C$': 'CAD', 'US$': 'USD', 'R$': 'BRL', 'A$': 'AUD', '€': 'EUR', '£': 'GBP', '$': region };
    const candidates = [];
    for (const [index, line] of lines.entries()) {
      if (/\b(?:frete|shipping|delivery|parcelas?|instalments?|installments?|save|economize|regular|original|was|points?|pontos?|cashback|rewards?)\b/i.test(line) || /^de\s*:/i.test(line)) continue;
      const priority = /\d+\s*%\s*(?:off|de desconto)\b/i.test(line) ? 0 : /\b(?:agora|now|preço|price|sale|por)\b/i.test(line) ? 2 : 1;
      if (skipDiscountLines && priority === 0) continue;
      for (const match of line.matchAll(money)) {
        const code = (match[1] || match[4]).toUpperCase();
        const currency = Object.hasOwn(codes, code) ? codes[code] : code;
        const digits = (match[2] || match[3]).replace(/[.,]+$/, '');
        const decimal = digits.match(/[.,]\d{2}$/);
        const normalized = decimal ? digits.slice(0, -3).replace(/[.,]/g, '') + '.' + digits.slice(-2) : digits.replace(/[.,]/g, '');
        if (!/^(?:\d+(?:\.\d{2})?|\.\d{2})$/.test(normalized)) continue;
        const price = Number(normalized);
        if (currency && Number.isFinite(price)) candidates.push({ price, currency, index, priority });
      }
    }
    const highest = candidates.reduce((priority, item) => Math.max(priority, item.priority), -1);
    const top = candidates.filter((item) => item.priority === highest);
    const first = top[0];
    const best = first && top.every((item) => item.price === first.price && item.currency === first.currency) ? first : null;
    const titleLine = (line) => /[\p{L}]{3}/u.test(line) && ![storeName, brand].some((name) => name && name.toLowerCase() === line.toLowerCase())
      && (line.split(/\s+/).length < 4 || (line.match(/\p{L}{3,}/gu) || []).length >= 2)
      && !/^(?:loja|store|vendido por|sold by)\s*:/i.test(line)
      && !/^(?:sterling si\s*l?\s*ver|prata(?: esterlina| 925)?|stainless steel|aço inoxidável|(?:\d+\s*k\s+)?(?:yellow |rose |white )?gold|gold plated|platinum plated)$/i.test(line)
      && !/(?:https?:\/\/|\bwww\.|\b(?:CAD|USD|BRL|EUR|GBP|AUD)\b|[$€£]|\b(?:shipping|delivery|frete|subtotal|checkout|carrinho|add to|shop now|adicionar|sale price|view product details|style your own|sold|reviews?|pick up|select a store|get it delivered|business hours|points?|pontos?|cashback)\b)/i.test(line)
      && !/^(?:\W*(?:black friday|best seller|gallery)\W*|(?:home|shop|bag|saved|account|menu|search|busca)(?:\s+(?:home|shop|bag|saved|account|menu|search|busca))*|novo|new|sale|oferta|ofertas|preço|price|produto|product|cadastro|login|sign in)$/i.test(line)
      && !/^\W*(?:black friday|deal is|\d+\s*(?:ml|g|oz)\s+in.stock)\b/i.test(line);
    const beforePrice = lines.slice(0, first?.index ?? lines.length);
    const lastTitle = beforePrice.findLastIndex(titleLine);
    let start = lastTitle;
    for (let i = lastTitle; i >= Math.max(0, lastTitle - 3) && titleLine(beforePrice[i]); i--) {
      if (/^[\p{L}\d][\p{L}\d &.'-]{1,40}\s+-\s+\p{L}/u.test(beforePrice[i])) {
        start = i;
        break;
      }
    }
    const productHeading = /^[\p{L}\d][\p{L}\d &.'-]{1,40}\s+-\s+\p{L}/u;
    const headingIndex = beforePrice.findLastIndex((line) => titleLine(line) && productHeading.test(line));
    let titleLines = lastTitle >= 0 ? beforePrice.slice(start, lastTitle + 1) : [];
    if (headingIndex >= 0) {
      const name = beforePrice[headingIndex].split(/\s+-\s+/)[0].toLowerCase();
      titleLines = [beforePrice[headingIndex]];
      for (const line of beforePrice.slice(headingIndex + 1)) {
        if (!titleLine(line) || line.toLowerCase() === name || /^(?:[*★☆]|(?:[Aa]\s+)?[AaKk]{3,}\s+\d)/.test(line)) break;
        titleLines.push(line);
      }
    }
    const title = titleLines.join(' ').slice(0, 300);
    return { title, store: storeName.slice(0, 150), price: best?.price ?? null, currency: best?.currency ?? null };
  }
  function mobileStoreBadge({ data, width, height }) {
    const limit = Math.floor(height * 0.33);
    const minYellow = Math.ceil(width * 0.028);
    const minHeight = Math.ceil(height * 0.005);
    let first = -1, left = width, right = 0;
    for (let y = Math.floor(height * 0.10); y <= limit; y++) {
      let yellow = 0, rowLeft = width, rowRight = 0;
      for (let x = Math.floor(width * 0.80); y < limit && x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] > 205 && data[i + 1] > 165 && data[i + 2] < 135) {
          yellow++;
          rowLeft = Math.min(rowLeft, x);
          rowRight = x + 1;
        }
      }
      if (yellow >= minYellow) {
        if (first < 0) first = y;
        left = Math.min(left, rowLeft);
        right = Math.max(right, rowRight);
        continue;
      }
      if (first >= 0 && y - first >= minHeight && y - first <= height * 0.025) {
        left = Math.max(0, left - 1);
        right = Math.min(width, right + 1);
        return { x: left / width, y: (first - 1) / height, w: (right - left) / width, h: (y - first + 2) / height };
      }
      first = -1;
      left = width;
      right = 0;
    }
    return null;
  }
  function mobileSaleRegions(data, width, height) {
    if (height < width * 1.5) return null;
    const pixel = (x, y) => (y * width + x) * 4;
    const red = (i) => data[i] > 175 && data[i] - data[i + 1] > 95 && data[i] - data[i + 2] > 95;
    let start = -1;
    for (let y = Math.floor(height * 0.33); y < height * 0.67; y++) {
      if (red(pixel(2, y)) && red(pixel(width - 3, y))) {
        if (start < 0) start = y;
        continue;
      }
      if (start < 0) continue;
      const band = y - start;
      const whiteBelow = [0.2, 0.5, 0.8].every((x) => {
        const i = pixel(Math.floor(width * x), y + 2);
        return Math.min(data[i], data[i + 1], data[i + 2]) > 235;
      });
      if (band >= height * 0.025 && band <= height * 0.10 && whiteBelow) {
        return { photo: { x: 0, y: 0.035, w: 1, h: start / height - 0.088 }, text: { x: 0, y: (y + 1) / height, w: 0.89, h: 0.28 } };
      }
      start = -1;
    }
    return null;
  }
  function screenshotRegions({ data, width, height }) {
    if (width < height * 1.25) return mobileSaleRegions(data, width, height);
    const offset = (x, y) => (y * width + x) * 4;
    const upper = Math.floor(height * 0.8);
    // Product pages often have a white gutter between the gallery and details.
    let gapStart = -1;
    const gaps = [];
    for (let x = Math.floor(width * 0.22); x <= Math.floor(width * 0.62); x++) {
      let white = 0;
      for (let y = 0; y < upper; y++) {
        const i = offset(x, y);
        if (Math.min(data[i], data[i + 1], data[i + 2]) >= 248) white++;
      }
      if (white >= upper * 0.95) {
        if (gapStart < 0) gapStart = x;
      } else if (gapStart >= 0) {
        if (x - gapStart >= width * 0.05 && gapStart <= width * 0.48) gaps.push([gapStart, x]);
        gapStart = -1;
      }
    }
    if (!gaps.length) return null;
    const [left, right] = gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
    // Ignore gallery bands that touch an edge, such as the next image below the product.
    const marks = new Uint8Array(left * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < left; x++) {
      const i = offset(x, y);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      marks[y * left + x] = Number(min < 158 || max - min > 28);
    }
    const components = [];
    for (let i = 0; i < marks.length; i++) {
      if (!marks[i]) continue;
      marks[i] = 0;
      const queue = [i];
      let x0 = left, y0 = height, x1 = 0, y1 = 0;
      for (let head = 0; head < queue.length; head++) {
        const cell = queue[head], x = cell % left, y = Math.floor(cell / left);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y);
        x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || nx >= left || ny < 0 || ny >= height) continue;
          const next = ny * left + nx;
          if (marks[next]) { marks[next] = 0; queue.push(next); }
        }
      }
      if (x0 <= 0 || x1 >= left - 1 || y0 <= 0 || y1 >= height - 1 || queue.length < 4) continue;
      components.push({ x0, y0, x1, y1, size: queue.length });
    }
    const best = components.sort((a, b) => b.size - a.size)[0];
    if (!best || best.size < left * height * 0.01) return null;
    const span = Math.max(best.x1 - best.x0, best.y1 - best.y0);
    const nearby = Math.ceil(span * 0.25);
    const object = { ...best };
    for (const part of components) {
      if (part.x1 < best.x0 - nearby || part.x0 > best.x1 + nearby || part.y1 < best.y0 - nearby || part.y0 > best.y1 + nearby) continue;
      object.x0 = Math.min(object.x0, part.x0); object.y0 = Math.min(object.y0, part.y0);
      object.x1 = Math.max(object.x1, part.x1); object.y1 = Math.max(object.y1, part.y1);
    }
    const pad = Math.ceil(span * 0.16);
    const x = Math.max(0, object.x0 - pad), y = Math.max(0, object.y0 - pad);
    const bounds = { x: x / width, y: y / height, w: (Math.min(left, object.x1 + pad + 1) - x) / width, h: (Math.min(height, object.y1 + pad + 1) - y) / height };
    const textX = Math.max(0, (right - 2) / width);
    return { photo: bounds, text: { x: textX, y: 0, w: 1 - textX, h: 0.55 } };
  }
  function read(doc, host, pageUrl) {
    const meta = (selector) => doc.querySelector(selector)?.content;
    let product;
    function visit(value) {
      if (!value || typeof value !== 'object' || product) return;
      if ([value['@type']].flat().includes('Product')) {
        product = value;
        return;
      }
      for (const child of Object.values(value))
        if (typeof child === 'object')
          if (Array.isArray(child)) child.forEach(visit);
          else visit(child);
    }
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]'))
      try {
        visit(JSON.parse(script.textContent));
      } catch {}
    const offers = [product?.offers].flat().filter(Boolean),
      offer = offers.find((x) => x.price != null) || offers[0] || {};
    const raw = offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price ?? meta('meta[property="product:price:amount"],meta[property="og:price:amount"],meta[itemprop="price"]');
    const currency = String(offer.priceCurrency || offer.priceSpecification?.priceCurrency || meta('meta[property="product:price:currency"],meta[property="og:price:currency"],meta[itemprop="priceCurrency"]') || '').toUpperCase();
    const price = raw == null ? null : Number(String(raw).replace(/\s/g, ''));
    const images = [product?.image].flat().flatMap((item) => (typeof item === 'string' ? [item] : [item?.contentUrl, item?.url]));
    images.push(...Array.from(doc.querySelectorAll('meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="twitter:image"],meta[property="twitter:image"]'), (tag) => tag.content));
    return {
      title: String(product?.name || meta('meta[property="og:title"]') || doc.title || '').slice(0, 300),
      store: store(host, meta('meta[property="og:site_name"]')),
      price: Number.isFinite(price) && price >= 0 ? price : null,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
      imageUrl: images.map((value) => imageUrl(value, pageUrl)).find(Boolean) || null,
    };
  }
  return { store, read, imageUrl, savedImageUrl, readPhotoText, screenshotRegions, mobileStoreBadge, photoLimit };
});
