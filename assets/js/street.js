// やまやま牧場：街（ショップ）画面ロジック
// 指示書_ショップ枠実装.md（枠のみ）+ 指示書_ラップ藁購入機能.md（コントラクターのみ実処理あり）対応。
// 何でも屋・獣医・建設屋・競り市場の「準備中」ボタンは触らない。

// ラップ藁購入：草ポイント数(pt)として在庫に加算する（日数ではない。1日分=5pt換算）
function buyWrapWara(ptAmount, cost) {
  const state = loadLoopState();
  if (state.money < cost) return false;
  state.money -= cost;
  state.wrapWara = (state.wrapWara || 0) + ptAmount;
  saveLoopState(state);
  return true;
}

const SHOPS = {
  shop_nandemo: {
    nameKey: 'shop_nandemo_name',
    descKey: 'shop_nandemo_desc',
    products: [
      { nameKey: 'product_yukagae_daiko' },
    ],
  },
  shop_juui: {
    nameKey: 'shop_juui_name',
    descKey: 'shop_juui_desc',
    products: [
      // 種付け（指示書_発情・種付け・妊娠システム実装.md対応。発情中の母牛にのみ実行可能）
      { nameKey: 'product_tanetsuke_koukyu', type: 'insemination', grade: 'premium', cost: 20000 },
      { nameKey: 'product_tanetsuke_futsuu', type: 'insemination', grade: 'normal', cost: 5000 },
      { nameKey: 'product_tanetsuke_yasui', type: 'insemination', grade: 'cheap', cost: 1000 },
      // 病気治療（指示書_病気システム本体の実装.md対応。発症中の牛を選んで治療する）
      { nameKey: 'product_byouki_chiryo', type: 'treatment' },
    ],
  },
  shop_contractor: {
    nameKey: 'shop_contractor_name',
    descKey: 'shop_contractor_desc',
    products: [
      { nameKey: 'product_wara_small', buy: { pt: 30, cost: 1200 } },
      { nameKey: 'product_wara_medium', buy: { pt: 60, cost: 2400 } },
      { nameKey: 'product_wara_large', buy: { pt: 120, cost: 4800 } },
    ],
  },
  shop_kensetsu: {
    nameKey: 'shop_kensetsu_name',
    descKey: 'shop_kensetsu_desc',
    products: [
      { nameKey: 'product_mahou_taihisha' },
      { nameKey: 'product_gyusha_kakuchou' },
      { nameKey: 'product_it_catalog', noteKey: 'product_it_catalog_note' },
      // 魔法の水飲み場（指示書_建設屋「魔法の水飲み場」実装.md対応）
      // デバッグ用の100Gから本来の10万Gに戻した（口頭指示対応）
      { nameKey: 'product_magic_water_trough', type: 'building', buildingKey: 'magicWaterTrough', cost: 100000 },
    ],
  },
  shop_seri: {
    nameKey: 'shop_seri_name',
    descKey: 'shop_seri_desc',
    products: [
      // 子牛売買申込み（指示書_子牛売買申込み（オスメス両対応・ドナドナ演出）実装.md対応）
      { nameKey: 'product_seri_shuppin', type: 'calf_sale' },
      // 成牛売却申込み（指示書_成牛（母牛・オス成牛）の売却申込み実装.md対応）
      { nameKey: 'product_seigyuu_baikyaku', type: 'adult_sale' },
      { nameKey: 'product_bogyuu_kounyuu', type: 'market_cow' },
    ],
  },
};

// 競り市場：購入できる母牛の固定ラインナップ（指示書_qualityPoint移行と母牛購入.md対応、1頭のみ）
const MARKET_COW = {
  skill: 'herdboys_eye',   // 牧童の目
  age: 72,                 // 3歳（1年=24日換算）
  condition: 6,
  qualityPoint: 30,        // 品質は保存せずqualityPointの累計から都度算出する（口頭指示：レベル制→スコープ制へ変更）
  price: 400000,           // デバッグ用の100Gから本来の40万Gに戻した（口頭指示対応）
};
// 牛房の空き判定はcommon.jsのADULT_COW_LIMITを参照する（母牛とオス成牛で上段3枠を共用するため）

