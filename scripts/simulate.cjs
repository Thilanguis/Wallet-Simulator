const E = require('../js/economy.js'),
  fs = require('node:fs'),
  path = require('node:path');
const s = E.defaults('balanced');
const f = (n) => {
  if (!Number.isFinite(n)) throw new Error('Resultado não finito na simulação.');
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
};
function session(minutes, activityEvery = 0, activityValue = 10, bonus = false) {
  let t = { seconds: 0, earnedUnits: 0, rate: s.timer.base },
    activities = 0,
    eligible = false;
  for (let minute = 1; minute <= minutes; minute++) {
    t = E.step(t, 60, s, eligible);
    if (activityEvery && minute % activityEvery === 0) {
      activities++;
      eligible = true;
      t.rate = E.round(t.rate + E.taskIncrement(activityValue, s) + s.timer.repeatIncrement * activities);
    }
  }
  return { minutes, activities, credits: E.adjusted(E.round(t.earnedUnits / 6000) + activities * activityValue, 'gain', bonus, s), rate: t.rate };
}
const profiles = [
  ['Somente tempo, 30 min', 30, 0, false],
  ['Jogo de 10 créditos a cada 10 min, 30 min', 30, 10, false],
  ['Jogo de 10 créditos a cada 10 min, 30 min, bônus', 30, 10, true],
  ['Somente tempo, 120 min', 120, 0, false],
  ['Jogo de 10 créditos a cada 10 min, 120 min', 120, 10, false],
];
const lines = [
  '# Economia e simulações',
  '',
  'Valores em R$ de saldo interno para serviços. Notas reais permanecem separadas. A configuração atual usa os valores equilibrados como padrão e admite catálogo personalizado; as referências clássicas abaixo documentam apenas os preços antigos, sem seletor de modo na interface.',
  '',
  '## Catálogo de serviços',
  '',
  '| Serviço | Clássico | Equilibrado | Jogos de 10 créditos | Minutos somente cronômetro base |',
  '|---|---:|---:|---:|---:|',
];
E.config.services.forEach((item) => lines.push(`| ${item.label} | ${f(item.classic)} | ${f(item.balanced)} | ${Math.ceil(item.balanced / 10)} | ${item.balanced / 0.5} |`));
lines.push(
  '',
  'A coluna de tempo considera somente a taxa-base, sem bônus nem atividades. Não existe teto de duração ou taxa. As equivalências são exemplos de planejamento, sem alterar registros existentes.',
  '',
  '## Ganhos por atividade',
  '',
  '| Atividade | Clássico | Equilibrado |',
  '|---|---:|---:|',
);
E.config.gains.forEach((item) => lines.push(`| ${item.id} | ${f(item.classic)} | ${f(item.balanced)} |`));
lines.push(
  '',
  'Extras (Clássico → Equilibrado): ' +
    Object.entries(E.config.extras)
      .map(([key, v]) => key + ' ' + v.classic + ' → ' + v.balanced)
      .join('; ') +
    '. O extra anteriormente anunciado como 500, mas cobrado como 400, passa a usar os 500 anunciados no Clássico.',
  '',
  'Ganhos de jogos eram inteiramente manuais. Sugestões equilibradas: ' +
    Object.entries(s.games)
      .map(([key, v]) => key + ' ' + v)
      .join('; ') +
    '. O limite manual do Equilibrado é ' +
    s.manualGainMax +
    ' por lançamento; a quantidade da atividade multiplicável é limitada a ' +
    s.quantityMax +
    '.',
  '',
  '## Cenários de sessão',
  '',
  '| Cenário | Atividades | Saldo gerado (R$) | Taxa final (R$/min) |',
  '|---|---:|---:|---:|',
);
for (const [label, minutes, every, bonus] of profiles) {
  const result = session(minutes, every, 10, bonus);
  lines.push(`| ${label} | ${result.activities} | ${f(result.credits)} | ${f(result.rate)} |`);
}
lines.push(
  '',
  'Cronômetro: base R$ ' + f(s.timer.base) + '/min; incremento dinâmico R$ ' + f(s.timer.autoIncrement) + ' a cada ' + s.timer.autoEvery + ' segundos por atividade elegível distinta. Cada registro aplica o incremento da atividade e de repetição configurados. Não há teto de tempo ou taxa; as durações acima são cenários. Os incrementos valem para segundos futuros, com arredondamento no fechamento.',
  '',
  'Bônus padrão +' + s.bonusPercent + '% e desconto −' + s.discountPercent + '% em serviços elegíveis. Redutores não recebem desconto. O editor JSON permite alterar o catálogo e os parâmetros; alterações não reprecificam operações anteriores. Não se altera o catálogo durante uma sessão ativa.',
  '',
  '## Roleta: distribuição',
  '',
  'Mantidos os 19 setores e pesos originais. Não se reduz proporcionalmente a chance dos serviços mais caros: preservar as chances evita mudar duas variáveis ao mesmo tempo. Pesos são normalizados, não exigem soma 100. Serviços e redutores são prêmios gratuitos; bônus dura 24h; o setor de dinheiro é uma oferta com custo do catálogo, que precisa de solicitação de resgate. Sorteio não significa pagamento real. Cooldown de 72h é salvo ao iniciar o giro; um giro interrompido é concluído uma vez ao reabrir.',
  '',
  '| Setor | Probabilidade esperada | Simulação (200 mil giros) |',
  '|---|---:|---:|',
);
let seed = 123456789;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const weights = E.config.roulette.map((r) => r.weight),
  sum = weights.reduce((a, b) => a + b, 0),
  counts = weights.map(() => 0),
  n = 200000;
for (let i = 0; i < n; i++) counts[E.drawRoulette(s, random)]++;
let maxError = 0;
E.config.roulette.forEach((r, i) => {
  const expected = weights[i] / sum,
    observed = counts[i] / n;
  maxError = Math.max(maxError, Math.abs(expected - observed));
  lines.push(`| ${r.label} | ${f(expected * 100)}% | ${f(observed * 100)}% |`);
});
if (maxError > 0.005) throw new Error('Distribuição fora da tolerância de 0,5 ponto percentual.');
lines.push(
  '',
  `Maior desvio absoluto: ${f(maxError * 100)} ponto percentual. Gerador determinístico com semente 123456789. A implementação do sorteio real usa Math.random e a mesma distribuição de pesos.`,
  ``,
  '## Benefícios e limites reais',
  '',
  'O benefício legado de US$ 60 conserva sua moeda e custo de catálogo. O Wallet não efetua pagamentos nem converte automaticamente saldo interno em gastos reais. As notas e suas equivalências USD/BRL continuam independentes da carteira.',
);
fs.mkdirSync(path.join(__dirname, '../docs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../docs/ECONOMIA.md'), lines.join('\n') + '\n');
console.log('Simulações concluídas: 200.000 giros; maior desvio ' + f(maxError * 100) + ' p.p. Tabelas em docs/ECONOMIA.md.');
