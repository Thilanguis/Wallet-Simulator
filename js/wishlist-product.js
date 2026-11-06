/* Read-only product suggestions: no scripts from a merchant are executed. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.WishProduct = api;
})(globalThis, function () {
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
  return { store, read, imageUrl };
});
