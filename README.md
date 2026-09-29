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
header: Public
size: 16:9
lang: ja
_class: lead
paginate: true
---

# 発表タイトル

---

## Why

スライドも markdown で書きたい…。
```

サンプルには通常ページのほか、`title-slide-big`、`content-slide-gray`、`takahashi` の使用例があります。`_class` はそのページだけに適用します。

### 公開区分を表示する

`ly` テーマでは、Markdown 冒頭の `header` が全ページ右上のラベルになります。

| 表示     | 指定                        |
| -------- | --------------------------- |
| 公開用   | `header: Public`            |
| 社内向け | `header: Internal Use Only` |
| 表示なし | `header` の行を省略         |

背景 SVG の編集は不要です。

## テーマを追加する

`themes/<テーマ名>.css` を作り、先頭に `/* @theme <テーマ名> */` を記載します。`.marprc.yml` が `themes/` を読み込むので、資料の `theme` を変えるだけで選択できます。

VS Code でも使うテーマは、`.vscode/settings.json` の `markdown.marp.themes` に `./themes/<テーマ名>.css` を追加します。

テーマの背景画像は `themes/assets/<テーマ名>/` に置きます。CSS の画像パスは Markdown の位置を基準に解決されるため、`../../themes/assets/<テーマ名>/background.svg` のように指定します。資料は `slides/<発表名>/slides.md` の階層に揃えてください。

`ly` は利用者提供の非公式テーマを元にしています。LINE ヤフーの公式テンプレートではありません。

Codex と Claude Code の執筆ルールは [AGENTS.md](AGENTS.md) にまとめています。`CLAUDE.md` は同じファイルへのシンボリックリンクです。