let currentShopId = null;

// ── 軽トラの説明UI（指示書_街UIの軽トラ説明化＋衰弱演出の土台.md対応） ──
// 他の施設にも同じ部品を展開できるよう、商品定義に手を入れずnameKeyから説明キーを引く形にしている。
// 説明が用意されていない商品は「無言」として成立する（将来、軽トラが語れない項目を足せるように）
let activeInfoBtn = null;

// product_tanetsuke_koukyu -> truck_info_tanetsuke_koukyu
function truckInfoKeyFor(product) {
  return 'truck_info_' + String(product.nameKey || '').replace(/^product_/, '');
}

// 辞書に無いキーはt()がキー名をそのまま返すため、未定義扱いにして無言にする
function lookupTruckText(key) {
  const v = t(key);
  return (!v || v === key) ? '' : v;
}

function showTruckBubble(rawText) {
  const bubble = document.getElementById('shopBubble');
  const line = truckLine(rawText, loadLoopState().day);
  document.getElementById('shopBubbleLabel').textContent = t('truck_bubble_label');
  document.getElementById('shopBubbleText').textContent = line.text;
  bubble.classList.toggle('silent', line.silent);
  bubble.classList.add('show');
  document.getElementById('shopTruck').classList.add('talking');
}

function closeTruckBubble() {
  if (activeInfoBtn) activeInfoBtn.classList.remove('on');
  activeInfoBtn = null;
  document.getElementById('shopBubble').classList.remove('show');
  document.getElementById('shopTruck').classList.remove('talking');
}

// 商品行の先頭に置く「？」ボタン。同じものを再度押すと閉じ、別のものを押すと内容だけ切り替わる
function buildInfoButton(product) {
  const btn = document.createElement('button');
  btn.className = 'info-btn';
  btn.textContent = '?';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeInfoBtn === btn) { closeTruckBubble(); return; }
    if (activeInfoBtn) activeInfoBtn.classList.remove('on');
    activeInfoBtn = btn;
    btn.classList.add('on');
    showTruckBubble(lookupTruckText(truckInfoKeyFor(product)));
  });
  return btn;
}

// [?] [名前 / 価格] [右側の要素] という3列の行を作る共通部品
function buildItemRow(product, priceText, rightEl) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.appendChild(buildInfoButton(product));

  const main = document.createElement('div');
  main.className = 'item-main';
  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = t(product.nameKey);
  main.appendChild(name);
  if (priceText) {
    const price = document.createElement('div');
    price.className = 'item-price';
    price.textContent = priceText;
    main.appendChild(price);
  }
  row.appendChild(main);

  if (rightEl) row.appendChild(rightEl);
  return row;
}

function openShopSheet(shopId) {
  const shop = SHOPS[shopId];
  if (!shop) return;
  currentShopId = shopId;
  document.getElementById('shopName').textContent = t(shop.nameKey);
  document.getElementById('shopDesc').textContent = t(shop.descKey);
  closeTruckBubble();

  const state = loadLoopState();
  const list = document.getElementById('shopProducts');
  list.innerHTML = '';
  shop.products.forEach(p => {
    if (p.type === 'market_cow') {
      list.appendChild(buildMarketCowRow(state, p));
      return;
    }
    if (p.type === 'insemination') {
      list.appendChild(buildInseminationRow(state, p));
      return;
    }
    if (p.type === 'building') {
      list.appendChild(buildBuildingRow(state, p));
      return;
    }
    if (p.type === 'calf_sale') {
      list.appendChild(buildCalfSaleRow(state, p));
      return;
    }
    if (p.type === 'adult_sale') {
      list.appendChild(buildAdultSaleRow(state, p));
      return;
    }
    if (p.type === 'treatment') {
      list.appendChild(buildTreatmentRow(state, p));
      return;
    }

    // 特別な処理を持たない商品（ラップ藁・準備中の品）も同じ[?]付きの行で並べる
    const btn = document.createElement('button');
    let priceText = '';
    if (p.buy) {
      const canAfford = state.money >= p.buy.cost;
      priceText = `${p.buy.cost.toLocaleString()}G`;
      btn.className = canAfford ? 'btn-buy' : 'btn-buy-disabled';
      btn.textContent = canAfford ? t('btn_buy') : t('btn_cant_buy');
      btn.disabled = !canAfford;
      if (canAfford) btn.addEventListener('click', () => handleBuyWara(p));
    } else {
      btn.className = 'btn-coming-soon';
      btn.disabled = true;
      btn.textContent = t('btn_coming_soon');
    }

    list.appendChild(buildItemRow(p, priceText, btn));
    if (p.noteKey) {
      const note = document.createElement('div');
      note.className = 'product-note';
      note.textContent = t(p.noteKey);
      list.appendChild(note);
    }
  });

  document.getElementById('shopSheetOverlay').classList.add('open');

  // 入店時の一言。用意されていない施設では何も出さない（無言のまま成立させる）
  const greeting = pickTruckGreeting(shopId);
  if (greeting) showTruckBubble(greeting);
}

