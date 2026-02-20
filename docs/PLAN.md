# Plan: Kindle Image Viewer (book-viewer)

---

## 目次

1. [概要](#1-概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [画面構成](#3-画面構成)
   - 3.1 [2ビュー方式の採用理由](#31-2ビュー方式の採用理由)
   - 3.2 [画面遷移](#32-画面遷移)
4. [UIモックアップ](#4-uiモックアップ)
   - 4.A [ライブラリビュー（本一覧）](#4a-ライブラリビュー本一覧)
   - 4.B [リーダービュー（見開き、RTL）](#4b-リーダービュー見開きrtl)
   - 4.C [リーダービュー（見開き、LTR）](#4c-リーダービュー見開きltr)
   - 4.D [Ctrl+G ジャンプダイアログ](#4d-ctrlg-ジャンプダイアログ)
   - 4.E [モバイル（対応外）](#4e-モバイル対応外)
5. [ファイル構成](#5-ファイル構成)
6. [アップロードフォルダ構造](#6-アップロードフォルダ構造)
   - 6.1 [book.json フォーマット](#61-bookjson-フォーマット)
7. [キーボード操作一覧](#7-キーボード操作一覧)
8. [実装ステップ](#8-実装ステップ)
   - 8.1 [Step 1: index.html — ビューアUI](#81-step-1-indexhtml--ビューアui)
   - 8.2 [Step 2: style.css — レイアウト](#82-step-2-stylecss--レイアウト)
   - 8.3 [Step 3: viewer.js — ロジック](#83-step-3-viewerjs--ロジック)
   - 8.4 [Step 4: sample/book.json — アップロードテンプレート](#84-step-4-samplebookjson--アップロードテンプレート)
9. [URL仕様](#9-url仕様)
10. [検証方法](#10-検証方法)
11. [備考](#11-備考)

---

## 1. 概要

Kindleでスクリーンショットとしてローカルに保存した書籍画像（400枚程度、1枚500KB前後）を、見開き2ページ形式で快適に閲覧するWebビューアを作成する。

- **著作権上、画像はローカル完結**（ブラウザの IndexedDB に保存、外部送信なし）
- **GitHub Pages でホスティング**（`https://chokotia.github.io/book-viewer/`）
- 初回のみ画像フォルダをアップロード → IndexedDB に保存 → 以降はオフラインでも閲覧可能
- 外部アプリ・メモ等から `https://chokotia.github.io/book-viewer/?book=book001&page=42` 形式のURLで特定ページを直接開ける

---

## 2. アーキテクチャ

```
GitHub Pages (静的ホスティング)
  index.html / viewer.js / style.css
       ↕
  ブラウザの IndexedDB（画像・メタデータを永続保存）
  ├── books store: { id, title, totalPages, direction, blankFirstPage, padding }
  └── images store: { key: "book001/001", blob: Blob }
```

**画像フロー:**
1. ユーザーが本1冊分のローカルフォルダを選択（フォルダピッカー）
2. JS が `book.json` と全画像を読み取り IndexedDB に保存
3. 以降はブラウザを開くだけで閲覧可能（画像はブラウザ外に出ない）

**IndexedDB の消去タイミング:**
ブラウザの「閲覧データを削除」→「Cookie とサイトデータ」にチェックしたときのみ。
タブ・ブラウザ・PC の再起動では消えない。

---

## 3. 画面構成

### 3.1 2ビュー方式の採用理由

| 観点 | 2ビュー方式 | 折りたたみサイドバー |
|---|---|---|
| 読書時の没入感 | ◎ ページ全面 | △ 端に残骸が残る |
| 実装の複雑さ | ◎ bodyクラスの切替のみ | △ アニメーション・ホバー状態管理 |
| 本の追加導線 | ○ ライブラリ画面にボタン | ○ サイドバーにボタン |

**理由:** 読書とライブラリ管理は「連続しない別タスク」。サイドバーは「同時に使う」場面向け（IDEのファイルエクスプローラー等）。読書中は本のフォルダ管理は不要なので、ビューを完全分離して没入感を最大化する。

### 3.2 画面遷移

```
[ライブラリビュー] --（本カードをクリック）--> [リーダービュー]
[リーダービュー]   --（← ライブラリ ボタン）--> [ライブラリビュー]
[リーダービュー]   --（Ctrl+G）--------------> [ジャンプダイアログ（オーバーレイ）]
```

---

## 4. UIモックアップ

### 4.A ライブラリビュー（本一覧）

```
+------------------------------------------------------------------+
|  Book Viewer                              [+ 本を追加]           |
+------------------------------------------------------------------+
|                                                                  |
|   +----------+  +----------+  +----------+  +----------+        |
|   |[✕]       |  |[✕]       |  |[✕]       |  |          |        |
|   |  [表紙]  |  |  [表紙]  |  |  [表紙]  |  | [DEMO]   |        |
|   |          |  |          |  |          |  |          |        |
|   +----------+  +----------+  +----------+  +----------+        |
|   あの本         Sample Book   Another Book   Demo Book          |
|   320 ページ     200 ページ    150 ページ    （お試し）          |
|                                                                  |
+------------------------------------------------------------------+
```

- ダーク背景 (#1a1a1a)
- 右上の `[+ 本を追加]` がアップロード起点（1回の操作＝1冊のフォルダを選択）
- カードクリック → リーダービューへ遷移
- `[✕]` ボタン → 削除確認ダイアログ → IndexedDB から本と画像を削除
- デモカードは削除不可。**常にリスト末尾に表示**（Canvas生成のプレースホルダー画像、10ページ）
- 本が多い場合はグリッドが縦スクロールで延びる

---

### 4.B リーダービュー（見開き、RTL）

```
+------------------------------------------------------------------+
|  [← ライブラリ]  あの本       p.47-48 / 320    [◀ 2/3 ▶]      |
+------------------------------------------------------------------+
|                                                                  |
|         +--------------------+--------------------+             |
|         |                    |                    |             |
|         |   右ページ          |   左ページ          |             |
|         |   (048.png)        |   (047.png)        |             |
|         |                    |                    |             |
|         |                    |                    |             |
|         +--------------------+--------------------+             |
|                                                                  |
|                [<< 前へ]           [次へ >>]                     |
+------------------------------------------------------------------+
```

- `[← ライブラリ]`: ライブラリへ戻る
- `[◀ 2/3 ▶]`: ジャンプ履歴ナビゲーター（スタック2件以上のときのみ表示）
  - `◀` クリックまたは Ctrl+Left → 履歴を1つ前へ
  - `▶` クリックまたは Ctrl+Right → 履歴を1つ先へ
  - `2/3` = 現在位置 / スタック件数
- RTL: 右ページ=偶数、左ページ=奇数（左右入れ替わり表示）
- ArrowLeft/Right で前後スプレッドへ移動

---

### 4.C リーダービュー（見開き、LTR）

```
+------------------------------------------------------------------+
|  [← ライブラリ]  Sample Western Book    p.21-22 / 200           |
+------------------------------------------------------------------+
|                                                                  |
|         +--------------------+--------------------+             |
|         |                    |                    |             |
|         |   左ページ          |   右ページ          |             |
|         |   (021.png)        |   (022.png)        |             |
|         |                    |                    |             |
|         +--------------------+--------------------+             |
|                                                                  |
|                [<< 前へ]           [次へ >>]                     |
+------------------------------------------------------------------+
```

---

### 4.D Ctrl+G ジャンプダイアログ（リーダー上にオーバーレイ）

```
+------------------------------------------------------------------+
|  [← ライブラリ]  あの本       p.47-48 / 320    [◀ 2/3 ▶]      |
+------------------------------------------------------------------+
|         +------------------+------------------+                 |
|         |        +----------------------------------+           |
|         |        |   ページジャンプ                 |           |
|         |        |                                  |           |
|         |        |  ページ番号 (1〜320):            |           |
|         |        |  +----------------------------+  |           |
|         |        |  |  142                       |  |           |
|         |        |  +----------------------------+  |           |
|         |        |                                  |           |
|         |        |  [キャンセル]      [ジャンプ]   |           |
|         |        +----------------------------------+           |
|         +------------------+------------------+                 |
+------------------------------------------------------------------+
```

- Ctrl+G で開く
- 入力欄にフォーカス自動移動（即タイプ可能）
- Enter → ジャンプ確定、Escape → キャンセル
- 範囲外の値は自動クランプ（1〜totalPages）

---

### 4.E モバイル（対応外）

モバイルデバイス（スマートフォン・タブレット）は対応外とする。
対象環境: デスクトップブラウザ（Chrome / Edge / Safari）のみ。
レスポンシブCSS・タッチ操作は実装しない。

---

## 5. ファイル構成

```
book-viewer/
├── index.html          ← ビューアUI本体
├── viewer.js           ← ページ表示・ナビゲーション・IndexedDB・アップロード処理
├── style.css           ← 見開きレイアウト
├── sample/
│   └── book.json       ← アップロード用テンプレート（フォーマット見本）
└── docs/
    └── PLAN.md
```

**サーバー起動スクリプト（serve.bat）は不要**
GitHub Pages が静的ホスティングを担う。ローカル確認は `python -m http.server 8080` を手動実行。

---

## 6. アップロードフォルダ構造

1回の操作で1冊のフォルダを選択して追加する:

```
book001/               ← このフォルダを選択する
├── book.json          ← この本のメタデータ（必須）
├── 001.png
├── 002.png
└── ...
```

**本のID:** フォルダ名をそのままIDとして使用（例: フォルダ名 `book001` → ID `book001`）。

**対応画像フォーマット:** `.png`, `.jpg`, `.jpeg`（拡張子の大文字小文字不問）。それ以外のファイルは無視する。

**ファイル名規則:** ゼロ埋め連番（例: `001.png`, `002.png`, ..., `010.png`）を推奨。
ソート順: ファイル名から数値部分を抽出して数値順（`1.png`, `2.png`, `10.png` でも正しく並ぶ）。数値が抽出できない場合はアルファベット順にフォールバック。

### 6.1 book.json フォーマット

各本フォルダ内に置く JSON ファイル（1冊＝1ファイル、オブジェクト形式）:

```json
{
  "title": "あの本のタイトル",
  "direction": "rtl",
  "blankFirstPage": false,
  "padding": 16
}
```

フィールド:
- `title`: 本のタイトル（ライブラリ表示名）
- `direction`: `"rtl"` = 右→左（漫画・和書）/ `"ltr"` = 左→右（洋書）
- `blankFirstPage`: `true` のとき1ページ目の前に空白ページを挿入（見開き偶奇調整）。省略時 `false`
- `padding`: 各ページ画像の上下左右の余白（ピクセル）。省略時 `0`

注: `id` はフォルダ名から自動取得、`totalPages` は画像ファイル数から自動取得（JSON への記載不要）。

---

## 7. キーボード操作一覧

| キー / 操作 | 動作 |
|---|---|
| ArrowLeft / ArrowRight | 前/次スプレッドへ（逐次移動） |
| Ctrl+G | ページジャンプダイアログを開く |
| Escape | ダイアログを閉じる（キャンセル） |
| Enter（ダイアログ内） | ジャンプ確定 |
| Ctrl+Left | ジャンプ履歴を1つ前へ |
| Ctrl+Right | ジャンプ履歴を1つ先へ |
| `[◀]` クリック（ヘッダー） | ジャンプ履歴を1つ前へ |
| `[▶]` クリック（ヘッダー） | ジャンプ履歴を1つ先へ |

注: Ctrl+Left/Right はジャンプダイアログが開いているときは無効化する。

---

## 8. 実装ステップ

### 8.1 Step 1: `index.html` — ビューアUI

`body` のクラスで2ビューを切り替える構造:

```html
<body class="view-library">  <!-- または view-reader -->

  <!-- ライブラリビュー -->
  <div id="library-view">
    <header>
      <h1>Book Viewer</h1>
      <button id="btn-add-books">+ 本を追加</button>
    </header>
    <main id="book-grid"><!-- 本カードをJSで挿入 --></main>
    <!-- アップロード進捗 -->
    <div id="upload-progress" class="hidden">
      読み込み中... <span id="progress-current">0</span> / <span id="progress-total">0</span>
    </div>
    <!-- エラー・警告ダイアログ -->
    <div id="upload-error-dialog" class="modal hidden">
      <div class="modal-box">
        <h2>エラー</h2>
        <p id="upload-error-message"></p>
        <button id="btn-error-close">閉じる</button>
      </div>
    </div>
    <!-- 本削除確認ダイアログ -->
    <div id="delete-confirm-dialog" class="modal hidden">
      <div class="modal-box">
        <h2>削除の確認</h2>
        <p id="delete-confirm-message"></p>
        <div class="modal-actions">
          <button id="btn-delete-cancel">キャンセル</button>
          <button id="btn-delete-confirm">削除</button>
        </div>
      </div>
    </div>
    <!-- 上書き確認ダイアログ -->
    <div id="overwrite-confirm-dialog" class="modal hidden">
      <div class="modal-box">
        <h2>上書きの確認</h2>
        <p id="overwrite-confirm-message"></p>
        <div class="modal-actions">
          <button id="btn-overwrite-cancel">キャンセル</button>
          <button id="btn-overwrite-confirm">上書き</button>
        </div>
      </div>
    </div>
  </div>

  <!-- リーダービュー -->
  <div id="reader-view">
    <header>
      <button id="btn-back-library">← ライブラリ</button>
      <span id="reader-title"></span>
      <span id="reader-page-info"></span>
      <div id="jump-history-nav" class="hidden">
        <button id="btn-history-prev">◀</button>
        <span id="jump-history-position"></span>
        <button id="btn-history-next">▶</button>
      </div>
    </header>
    <main id="spread-container">
      <img id="page-left"  alt="left page">
      <img id="page-right" alt="right page">
    </main>
    <footer>
      <button id="btn-prev">&lt;&lt; 前へ</button>
      <button id="btn-next">次へ &gt;&gt;</button>
    </footer>
  </div>

  <!-- Ctrl+G ジャンプダイアログ -->
  <div id="jump-dialog" class="modal hidden">
    <div class="modal-box">
      <h2>ページジャンプ</h2>
      <label>ページ番号 (<span id="jump-range"></span>):
        <input id="jump-input" type="number" min="1">
      </label>
      <div class="modal-actions">
        <button id="btn-jump-cancel">キャンセル</button>
        <button id="btn-jump-confirm">ジャンプ</button>
      </div>
    </div>
  </div>

</body>
```

---

### 8.2 Step 2: `style.css` — レイアウト

- `body.view-library #reader-view { display: none }` / `body.view-reader #library-view { display: none }` でビュー切替
- 背景: ダーク系（`#1a1a1a`）
- ライブラリ: CSS Grid で本カードを並べる。`overflow-y: auto` でスクロール対応
- 見開き: `display: flex` で左右2枚並べ、`max-height: 95vh` で縦に収める
- ページ画像の余白: `padding` は `book.json` の `padding` 値を JS で各 `<img>` の `style.padding` に設定
- 欠けたページスロット（端数の場合）: 暗背景のみ表示（`<img>` 非表示）
- モーダル: `position: fixed`、半透明バックドロップ `rgba(0,0,0,0.7)`
- レスポンシブ対応なし（デスクトップ専用）

---

### 8.3 Step 3: `viewer.js` — ロジック

#### IndexedDB スキーマ

| ストア | キー | 値 |
|---|---|---|
| `books` | `id` | `{ id, title, totalPages, direction, blankFirstPage, padding }` |
| `images` | `"book001/001"` | `{ key, blob }` |

#### 主要機能

1. **デモ本**: Canvas でプレースホルダー画像を生成（実画像ファイル不要、10ページ）。IndexedDB には保存せず、常にメモリ上で生成。リスト末尾に固定表示。
2. **アップロード**:
   - File System Access API (`showDirectoryPicker`) を優先（Chrome/Edge）
   - 非対応ブラウザは `<input webkitdirectory>` にフォールバック
   - 1回の操作で1冊のフォルダを選択する
   - フォルダ内の `book.json` を読み込みメタデータ取得。`id` はフォルダ名から自動設定
   - `totalPages` は実際の画像ファイル数から自動取得（`book.json` への記載不要）
   - 対応フォーマット: `.png`, `.jpg`, `.jpeg`（拡張子の大文字小文字不問）。それ以外は無視
   - ソート順: ファイル名から数値部分を抽出して数値順にソート。数値が抽出できない場合はアルファベット順にフォールバック
   - 進捗表示: `#upload-progress` を表示し、1画像保存するごとにカウントアップ（例: `読み込み中... 142 / 320`）
   - **全画像の保存完了後**に `books` ストアへ登録（途中中断時に壊れたエントリが残らないようにするため）
   - フォルダピッカーでキャンセルした場合は何もせず終了（エラーなし）
3. **ページ表示 (`showSpread(spreadStart)`)**:
   - `direction: "rtl"` → 左右ページを入れ替えて表示
   - `blankFirstPage: true` → 仮想ページ0（空白）を先頭に挿入
   - `padding` 値を各 `<img>` の `style.padding` に適用
   - 欠けたページスロット（最終スプレッドで端数の場合）: 対応する `<img>` を非表示にし空スロットを表示
4. **逐次ナビゲーション**: ArrowLeft/Right キー + ボタン（2ページ進む/戻る）
5. **URL更新**: `history.replaceState` で `?book=xxx&page=N` を維持
6. **ページジャンプ (Ctrl+G)**:
   - ダイアログを開く → ページ番号入力 → スプレッド計算 → ジャンプ
   - ジャンプ前に現在位置をジャンプ履歴に追記
7. **ジャンプ履歴ナビゲーション (Ctrl+Left / Ctrl+Right / ヘッダーボタン)**:
   - Ctrl+G ジャンプのみを追跡（逐次ナビは対象外）
   - 履歴を遡る/進む

#### アップロード時のエラーハンドリング

| ケース | 対応 |
|---|---|
| `book.json` が存在しない | エラーダイアログ表示してアップロード中止 |
| `book.json` のJSON形式不正 | エラーダイアログ（詳細メッセージ付き）、中止 |
| 必須フィールド欠損（`title`, `direction`） | エラーダイアログ、中止 |
| 画像ファイルが0枚 | エラーダイアログ、中止 |
| 同じIDの本がIndexedDBに既存 | 「〇〇 は既に存在します。上書きしますか？」確認ダイアログ |
| ストレージ容量不足 | エラーダイアログ（空き容量確認を促す） |
| フォルダピッカーキャンセル | 何もせず終了（エラーなし） |

#### 本の削除

- ライブラリビューのカード右上 `[✕]` クリック → 削除確認ダイアログ（「〇〇 を削除しますか？この操作は元に戻せません。」）
- 確定後: `books` ストアの該当エントリ削除 + `images` ストアの該当キー（`"bookXXX/*"`）を全削除
- デモ本はIndexedDBに保存しないため削除対象外

#### スプレッド計算

```
blankFirstPage: false → 最初のspread = 1, 以降 3, 5, 7, ...
blankFirstPage: true  → 最初のspread = 0, 以降 2, 4, 6, ...

RTL: leftImg = spreadStart+1, rightImg = spreadStart
LTR: leftImg = spreadStart,   rightImg = spreadStart+1
```

**ページ番号 N からスプレッド開始への正規化:**
```
blankFirstPage: false → spreadStart = N が奇数なら N、偶数なら N-1
blankFirstPage: true  → spreadStart = N が偶数なら N、奇数なら N-1
```

**端数処理（最終スプレッド）:**
```
totalPages が奇数 かつ blankFirstPage:false → 最終スプレッドは片ページのみ
  RTL: rightImg = 最終ページ, leftImg スロットは空白（<img> 非表示）
  LTR: leftImg  = 最終ページ, rightImg スロットは空白（<img> 非表示）
totalPages が偶数 かつ blankFirstPage:true → 同様に最終スプレッドが片ページになる場合あり
```

#### ジャンプ履歴のデータ構造

```js
jumpHistory = {
  stack: number[],  // スプレッド開始インデックスの配列
  cursor: number    // 現在の位置（stackのインデックス）
}
```

**操作フロー例（blankFirstPage: false の場合）:**
```
本を開く (p.1)            → stack=[1],          cursor=0
Ctrl+G → p.142           → stack=[1, 141],      cursor=1
ArrowKey で p.143〜155   → stack 変化なし
Ctrl+G → p.280           → stack=[1, 141, 279], cursor=2
Ctrl+Left                → cursor=1, p.141 へ移動
Ctrl+Left                → cursor=0, p.1 へ移動
Ctrl+G → p.50            → 前方履歴を切り捨て: stack=[1, 49], cursor=1
```

**blankFirstPage: true の場合の初期値:**
```
本を開く (p.1)            → stack=[0],          cursor=0  ← spreadStart は 0（空白ページ分）
```

履歴ナビゲーター `[◀ 2/3 ▶]` はスタックが2件以上のときのみ表示。

---

### 8.4 Step 4: `sample/book.json` — アップロードテンプレート

ユーザーが自分の本フォルダに置く `book.json` のサンプル。

---

## 9. URL仕様

| URL | 動作 |
|---|---|
| `https://chokotia.github.io/book-viewer/` | 本一覧を表示 |
| `https://chokotia.github.io/book-viewer/?book=book001&page=5` | book001 の5ページ目（見開き）を直接表示 |

`page` パラメータは1始まりのページ番号。スプレッド計算により適切な見開きに正規化する。
`page` が範囲外（0以下、totalPages超）の場合は 1〜totalPages にクランプする。
本がIndexedDBに存在しない場合はライブラリビューへリダイレクトする。

---

## 10. 検証方法

1. GitHub Pages にデプロイ → 本一覧（デモカードのみ、末尾に表示）が表示されることを確認
2. デモカードをクリック → Canvas 生成のプレースホルダー画像で見開き表示されることを確認
3. `sample/book.json` を参考にフォルダを作成し「本を追加」→ アップロード進捗が表示され本が追加されることを確認
4. アップロード後にページ移動 → 画像が正しく表示されることを確認
5. `padding` を設定した本で画像に余白が付くことを確認
6. URLに `?book=book001&page=5` を付けてアクセス → 正しい見開きが開くことを確認
7. RTL設定の本でページの左右が反転していることを確認
8. `blankFirstPage: true` の本で最初の見開きが「空白 + 1ページ目」になることを確認
9. ブラウザを閉じて再度開く → IndexedDB の画像が残っていることを確認
10. Ctrl+G でダイアログが開き、ページ番号入力後に Enter でジャンプできることを確認
11. ジャンプダイアログで Escape を押すとキャンセルされることを確認
12. 範囲外のページ番号（例: -5 や 9999）が自動クランプされることを確認
13. Ctrl+G で p.1→p.142→p.280 とジャンプ後、Ctrl+Left 2回で p.1 に戻れることを確認
14. 履歴中間から新たに Ctrl+G ジャンプすると前方履歴が切り捨てられることを確認
15. Ctrl+Left/Right はジャンプダイアログが開いているときに反応しないことを確認
16. 総ページ数が奇数の本で最終スプレッドが片ページ + 空白になることを確認
17. `[✕]` ボタンで本を削除すると一覧から消え、IndexedDB からも削除されることを確認
18. 存在しないbookIDのURLでアクセスするとライブラリビューへリダイレクトされることを確認
19. 同じフォルダ名の本をアップロードすると上書き確認ダイアログが表示されることを確認
20. `book.json` が不正な形式のときエラーダイアログが表示されアップロードが中止されることを確認
21. `[◀]` / `[▶]` ヘッダーボタンのクリックでジャンプ履歴を前後に移動できることを確認
22. フォルダピッカーでキャンセルしたときにエラーが出ないことを確認
23. 本が多い場合にライブラリビューが縦スクロールで表示されることを確認

---

## 11. 備考

- IndexedDB の容量上限: ディスク空き容量の約60%（Cドライブ）。200MBは問題なし
- File System Access API: Chrome/Edge 86+, Safari 15.2+ 対応、Firefox は `webkitdirectory` fallback
- GitHub リポジトリ: `https://github.com/chokotia/book-viewer`
- GitHub Pages URL: `https://chokotia.github.io/book-viewer/`
