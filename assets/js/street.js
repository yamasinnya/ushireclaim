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
      { nameKey: 'product_bogyuu_kounyuu' },
    ],
  },
};

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

(async function () {
  await loadDict();
  renderHeader('gameHeader');
  document.getElementById('btn-back').textContent = '← ' + t('btn_go_home');
  document.getElementById('btn-back').addEventListener('click', () => { location.href = 'home.html'; });
  document.getElementById('shopCloseBtn').textContent = t('barn_close_btn');
})();
