# Issue 002: book.json に本の ID フィールドを追加する

## 概要

現在、本の ID はフォルダ名から自動生成されている。
`book.json` に明示的な `id` フィールドを持たせることで、フォルダ名に依存しない安定した識別子を実現したい。

## 背景・動機

以前の実装では、フォルダ選択時にフォルダ名をそのまま ID として使用していた。

```js
const bookId = dirHandle.name;
```

この方式には以下の問題があった。

- フォルダ名を変更すると ID が変わり、IndexedDB の既存データと一致しなくなる
- 異なる端末・環境間でフォルダ名が異なると、同じ本でも別エントリとして登録される
- URL のクエリパラメータ（`?book=`）に使われるため、フォルダ名が URL に露出する

## 変更内容

`book.json` に必須の `id` フィールドを追加した。

### book.json の変更例

```json
{
  "id": "my-book-001",
  "title": "本のタイトル",
  "direction": "rtl",
  "blankFirstPage": false,
  "padding": 0
}
```

### フィールド仕様

| フィールド | 必須 | 説明 |
|---|---|---|
| `id` | ✓ | 本を一意に識別する文字列 |

### 動作方針

1. `book.json` の `id` フィールド（必須）を `bookId` として使用する
2. `id` フィールドがない、または空文字の場合はエラーを表示して登録を中止する

### 変更ファイル

- `viewer.js`（`id` フィールドのバリデーションと読み取りロジックを追加）
- `README.md`（`book.json` のフィールド一覧に `id` を追記）

### 差分（viewer.js）

```js
// 変更前
const bookId = dirHandle.name;

// 変更後
if (!meta.id || typeof meta.id !== 'string' || meta.id.trim() === '') {
  showError('book.json に "id" フィールド（文字列）が必要です。');
  return;
}
const bookId = meta.id.trim();
```

## 確認方法

1. `book.json` に `"id": "custom-id"` を追加してフォルダを登録 → IndexedDB に `custom-id` で保存されること
2. `book.json` に `id` フィールドを持たないフォルダを登録 → エラーが表示されて登録されないこと
3. フォルダ名を変更して再登録しても、`id` が同じであれば重複エラーが出ること
