# slides

Marp で論文紹介や技術発表のスライドを書くリポジトリです。Markdown・テーマ CSS・画像を管理し、PDF は手元で生成します。執筆には Codex / Claude Code も使えます。

- [レイアウトの見本](slides/example/slides.md): `ly` テーマのクラスと Markdown の使用例
- [Beyond Atomic Layouts の論文紹介](slides/2026-10-19-beyond-atomic-layouts/slides.md): 2026 年 10 月 19 日の発表資料

初めて使う場合は、セットアップから PDF 出力まで進めてください。資料やテーマの書き方は後半、検査エラーの条件は [レイアウト検査の仕様](docs/check-layout.md) で確認できます。

## セットアップ

[mise](https://mise.jdx.dev/getting-started.html) と Google Chrome を用意し、リポジトリのルートで実行します。

```sh
mise trust
mise install
```

Node.js と Marp CLI のバージョンは [mise.toml](mise.toml) で管理します。`ly` テーマの LINE Seed JP は同梱済みで、フォントのインストールや取得用のネット接続は不要です。入手元とライセンスは [フォントの README](themes/assets/ly/fonts/README.md) と [OFL.txt](themes/assets/ly/fonts/OFL.txt) にあります。

## プレビューする

```sh
mise run preview
```

ブラウザで <http://localhost:8080/slides/example/slides.md> を開きます。Markdown を保存すると表示が更新され、`Ctrl+C` でサーバーを終了します。

VS Code では推奨拡張の [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode) を入れ、[サンプル](slides/example/slides.md) の Markdown プレビューを開きます。ローカルの `ly` テーマは `.vscode/settings.json` に登録済みです。

## PDF を出力する

```sh
mise run pdf
```

`slides/` 内の全資料を変換し、`dist/<発表名>/slides.pdf` に出力します。見本は `dist/example/slides.pdf`、論文紹介は `dist/2026-10-19-beyond-atomic-layouts/slides.pdf` です。`dist/` は Git 管理対象外です。

PDF 生成前にレイアウト検査が走り、エラーがあると生成を止めます。プレビューサーバーを動かしたまま実行する場合は、別のターミナルを使ってください。

## 検査結果と原寸画像を確認する

```sh
mise run check-layout
```

Chrome でフォントと画像の読み込みを待ち、全資料を描画して検査します。追加の Puppeteer インストールは不要です。結果は `dist/<発表名>/slides-review/` に出力します。

| ファイル                     | 確認する内容                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| `review.md`                  | ページごとのエラーと、画像を見て判断する `Space review` の空白候補 |
| `slide-N.png`                | 全ページの原寸画像。改行、図、背景、日本語フォントを確認           |
| `slide-N-space.png`          | 空白候補を番号・寸法付きで着色した画像。通常画像と比較             |
| `lines.json` / `spaces.json` | 描画行・配置の測定値 / 空白候補・列・要素間隔の測定値              |

エラーは終了コード 1 になり、`mise run pdf` も停止します。表示された検査 ID を [仕様表](docs/check-layout.md#検査一覧) で引き、対象ページを直してください。`Space review` の候補は人が判断するため、終了コードに影響しません。候補ゼロでも、全ページの原寸画像を確認します。保存時の自動検査は設定していません。

`LAYOUT_OUT` で出力先のルート、`CHROME_PATH` で Chrome の位置を指定できます。検査画像では `debug-layout` の枠を一時的に消しますが、元の Markdown は変更しません。検査の範囲・閾値・限界、出力の読み方は仕様書にまとめています。

## main への変更を CI で検査する

`main` 向けの Pull Request と `main` への push で、[Slides ワークフロー](.github/workflows/slides.yml) が `mise run check-release`・`mise run test`・`mise run test-layout`・`mise run pdf` を実行します。ローカルと OS・CPU を揃えるため macOS 26 (arm64) を使いますが、Chrome の更新で改行が変わる場合はあります。成功・失敗のどちらでも、生成済みの PDF と原寸 PNG・`review.md` を Actions の `slides-review` artifact から確認できます。

`mise run check-release` はサンプルを含む `slides/` 以下の Markdown を調べ、1 行で書いた `class:` / `_class:` 指定に `debug-layout` があれば失敗します。除外を設ける場合は `scripts/check-release.cjs` の `excludedPaths` を編集します。

検査が通るまでマージできないようにするには、管理者が GitHub の Settings → Rules → Rulesets で `main` を対象にし、Require status checks to pass で **Validate slides** を必須にします。従来の branch protection でも同じチェック名を選べます。一度ワークフローを実行してから設定してください。CI の追加だけでは、このリポジトリ設定は変わりません。

## 資料を追加する

[サンプルの Markdown](slides/example/slides.md) を `slides/<発表名>/slides.md` にコピーし、本文を差し替えます。図は同じディレクトリの `assets/` に置き、`![図の説明](assets/figure.png)` と参照します。この階層を保つと、テーマ内の素材パスも解決できます。

冒頭の `theme: ly` でテーマ、`footer:` で著作権表示を指定します。ページを区切るには `---` を使い、本文ページには `## 見出し` を置きます。`paginate: true` と表紙の `_paginate: false` を併用すると、表紙は番号を隠し、本文の番号は 2 から始まります。

`class` は資料全体、`_class` はそのページに適用します。`_class` はクラス全体を置き換えるため、情報分類など共通のクラスも含めてください。

## ly テーマを使う

`ly` は利用者提供の非公式テーマを元にしており、LINE ヤフーの公式テンプレートではありません。実際の構成はサンプル、共通設定は [themes/ly.css](themes/ly.css) を参照してください。

| レイアウト           | 指定するクラス・用途                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| 論文表紙             | `paper-title title-slide-big first-slide`：論文・発表者情報を配置        |
| 自己紹介             | `profile-slide content-slide-gray`：左に経歴・研究分野、右に写真・リンク |
| 背景の切り替え       | `title-slide-big` / `content-slide-gray`                                 |
| 大きな文字の中央配置 | `takahashi`                                                              |

### 論文表紙と自己紹介

論文表紙は、`# 論文タイトル`、著者、著者所属、論文リンク、発表者情報の引用ブロック、注記の引用ブロック、ロゴ画像の順に書きます。発表者情報は所属・氏名・リンクの 3 段落です。`paper-title` が配置、`title-slide-big` が背景を指定するため、サンプルの段落順を保って内容を差し替えてください。CSS の領域名は順に `paper-title`・`authors`・`affiliations`・`links`・`presenter`・`note`・`logo` です。

表紙の `_テキスト_` は斜体の代わりに白いハイライトを付けます。背景は文字のある行だけ白くなり、ボックスの残りには装飾が残ります。タイトルの行高を縮めるときは、`g` などの下端が次行のハイライトに隠れないか確認します。ロゴは [Wikimedia Commons の SVG](https://upload.wikimedia.org/wikipedia/commons/6/68/LY_Corp_logo.svg) を `themes/assets/ly/logo.svg` に保存しています。

自己紹介は `##` の見出し、経歴・研究分野の引用ブロック、写真・関連リンクの引用ブロックの順です。右列の先頭段落に写真 2 枚、次の段落にプロフィールリンクを置きます。以降は `[![説明](assets/画像.png)](URL) [説明](URL)` の組で、サムネイル下部にテキストリンクを重ねます。リンクは画像中央を基準に文字数に応じた幅で 1 行表示し、標準で不透明度 85% の白背景が付きます。研究分野の親項目を `**太字**` にすると赤く強調します。

見本の写真は [kitada-ly.jpg](https://shunk031.me/icons/kitada-ly.jpg)・[kitada-kita.jpg](https://shunk031.me/icons/kitada-kita.jpg) を `slides/example/assets/` に保存しています。論文紹介でも同じ写真を使用し、講座・書籍のサムネイルとともに資料自身の `assets/` に保存しています。見本の自己紹介文は差し替え用の作例です。

### 見出しに説明を添える

`## 主題 **|** _説明_` と書くと、主題は 48px、説明は約 25.7px で表示します。`**|**` は中央揃えの縦線になり、説明は斜体になりません。長い説明は残りの幅で折り返しますが、検査では題目・説明ともに 1 行を要求します。自動縮小はしないため、文章や幅を調整してください。

### 引用・図・キャプションを書く

本文の括弧補足 `(zero-shot)` などは Marp プラグインが自動で囲み、括弧も含めて引用と同じ 20px（`--citation-font-size`）で表示します。数式・コード・URL・引用リンク・表紙・スライド題目は対象外です。装飾をまたぐ括弧は自動変換せず、検査のレビュー候補になります。

段落・箇条書きの引用は `_[[Author+ ConfName’YY](URL)]_` と書くと、斜体の代わりに共通の 20px で表示します。通常リンクのサイズは変わりません。複数研究は `LayoutLMv3 _[[Huang+ MM’22](文献URL)]_ / ScreenQA _[[Hsiao+ NAACL’25](文献URL)]_` のように各研究名の直後へ置きます。同一著者の複数論文は `_[[Kitada+ IEEE Access’21](URL1), [Appl. Intell.’22](URL2)]_` とまとめ、角括弧とカンマをリンクの外に置きます。リンク先は各論文か対応する参考文献項目です。

```markdown
> ![Figure 2: 入出力の対応](assets/figure.png)
>
> Figure from [[Huang+ ECCV’26](https://arxiv.org/html/2608.26716v1#S3.F2)]: 画像・メタデータ・質問・回答の対応
```

図の出典は図の直下か隣に置き、空でない説明を付けます。角括弧は表示用で、リンクに含めません。出典・説明は共通の 20px で中央揃えです。表記は [既存資料の 15 ページ](https://speakerdeck.com/shunk031/from-fragment-to-one-piece-a-survey-on-ai-driven-graphic-design?slide=15)・[30 ページ](https://speakerdeck.com/shunk031/from-fragment-to-one-piece-a-survey-on-ai-driven-graphic-design?slide=30) を基にしています。

切り出した画像の右端を背景へなじませるには、パスに `#crop-right` を付けます。フェード幅は `--crop-feather-width`（16px）で調整します。元画像は残し、切り出す範囲と境界の処理を確認してください。

### 情報分類を表示する

| 表示              | クラス                               |
| ----------------- | ------------------------------------ |
| Top Secret        | `classification-top-secret`          |
| Secret            | `classification-secret`              |
| Restricted        | `classification-restricted`          |
| Internal Use Only | `classification-internal`            |
| Public            | `classification-public`              |
| 表示なし          | 全ページで情報分類クラスを指定しない |

全ページで同じ分類を使い、`_class` にも含めます（例：`<!-- _class: content-slide-gray classification-public -->`）。ラベルは通常は左上、`first-slide` の表紙では右上です。`header` は通常のヘッダーとして使えます。

`.marprc.cjs` が読み込む検証スクリプトは、未知の `classification-*`、複数区分、ページ間の変更・指定漏れをエラーにします。VS Code 内蔵プレビューではこの検証が走らないため、仕上げに `mise run pdf` を実行します。分類検証や Marp 設定を変更した場合は `mise run test` も実行してください。

### 共通の見た目と確認用の枠を調整する

`themes/ly.css` の `:root` に共通設定、`section.paper-title` の先頭に論文表紙の設定をまとめています。同じ役割の文字は共通変数で調整します。

| 調整するもの                     | 主な変数・初期値                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 外側の余白・要素間隔             | `--slide-padding`、`--slide-top`、`--content-gap`（16px）。本文・ラベル・footer の左余白を共通化                               |
| 文字色・背景色                   | `--color-heading`、`--color-text`、`--color-background`                                                                        |
| 本文・見出し                     | `--body-font-size`（30px）、`--heading-font-size`（48px）、`--heading-description-ratio`                                       |
| 入れ子                           | `--nested-list-font-size` / `--deep-list-font-size`（ともに 26.25px）、`--nested-list-indent`                                  |
| 箇条書き                         | `--list-line-height`（一文内の行間）、`--list-item-gap`（項目間の余白）                                                        |
| 引用・図                         | `--citation-font-size` / `--figure-caption-font-size`（ともに 20px）                                                           |
| 見出しの縦線                     | `--heading-separator-*`（太さ・高さ）                                                                                          |
| 情報分類・ページ番号・著作権     | `--classification-*`、`--pagination-font-size`、`--footer-*`                                                                   |
| 自己紹介                         | `--profile-*`（列幅・文字・写真間隔）、`--profile-list-gap`（研究分野間）、`--profile-thumbnail-height`、`--profile-caption-*` |
| 白背景の不透明度                 | `--white-background-opacity`（85%）。値を大きくすると白が濃くなる                                                              |
| 論文表紙の余白・列幅             | `--paper-padding-*`、`--paper-row-gap`、`--paper-column-gap`、`--paper-presenter-width`                                        |
| 論文表紙の文字・ハイライト・ロゴ | `--paper-title-*`、`--paper-authors-*`、`--paper-highlight-color`、`--paper-logo-width`                                        |

通常本文のラベル → 見出し → 本文は `--content-gap` で間隔を揃えます。中央配置の `first-slide`・`lead`・`takahashi` は対象外です。行高・箇条書きの字下げ・注記の幅も変数で調整できます。

`debug-layout` をページのクラスに加えると、要素を赤い実線、情報分類・ページ番号を青い破線で囲み、用途ラベルを表示します（例：`<!-- _class: content-slide-gray classification-public debug-layout -->`）。消すにはそのページのクラスから外します。全体の `class` に指定した場合も、`_class` のあるページには個別に必要です。全ページで消すときは両方から外します。枠の色・太さ・ラベルのサイズは `--debug-*` で調整でき、プロフィールでも併用できます。

## テーマを追加する

`themes/<テーマ名>.css` を作り、先頭に `/* @theme <テーマ名> */` を記載します。`.marprc.cjs` が `themes/` を読み込むので、資料の `theme` を変えると選択できます。VS Code 用には `.vscode/settings.json` の `markdown.marp.themes` に `./themes/<テーマ名>.css` を追加します。

背景画像は `themes/assets/<テーマ名>/` に置きます。CSS の画像パスは Markdown の位置を基準に解決するため、`../../themes/assets/<テーマ名>/background.svg` と指定します。資料は `slides/<発表名>/slides.md` の階層に揃えてください。

Codex / Claude Code の執筆ルールは [AGENTS.md](AGENTS.md) にあります。`CLAUDE.md` は同じファイルへのシンボリックリンクです。