// 施設ごとに1〜2パターン用意しておき、あればランダムに1つ選ぶ
function pickTruckGreeting(shopId) {
  const lines = [1, 2]
    .map(n => lookupTruckText(`truck_enter_${shopId}_${n}`))
    .filter(Boolean);
  if (lines.length === 0) return '';
  return lines[Math.floor(Math.random() * lines.length)];
}

function closeShopSheet() {
  closeTruckBubble();
  document.getElementById('shopSheetOverlay').classList.remove('open');
}

// ── 競り市場：子牛売買申込み（指示書_子牛売買申込み（オスメス両対応・ドナドナ演出）実装.md対応） ──
// 生後17〜20日の未申込み子牛（オスメス問わず）が対象
function buildCalfSaleRow(state, product) {
  const wrap = document.createElement('div');
  const eligible = state.cows.filter(cow => cow.type === 'calf' && !cow.saleApplied && cow.age >= 17 && cow.age <= 20);

  // 見出しは他の商品と同じ[?]付きの行。金額は出さない（申込み＝即入金ではないため）
  let right = null;
  if (eligible.length === 0) {
    right = document.createElement('span');
    right.className = 'item-note';
    right.textContent = t('calf_sale_no_target');
  }
  wrap.appendChild(buildItemRow(product, '', right));
  if (eligible.length === 0) return wrap;

  eligible.forEach(cow => {
    const row = document.createElement('div');
    row.className = 'product-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'product-name';
    const genderIcon = cow.gender === 'female' ? t('calf_gender_female') : t('calf_gender_male');
    nameSpan.textContent = `${genderIcon} ${cow.name}（${t('calf_sale_age_label').replace('{age}', cow.age)}）`;
    row.appendChild(nameSpan);

    const btn = document.createElement('button');
    btn.className = 'btn-buy';
    btn.textContent = t('calf_sale_apply_btn');
    btn.addEventListener('click', () => applyCalfSale(cow.id));
    row.appendChild(btn);

    wrap.appendChild(row);
  });

  return wrap;
}

// ── 獣医：病気治療（指示書_病気システム本体の実装.md対応） ──
// 発症中(diseaseAlert)の牛を一覧表示し、選んで治療すると即座に治癒する
function buildTreatmentRow(state, product) {
  const wrap = document.createElement('div');
  const sick = state.cows.filter(cow => cow.diseaseAlert);

  // 見出しの行は他の商品と同じ形（[?] 名前/価格）。病気の牛がいない時はその旨を右に出す
  let right = null;
  if (sick.length === 0) {
    right = document.createElement('span');
    right.className = 'item-note';
    right.textContent = t('treatment_no_target');
  }
  wrap.appendChild(buildItemRow(product, `${ILLNESS_TREATMENT_COST.toLocaleString()}G`, right));
  if (sick.length === 0) return wrap;

  // 病気の牛は1頭ずつ並べて、それぞれ治療できるようにする
  const canAfford = state.money >= ILLNESS_TREATMENT_COST;
  sick.forEach(cow => {
    const row = document.createElement('div');
    row.className = 'product-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'product-name';
    const genderIcon = cow.gender === 'female' ? t('calf_gender_female') : t('calf_gender_male');
    nameSpan.textContent = `${genderIcon} ${cow.name}`;
    row.appendChild(nameSpan);

    const btn = document.createElement('button');
    btn.className = canAfford ? 'btn-buy' : 'btn-buy-disabled';
    btn.textContent = canAfford ? t('treatment_btn') : t('btn_cant_buy');
    btn.disabled = !canAfford;
    if (canAfford) btn.addEventListener('click', () => applyTreatment(cow.id));
    row.appendChild(btn);

    wrap.appendChild(row);
  });

  return wrap;
}

