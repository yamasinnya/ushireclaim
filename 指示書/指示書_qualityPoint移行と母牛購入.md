# 指示書：qualityPoint移行・母牛購入・多頭対応（統合）

## これは何の作業か

以下を一括で実装する。関連ファイルを横断して修正するため、まとめて対応すること。

1. `state.qualityPoint`（全頭共通）→ `cow.qualityPoint`（牛ごと）への移行
2. 草ポイントの案分（多頭対応）
3. 牛舎の多頭表示対応確認
4. 競り市場で母牛を購入できるようにする

---

## ①qualityPointの移行

### common.jsの変更

`LOOP_DEFAULT_STATE`から`qualityPoint`を削除し、牛オブジェクト側に移す。

```js
// 変更前
{
  version: 1,
  qualityPoint: 0,   // ← 削除
  cows: [{ ... }]
}

// 変更後
{
  version: 1,
  cows: [{
    qualityPoint: 0,  // ← 牛ごとに持つ
    ...
  }]
}
```

### マイグレーション処理

旧セーブデータに`state.qualityPoint`が残っている場合：
- `state.cows[0].qualityPoint`に移して`state.qualityPoint`を削除する
- 2頭目以降は`qualityPoint: 0`で初期化

```js
// loadLoopState内に追加
if (typeof state.qualityPoint === 'number') {
  if (state.cows.length > 0) {
    state.cows[0].qualityPoint = state.qualityPoint;
  }
  delete state.qualityPoint;
  saveState(state);
}
```

### 関連ファイルの修正

`state.qualityPoint`を参照している全箇所を`cow.qualityPoint`に変更する。
対象ファイル：feeding.html・upkeep.html・barn.js（または barn.html）・その他ヒットした全ファイル。

grepで`qualityPoint`を検索して全件修正すること。

---

## ②草ポイントの案分（多頭対応）

feeding.htmlの体調変動計算を、全頭均等案分に変更する。

### 現状の処理イメージ
```
grassPerCow = state.grassStock / cows.length
各牛に同じgrassPerCowを適用
```

この「均等案分」の考え方は維持する。
ただし`cow.qualityPoint`が牛ごとになったため、品質ポイントの加算先も各牛に変更する。

### 薬草（レア）の品質ポイント加算

現状`state.qualityPoint += 5`になっているはずなので、これを以下に変更：

```js
// 薬草ペア成立時の処理（explore.html）
// 変更前：state.qualityPoint += 5
// 変更後：全頭に均等加算（または先頭牛のみ？）
```

**薬草の品質ポイント加算先について確認が必要**。
草と同様に全頭均等案分にするか、それとも先頭牛のみに加算するかを判断してから実装すること。
判断できない場合は実装を止めてやましさんに確認すること。

---

## ③競り市場：母牛購入機能

### 固定ラインナップ（1頭のみ）

street.htmlの競り市場シートに、以下の固定母牛を購入できるUIを追加する。

```js
const MARKET_COW = {
  skill: 'herdboys_eye',   // 牧童の目
  ageDays: 72,             // 3年（24日×3）
  seed: null,              // 購入時にMath.random()で生成
  condition: 6,
  quality: 2,              // 可
  qualityPoint: 0,
  type: 'mother',
  gender: 'female',
  pregnantDay: 0,
  poopCount: 0,
  diseaseAlert: false,
  price: 100,              // 100G
};
```

### 購入UIの表示

競り市場シートに以下を追加：

```
────────────────────────
母牛を購入する

🐄 メス・3歳・体調6・品質可
   スキル：👦 牧童の目
   
   100G

[購入する]（所持金不足でグレーアウト）
────────────────────────
```

### 購入フロー

1. 「購入する」ボタンをタップ
2. 命名モーダルを表示（`naming.js`の`validateCowName(name, 'female')`を使用）
3. 名前を入力・確定
4. 所持金から100G減算
5. 以下のデータで`state.cows`に追加：

```js
{
  id: 'cow_' + Date.now(),   // ユニークID
  name: /* 入力した名前 */,
  seed: Math.floor(Math.random() * 99999) + 1,
  ...MARKET_COW（price以外の全フィールド）
}
```

6. セーブして「購入しました」メッセージを表示

### 購入上限

`state.cows.filter(c => c.type === 'mother').length >= 3`の場合は
「牛房がいっぱいです」と表示してボタンをグレーアウトする。

---

## ④牛舎の多頭対応確認

barn.htmlの`COW_SLOTS`は6頭分用意済みのはず。
2頭目追加後に以下を確認すること（修正が必要な場合は対応する）：

- 2頭目がCOW_SLOTSの2番目のスロット（s1）に正しく表示される
- 各牛のタップで詳細シートが開き、それぞれの`cow.qualityPoint`が表示される
- 💩は各牛個別に管理されている（`cow.poopCount`）

---

## 触らないこと

- 草ポイントの閾値（3以下/4〜8/9以上）
- 品質ポイントの閾値（劣→可30/可→良50/良→優80）
- 💩のペナルティ（-5pt/日）
- スキルのロジック本体

---

## 完成の目安

1. `state.qualityPoint`への参照が全ファイルからなくなっている
2. 旧セーブで起動しても正常にマイグレーションされる
3. 競り市場で母牛を100Gで購入できる
4. 購入した2頭目が牛舎に表示される
5. ふうかと2頭目それぞれのqualityPointが独立して動く（feeding後に確認）

---

## 確認してほしいこと（実装後に報告）

- 薬草の品質ポイント加算先をどう判断したか
- qualityPointのgrepヒット数と修正箇所一覧
- 2頭目購入後の牛舎表示のスクショかログ
- 不明点は実装を止めてやましさんに確認すること
