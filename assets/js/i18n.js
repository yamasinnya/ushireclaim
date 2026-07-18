// 文字列辞書ローダー（ja.jsonのみ。英語版は将来対応）
let _dict = {};

async function loadDict() {
  try {
    const res = await fetch('assets/i18n/ja.json');
    _dict = await res.json();
  } catch (e) {
    _dict = {};
  }
  return _dict;
}

function t(key) {
  return _dict[key] || key;
}
