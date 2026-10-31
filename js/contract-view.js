'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHTML;
  const money = (n) => esc(formatBR(n));
  function render() {
    const settings = getEconomy(),
      config = Economy.config,
      rules = settings.contractRules;
    const benefits = Object.entries(settings.benefits)
      .map(([id, benefit]) => '<li>' + esc(config.services.find((item) => item.id === id)?.label || id) + ': ' + esc(Finance.format(benefit.amount, benefit.currency)) + ', cumprido fora do aplicativo.</li>')
      .join('');
    const rows = config.services
      .map(
        (item) =>
          '<tr><td>' +
          esc(item.label) +
          '</td><td>' +
          money(settings.prices[item.id]) +
          '</td><td>' +
          esc(item.description) +
          (item.id === 'Cozinhar jantar' ? ' · Adicional de ' + money(rules.dinnerGuestPrice) + ' por amiga.' : '') +
          (item.taskCount > 1 ? ' · ' + item.taskCount + ' conclusões separadas.' : '') +
          '</td></tr>',
      )
      .join('');
    const gains = config.gains.map((item) => '<tr><td>' + esc(item.id) + '</td><td>' + money(settings.gains[item.id]) + '</td></tr>').join('');
    const games = config.games
      .map(
        (item) =>
          '<li><strong>' +
          esc(item.id) +
          '</strong>: sugestão de ' +
          money(settings.games[item.id]) +
          (item.scoreBased === false
            ? '. Valor ajustável. O cronômetro começa ao escolher a atividade e pode ser pausado manualmente; não lê nem monitora o WhatsApp.'
            : '. O valor pode ser definido pelo resultado ou pela diferença de pontos multiplicada pelo valor por ponto informado.') +
          (item.timerEligible ? ' 💲 Ativa a progressão automática durante a sessão do cronômetro.' : '') +
          '</li>',
      )
      .join('');
    const extras = Object.entries(settings.extras)
      .map(([id, value]) => '<li>' + esc('Adicional: ' + (config.extras[id]?.label || id)) + ': ' + money(value) + '.</li>')
      .join('');
    const blocks = Object.entries(config.cooldowns)
      .map(([id, hours]) => '<li>' + esc(config.services.find((item) => item.id === id)?.label || id) + ': ' + hours + ' horas.</li>')
      .join('');
    $('contractDocument').innerHTML = `
      <header><h1>💎 Contrato de Submissão e Resgate de Saldo</h1><p>Versão do sistema · valores vigentes do catálogo</p></header>
      <h2>Partes envolvidas</h2><p>Dominadora: ____________________________________</p><p>Dominado: ______________________________________</p>
      <h2>Objetivo</h2><p>Organizar a dinâmica entre as partes, a geração de saldo interno por jogos e atividades e a compra de serviços, mimos e privilégios. O saldo interno não se confunde com os gastos reais registrados nas notas.</p>
      <h2>1. Tarefas e valores</h2><p>Os serviços são comprados com o Saldo Dominadora. Cada compra gera uma pendência a ser cumprida. Os preços abaixo são os valores-base, antes do desconto lingerie.</p>
      <div class="contract-table-wrap"><table><thead><tr><th>Tarefa</th><th>Valor (R$)</th><th>Observações</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h2>2. Regras especiais</h2><ul>
        <li>As tarefas compradas devem ser cumpridas conforme suas descrições.</li>
        <li>Descumprimento de tarefa: acréscimo de ${money(rules.failurePenalty)} ao saldo interno, mediante registro e confirmação da ocorrência.</li>
        <li>A Dominadora deve se esforçar para não passar creme nos pés todos os dias. Ocorrência dessa regra: desconto de ${money(rules.creamPenalty)} do saldo interno, mediante registro e confirmação.</li>
        <li>As penalidades não recebem bônus lingerie.</li>
        <li>O uso de roupas e adereços durante a dinâmica segue o combinado entre as partes. O sistema não verifica essa condição automaticamente.</li>
      </ul>
      <h2>3. Geração de saldo</h2><h3>3.1 Jogos e atividades variáveis</h3><ul>${games}</ul>
      <p>Na calculadora, a diferença corresponde aos pontos da Dominadora (ou ao total das amigas) menos os do Dominado, com mínimo zero. Usar o resultado apenas preenche o valor; o saldo só muda ao registrar o ganho.</p>
      <h3>3.2 Atividades de ganho</h3><div class="contract-table-wrap"><table><thead><tr><th>Atividade</th><th>Ganho (R$)</th></tr></thead><tbody>${gains}</tbody></table></div><ul>${extras}</ul>
      <p>Limite de quantidade por lançamento com multiplicador: ${settings.quantityMax}. Limite de ganho digitado por lançamento em jogos e Outro: ${money(settings.manualGainMax)}.</p>
      <h2>4. Uso e conclusão de serviços</h2><p>O saldo é acumulado pelas operações de ganho e pelas ocorrências registradas. Comprar serviços desconta seu preço do saldo. Concluir um serviço não devolve nem acrescenta saldo. Serviços com várias tarefas acompanham cada conclusão separadamente.</p>
      <ul>${benefits}</ul><p>A compra de serviços internos não cria gastos reais nas notas; esses registros são separados.</p>
      <h2>5. Bônus, tempo, bloqueios e roleta</h2><ul>
        <li>Com lingerie ativa: bônus de ${settings.bonusPercent}% nos ganhos e desconto de ${settings.discountPercent}% nos serviços elegíveis. Redutores de tempo e aceleração não recebem desconto.</li>
        <li>Cronômetro: começa ao escolher uma atividade de ganho. Trocar de atividade mantém a sessão; uma pausa manual só é retomada pelo botão Continuar. O saldo não muda só por selecionar uma atividade. Base de ${money(settings.timer.base)} por minuto. Atividades na sessão podem aumentar a taxa; após um item 💲, o aumento automático é de ${money(settings.timer.autoIncrement)} a cada ${settings.timer.autoEvery} segundos por atividade dinâmica distinta ativa no combo. Repetir a mesma atividade não duplica sua participação; ela pode ser encerrada no cronômetro sem reprecificar o passado. Não há teto de duração nem de taxa. Valores já acumulados mantêm a taxa efetivamente ganha.</li>
        <li>Roleta: ${config.roulette.length} setores, uma rodada a cada ${config.rouletteCooldownMs / 86400000} dias. Os prêmios gratuitos devem ser resgatados; o bloqueio do serviço continua sendo respeitado.</li>
      </ul><h3>Intervalos entre compras</h3><ul>${blocks}</ul>
      <h2>6. Vigência e assinaturas</h2><p>Este documento representa a configuração atual do sistema e acompanha as alterações salvas no catálogo. É válido enquanto a dinâmica estiver ativa entre as partes. O PDF original é mantido como referência histórica.</p>
      <div class="contract-signatures"><p>Dominadora: __________________________________</p><p>Dominado: ____________________________________</p><p>Data: ____ / ____ / ________</p></div>`;
  }
  $('abrirContrato').onclick = () => {
    document.querySelector('[data-panel="contractPanel"]').click();
    $('contractPanel').scrollIntoView({ block: 'start' });
  };
  $('editContractValues').onclick = () => {
    document.querySelector('[data-panel="backupPanel"]').click();
    $('customEconomy').open = true;
    $('customEconomyJson').focus();
  };
  $('printContract').onclick = () => window.print();
  window.addEventListener('economy:changed', render);
  document.querySelector('[data-panel="contractPanel"]').addEventListener('click', render);
  render();
});
