# book-viewer

ローカルの画像ファイルを見開きで読める、ブラウザベースの本ビューアです。
サーバー不要。画像データはブラウザの IndexedDB に保存されます。

**公開URL:** https://chokotia.github.io/book-viewer/

## 動作環境

**Chrome のみ**（File System Access API を使用）

## 使い方

1. 上の URL（または `index.html`）を Chrome で開く
2. **「+ 本を追加」** をクリックし、本のフォルダを選択
3. ライブラリに表示された本をクリックして読む

本のデータは [Google Drive](https://drive.google.com/drive/folders/1Xe8XW0GxWAopfZfZrnfgWGCjkyITel2V) に置いてあります。

## データ形式

本ごとにフォルダを用意し、以下の構成にする。

```
book-title/
├── book.json
├── 001.png
├── 002.png
└── ...
```

### book.json

```json
{
  "id": "my-book-001",
  "title": "本のタイトル",
  "direction": "rtl",
  "blankFirstPage": false,
  "padding": 0
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `id` | ✓ | 本を一意に識別する文字列 |
| `title` | ✓ | 表示タイトル |
| `direction` | ✓ | `"rtl"`（右→左、日本語漫画）または `"ltr"`（左→右） |
| `blankFirstPage` | | `true` にすると1ページ目を空白として扱い、2ページ目から見開きを組む（デフォルト: `false`） |
| `padding` | | 各画像の余白(px)（デフォルト: `0`） |

### 画像ファイル

- 対応形式: `.png` / `.jpg` / `.jpeg`
- ファイル名の先頭数字で並び順を決定（例: `001.png`, `002.png`, ...）
- 数字がない場合はアルファベット順

## キーボード操作

| キー | 動作 |
|---|---|
| `←` / `→` | 見開き移動（読み進める方向は direction に従う） |
| `Ctrl+G` | ページジャンプ |
| `Ctrl+←` / `Ctrl+→` | ジャンプ履歴を前後に移動 |
| `Escape` | ダイアログを閉じる |
| `?` | キー操作ヘルプを表示 |
