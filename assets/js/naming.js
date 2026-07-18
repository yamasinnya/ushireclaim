// やまやま牧場：命名システム（共通モジュール）
// プロローグの牛命名・将来の子牛命名でも流用する。
// 文字列は直書きせずt()キーを返す（呼び出し側でt()して表示すること）。

const NAMING_RULES = {
  female: {
    pattern: /^[ぁ-ん0-9０-９]+$/,
    maxLength: 8,
    placeholderKey: 'naming_placeholder_female',
    hintKey: 'naming_hint_female',
    invalidCharsErrorKey: 'naming_error_invalid_female',
  },
  male: {
    pattern: /^[一-龯0-9０-９]+$/,
    maxLength: 8,
    placeholderKey: 'naming_placeholder_male',
    hintKey: 'naming_hint_male',
    invalidCharsErrorKey: 'naming_error_invalid_male',
  },
};

function validateCowName(name, gender) {
  const rule = NAMING_RULES[gender];
  if (!name || name.length === 0) return { valid: false, errorKey: 'naming_error_empty' };
  if (name.length > rule.maxLength) return { valid: false, errorKey: 'naming_error_too_long' };
  if (!rule.pattern.test(name)) return { valid: false, errorKey: rule.invalidCharsErrorKey };
  return { valid: true };
}
