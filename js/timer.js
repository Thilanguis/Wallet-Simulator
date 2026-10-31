/* Active time is integrated at its earned rate. Restored sessions are paused. */
let tempoSegundos = 0,
  timerInterval = null,
  wakeLock = null,
  timerEmSessao = false;
let contadorTarefasTimer = 0,
  somaIncrementosValorSessao = 0,
  baseMultiplicadorSessao = 1,
  sessionHasEligibleTask = false;
let timerEarnedUnits = 0,
  timerLastTick = 0;
let sessionDynamicActivities = new Set(),
  legacyDynamicActivity = false;
function activeDynamicCount() {
  return sessionDynamicActivities.size || (legacyDynamicActivity ? 1 : 0);
}
function renderDynamicCombo() {
  let area = document.getElementById('timerDynamicCombo');
  if (!area) {
    area = document.createElement('div');
    area.id = 'timerDynamicCombo';
    document.getElementById('contadorBloco').append(area);
  }
  area.replaceChildren();
  const caption = document.createElement('p');
  caption.className = 'hint';
  caption.textContent = activeDynamicCount()
    ? 'Combo: ' + activeDynamicCount() + ' atividade(s) · +' + formatBR(Economy.round(getEconomy().timer.autoIncrement * activeDynamicCount())) + ' a cada ' + getEconomy().timer.autoEvery + ' segundos · toque no × para encerrar uma dinâmica.'
    : 'Seu combo aparece aqui ao registrar atividades 💲 durante a sessão.';
  area.append(caption);
  for (const name of sessionDynamicActivities) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'dynamic-combo-chip';
    chip.textContent = name + ' ×';
    chip.setAttribute('aria-label', 'Encerrar dinâmica: ' + name);
    chip.onclick = () => {
      syncTimer();
      sessionDynamicActivities.delete(name);
      legacyDynamicActivity = false;
      sessionHasEligibleTask = activeDynamicCount() > 0;
      persistTimer();
      renderDynamicCombo();
    };
    area.append(chip);
  }
}
function persistTimer() {
  AppStorage.setItem(
    'timerSession',
    JSON.stringify({
      seconds: tempoSegundos,
      earnedUnits: timerEarnedUnits,
      rate: Number(document.getElementById('valorPorMinuto').value),
      active: timerEmSessao,
      tasks: contadorTarefasTimer,
      eligible: activeDynamicCount() > 0,
      dynamicActivities: Array.from(sessionDynamicActivities),
      legacyDynamicActivity,
      running: !!timerInterval,
    }),
  );
}
function syncTimer() {
  if (!timerInterval || !timerLastTick) return;
  const seconds = Math.max(0, Math.floor((Date.now() - timerLastTick) / 1000));
  if (!seconds) return;
  const state = Economy.step({ seconds: tempoSegundos, earnedUnits: timerEarnedUnits, rate: Number(document.getElementById('valorPorMinuto').value) }, seconds, getEconomy(), activeDynamicCount());
  tempoSegundos = state.seconds;
  timerEarnedUnits = state.earnedUnits;
  document.getElementById('valorPorMinuto').value = state.rate.toFixed(2);
  timerLastTick += seconds * 1000;

  persistTimer();
}
function aplicarBonusDeTarefaDuranteTimer(value, name) {
  if (!timerEmSessao) return;
  syncTimer();
  if (ELIGIBLE_TASKS.has(String(name).trim())) {
    sessionDynamicActivities.add(String(name).trim());
    legacyDynamicActivity = false;
    sessionHasEligibleTask = true;
    renderDynamicCombo();
  }
  contadorTarefasTimer++;
  const settings = getEconomy();
  const classic = Economy.config.services.find((s) => s.id === name)?.classic || Economy.config.gains.find((s) => s.id === name)?.classic || value;
  const increment = Economy.taskIncrement(classic, settings) + settings.timer.repeatIncrement * contadorTarefasTimer;
  const input = document.getElementById('valorPorMinuto');
  input.value = Economy.round(Number(input.value) + increment).toFixed(2);
  persistTimer();
  atualizarValorAcumulado();
}
function calcularValorTotal(seconds, rate) {
  return Economy.round((seconds * rate) / 60);
}
function atualizarValorAcumulado() {
  document.getElementById('valorAcumuladoDisplay').textContent = formatBR(Economy.round(timerEarnedUnits / 6000));
}
async function requestWakeLock() {
  if ('wakeLock' in navigator)
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {}
}
async function releaseWakeLock() {
  if (wakeLock) {
    try {
      await wakeLock.release();
    } catch {}
    wakeLock = null;
  }
}
function atualizarDisplay() {
  const min = String(Math.floor(tempoSegundos / 60)).padStart(2, '0'),
    sec = String(tempoSegundos % 60).padStart(2, '0');
  document.getElementById('tempoDisplay').textContent = min + ':' + sec;
  atualizarValorAcumulado();
}
document.addEventListener('DOMContentLoaded', () => {
  const raw = AppStorage.getItem('timerSession');
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (!saved.active) return;
    if (![saved.seconds, saved.earnedUnits, saved.rate, saved.tasks].every((n) => Number.isFinite(n) && n >= 0)) throw new Error('Sessão inválida.');
    tempoSegundos = saved.seconds;
    timerEarnedUnits = saved.earnedUnits;
    contadorTarefasTimer = saved.tasks;
    if (saved.dynamicActivities !== undefined && (!Array.isArray(saved.dynamicActivities) || saved.dynamicActivities.length > 1000 || saved.dynamicActivities.some((name) => typeof name !== 'string' || name.length > 200)))
      throw new Error('Combo salvo inválido.');
    sessionDynamicActivities = new Set(saved.dynamicActivities || []);
    legacyDynamicActivity = saved.dynamicActivities === undefined ? !!saved.eligible : !!saved.legacyDynamicActivity;
    sessionHasEligibleTask = activeDynamicCount() > 0;
    timerEmSessao = true;
    document.getElementById('valorPorMinuto').value = saved.rate;
    document.getElementById('btnPlayPauseTempo').textContent = '▶️ Retomar sessão salva';
    atualizarDisplay();
    renderDynamicCombo();
  } catch (error) {
    storageFailure(error);
  }
});
window.addEventListener('pagehide', () => {
  syncTimer();
  persistTimer();
  AppStorage.flush();
});
// A mirrored device displays the controller's session without integrating it twice.
window.freezeWalletTimer = function () {
  syncTimer();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerLastTick = 0;
  releaseWakeLock();
  persistTimer();
  document.getElementById('btnPlayPauseTempo').textContent = timerEmSessao ? '▶️ Continuar' : '▶️ Começar';
  atualizarDisplay();
};
window.addEventListener('wallet:remote', (event) => {
  if (event.detail && !event.detail.initial && !event.detail.changedKeys.includes('timerSession')) return;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerLastTick = 0;
  const saved = JSON.parse(AppStorage.getItem('timerSession') || 'null');
  tempoSegundos = saved?.seconds || 0;
  timerEarnedUnits = saved?.earnedUnits || 0;
  contadorTarefasTimer = saved?.tasks || 0;
  timerEmSessao = !!saved?.active;
  sessionDynamicActivities = new Set(saved?.dynamicActivities || []);
  legacyDynamicActivity = !!saved?.legacyDynamicActivity;
  sessionHasEligibleTask = activeDynamicCount() > 0;
  document.getElementById('valorPorMinuto').value = saved?.rate ?? getEconomy().timer.base;
  document.getElementById('btnPlayPauseTempo').textContent = timerEmSessao ? '▶️ Continuar' : '▶️ Começar';
  atualizarDisplay();
  renderDynamicCombo();
});
window.addEventListener('wallet:control', () => persistTimer());
