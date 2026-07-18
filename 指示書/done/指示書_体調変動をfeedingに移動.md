# 指示書：体調変動の表示をfeeding.htmlに移動

## これは何の作業か

現在 upkeep.html に実装されている「体調変動の計算・表示」を feeding.html に移す。

「草を集める → 牛に食べさせる（feeding.gif） → 体調が変わる」という流れの方が自然なため。
upkeep.html は「今日のイベント（発情・難産・特になし）」に専念させる。

---

## feeding.html に追加する処理

feeding.html のタップ/ボタンで「次へ」に進む前に、以下を実行する：

1. upkeep.html から体調変動の計算ロジックをそのまま移植する
   - grassStock / cows.length で1頭あたりポイントを算出
   - 3pt以下 → 体調-1 / 4〜8pt → 維持 / 9pt以上 → 体調+1（1〜10でクランプ）
   - 処理後 grassStock を 0 にリセット
   - セーブに反映する（saveState）

2. 体調変動があった場合、feeding.gif の下（または上）にテキストを表示する
   - `t("condition_up")` / `t("condition_down")` を使う（既存キーをそのまま流用）
   - 変動がない場合は何も表示しない

---

## upkeep.html から削除する処理

- 体調変動の計算ロジック（grassStock の参照・計算・クランプ）
- 体調変動テキストの表示（condition_up / condition_down の参照）
- grassStock のリセット処理

upkeep.html に残すのは「発情／難産／特になし」のイベント判定・表示のみ。

---

## 触らないこと

- 体調変動の計算式・クランプ範囲（変更しない）
- t() のキー名（condition_up / condition_down はそのまま流用）
- feeding.gif の表示タイミング・見た目
- 画面遷移の順序（feeding.html → date_change.html → mana_gain.html → upkeep.html → home.html は変えない）

---

## 確認してほしいこと（実装後に報告）

- feeding.html で体調変動テキストが表示されること
- upkeep.html から体調関連コードが除去されていること
- 1周プレイして feeding.html にテキストが出ること（変動がない日は何も出ないことも確認）
