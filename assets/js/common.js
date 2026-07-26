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
      skill: 'zenno',
      type: 'mother',     // 'mother' | 'calf'（床替え等、母牛のみが対象の処理で使用）
      // 品質(優良可)はもう保存しない。qualityPointの累計からgetQualityTier()で都度算出する（口頭指示：レベル制→スコープ制へ変更）
      qualityPoint: 30,  // 牛ごとの品質ポイント累計（薬草獲得・体調日次加算等で増減する。下がればティアも下がる）
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

// ── 成牛（母牛・オス成牛）の枠（指示書_子牛の成牛昇格イベント実装.md対応） ──
// 牛舎の上段3部屋(s0〜s2)を成牛枠として、母牛とオス成牛で共用する（口頭指示対応）
const ADULT_COW_LIMIT = 3;
function isAdultCow(cow) {
  return cow.type === 'mother' || cow.type === 'bull';
}
function countAdultCows(cows) {
  return cows.filter(isAdultCow).length;
}

// 成牛昇格時のスキル抽選：qualityPointでティアを決め、ティア内の2つから50%ずつで選ぶ
const PROMOTION_SKILL_TIERS = [
  { maxQualityPoint: 30,       skills: ['herdboys_eye', 'okanemochi'] },   // 弱
  { maxQualityPoint: 60,       skills: ['hatarakimono', 'takeuchi'] },     // 普通
  { maxQualityPoint: Infinity, skills: ['roku', 'trace'] },                // 強
];
function rollPromotionSkill(qualityPoint) {
  const qp = Math.floor(qualityPoint || 0);
  const tier = PROMOTION_SKILL_TIERS.find(t => qp <= t.maxQualityPoint) || PROMOTION_SKILL_TIERS[PROMOTION_SKILL_TIERS.length - 1];
  return tier.skills[Math.floor(Math.random() * tier.skills.length)];
}

// 成牛（母牛・オス成牛）の売却額（指示書_成牛（母牛・オス成牛）の売却申込み実装.md対応）
// 年齢が上がるほど基本額が下がり、9歳以降は下げ止まる。3歳未満は3歳と同じ扱い
const ADULT_SALE_BASE_MAX = 500000;   // 3歳（またはそれ以下）の基本額
const ADULT_SALE_BASE_MIN = 300000;   // 9歳以降の下げ止まり額
const ADULT_SALE_AGE_STEP = 33334;    // 1歳ごとの下落額
const ADULT_SALE_QUALITY_RATE = 1000; // qualityPoint 1ptあたりの上乗せ額
const BULL_SALE_MULTIPLIER = 1.1;     // オス成牛の体格ボーナス
function calcAdultCowSalePrice(ageInYears, qualityPoint, cowType) {
  const clampedAge = Math.max(3, ageInYears || 0); // 3歳未満は3歳扱い
  const ageBase = Math.max(
    ADULT_SALE_BASE_MIN,
    ADULT_SALE_BASE_MAX - (clampedAge - 3) * ADULT_SALE_AGE_STEP
  );
  const price = ageBase + (qualityPoint || 0) * ADULT_SALE_QUALITY_RATE;
  return cowType === 'bull' ? Math.round(price * BULL_SALE_MULTIPLIER) : Math.round(price);
}

// 頭数超過による強制売却は上記の売却式とは別物で、子牛売却式の1割引きを使う（指示書の指定通り据え置き）
const FORCED_SALE_DISCOUNT = 0.9;
function calcForcedAdultSalePrice(qualityPoint, gender) {
  return Math.round(calcCalfSalePrice(qualityPoint, gender) * FORCED_SALE_DISCOUNT);
}

// 子牛売買（ドナドナ）の売値計算（指示書_子牛売買申込み（オスメス両対応・ドナドナ演出）実装.md対応）
// 下振れなし。計算式通りの金額が最低保証で、そこから0〜8%上乗せされる。数値調整用に1箇所にまとめる
const CALF_SALE_BASE_MALE = 400000;    // オス基本額
const CALF_SALE_BASE_FEMALE = 300000;  // メス基本額（オスより10万円安い）
const CALF_SALE_RATE = 4000;           // qualityPoint 1ptあたりの上乗せ額
const CALF_SALE_BONUS_MAX = 0.08;      // 上振れの最大率（0〜8%、下振れなし）
function calcCalfSalePrice(qualityPoint, gender) {
  const base = (gender === 'male' ? CALF_SALE_BASE_MALE : CALF_SALE_BASE_FEMALE)
    + (qualityPoint || 0) * CALF_SALE_RATE;
  const bonusRate = Math.random() * CALF_SALE_BONUS_MAX;
  return Math.round(base * (1 + bonusRate));
}

// 育成飼料1回あたりの品質ポイント増加量（指示書_子牛の育成飼料による品質ポイント加算実装.md対応）
// サイロ建設前は+1、建設後(buildings.silo === true)は+2（サイロ建設処理自体は別フェーズ）
function getCalfFeedGain(buildings) {
  return buildings && buildings.silo ? 2 : 1;
}

// 日齢 → 年齢[歳]（1年=24日換算。売却額の算出や市場の表示で使う）
function cowAgeInYears(ageDays) {
  return Math.floor((ageDays || 0) / 24);
}

