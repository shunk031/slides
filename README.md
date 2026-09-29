# slides

Marp で論文紹介や技術発表のスライドを書くリポジトリです。Markdown・テーマ CSS・画像を管理し、PDF は手元で生成します。執筆には Codex / Claude Code も使えます。

## セットアップ

[mise](https://mise.jdx.dev/getting-started.html) と Google Chrome を用意し、リポジトリのルートで実行します。

```sh
mise trust
mise install
```

Node.js と Marp CLI のバージョンは `mise.toml` で管理します。
`ly` テーマは [Google Fonts の LINE Seed JP](https://fonts.google.com/specimen/LINE+Seed+JP) を読み込みます。フォントのインストールは不要ですが、プレビューと PDF 変換にはネット接続が必要です。

## サンプルを表示する

VS Code では推奨拡張の [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode) をインストールし、`slides/example/slides.md` の Markdown プレビューを開きます。`.vscode/settings.json` にローカルの `ly` テーマを登録しています。

ブラウザで確認する場合は、次を実行します。

```sh
mise run preview
```

ブラウザで <http://localhost:8080/slides/example/slides.md> を開きます。Markdown を保存すると表示が更新されます。終了は `Ctrl+C` です。

PDF を生成するには、別のターミナルで次を実行します。

```sh
mise run pdf
```

`slides/` 内の資料をまとめて変換し、サンプルは `dist/example/slides.pdf` に出力します。`dist/` は Git 管理対象外です。

## 資料を追加する

`slides/example/slides.md` を `slides/<発表名>/slides.md` にコピーし、本文を書き換えます。図は同じディレクトリの `assets/` に置き、`![図の説明](assets/figure.png)` のように参照します。

```markdown
---
marp: true
theme: ly
class: classification-public
size: 16:9
lang: ja
footer: © LY Corporation
_class: lead first-slide classification-public
paginate: true
_paginate: false
---

# 発表タイトル

---

## Why

スライドも markdown で書きたい…。
```

サンプルには通常ページのほか、`title-slide-big`、`content-slide-gray`、`takahashi` の使用例があります。`_class` はそのページだけに適用します。

`paginate: true` でページ番号を有効にし、`_paginate: false` で表紙だけ非表示にしています。表紙もページ数に含み、本文の番号は 2 から始まります。

`footer:` で著作権表示を指定します。本文・情報分類ラベル・footer の左余白は、`themes/ly.css` の `--slide-padding` でまとめて調整できます。表紙の情報分類ラベルは右上に置きます。

サンプルの `style:` はレイアウト確認用です。要素を赤い実線、情報分類ラベルとページ番号を青い破線で囲みます。見出し・段落・コードの枠には用途を表示します。枠と用途の表示を消すには、この `style:` ブロックを削除してください。

### 情報分類を表示する

`ly` テーマでは、`class` に指定した情報分類を左上のラベルに表示します。Markdown 冒頭の `_class` に `first-slide` を加えると、1 ページ目だけ右上に表示します。

| 表示              | クラス                      |
| ----------------- | --------------------------- |
| Top Secret        | `classification-top-secret` |
| Secret            | `classification-secret`     |
| Restricted        | `classification-restricted` |
| Internal Use Only | `classification-internal`   |
| Public            | `classification-public`     |
| 表示なし          | 情報分類クラスを指定しない  |

全ページで同じ情報分類を指定します。`_class` は `class` 全体を上書きするため、レイアウトを変えるページにも情報分類を含めます。

```markdown
<!-- _class: title-slide-big classification-public -->
```

`.marprc.cjs` が検証スクリプトを読み込み、Marp CLI での変換時に `classification-` で始まる未知のクラス、複数区分、ページ間の分類変更・指定漏れをエラーにします。全ページで指定しなければ表示なしです。`header` は通常のヘッダーとして使えます。

VS Code 内蔵プレビューではこの検証を実行しないため、仕上げに `mise run pdf` を実行してください。検証スクリプトを変更した場合は `mise run test` で正常・不正な指定のテストを実行します。

## テーマを追加する

`themes/<テーマ名>.css` を作り、先頭に `/* @theme <テーマ名> */` を記載します。`.marprc.cjs` が `themes/` を読み込むので、資料の `theme` を変えるだけで選択できます。

VS Code でも使うテーマは、`.vscode/settings.json` の `markdown.marp.themes` に `./themes/<テーマ名>.css` を追加します。

テーマの背景画像は `themes/assets/<テーマ名>/` に置きます。CSS の画像パスは Markdown の位置を基準に解決されるため、`../../themes/assets/<テーマ名>/background.svg` のように指定します。資料は `slides/<発表名>/slides.md` の階層に揃えてください。

`ly` は利用者提供の非公式テーマを元にしています。LINE ヤフーの公式テンプレートではありません。

Codex と Claude Code の執筆ルールは [AGENTS.md](AGENTS.md) にまとめています。`CLAUDE.md` は同じファイルへのシンボリックリンクです。
