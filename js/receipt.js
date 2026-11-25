(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./finance.js') : root.Finance);
  if (typeof module === 'object') module.exports = api;
  else root.Receipt = api;
})(typeof window === 'object' ? window : globalThis, function (F) {
  function suggest(text, entries = [], confidence = null) {
    const lines = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const warnings = ['Confira loja, valor efetivamente pago, moeda e data antes de registrar.'];
    const known = lines.find((l) => /shein|amazon|shopee|mercado livre|ifood|aliexpress/i.test(l));
    let store = known?.match(/shein|amazon|shopee|mercado livre|ifood|aliexpress/i)?.[0];
    store = store ? store.charAt(0).toUpperCase() + store.slice(1).toLowerCase() : lines.find((l) => !F.moneyTokens(l).length && !/comprovante|recibo|nota fiscal|pedido|pagamento|cnpj|cpf|\d{2}\/\d{2}/i.test(l)) || '';
    store = store.slice(0, 200);
    if (!known) warnings.push('Estabelecimento inferido do texto; revise o nome.');
    let date = '';
    const dateMatch = text.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
    if (dateMatch) date = dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1];
    else date = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] || '';
    if (!F.validDate(date)) {
      date = '';
      warnings.push('Data não reconhecida; preencha manualmente.');
    }
    const candidates = [];
    const moneyForReceipt = line => F.moneyTokens(line, { canadian: true });
    for (const [index, line] of lines.entries()) {
      if (/subtotal|sub-total|frete|desconto|troco|parcelas|limite|saldo|imposto|taxa/i.test(line) && !/total (?:pago|final)|valor (?:pago|final)/i.test(line)) continue;
      let money = moneyForReceipt(line);
      let context = line;
      if (!money.length && /total|pago|pagamento/i.test(line) && lines[index + 1]) {
        money = moneyForReceipt(lines[index + 1]);
        context += ' ' + lines[index + 1];
      }
      let score = /valor (?:efetivamente )?pago|total pago|valor final|total final|paid|amount paid/i.test(context) ? 100 : /total|pagamento aprovado/i.test(context) ? 70 : /valor|amount/i.test(context) ? 40 : 10;
      if (/cancelado|recusado|estornado/i.test(context)) {
        score = 0;
        warnings.push('Documento menciona cancelamento/estorno: confira a situação.');
      }
      const equivalence = /=/.test(context) && money.some((m) => m.currency === 'BRL');
      for (const m of equivalence ? money.filter((m) => m.currency === 'BRL') : money) candidates.push({ ...m, score, line: context });
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const ambiguous = !best || best.score < 70 || candidates.some((c) => c !== best && c.score === best.score && (c.amount !== best.amount || c.currency !== best.currency));
    if (best?.currency === 'CAD' && /^\$|^d[oó]lares?/i.test(best.raw)) warnings.push('CAD sugerido a partir do símbolo $. Confira a moeda.');
    if (ambiguous) warnings.push('Valor incerto: não há um único total pago claramente identificado.');
    if (confidence !== null && confidence < 75) warnings.push('OCR com baixa confiança (' + Math.round(confidence) + '%).');
    if (!best) warnings.push('Valor não reconhecido; digite o valor pago.');
    const category = /ifood/i.test(store) ? F.categories[2] : F.categories[7];
    const entry = { store, description: F.nextStoreLabel(entries, store || 'Compra'), date, category, amount: best?.amount || 0, currency: best?.currency || 'BRL', status: 'paid' };
    const possibleDuplicates = F.duplicates(entries, entry);
    if (possibleDuplicates.length) warnings.push('Possível duplicidade: mesma loja, data, valor e moeda já registrados.');
    return { entry, warnings, confidence, ambiguous, candidates, possibleDuplicates };
  }
  return { suggest };
});
