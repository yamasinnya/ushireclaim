// やまやま牧場：ループ全体の共有セーブ・共通ロジック
const LOOP_SAVE_KEY = 'yamayama_loop_v1';

const LOOP_DEFAULT_STATE = {
  version: 1,
  day: 1,
  cows: [
    {
      id: 'cow_001',
      name: 'ふうか',
      gender: 'female',
      age: 48,          // ゲーム内日数（2歳=48日、1年=24日換算）
      seed: 1234,       // ブチ模様の乱数シード（4桁）
      condition: 6,     // 体調（内部値 1-10）。初期値6＝普通
      quality: 2,       // 品質（1-4）。初期値2＝可。今回は変動ロジックなし
      skill: 'zenno',
      type: 'mother',     // 'mother' | 'calf'（床替え等、母牛のみが対象の処理で使用）
      qualityPoint: 0,   // 牛ごとの品質ポイント（薬草獲得から貯まる。閾値到達でfeeding.htmlにて品質を1段階上げ、0へリセット）
      pregnantDay: 0,    // 妊娠経過日数。0=非妊娠。毎日アップキープで+1
      actualBirthDay: 0, // 実際の出産日（pregnantDayの値、16〜20のランダム）。0=未確定。pregnantDay===15でupkeep.htmlが確定させる
      // 繁殖状態（指示書_発情・種付け・妊娠システム実装.md対応）。表示優先度はbarn.js参照
      // 'none'=通常 / 'estrus'=発情中 / 'inseminated'=種付け済み(着床判定〜結果通知まで) / 'pregnant'=妊娠確定済み / 'failed'=着床失敗（次の発情まで表示）
      breedingState: 'none',
      breedingGrade: null, // 直近の種付けで使ったグレード('cheap'/'normal'/'premium')。出産時の子牛品質ポイントロールに使用
      inseminatedDay: 0,   // 種付けを実行した日（着床判定は+1日後、結果通知は+2日後）
      poopCount: 0,      // 💩の数（0〜4）。毎日アップキープで+1、床替えで0にリセット
      diseaseAlert: false, // 😷アイコン表示フラグ。フェーズ3で発動ロジックを実装予定
    },
  ],
  money: 0,
  grassStock: 0,  // 探索で集めた草の合計ポイント（翌日の体調変動に使い、アップキープ時に0へリセット）
  manaUsed: 0,  // 本日すでに消費した魔力の合計（探索・床替え等で共有。date_change.htmlで日付が変わるたびに0へリセット）
  wrapWara: 0,  // ラップ藁の在庫数。購入実装は別フェーズ、現時点では表示のみ
  buildings: {
    gyusha_small: true, // 牛舎（小）。初期状態から表示。将来、建設屋で建てた施設をここに追加していく
  },
};

// 牛ごとのマージ：デフォルトに無いフィールドの補完のみ行い、skillを含め進行中の値はセーブ側を優先する。
function mergeCowWithDefault(savedCow, defaultCow) {
  if (!defaultCow) return savedCow; // デフォルトに居ない牛（将来のガチャ牛など）はそのまま
  return { ...defaultCow, ...savedCow };
}

function loadLoopState() {
  try {
    const raw = localStorage.getItem(LOOP_SAVE_KEY);
    if (!raw) return { ...LOOP_DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== LOOP_DEFAULT_STATE.version) return { ...LOOP_DEFAULT_STATE };
    // 旧セーブ互換：state.qualityPoint（全頭共通）→ cows[0].qualityPoint（牛ごと）へ移行
    if (typeof parsed.qualityPoint === 'number') {
      if (parsed.cows && parsed.cows.length > 0) {
        parsed.cows[0].qualityPoint = parsed.qualityPoint;
      }
      delete parsed.qualityPoint;
    }
    const defaultCowsById = {};
    LOOP_DEFAULT_STATE.cows.forEach(c => { defaultCowsById[c.id] = c; });
    const mergedCows = (parsed.cows || []).map(saved => mergeCowWithDefault(saved, defaultCowsById[saved.id]));
    // buildingsも浅いスプレッドだけだと、将来デフォルトに新しい施設フラグを追加した時に
    // 既存セーブ側の値がbuildingsごと丸ごと勝ってしまい新フラグが消える。cows同様キー単位でマージする。
    const mergedBuildings = { ...LOOP_DEFAULT_STATE.buildings, ...(parsed.buildings || {}) };
    return { ...LOOP_DEFAULT_STATE, ...parsed, cows: mergedCows, buildings: mergedBuildings };
  } catch (e) {
    return { ...LOOP_DEFAULT_STATE };
  }
}

function saveLoopState(state) {
  localStorage.setItem(LOOP_SAVE_KEY, JSON.stringify(state));
}

// 体調（1-10）→ 1日あたりの魔力（探索回数）
// 設計まとめ.md「リソース設計」の表に対応
function conditionToMagic(condition) {
  if (condition >= 9) return 8;
  if (condition >= 7) return 7;
  if (condition >= 5) return 6;
  if (condition >= 3) return 5;
  return 4;
}

function conditionToLabel(condition) {
  if (condition >= 9) return '絶好調';
  if (condition >= 7) return '良好';
  if (condition >= 5) return '普通';
  if (condition >= 3) return '不調';
  return '危険';
}

