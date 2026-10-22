# slides

Marp で論文紹介や技術発表のスライドを書くリポジトリです。Markdown・テーマ CSS・画像を管理し、PDF は手元で生成します。執筆には Codex / Claude Code も使えます。

## セットアップ

[mise](https://mise.jdx.dev/getting-started.html) と Google Chrome を用意し、リポジトリのルートで実行します。

```sh
mise trust
mise install
```

`ly` テーマの LINE Seed JP は同梱済みで、フォントのインストールや取得用のネット接続は不要です。

## プレビュー

`mise run preview`

ブラウザで <http://localhost:8080/slides/example/slides.md> を開きます。Markdown を保存すると表示が更新され、`Ctrl+C` でサーバーを終了します。

## PDF 出力

`mise run pdf`

`slides/` 内の全資料を変換し、`dist/<発表名>/slides.pdf` に出力します。

## ドキュメント

- [執筆ガイド](docs/authoring.md): 資料の追加、見出し・引用・情報分類、表紙・自己紹介、VS Code のプレビュー
- [テーマガイド](docs/theme.md): `ly` のレイアウト、共通変数・デバッグ枠、テーマの追加
- [レイアウト検査](docs/check-layout.md): 実行方法、出力ファイル、検査条件・閾値・限界
- [CI](docs/ci.md): ワークフロー、公開前検査、必須チェックの設定

Codex / Claude Code の執筆ルールは [AGENTS.md](AGENTS.md) にあります。`CLAUDE.md` は同じファイルへのシンボリックリンクです。
