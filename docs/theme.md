# テーマの使い方と調整

## ly テーマを使う

`ly` は利用者提供の非公式テーマを元にしており、LINE ヤフーの公式テンプレートではありません。実際の構成は [サンプル](../slides/example/slides.md)、共通設定は [themes/ly.css](../themes/ly.css) を参照してください。

| レイアウト           | 指定するクラス・用途                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| 論文表紙             | `paper-title title-slide-big first-slide`：論文・発表者情報を配置        |
| 自己紹介             | `profile-slide content-slide-gray`：左に経歴・研究分野、右に写真・リンク |
| 背景の切り替え       | `title-slide-big` / `content-slide-gray`                                 |
| 大きな文字の中央配置 | `takahashi`                                                              |

## 共通の見た目と確認用の枠を調整する

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