function applyTreatment(cowId) {
  const state = loadLoopState();
  const cow = state.cows.find(c => c.id === cowId);
  if (!cow || !cow.diseaseAlert) return;
  if (state.money < ILLNESS_TREATMENT_COST) return;

  state.money -= ILLNESS_TREATMENT_COST;
  cow.diseaseAlert = false; // 即座に治癒（牛舎の「!」マークも消える）。下がった体調は戻さない
  saveLoopState(state);

  // 日誌：治療が終わった記録
  addJournalEntry({
    day: state.day, category: 'cure',
    cowId: cow.id, cowName: cow.name,
    text: `${cow.name}、治療を終えて元気を取り戻した。`,
  });

  renderHeader('gameHeader');
  if (currentShopId) openShopSheet(currentShopId); // 所持金・対象リストを再描画
  showShopMessage(t('treatment_done_msg').replace('{name}', cow.name));
}

// ── 競り市場：成牛売却申込み（指示書_成牛（母牛・オス成牛）の売却申込み実装.md対応） ──
// 母牛・オス成牛が対象。妊娠中や発情中でも申込める（口頭指示対応）
function buildAdultSaleRow(state, product) {
  const wrap = document.createElement('div');
  const eligible = state.cows.filter(cow => isAdultCow(cow) && !cow.saleApplied);

  // 見出しは他の商品と同じ[?]付きの行。金額は出さない（申込み＝即入金ではないため）
  let right = null;
  if (eligible.length === 0) {
    right = document.createElement('span');
    right.className = 'item-note';
    right.textContent = t('adult_sale_no_target');
  }
  wrap.appendChild(buildItemRow(product, '', right));
  if (eligible.length === 0) return wrap;

  eligible.forEach(cow => {
    const row = document.createElement('div');
    row.className = 'product-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'product-name';
    // 金額はここでは出さない（申込み＝即入金ではないため、出荷後の演出まで伏せる）
    const genderIcon = cow.gender === 'female' ? t('calf_gender_female') : t('calf_gender_male');
    nameSpan.textContent = `${genderIcon} ${cow.name}（${formatCowAge(cow.age)}）`;
    row.appendChild(nameSpan);

    const btn = document.createElement('button');
    btn.className = 'btn-buy';
    btn.textContent = t('adult_sale_apply_btn');
    btn.addEventListener('click', () => openAdultSaleConfirm(cow));
    row.appendChild(btn);

    wrap.appendChild(row);
  });

  return wrap;
}

// 誤操作防止の確認ダイアログ（取り消せない操作のため必ず挟む）
let pendingAdultSaleCowId = null;
function openAdultSaleConfirm(cow) {
  pendingAdultSaleCowId = cow.id;
  document.getElementById('adultSaleConfirmText').textContent =
    t('adult_sale_confirm').replace('{name}', cow.name);
  document.getElementById('adultSaleConfirmYes').textContent = t('adult_sale_confirm_yes');
  document.getElementById('adultSaleConfirmNo').textContent = t('btn_cancel');
  document.getElementById('adultSaleConfirmOverlay').classList.add('open');
}
function closeAdultSaleConfirm() {
  document.getElementById('adultSaleConfirmOverlay').classList.remove('open');
  pendingAdultSaleCowId = null;
}
function confirmAdultSale() {
  const state = loadLoopState();
  const cow = state.cows.find(c => c.id === pendingAdultSaleCowId);
  if (!cow || cow.saleApplied) { closeAdultSaleConfirm(); return; }
  cow.saleApplied = true;
  cow.saleAppliedDay = state.day;
  saveLoopState(state);

  closeAdultSaleConfirm();
  renderHeader('gameHeader');
  if (currentShopId) openShopSheet(currentShopId); // 対象リストを再描画
  showShopMessage(t('adult_sale_applied_msg').replace('{name}', cow.name));
}

