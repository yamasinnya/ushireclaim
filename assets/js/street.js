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
      { nameKey: 'product_tanetsuke_koukyu' },
      { nameKey: 'product_tanetsuke_futsuu' },
      { nameKey: 'product_tanetsuke_yasui' },
      { nameKey: 'product_byouki_chiryo' },
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
    ],
  },
  shop_seri: {
    nameKey: 'shop_seri_name',
    descKey: 'shop_seri_desc',
    products: [
      { nameKey: 'product_seri_shuppin' },
      { nameKey: 'product_bogyuu_kounyuu', type: 'market_cow' },
    ],
  },
};

// 競り市場：購入できる母牛の固定ラインナップ（指示書_qualityPoint移行と母牛購入.md対応、1頭のみ）
const MARKET_COW = {
  skill: 'herdboys_eye',   // 牧童の目
  age: 72,                 // 3歳（1年=24日換算）
  condition: 6,
  quality: 2,              // 可
  price: 100,
};
const MARKET_MOTHER_LIMIT = 3;

let currentShopId = null;

function openShopSheet(shopId) {
  const shop = SHOPS[shopId];
  if (!shop) return;
  currentShopId = shopId;
  document.getElementById('shopName').textContent = t(shop.nameKey);
  document.getElementById('shopDesc').textContent = t(shop.descKey);

  const state = loadLoopState();
  const list = document.getElementById('shopProducts');
  list.innerHTML = '';
  shop.products.forEach(p => {
    if (p.type === 'market_cow') {
      list.appendChild(buildMarketCowRow(state));
      return;
    }

    const row = document.createElement('div');
    row.className = 'product-row';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'product-name';
    nameSpan.textContent = t(p.nameKey);
    row.appendChild(nameSpan);

    if (p.buy) {
      const canAfford = state.money >= p.buy.cost;
      const btn = document.createElement('button');
      btn.className = canAfford ? 'btn-buy' : 'btn-buy-disabled';
      btn.textContent = canAfford ? t('btn_buy') : t('btn_cant_buy');
      btn.disabled = !canAfford;
      if (canAfford) btn.addEventListener('click', () => handleBuyWara(p));
      row.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn-coming-soon';
      btn.disabled = true;
      btn.textContent = t('btn_coming_soon');
      row.appendChild(btn);
    }

    list.appendChild(row);
    if (p.noteKey) {
      const note = document.createElement('div');
      note.className = 'product-note';
      note.textContent = t(p.noteKey);
      list.appendChild(note);
    }
  });

  document.getElementById('shopSheetOverlay').classList.add('open');
}

function closeShopSheet() {
  document.getElementById('shopSheetOverlay').classList.remove('open');
}

function handleBuyWara(product) {
  const ok = buyWrapWara(product.buy.pt, product.buy.cost);
  if (!ok) return;
  renderHeader('gameHeader');
  if (currentShopId) openShopSheet(currentShopId); // 所持金・ボタン状態を再描画
  showShopMessage(t('msg_wara_purchased').replace('{days}', Math.floor(product.buy.pt / 5)));
}

// ── 競り市場：母牛購入（指示書_qualityPoint移行と母牛購入.md対応） ──
function buildMarketCowRow(state) {
  const wrap = document.createElement('div');
  wrap.className = 'market-cow-row';

  const skill = SKILL_DISPLAY[MARKET_COW.skill];
  const summary = document.createElement('div');
  summary.className = 'market-cow-summary';
  summary.textContent = `🐄 ${t('market_gender_female')}・${Math.floor(MARKET_COW.age / 24)}${t('market_age_unit')}・${t('barn_condition_label')}${MARKET_COW.condition}・${t(qualityToLabelKey(MARKET_COW.quality))}`;
  const skillLine = document.createElement('div');
  skillLine.className = 'market-cow-skill';
  skillLine.textContent = `${t('market_skill_label')}${skill ? skill.emoji + ' ' + t(skill.nameKey) : ''}`;
  const price = document.createElement('div');
  price.className = 'market-cow-price';
  price.textContent = MARKET_COW.price + 'G';
  wrap.appendChild(summary);
  wrap.appendChild(skillLine);
  wrap.appendChild(price);

  const motherCount = state.cows.filter(c => c.type === 'mother').length;
  const isFull = motherCount >= MARKET_MOTHER_LIMIT;
  const canAfford = state.money >= MARKET_COW.price;
  const enabled = canAfford && !isFull;

  const btn = document.createElement('button');
  btn.className = enabled ? 'btn-buy' : 'btn-buy-disabled';
  btn.textContent = enabled ? t('btn_buy') : t('btn_cant_buy');
  btn.disabled = !enabled;
  if (enabled) btn.addEventListener('click', () => openMarketNaming());
  wrap.appendChild(btn);

  if (isFull) {
    const note = document.createElement('div');
    note.className = 'product-note';
    note.textContent = t('market_full');
    wrap.appendChild(note);
  }

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
  const motherCount = state.cows.filter(c => c.type === 'mother').length;
  if (state.money < MARKET_COW.price || motherCount >= MARKET_MOTHER_LIMIT) { closeMarketNaming(); return; }

  state.money -= MARKET_COW.price;
  const newCow = {
    id: 'cow_' + Date.now(),
    name: input.value,
    gender: 'female',
    age: MARKET_COW.age,
    seed: Math.floor(Math.random() * 99999) + 1,
    condition: MARKET_COW.condition,
    quality: MARKET_COW.quality,
    qualityPoint: 0,
    skill: MARKET_COW.skill,
    type: 'mother',
    pregnantDay: 0,
    poopCount: 0,
    diseaseAlert: false,
  };
  state.cows.push(newCow);
  saveLoopState(state);

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

(async function () {
  await loadDict();
  renderHeader('gameHeader');
  document.getElementById('btn-back').textContent = '← ' + t('btn_go_home');
  document.getElementById('btn-back').addEventListener('click', () => { location.href = 'home.html'; });
  document.getElementById('shopCloseBtn').textContent = t('barn_close_btn');
})();
