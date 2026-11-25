'use strict';
window.WishFx = (() => {
  let pending = null,
    attempted = 0;
  const personalView = !window.AppStorage;
  const current = () => {
    try {
      return JSON.parse((personalView ? localStorage.getItem('wishlistFxPublic') : AppStorage.getItem('wishlistFx')) || 'null');
    } catch {
      return null;
    }
  };
  function day() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const date = new Date(parts.year + '-' + parts.month + '-' + parts.day + 'T12:00:00Z');
    if (Number(parts.hour) < 8) date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  async function refresh() {
    if ((!personalView && !WalletStore.isWritable()) || pending || current()?.checkedDay === day() || Date.now() - attempted < 3600000) return pending;
    attempted = Date.now();
    pending = (async () => {
      try {
        const response = await fetch('https://api.frankfurter.dev/v2/rates?base=BRL', { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error();
        const data = await response.json(),
          rates = { BRL: 1 },
          dates = {};
        if (!Array.isArray(data)) throw new Error();
        for (const row of data)
          if (row.base === 'BRL' && /^[A-Z]{3}$/.test(row.quote) && Number.isFinite(row.rate) && row.rate > 0) {
            rates[row.quote] = 1 / row.rate;
            dates[row.quote] = row.date;
          }
        if (!rates.CAD) throw new Error();
        const snapshot = JSON.stringify({ checkedDay: day(), checkedAt: Date.now(), rates, dates, source: 'Frankfurter' });
        if (personalView) localStorage.setItem('wishlistFxPublic', snapshot);
        else {
          AppStorage.setItem('wishlistFx', snapshot);
          AppStorage.flush();
        }
      } catch {
      } finally {
        pending = null;
        window.dispatchEvent(new Event('wishlist:rates'));
      }
    })();
    return pending;
  }
  const convert = (value, currency) => {
    if (currency === 'BRL' || value === 0) return value;
    const rate = current()?.rates?.[currency];
    return Number.isFinite(rate) && rate > 0 ? Math.round(value * rate * 100) / 100 : null;
  };
  window.addEventListener('cloud:state', () => void refresh());
  window.addEventListener('online', () => {
    attempted = 0;
    void refresh();
  });
  if (!personalView) setInterval(() => void refresh(), 60000);
  return { refresh, convert, current };
})();