function applyCalfSale(calfId) {
  const state = loadLoopState();
  const cow = state.cows.find(c => c.id === calfId);
  if (!cow || cow.saleApplied) return;
  cow.saleApplied = true; // メスの場合、この時点で母牛への昇格対象から外れる（将来の昇格ロジックがこのフラグを見る想定）
  cow.saleAppliedDay = state.day;
  saveLoopState(state);

  renderHeader('gameHeader');
  if (currentShopId) openShopSheet(currentShopId); // 対象リストを再描画
  showShopMessage(t('calf_sale_applied_msg').replace('{name}', cow.name));
}

function handleBuyWara(product) {
  const ok = buyWrapWara(product.buy.pt, product.buy.cost);
  if (!ok) return;
  renderHeader('gameHeader');
  if (currentShopId) openShopSheet(currentShopId); // 所持金・ボタン状態を再描画
  showShopMessage(t('msg_wara_purchased').replace('{days}', Math.floor(product.buy.pt / 5)));
}

// ── 獣医：種付け（指示書_発情・種付け・妊娠システム実装.md対応） ──
function buildInseminationRow(state, product) {
  const estrusCows = state.cows.filter(c => c.type === 'mother' && c.breedingState === 'estrus');
  const canAfford = state.money >= product.cost;
  const enabled = canAfford && estrusCows.length > 0;

  // 発情中の牛がいない時は、買えない理由が分かるよう文言に出す（価格は常に表示したまま）
  let right;
  if (canAfford && estrusCows.length === 0) {
    right = document.createElement('span');
    right.className = 'item-note';
    right.textContent = t('vet_no_estrus_cow');
  } else {
    right = document.createElement('button');
    right.className = enabled ? 'btn-buy' : 'btn-buy-disabled';
    right.textContent = enabled ? t('btn_buy') : t('btn_cant_buy');
    right.disabled = !enabled;
    if (enabled) {
      right.addEventListener('click', () => {
        // 発情中が1頭ならそのまま適用、2頭以上なら選択させる（口頭指示対応）
        if (estrusCows.length === 1) {
          applyInsemination(estrusCows[0].id, product);
        } else {
          openCowPicker(estrusCows, product);
        }
      });
    }
  }

  return buildItemRow(product, `${product.cost.toLocaleString()}G`, right);
}

function applyInsemination(cowId, product) {
  const state = loadLoopState();
  const cow = state.cows.find(c => c.id === cowId);
  if (!cow || cow.breedingState !== 'estrus') return;
  if (state.money < product.cost) return;

  state.money -= product.cost;
  cow.breedingState = 'inseminated';
  cow.breedingGrade = product.grade;
  cow.inseminatedDay = state.day;
  saveLoopState(state);

  renderHeader('gameHeader');
  if (currentShopId) openShopSheet(currentShopId); // 所持金・発情牛の一覧を再描画
  showShopMessage(t('vet_insemination_done').replace('{name}', cow.name));
}

// 発情中の母牛が複数いる時だけ表示する対象選択リスト
let pendingInseminationProduct = null;
function openCowPicker(cows, product) {
  pendingInseminationProduct = product;
  document.getElementById('cowPickerTitle').textContent = t('vet_pick_cow_title');
  const list = document.getElementById('cowPickerList');
  list.innerHTML = '';
  cows.forEach(cow => {
    const btn = document.createElement('button');
    btn.className = 'naming-confirm-btn';
    btn.style.marginBottom = '8px';
    btn.textContent = cow.name;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      applyInsemination(cow.id, pendingInseminationProduct);
      closeCowPicker();
    });
    list.appendChild(btn);
  });
  document.getElementById('cowPickerCancelBtn').textContent = t('btn_cancel');
  document.getElementById('cowPickerOverlay').classList.add('open');
}
function closeCowPicker() {
  document.getElementById('cowPickerOverlay').classList.remove('open');
  pendingInseminationProduct = null;
}

