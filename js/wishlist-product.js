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
  const currencyCodes = 'CAD|BRL|USD|EUR|GBP|AUD|JPY|CNY|CHF|NZD|HKD|SGD|MXN';
  const currencies = { 'CA$': 'CAD', 'C$': 'CAD', 'R$': 'BRL', 'US$': 'USD', 'A$': 'AUD', 'AU$': 'AUD', 'NZ$': 'NZD', 'HK$': 'HKD', 'S$': 'SGD', 'MX$': 'MXN', 'JP¥': 'JPY', 'CN¥': 'CNY', '€': 'EUR', '£': 'GBP' };
  const currencyPrefix = '(?<![\\p{L}])(?:' + currencyCodes + ')(?![\\p{L}])|(?:CA|US|AU|NZ|HK|MX|[CRAS])?\\$|(?:JP|CN)?¥|[€£]';
  const currencySuffix = '(?:' + currencyCodes + ')(?![\\p{L}])|[€£¥]';
  const digits = "(?:\\d{1,3}(?:[., '’]\\d{3})+|\\d+)(?:[.,] *\\d{1,2})?";
  const money = () => new RegExp('(' + currencyPrefix + ')\\s*\\$?\\s*(' + digits + ')(?![\\d.,])|(?<![\\d.,])(' + digits + ')\\s*(' + currencySuffix + ')', 'giu');
  const oldLabel = /\b(?:was|original(?: price)?|regular(?: price)?|list price|before|formerly|rrp|msrp|previous price|prix (?:initial|régulier|normal|conseillé)|au lieu de|preço (?:anterior|original|normal|de tabela)|antes|de)\s*[:–—=-]?\s*$/iu;
  const feeLabel = /\b(?:frete|shipping|delivery|livraison|expédition|entrega|parcelas?|instal+l?ments?|[0-9]+\s*x(?:\s+de)?|subtotal|impostos?|tax(?:es)?|taxas?|économisez|économie|rabais|duty|duties|save|economize|desconto|discount|cashback|a partir de|starting at|from|up to|rewards?)\b/iu;
  const currentLabel = /\b(?:sale price|current price|your price|offer price|prix (?:actuel|promotionnel)|maintenant|now|agora|por|à vista|preço (?:atual|promocional)|valor atual|price|preço)\s*[:–—=-]?\s*$/iu;
  const heading = /^(?:nome do produto|produto|product(?: name)?|item)\s*:\s*(.+)$/iu;
  const storeLabel = /^(?:(?:loja|store|seller|vendedor|boutique)\s*:\s*|(?:vendido por|sold by|vendu par)(?:\s*:\s*|\s+))(.+)$/iu;
  const knownStoreHeading = /^(?:Pandora|Amazon|Shein|YesStyle|Coach|Shopee|AliExpress|Mercado Livre|Browns Shoes|MICHI|Sephora|Zara|Temu|Nike|Adidas)$/iu;
  const domainPattern = /(?:https?:\/\/|www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com(?:\.br|\.au)?|co\.(?:uk|jp|nz)|net|org|shop|store|ca|br|uk|de|fr|us|au|jp|cn|ch|io)\b/iu;

  function numberFromPhoto(raw) {
    const compact = raw.replace(/\s+/g, '').replace(/['’]/g, '');
    const decimal = compact.match(/[.,](\d{1,2})$/);
    const whole = decimal ? compact.slice(0, decimal.index) : compact;
    if (!/^\d+$|^\d{1,3}(?:[.,]\d{3})+$/u.test(whole)) return null;
    const value = Number(whole.replace(/[.,]/g, '') + (decimal ? '.' + decimal[1] : ''));
    return Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)) ? value : null;
  }

  function photoPriceCandidates(lines, host, isStruck) {
    const region = /(?:^ca\.|\.ca$)/i.test(host) ? 'CAD' : /^us\.|\.us$/i.test(host) ? 'USD'
      : /\.au$/i.test(host) ? 'AUD' : /\.nz$/i.test(host) ? 'NZD'
      : /^jp\.|\.jp$/i.test(host) ? 'JPY' : /\.cn$/i.test(host) ? 'CNY' : null;
    const explicitCurrencies = new Set();
    for (const line of lines) {
      // A selected currency or an explicit currency on an amount can disambiguate a bare symbol.
      const selected = line.match(new RegExp('^(?:currency|moeda)\\s*:\\s*(' + currencyCodes + ')\\b', 'iu'));
      if (selected) explicitCurrencies.add(selected[1].toUpperCase());
      for (const match of line.matchAll(money())) {
        const symbol = (match[1] || match[4]).toUpperCase();
        const code = currencies[symbol] || (/^[A-Z]{3}$/.test(symbol) ? symbol : null);
        if (code && (symbol.endsWith('$') || symbol.endsWith('¥') || /^[A-Z]{3}$/.test(symbol))) explicitCurrencies.add(code);
      }
    }
    const sharedCurrency = explicitCurrencies.size === 1 ? [...explicitCurrencies][0] : null;
    const resolveCurrency = (symbol) => {
      if (symbol === '$') return ['CAD','USD','AUD','NZD','HKD','SGD','MXN'].includes(sharedCurrency) ? sharedCurrency : region;
      if (symbol === '¥') return ['JPY','CNY'].includes(sharedCurrency) ? sharedCurrency : ['JPY','CNY'].includes(region) ? region : null;
      return currencies[symbol] || symbol;
    };
    const candidates = [];
    for (const [index, line] of lines.entries()) {
      let matches = [...line.matchAll(money())];
      const currencyless = !matches.length && line.match(new RegExp('^(.*?)(' + digits + ')\\s*$', 'iu'));
      if (currencyless) {
        const prefix = currencyless[1].trim();
        const standaloneCode = new RegExp('^(?:' + currencyCodes + ')$', 'iu');
        const adjacentCode = !prefix && [lines[index - 1], lines[index + 1]].find(value => value && standaloneCode.test(value));
        if (currentLabel.test(prefix) || (!prefix && (adjacentCode || currentLabel.test(lines[index - 1] || '')))) {
          matches = [{ 0: currencyless[2], 1: adjacentCode || '', 2: currencyless[2], index: currencyless[1].length }];
        }
      }
      for (const [position, match] of matches.entries()) {
        const prefix = line.slice(position ? matches[position - 1].index + matches[position - 1][0].length : 0, match.index).trim();
        const suffix = line.slice(match.index + match[0].length, matches[position + 1]?.index ?? line.length).trim();
        const lastLine = lines[index - 1] || '';
        const label = prefix || (/[:：]$/.test(lastLine) || /^(?:now|agora|price|preço|frete|shipping|regular price|original price|sale price)$/iu.test(lastLine) ? lastLine : '');
        const current = currentLabel.test(label);
        const previousPriceLabel = suffix.match(/^\(([^)]+)\)/)?.[1];
        const excluded = isStruck?.(index, match.index, match.index + match[0].length) || oldLabel.test(label) || (previousPriceLabel && oldLabel.test(previousPriceLabel)) || (!current && feeLabel.test(label)) ||
          /^(?:(?:\/|per|por)\s*(?:m[eê]s|month|week|semana|parcela)|(?:em|in)\s+\d+\s*(?:x|parcelas?|instal+l?ments?)|(?:de\s+)?(?:frete|shipping|tax(?:es)?|impostos?)\b)/iu.test(suffix) ||
          /^\d+[.,]?\d*\s*%\s*(?:off|de desconto)\b/iu.test(suffix) && !current;
        const range = /^(?:-|–|—|a|to|até)\s*\d/iu.test(suffix);
        const price = numberFromPhoto(match[2] || match[3]);
        const symbol = (match[1] || match[4] || '').toUpperCase();
        if (price != null) candidates.push({ price, currency: symbol ? resolveCurrency(symbol) : sharedCurrency, index, excluded, range, priority: current ? 2 : 1 });
      }
    }
    return candidates;
  }

  function normalizePhotoLine(line) {
    return String(line || '').normalize('NFKC').trim()
      .replace(/\bC\s*A\s*(?:S\s*\$?|\$)\s*(\d+[.,])\s*(\d{2})(?!\d)/gi, (_, amount, cents) => 'CA$ ' + amount + cents)
      .replace(/\bU\s*S\s*S?\s*\$\s*(?=\d)/gi, 'US$ ');
  }
  function readPhotoText(text, productUrl = '', { keepUnconfirmedAmount = false, isStruck } = {}) {
    const lines = String(text || '').split(/\r?\n/).map(normalizePhotoLine).filter(Boolean);
    let host = '', domainIndex = -1;
    try { host = new URL(productUrl).hostname; } catch {}
    if (!host) {
      for (const [index, line] of lines.entries()) {
        const domain = line.match(domainPattern)?.[0];
        if (!domain) continue;
        try { host = new URL(/^https?:/i.test(domain) ? domain : 'https://' + domain).hostname; domainIndex = index; break; } catch {}
      }
    }
    const labeledStore = lines.map(line => line.match(storeLabel)?.[1]).find(Boolean);
    const brand = lines.find(line => knownStoreHeading.test(line));
    const storeName = (labeledStore || (host && store(host.toLowerCase())) || brand || '').slice(0, 150);
    const candidates = photoPriceCandidates(lines, host, isStruck);
    const eligible = candidates.filter(item => !item.excluded);
    const highest = Math.max(0, ...eligible.map(item => item.priority));
    const top = eligible.filter(item => item.priority === highest);
    const first = top[0];
    const oneAmount = first && top.every(item => !item.range && item.price === first.price);
    const oneCurrency = oneAmount && top.every(item => item.currency === first.currency);
    const best = oneCurrency && first.currency ? first : null;
    const confirmedAmount = keepUnconfirmedAmount && oneAmount ? first.price : null;
    const titleLine = (line, index) => index !== domainIndex && !line.match(domainPattern) && !storeLabel.test(line) &&
      ![storeName, brand].some(name => name && name.toLowerCase() === line.toLowerCase()) &&
      /\p{L}{3}/u.test(line) && ![...line.matchAll(money())].length &&
      !/^(?:[★☆*]|\d+[\d.,]*\s*(?:reviews?|sold|vendidos?)|(?:black friday|best seller|promoção|ofertas?|descontos?|new|sale|gallery|menu|search|home|shop|bag|saved|account|login|sign in|newsletter|product details|detalhes do produto|explore|discover|browse|view all|confira|descubra|cart|categoria|início|por|price|preço|payment|pagamento|reviews?|avaliações|select|choose|escolha|add to|adicionar|comprar|promo code|sku|color|cor|size|tamanho|estoque|in stock|frete|shipping|delivery|entrega|taxas?|tax(?:es)?|installments?|parcelas?|currency|moeda|sterling silver|prata(?: esterlina| 925)?|stainless steel|gold plated|platinum plated|retirar|pickup|buy now|checkout|subtotal|total|description|descrição)(?:\b|:))/iu.test(line) &&
      !/\b(?:points?|pontos?|cashback|free delivery|free shipping|sem juros|por mês|em até|off)\b/iu.test(line) &&
      !/^[\d.,]+\s*(?:ml|g|oz|mm|cm|kg)\b/iu.test(line);
    const explicitTitle = lines.map(line => line.match(heading)?.[1]).find(Boolean);
    const reference = (best || first || candidates[0])?.index;
    const names = lines.map((line, index) => ({ line, index })).filter(({line,index}) => titleLine(line,index));
    const productHeading = /^[\p{L}\d][\p{L}\d &.'-]{1,40}\s+-\s+\p{L}/u;
    const scored = names.map(item => ({
      ...item,
      score: (productHeading.test(item.line) ? 8 : 0) + (item.line.split(/\s+/).length >= 2 ? 3 : 0) +
        (reference == null ? 0 : item.index < reference ? Math.max(0, 4 - (reference - item.index) / 2) : item.index === reference + 1 ? 2 : 0),
    })).sort((a, b) => b.score - a.score);
    const chosen = scored[0];
    let title = explicitTitle || (chosen && chosen.score >= 3 ? chosen.line : '');
    if (!explicitTitle && chosen && title && productHeading.test(title) && reference != null && chosen.index < reference) {
      const next = lines[chosen.index + 1];
      if (next && chosen.index + 1 < reference && titleLine(next, chosen.index + 1) && !productHeading.test(next) && next.split(/\s+/).length >= 2) title += ' ' + next;
    }
    return { title: title.slice(0, 300), store: storeName, price: best?.price ?? confirmedAmount, currency: best?.currency ?? null,
      priceIssue: !best && top.length ? (oneAmount && top.some(item => !item.currency) ? 'currency' : 'ambiguous') : null,
      excludedPrices: candidates.filter(item => item.excluded).map(({price, currency}) => ({price, currency})) };
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
  async function readLink(url, signal) {
    const response = await fetch(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw Error('Página indisponível.');
    const text = await response.text();
    if (text.length > 2000000) throw Error('Página muito grande.');
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return read(doc, url.hostname, response.url || url.href);
  }
  return { store, read, readLink, imageUrl, savedImageUrl, readPhotoText, normalizePhotoLine, photoLimit };
});
