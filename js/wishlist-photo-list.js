/* Infer independent product rows from text and optional local OCR coordinates. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./wishlist-product.js') : root.WishProduct);
  if (typeof module === 'object') module.exports = api;
  else root.WishPhotoList = api;
})(globalThis, function (product) {
  const codes = 'CAD|BRL|USD|EUR|GBP|AUD|JPY|CNY|CHF|NZD|HKD|SGD|MXN';
  const amount = "(?:\\d{1,3}(?:[., '’]\\d{3})+|\\d+)(?:[.,]\\s*\\d{1,2})?";
  // These matches locate the pieces of a row. WishProduct determines the price and currency.
  const money = () => new RegExp('(?:(?:' + codes + ')\\s*\\$?|(?:CA|US|AU|NZ|HK|MX|[CRAS])?\\$|(?:JP|CN)?¥|[€£])\\s*' + amount + '|' + amount + '\\s*(?:' + codes + '|[€£¥])(?![\\p{L}])', 'giu');
  const merchant = /^(?:(?:loja|store|seller|vendedor|boutique)\s*:\s*|(?:vendido por|sold by|vendu par)(?:\s*:\s*|\s+))(.+)$/iu;
  const itemMerchant = /^(?:vendido por|sold by|vendu par)\b/iu;
  const host = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com(?:\.br|\.au)?|co\.(?:uk|jp|nz)|net|org|shop|store|ca|br|uk|de|fr|us|au|jp|cn|ch|io)(?:\/\S*)?$/iu;
  const priceLabel = /\b(?:regular price|original price|previous price|sale price|your price|current price|offer price|prix(?: actuel| promotionnel| initial| régulier| normal| conseillé)?|au lieu de|maintenant|preço(?: antigo| anterior| original| atual| promocional)?|valor(?: unitário| atual)?|price|agora|now|antes|was|por|de|à vista)\s*[:–—-]?\s*$/iu;
  const pricedSummary = /^(?:grand total|order total|estimated total|total(?:\s+(?:do pedido|geral|estimado|a pagar|dos produtos))?|sub[- ]?total|frete|shipping|delivery|entrega|imposto(?:s)?|tax(?:es)?|desconto|discount|you save|economia|parcela(?:s)?|instal+l?ment(?:s)?)\b/iu;
  const chrome = /^(?:meus produtos|minha lista|lista de (?:compra(?:s)?|desejos)|my (?:products|wishlist)|shopping list|product details|detalhes do produto|products|search|buscar|pesquisar|categorie(?:s)?|categor(?:ia|ias|y)(?: de produtos?)?|sort by|filtrar|ordenar|quantidade|quantity|qty|color|cor|size|tamanho|varia(?:ção|ções)|sku|insert description|inserir descrição|descrição|description|shop now|add to|adicionar ao|remove|remover|editar|buy now|comprar|carrinho|cart|checkout|select|escolha|reviews?|avaliações|in stock|em estoque|disponível|disponibilidade|new|sale|oferta|subtotal)\b/iu;
  const itemDetails = /^(?:(?:size|tamanho|dimensions?|net weight|sku|product (?:code|id))\b|(?:peso|variant|varia(?:ção|ções)|shade|tom|volume|reference|ref(?:erência)?|model(?:o)?|código)\s*:|(?:item|artigo)\s*(?:(?:#|n[º°.]|:)\s*)?\d{4,}\b)/iu;
  const explicitTitle = /^(?:nome do produto|produto|product(?: name)?|item)\s*:\s*\S|^(?:produto|product|item)\s+\d+\s*$/iu;
  const separatorNoise = /^[\s:|;·•–—-]+|[\s:|;·•–—-]+$/gu;
  const currencySetting = /^(?:currency|moeda)\s*:\s*[A-Z]{3}$/iu;
  const markedAmount = new RegExp('(?:^|\\s)((?:preço(?: atual| promocional)?|valor atual|current price|sale price|your price|offer price|price|prix (?:actuel|promotionnel)|maintenant|agora|now|por|à vista)\\s*[:–—=-]?\\s*' + amount + ')$', 'iu');

  function cleanTitle(text) {
    const name = text.replace(separatorNoise, '').trim();
    if (!name || /^(?:produto|product|item)$/iu.test(name) || name.length > 300 || !/\p{L}{3}/u.test(name) || merchant.test(name) || host.test(name) || pricedSummary.test(name) || itemDetails.test(name)) return '';
    if (explicitTitle.test(name)) return name.replace(/^(?:nome do produto|produto|product(?: name)?|item)\s*:\s*/iu, '');
    if (chrome.test(name) || priceLabel.test(name) && name.split(/\s+/).length < 3 ||
        /^(?:CAD|BRL|USD|EUR|GBP|AUD|JPY|CNY|CHF|NZD|HKD|SGD|MXN)$/.test(name) ||
        /\b(?:off|por mês|sem juros|pontos|points)\b/iu.test(name)) return '';
    return name;
  }

  function observation(line) {
    const text = product.normalizePhotoLine(line.text);
    const amountSpans = [...text.matchAll(money())];
    const first = amountSpans[0], last = amountSpans.at(-1);
    const marked = !first && text.match(markedAmount);
    let title = '';
    if (first && !pricedSummary.test(text)) {
      const prefix = text.slice(0, first.index).replace(priceLabel, '').trim();
      const suffix = text.slice(last.index + last[0].length).trim();
      const choices = [cleanTitle(prefix), /^[\d%(]/u.test(suffix) ? '' : cleanTitle(suffix)].filter(Boolean);
      if (choices.length === 1) title = choices[0];
    } else if (marked) {
      title = cleanTitle(text.slice(0, marked.index));
    } else if (!first) {
      title = cleanTitle(text);
    }
    const box = line.bbox;
    return {
      text: marked ? marked[1] : text, title, explicit: explicitTitle.test(text),
      hasMoney: Boolean(first || marked), box, words: line.words,
    };
  }

  function trimEdgeNoise(line) {
    if (!Array.isArray(line.words) || line.words.length < 2) return line;
    const words = line.words.filter(({text, bbox}) =>
      text?.trim() && bbox && [bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite));
    let start = 0, end = words.length;
    const noise = ({text, confidence}) => confidence < 20 && /^[^\d$€¥£]{1,2}$/u.test(text);
    while (start < end - 1 && noise(words[start])) start++;
    while (end > start + 1 && noise(words[end - 1])) end--;
    if (start === 0 && end === words.length) return line;
    const retained = words.slice(start, end);
    const coordinates = retained.map(({bbox}) => bbox);
    return {
      text: retained.map(({text}) => text).join(' '),
      words: retained,
      confidence: retained.reduce((sum,{confidence}) => sum + (confidence ?? line.confidence ?? 100), 0) / retained.length,
      bbox: {
        x0: Math.min(...coordinates.map(({x0}) => x0)),
        x1: Math.max(...coordinates.map(({x1}) => x1)),
        y0: Math.min(...coordinates.map(({y0}) => y0)),
        y1: Math.max(...coordinates.map(({y1}) => y1)),
      },
    };
  }

  function readingBands(result) {
    const lines = (Array.isArray(result.lines) ? result.lines.map(trimEdgeNoise) : []).filter(({ text, bbox, confidence }) =>
      text?.trim() && bbox && [bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite) &&
      bbox.x1 > bbox.x0 && bbox.y1 > bbox.y0 && (!Number.isFinite(confidence) || confidence >= 35));
    if (!lines.length) return String(result.text || '').split(/\r?\n/).map(text => ({ parts: [observation({ text })] }));
    const sorted = lines.map(observation).sort((a,b) => a.box.y0 + a.box.y1 - b.box.y0 - b.box.y1 || a.box.x0 - b.box.x0);
    const bands = [];
    for (const part of sorted) {
      const center = (part.box.y0 + part.box.y1) / 2;
      // Smaller font sizes must still overlap the product heading's visual line.
      const band = bands.at(-1);
      const height = part.box.y1 - part.box.y0;
      if (band && Math.abs(center - band.center) <= .55 * Math.max(height, band.height)) {
        band.parts.push(part);
      } else {
        bands.push({ center, height, parts: [part] });
      }
    }
    for (const band of bands) band.parts.sort((a,b) => a.box.x0 - b.box.x0);
    return bands;
  }

  function unpack(band) {
    const parts = band.parts.filter(part => part.text);
    const context = parts.filter(({text}) => merchant.test(text) || host.test(text) || currencySetting.test(text));
    const rows = parts.filter(part => !context.includes(part));
    const titles = rows.filter(part => part.title);
    const amounts = rows.filter(part => part.hasMoney);
    return {
      ...band, context, titles, amounts,
      summary: rows.some(({text}) => pricedSummary.test(text)),
    };
  }

  function aligned(title, price) {
    if (!title.box || !price.box) return false;
    const t = title.box, p = price.box;
    const tolerance = Math.max(t.y1 - t.y0, p.y1 - p.y0) * 1.25;
    return p.x0 <= t.x1 + tolerance && p.x1 >= t.x0 - tolerance;
  }

  function stackedHeading(bands, index, amounts, allowForeignPrices = false) {
    const anchor = amounts[0];
    const heading = [];
    let below = bands[index];
    let seller = '';
    for (let i = index - 1; i >= 0; i--) {
      const band = bands[i];
      if (!Number.isFinite(band.center) || band.summary ||
          below.center - band.center > 2.5 * Math.max(band.height, below.height)) break;
      const near = part => {
        const reference = heading[0]?.box || anchor.box;
        const tolerance = 1.2 * Math.max(part.box.y1 - part.box.y0, reference.y1 - reference.y0);
        return Math.abs(part.box.x0 - reference.x0) <= tolerance;
      };
      if (band.amounts.some(part => !allowForeignPrices || near(part))) break;
      if (band.context.length) {
        const itemSeller = band.context.length === 1 && band.context[0];
        if (heading.length || !itemSeller || !itemMerchant.test(itemSeller.text) || !near(itemSeller)) break;
        seller = itemSeller.text;
        below = band;
        continue;
      }
      // Text printed on the product photo may be recognized in a different column.
      if (band.parts.every(part => !near(part))) continue;
      const text = band.titles.filter(near);
      if (text.length !== 1) {
        if (!heading.length && !text.length && band.parts.some(part => itemDetails.test(part.text) && near(part))) {
          below = band;
          continue;
        }
        break;
      }
      heading.unshift(text[0]);
      below = band;
      if (text[0].explicit) break;
    }
    if (!heading.length) return null;
    const title = heading.map(part => part.title).join(' ');
    if (title.length > 300) return null;
    return { title: { ...heading[0], title }, parts: heading, seller };
  }

  function stackedColumns(bands, index) {
    const band = bands[index];
    const amounts = band.amounts;
    const gaps = [];
    for (let i = 1; i < amounts.length; i++) {
      if (amounts[i].box.x0 - amounts[i - 1].box.x1 > 3 * band.height) gaps.push(i);
    }
    if (gaps.length !== 1) return [];

    const groups = [amounts.slice(0, gaps[0]), amounts.slice(gaps[0])];
    const [left, right] = groups.map(group => stackedHeading(bands, index, group));
    if (!left || !right) return [];

    // A card can place an old and current price far apart. Both sides must
    // also have separate headings in their own columns before splitting.
    const leftEdge = Math.max(...[...left.parts, ...groups[0]].map(part => part.box.x1));
    const rightEdge = Math.min(...[...right.parts, ...groups[1]].map(part => part.box.x0));
    if (leftEdge >= rightEdge) return [];
    return [{ ...left, amounts: groups[0] }, { ...right, amounts: groups[1] }];
  }

  function staggeredColumns(bands) {
    const prices = bands.flatMap((band, index) => band.summary ? []
      : band.amounts.map(part => ({ part, index })));
    if (prices.length < 4 || prices.some(({ part }) => !part.box || part.title)) return null;

    prices.sort((a, b) => a.part.box.x0 - b.part.box.x0);
    const height = Math.max(...prices.map(({ part }) => part.box.y1 - part.box.y0));
    const gap = prices.findIndex(({ part }, i) => i > 0 && part.box.x0 - prices[i - 1].part.box.x0 > 4 * height);
    if (gap < 2 || prices.length - gap < 2) return null;

    // Uneven title lengths can offset the price lines. Two repeated price
    // columns with their own product headings provide stronger evidence than
    // an unrelated heading from the other column on the same visual band.
    const lanes = [prices.slice(0, gap), prices.slice(gap)];
    const rightStart = lanes[1][0].part.box.x0;
    const drafts = new Map();
    const usedHeadings = new Set();
    for (const [side, lane] of lanes.entries()) {
      if (new Set(lane.map(({ index }) => index)).size !== lane.length ||
          lane.at(-1).part.box.x0 - lane[0].part.box.x0 > height) return null;
      for (const { index, part } of lane) {
        const heading = stackedHeading(bands, index, [part], true);
        if (!heading || heading.parts.some(title => usedHeadings.has(title) ||
            (side === 0 ? title.box.x1 >= rightStart : title.box.x0 < rightStart - height))) return null;
        for (const title of heading.parts) usedHeadings.add(title);
        const rows = drafts.get(index) || [];
        rows.push({ ...heading, amounts: [part] });
        drafts.set(index, rows);
      }
    }
    return { drafts, usedHeadings };
  }

  function priceBox(part, start, end) {
    let cursor = 0;
    const found = [];
    for (const word of part.words || []) {
      const value = product.normalizePhotoLine(word.text);
      if (!value || !word.bbox) continue;
      const index = part.text.indexOf(value, cursor);
      if (index < 0) continue;
      cursor = index + value.length;
      if (index < end && cursor > start) {
        // OCR can fuse two amounts into one word. This shared box cannot
        // establish which of them a line crosses.
        if ([...value.matchAll(money())].length > 1) return null;
        found.push(word.bbox);
      }
    }
    if (!found.length) return null;
    return {
      x0: Math.min(...found.map(box => box.x0)),
      x1: Math.max(...found.map(box => box.x1)),
      y0: Math.min(...found.map(box => box.y0)),
      y1: Math.max(...found.map(box => box.y1)),
    };
  }

  function interpret(draft, productUrl, inspectPrice) {
    const { title, context, amounts } = draft;
    const clues = context.filter(Boolean);
    const priceText = amounts.map(part => part.text);
    const isStruck = inspectPrice ? (line, start, end) => {
      const part = amounts[line - clues.length];
      const box = part && priceBox(part, start, end);
      return box && inspectPrice(box)?.struck;
    } : undefined;
    const fields = product.readPhotoText([...clues, ...priceText].join('\n'), productUrl, {
      keepUnconfirmedAmount: true,
      isStruck,
    });
    return { ...fields, title: title.title };
  }

  function read(result, productUrl = '', { inspectPrice } = {}) {
    const bands = readingBands(result || {}).map(unpack);
    let sectionStore = '', sectionHost = '', currency = '';
    const drafts = [];
    const usedAmounts = new Set();
    const columns = staggeredColumns(bands);
    const claimedHeadings = columns?.usedHeadings || new Set();
    for (const [index, band] of bands.entries()) {
      for (const {text} of band.context) {
        if (currencySetting.test(text)) currency = text;
        else if (host.test(text)) {
          sectionHost = text;
          sectionStore = '';
          currency = '';
        } else if (!itemMerchant.test(text)) {
          sectionStore = text;
          currency = '';
        }
      }
      if (columns && band.amounts.length) {
        for (const column of columns.drafts.get(index) || []) drafts.push({
          title: column.title,
          amounts: column.amounts,
          context: [column.seller || sectionStore, sectionHost, currency],
        });
        continue;
      }
      if (band.summary || band.titles.length > 1 || usedAmounts.has(index)) continue;
      let title = band.titles[0];
      let amounts = band.amounts;
      let stackedSeller = '';
      if (!title && amounts.length && Number.isFinite(band.center)) {
        const paired = stackedColumns(bands, index);
        if (paired.length) {
          for (const column of paired) {
            for (const part of column.parts) claimedHeadings.add(part);
            drafts.push({
              title: column.title,
              amounts: column.amounts,
              context: [column.seller || sectionStore, sectionHost, currency],
            });
          }
          continue;
        }
        const stacked = stackedHeading(bands, index, amounts);
        if (stacked) {
          title = stacked.title;
          stackedSeller = stacked.seller;
          for (const part of stacked.parts) claimedHeadings.add(part);
        }
      }
      if (!title) continue;

      const next = bands[index + 1];
      const nearby = Number.isFinite(band.center) && next?.center - band.center <= band.height * 2.5;
      if (nearby && !next.summary && !next.titles.length && amounts.length && next.amounts.length &&
          next.amounts.every(price => aligned(title, price) && priceLabel.test(price.text.replace(money(), '').trim()))) {
        // Include separately labeled current/previous amounts for the same product.
        amounts = [...amounts, ...next.amounts];
        usedAmounts.add(index + 1);
      }
      // Allow an explicit item to be reviewed with an empty price, but don't
      // infer unpriced products from arbitrary headings or descriptions.
      if (!amounts.length && !title.explicit) continue;
      const seller = band.context.find(({text}) => itemMerchant.test(text)) ||
        (nearby && !next.titles.length
          ? next.context.find(part => itemMerchant.test(part.text) && aligned(title, part))
          : null);
      drafts.push({ title, amounts, context: [seller?.text || stackedSeller || sectionStore, sectionHost, currency] });
    }
    const credibleDrafts = drafts.filter(draft => draft.amounts.length || !claimedHeadings.has(draft.title));
    const resultRows = credibleDrafts.map(draft => interpret(draft, productUrl, inspectPrice));
    // Distinct credible product headings are needed to switch to list import.
    const unique = new Set(resultRows.map(item => item.title.toLocaleLowerCase()));
    const explicit = new Set(drafts.filter(draft => draft.title.explicit).map(draft => draft.title.title.toLocaleLowerCase()));
    const anchored = credibleDrafts.filter(draft => draft.amounts.length).length;
    if (unique.size < 2 || (explicit.size < 2 && anchored < 2 && !resultRows.some(item => item.price != null || item.priceIssue))) return [];
    return resultRows;
  }

  return { read };
});