// ── 建設屋：一度買うと恒久的にbuildings.{buildingKey}=trueになる施設（指示書_建設屋「魔法の水飲み場」実装.md対応） ──
function buildBuildingRow(state, product) {
  const built = !!state.buildings[product.buildingKey];
  const canAfford = state.money >= product.cost;
  const btn = document.createElement('button');
  if (built) {
    btn.className = 'btn-buy-disabled';
    btn.disabled = true;
    btn.textContent = t('building_already_built');
  } else {
    btn.className = canAfford ? 'btn-buy' : 'btn-buy-disabled';
    btn.disabled = !canAfford;
    btn.textContent = canAfford ? t('btn_buy') : t('btn_cant_buy');
    if (canAfford) btn.addEventListener('click', () => handleBuyBuilding(product));
  }

  return buildItemRow(product, `${product.cost.toLocaleString()}G`, btn);
}

function handleBuyBuilding(product) {
  const state = loadLoopState();
  if (state.buildings[product.buildingKey]) return;
  if (state.money < product.cost) return;

  state.money -= product.cost;
  state.buildings[product.buildingKey] = true;
  saveLoopState(state);

  // 日誌：施設が建った記録
  addJournalEntry({
    day: state.day, category: 'build',
    text: `建設屋に頼んで、${t(product.nameKey)}を建てた。`,
  });

  renderHeader('gameHeader');
  if (currentShopId) openShopSheet(currentShopId); // ボタン状態（建設済み）を再描画
  showShopMessage(t('msg_building_purchased').replace('{name}', t(product.nameKey)));
}

// ── 競り市場：母牛購入（指示書_qualityPoint移行と母牛購入.md対応） ──
function buildMarketCowRow(state, product) {
  const wrap = document.createElement('div');

  const isFull = countAdultCows(state.cows) >= ADULT_COW_LIMIT;
  const canAfford = state.money >= MARKET_COW.price;
  const enabled = canAfford && !isFull;

  const btn = document.createElement('button');
  btn.className = enabled ? 'btn-buy' : 'btn-buy-disabled';
  btn.textContent = enabled ? t('btn_buy') : t('btn_cant_buy');
  btn.disabled = !enabled;
  if (enabled) btn.addEventListener('click', () => openMarketNaming());

  // 見出しは他の商品と同じ[?]付きの行。値段もそこに出すので専用の価格表示は持たない
  wrap.appendChild(buildItemRow(product, `${MARKET_COW.price.toLocaleString()}G`, btn));

  // 出品されている牛の中身は行の下に続けて出す
  const detail = document.createElement('div');
  detail.className = 'market-cow-row';
  const skill = SKILL_DISPLAY[MARKET_COW.skill];
  const summary = document.createElement('div');
  summary.className = 'market-cow-summary';
  summary.textContent = `🐄 ${t('market_gender_female')}・${Math.floor(MARKET_COW.age / 24)}${t('market_age_unit')}・${t('barn_condition_label')}${MARKET_COW.condition}・${t(qualityPointToLabelKey(MARKET_COW.qualityPoint))}`;
  const skillLine = document.createElement('div');
  skillLine.className = 'market-cow-skill';
  skillLine.textContent = `${t('market_skill_label')}${skill ? skill.emoji + ' ' + t(skill.nameKey) : ''}`;
  detail.appendChild(summary);
  detail.appendChild(skillLine);

  if (isFull) {
    const note = document.createElement('div');
    note.className = 'product-note';
    note.textContent = t('market_full');
    detail.appendChild(note);
  }
  wrap.appendChild(detail);

  return wrap;
}

function openMarketNaming() {
  const rule = NAMING_RULES.female;
  document.getElementById('marketNamingTitle').textContent = t('naming_title');
  document.getElementById('marketNamingHint').textContent = t(rule.hintKey);
  const input = document.getElementById('marketNamingInput');
  input.placeholder = t(rule.placeholderKey);
  input.value = '';
  document.getElementById('marketNamingError').textContent = '';
  document.getElementById('marketNamingConfirmBtn').textContent = t('naming_confirm_btn');
  document.getElementById('marketNamingConfirmBtn').disabled = true;
  document.getElementById('marketNamingCancelBtn').textContent = t('btn_cancel');
  document.getElementById('marketNamingOverlay').classList.add('open');
  input.focus();
}

