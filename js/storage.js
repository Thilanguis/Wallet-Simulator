/* =================================================================== */
/* CONFIG & STATE                             */
/* =================================================================== */

const FIXED_VALUES_GANHO = {
  'Pés na cara': 400,
  'Tapa de pé na cara': 2,
  'Chupar peito': 500,
  'Cuspir na cara': 320,
  'Mijar na boca': 350,
  'Dedo do meio com desprezo': 30,
  'Vestir cinta e comer dominado': 3500,
  'Dar uma meleca para comer': 200,
  'Comer cutícula e peles dos pés': 800,
  'Cuspir porra (Sêmen) na boca': 2000,
  'Chupar buceta': 200,
  'Peidar na cara': 150,
};

// const BONUS_ESPECIAL_MULTIPLIER = 0.85; // 1.3x

/* BÔNUS em GANHOS (+30%) */
const BONUS_GANHO_MULTIPLIER = 1.15;

/* DESCONTO em COMPRAS (-15%) — use só se quiser mesmo aplicar desconto nos gastos */
const DESCONTO_COMPRA_MULTIPLIER = 0.85;

const ELIGIBLE_TASKS = new Set(['Videogames Competitivos', 'Perfil', 'Jogos de tabuleiro com amigas', 'Buraco']);

// Estado inicial agora vem do Firestore (ou começa zerado)
let saldoDominadora = 0;
let historico = [];
let tarefasPendentes = [];
let bonusEspecialAtivo = false;