// 育成飼料1回あたりの品質ポイント増加量（指示書_子牛の育成飼料による品質ポイント加算実装.md対応）
// サイロ建設前は+1、建設後(buildings.silo === true)は+2（サイロ建設処理自体は別フェーズ）
function getCalfFeedGain(buildings) {
  return buildings && buildings.silo ? 2 : 1;
}

// 子牛の成長ステージ（指示書_子牛の成長ステージと特殊ルール実装.md対応）
function getCalfStage(age) {
  if (age < 4) return 'nursing';   // 哺乳期（生まれたて〜2ヶ月）
  if (age < 8) return 'weaning';   // 離乳移行期（2〜4ヶ月）
  return 'growing';                 // 育成期（4ヶ月〜）
}

// 発情確率（品質ティア別。指示書_発情・種付け・妊娠システム実装.md対応。優90%/良75%/可50%/劣25%）
const ESTRUS_PROBABILITY = { 4: 0.90, 3: 0.75, 2: 0.50, 1: 0.25 };

// 種付けグレード別、出産時の子牛品質ポイントスタート値ロール
function rollCalfStartQualityPoint(grade) {
  if (grade === 'premium') return 15 + Math.floor(Math.random() * 6); // 15〜20の一様乱数
  if (grade === 'normal') return 5 + Math.floor(Math.random() * 14); // 5〜18の一様乱数
  return 0; // cheap（安い）は固定0
}

// 母牛の体調から算出した魔力の合計（子牛は魔力を持たない）
function calcTotalMagic(cows) {
  return cows
    .filter(cow => cow.type === 'mother')
    .reduce((sum, cow) => sum + conditionToMagic(cow.condition), 0);
}

// 本日の残り魔力（探索・床替え等で共有のmanaUsedを差し引いた値）
function manaRemaining(state) {
  return Math.max(0, calcTotalMagic(state.cows) - (state.manaUsed || 0));
}

// 魔力を消費して共有セーブに書き込む（explore.htmlの探索・barn.htmlの床替え等から呼ぶ）
function spendMana(amount) {
  const state = loadLoopState();
  state.manaUsed = (state.manaUsed || 0) + amount;
  saveLoopState(state);
  return state;
}

// 品質ポイント→品質変動の閾値（薬草獲得→品質ポイントの経路のみ実装。体調差分経路はスコープ外）
const QUALITY_THRESHOLD_TO_KA  = 30; // 劣→可
const QUALITY_THRESHOLD_TO_RYO = 50; // 可→良
const QUALITY_THRESHOLD_TO_YU  = 80; // 良→優
function qualityThresholdFor(quality) {
  if (quality === 1) return QUALITY_THRESHOLD_TO_KA;
  if (quality === 2) return QUALITY_THRESHOLD_TO_RYO;
  return QUALITY_THRESHOLD_TO_YU;
}

// 品質（1-4）→ 表示ラベルのt()キー（実際の文字列はja.json経由で取得する）
function qualityToLabelKey(quality) {
  if (quality >= 4) return 'quality_label_yu';
  if (quality === 3) return 'quality_label_ryo';
  if (quality === 2) return 'quality_label_ka';
  return 'quality_label_retsu';
}

// スキルキー→ 絵文字とt()キーの対応（cow.skillの値と一致させること）
const SKILL_DISPLAY = {
  herdboys_eye: { emoji: '👦', nameKey: 'skill_name_herdboys_eye' },
  trace:        { emoji: '🐾', nameKey: 'skill_name_trace' },
  roku:         { emoji: '🔮', nameKey: 'skill_name_roku' },
  zenno:        { emoji: '⛩️', nameKey: 'skill_name_zenno' },
};

// 通算day(1始まり) → { year, month, half, season }
// 1年=24日、1ヶ月=2日（上旬/下旬）、季節：春3-5月 夏6-8月 秋9-11月 冬12-2月
function formatDate(day) {
  const dayInYear = (day - 1) % 24;
  const year = Math.floor((day - 1) / 24) + 1;
  const month = Math.floor(dayInYear / 2) + 1;
  const half = dayInYear % 2 === 0 ? '上旬' : '下旬';
  let season;
  if (month >= 3 && month <= 5) season = '春';
  else if (month >= 6 && month <= 8) season = '夏';
  else if (month >= 9 && month <= 11) season = '秋';
  else season = '冬';
  return { year, month, half, season, text: `${year}年目　${season}　${month}月${half}` };
}

// 共通ヘッダー（指示書_共通ヘッダー実装.md対応）：日付・魔力・所持金・ラップ藁を表示する
// 対象要素に <div id="gameHeader" class="game-header"></div> を置き、renderHeader('gameHeader') を呼ぶ
function renderHeader(targetElementId) {
  const state = loadLoopState();
  const dateInfo = formatDate(state.day);
  const el = document.getElementById(targetElementId);
  if (!el) return;
  el.innerHTML = `
    <div class="header-left">
      <div class="header-date">${dateInfo.text.replace('　', '<br>')}</div>
      <div class="header-day">Day ${state.day}</div>
    </div>
    <div class="header-stats">
      <span class="stat-mana">🔮 ${manaRemaining(state)}</span>
      <span class="stat-gold">💰 ${state.money}G</span>
      <span class="stat-wara">
        <img src="assets/sprites/icon_wrap_wara.png" class="wrap-icon"> ${Math.floor((state.wrapWara || 0) / 5)}
      </span>
    </div>
  `;
}