function closeMarketNaming() {
  document.getElementById('marketNamingOverlay').classList.remove('open');
}

function checkMarketNamingInput() {
  const input = document.getElementById('marketNamingInput');
  const result = validateCowName(input.value, 'female');
  document.getElementById('marketNamingConfirmBtn').disabled = !result.valid;
  document.getElementById('marketNamingError').textContent = (!result.valid && input.value.length > 0) ? t(result.errorKey) : '';
}

function confirmMarketNaming() {
  const input = document.getElementById('marketNamingInput');
  const result = validateCowName(input.value, 'female');
  if (!result.valid) return;

  const state = loadLoopState();
  if (state.money < MARKET_COW.price || countAdultCows(state.cows) >= ADULT_COW_LIMIT) { closeMarketNaming(); return; }

  state.money -= MARKET_COW.price;
  const newCow = {
    id: 'cow_' + Date.now(),
    name: input.value,
    gender: 'female',
    age: MARKET_COW.age,
    seed: Math.floor(Math.random() * 99999) + 1,
    condition: MARKET_COW.condition,
    qualityPoint: MARKET_COW.qualityPoint,
    lastKnownQualityTier: getQualityTier(MARKET_COW.qualityPoint), // 品質ティア変化通知の前日比較用初期値（口頭指示対応）
    skill: MARKET_COW.skill,
    type: 'mother',
    pregnantDay: 0,
    actualBirthDay: 0,
    breedingState: 'none',
    breedingGrade: null,
    inseminatedDay: 0,
    poopCount: 0,
    diseaseAlert: false,
  };
  state.cows.push(newCow);
  saveLoopState(state);

  // 日誌：買った牛が牧場に来た記録
  addJournalEntry({
    day: state.day, category: 'arrive',
    cowId: newCow.id, cowName: newCow.name,
    text: `競り市場から${newCow.name}を迎え入れた。`,
  });

  closeMarketNaming();
  renderHeader('gameHeader');
  if (currentShopId) openShopSheet(currentShopId); // 所持金・満室状態を再描画
  showShopMessage(t('market_purchased_msg').replace('{name}', newCow.name));
}

let shopMsgTimer = null;
function showShopMessage(text) {
  const el = document.getElementById('shopMsg');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(shopMsgTimer);
  shopMsgTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

document.querySelectorAll('.shop-zone').forEach(el => {
  el.addEventListener('click', () => openShopSheet(el.dataset.shop));
});

document.getElementById('marketNamingInput').addEventListener('input', checkMarketNamingInput);
document.getElementById('marketNamingConfirmBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  confirmMarketNaming();
});
document.getElementById('marketNamingCancelBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeMarketNaming();
});
document.getElementById('marketNamingBox').addEventListener('click', (e) => e.stopPropagation());

document.getElementById('cowPickerCancelBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeCowPicker();
});
document.getElementById('cowPickerBox').addEventListener('click', (e) => e.stopPropagation());

document.getElementById('adultSaleConfirmYes').addEventListener('click', (e) => {
  e.stopPropagation();
  confirmAdultSale();
});
document.getElementById('adultSaleConfirmNo').addEventListener('click', (e) => {
  e.stopPropagation();
  closeAdultSaleConfirm();
});
document.getElementById('adultSaleConfirmBox').addEventListener('click', (e) => e.stopPropagation());

(async function () {
  await loadDict();
  renderHeader('gameHeader');
  document.getElementById('btn-back').textContent = '← ' + t('btn_go_home');
  document.getElementById('btn-back').addEventListener('click', () => { location.href = 'home.html'; });
  document.getElementById('shopCloseBtn').textContent = t('barn_close_btn');

  // 「？」以外の場所をタップしたら吹き出しを閉じる（「？」側はstopPropagationしている）
  document.addEventListener('click', () => { if (activeInfoBtn) closeTruckBubble(); });
})();