// 成牛の年齢表示（口頭指示対応）：12ヶ月未満は「〇ヶ月」、12ヶ月以上は「〇才〇ヶ月」
// ゲーム内は1年=24日=12ヶ月換算（月齢 = 日齢 ÷ 2）
function formatCowAge(ageDays) {
  const months = Math.floor((ageDays || 0) * 0.5);
  if (months < 12) return months + t('barn_months_suffix');
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return restMonths === 0
    ? years + t('barn_years_suffix')
    : years + t('barn_years_suffix') + restMonths + t('barn_months_suffix');
}

// 子牛の成長ステージ（指示書_子牛の成長ステージと特殊ルール実装.md対応）
function getCalfStage(age) {
  if (age < 4) return 'nursing';   // 哺乳期（生まれたて〜2ヶ月）
  if (age < 8) return 'weaning';   // 離乳移行期（2〜4ヶ月）
  return 'growing';                 // 育成期（4ヶ月〜）
}

// ラップ藁は草ポイント単位で保持する（5pt = 1日分）
const WRAP_WARA_PT_PER_DAY = 5;

// 良いランダムイベント（指示書_良いランダムイベント（人形芝居演出）実装.md対応）
// 病気と対になるポジティブイベント。牧場全体で1日1回判定する（牛ごとではない）
const GOOD_EVENT_RATE = 0.05;        // 1日あたりの発生確率
const GOOD_EVENT_FORCE_DAY = 3;      // この日は確率判定を無視して必ず発生させる（動作確認用）
const GOOD_EVENT_QUALITY_GAIN = 4;   // 親子じゃれ合い：母牛のqualityPointに加算
const GOOD_EVENT_MONEY_MIN = 50;     // お金拾い：加算額の下限
const GOOD_EVENT_MONEY_MAX = 150;    // 同・上限
const GOOD_EVENT_WARA_DAYS = 2;      // 藁ラップもらい：加算する日数

// 病気（指示書_病気システム本体の実装.md対応）。フラグは既存のcow.diseaseAlertを流用する
const ILLNESS_START_DAY = 7;          // この日以降のみ発症判定を行う（day7チュートリアルより前に発症させない）
const ILLNESS_ONSET_RATE = 0.05;      // 対象の母牛1頭あたりの1日の発症確率
const ILLNESS_CONDITION_PENALTY = 1;  // 発症中に毎日下がる体調（下限1。品質へは体調経由で間接的に効く）
const ILLNESS_TREATMENT_COST = 200;   // 街の獣医での治療費

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

// 体調ベースの品質ポイント日次加算（指示書_母牛の品質ポイント（体調ベースの日々加算）実装.md対応）
// 体調6(普通)を基準に、差分をそのままqualityPointへ加減算する。プレイして調整する前提の係数なのでここにまとめる
const CONDITION_QUALITY_BASELINE = 6; // この体調を基準にする
const CONDITION_QUALITY_RATE = 1;     // 差分に掛ける係数
function getConditionQualityDelta(condition) {
  return (condition - CONDITION_QUALITY_BASELINE) * CONDITION_QUALITY_RATE;
}

// 品質(優良可)はレベル制ではなくスコープ制：qualityPointの累計から都度算出する（口頭指示対応）
// 各ティアの累計到達点（劣→可30/可→良50/良→優80。表の数値をそのまま累計の区切りとして使う）
// qualityPointが下がればティアも下がる（一度上がったら固定、という挙動は廃止）
const QUALITY_TIER_THRESHOLDS = [0, 30, 50, 80];
function getQualityTier(qualityPoint) {
  const p = qualityPoint || 0;
  for (let tier = QUALITY_TIER_THRESHOLDS.length; tier >= 1; tier--) {
    if (p >= QUALITY_TIER_THRESHOLDS[tier - 1]) return tier;
  }
  return 1;
}

// 品質（1-4）→ 表示ラベルのt()キー（実際の文字列はja.json経由で取得する）
function qualityToLabelKey(quality) {
  if (quality >= 4) return 'quality_label_yu';
  if (quality === 3) return 'quality_label_ryo';
  if (quality === 2) return 'quality_label_ka';
  return 'quality_label_retsu';
}

// qualityPointの累計から直接ラベルキーを引く（呼び出し側の主な入口）
function qualityPointToLabelKey(qualityPoint) {
  return qualityToLabelKey(getQualityTier(qualityPoint));
}

// スキルキー→ 絵文字とt()キーの対応（cow.skillの値と一致させること）
const SKILL_DISPLAY = {
  herdboys_eye: { emoji: '👦', nameKey: 'skill_name_herdboys_eye' },
  trace:        { emoji: '🐾', nameKey: 'skill_name_trace' },
  roku:         { emoji: '🔮', nameKey: 'skill_name_roku' },
  takeuchi:     { emoji: '🎯', nameKey: 'skill_name_takeuchi' },
  hatarakimono: { emoji: '💪', nameKey: 'skill_name_hatarakimono' },
  okanemochi:   { emoji: '💰', nameKey: 'skill_name_okanemochi' },
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
