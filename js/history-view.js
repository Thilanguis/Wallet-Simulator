'use strict';
window.WalletHistoryView = (() => {
  const element = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function render(container, entries, archive) {
    container.replaceChildren();
    if (!entries.length) {
      container.append(element('p', 'history-empty', 'Sem registros para o período.'));
      return;
    }
    const groups = new Map();
    for (const record of entries) {
      const date = new Date(record.timestamp);
      const key = Number.isFinite(date.getTime()) ? date.toLocaleDateString('sv-SE') : 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    for (const [day, records] of groups) {
      const section = element('section', 'history-day');
      const date = new Date(day + 'T12:00:00');
      section.append(element('h3', 'history-day-title', day === 'unknown' ? 'Data não informada' : date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })));
      for (const record of records) {
        const type = ['ganho', 'gasto', 'ajuste', 'premio'].includes(record.tipo) ? record.tipo : 'ajuste';
        const row = element('article', 'history-row history-' + type);
        const content = element('div', 'history-content');
        content.append(element('span', 'history-type', { ganho: 'Ganho', gasto: 'Gasto', ajuste: 'Ajuste', premio: 'Prêmio' }[type]), element('span', 'history-description', record.descricao || 'Sem descrição'));
        let amount = Number(record.valor) || 0,
          sign = type === 'ganho' ? '+' : type === 'gasto' ? '−' : '';
        if (type === 'ajuste') {
          const match = String(record.descricao || '').match(/Ajuste manual de saldo:\s*(-?\d+(?:\.\d+)?)\s*→\s*(-?\d+(?:\.\d+)?)/);
          if (match) {
            amount = Number(match[2]) - Number(match[1]);
            sign = amount < 0 ? '−' : amount > 0 ? '+' : '';
            content.querySelector('.history-description').textContent = 'Ajuste manual de saldo';
            content.append(element('span', 'history-adjustment', formatBR(Number(match[1])) + ' → ' + formatBR(Number(match[2]))));
          }
        }
        const validBonus = ['valorOriginal', 'valorFinal', 'diferenca', 'percentual'].every((key) => typeof record[key] === 'number' && Number.isFinite(record[key]));
        if (validBonus && record.percentual !== 0) {
          const bonus = element('div', 'history-bonus');
          bonus.append(
            element('span', 'history-bonus-label', (record.percentual > 0 ? 'Bônus +' : 'Desconto −') + Math.abs(record.percentual) + '%'),
            element('s', '', formatBR(record.valorOriginal)),
            element('strong', '', formatBR(record.valorFinal)),
            element('span', '', (record.percentual > 0 ? 'Extra ' : 'Economia ') + formatBR(Math.abs(record.diferenca))),
          );
          content.append(bonus);
        } else if (validBonus) content.append(element('span', 'history-bonus-neutral', 'Sem bônus aplicado'));
        const time = new Date(record.timestamp);
        const when = element('time', 'history-time', Number.isFinite(time.getTime()) ? time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
        if (Number.isFinite(time.getTime())) when.dateTime = time.toISOString();
        const numbers = element('div', 'history-numbers');
        numbers.append(element('strong', 'history-amount', type === 'premio' && amount === 0 ? 'Gratuito' : sign + formatBR(Math.abs(amount))), element('span', 'history-balance', 'Saldo ' + formatBR(Number(record.saldoAtual) || 0)));
        const button = element('button', 'btn-del-hist history-archive');
        button.type = 'button';
        button.title = 'Arquivar registro';
        button.setAttribute('aria-label', 'Arquivar ' + (record.descricao || 'registro'));
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/></svg>';
        button.onclick = () => archive(record.timestamp);
        row.append(when, content, numbers, button);
        section.append(row);
      }
      container.append(section);
    }
  }
  return { render };
})();
