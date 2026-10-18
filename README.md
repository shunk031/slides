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

## 改行と見た目を確認する

```sh
mise run check-layout
```

Chrome で実際に描画し、フォントと画像の読み込み後に各行を測ります。
`dist/<発表名>/slides-review/` に全ページの原寸 PNG、改行情報 `lines.json`、確認用の `review.md` を出力します。`LAYOUT_OUT` を指定すると出力先のルートを変更できます。
画像では `debug-layout` を一時的に無効にします。元の Markdown は変更しません。

2 行目以降の最短行が同じ要素の最長行に対して、見出しは 60%未満、本文・箇条書き・表セル・キャプションは 25%未満ならエラーにします。途中で短い語だけが孤立する場合も対象です。flex/grid の見出しは題目と副題を独立して測り、大きな題目の文字が副題の改行を隠さないようにします。自動改行と明示的な改行の両方を検査します。
自動改行が `Intl.Segmenter` の単語内部に入ると `midword-wrap` エラーにします。日本語は `ja`、英語などは各 section の `lang` で分割します。英単語、リンク、コードも対象です。`<br>`・`<wbr>` は明示的な区切りとして除外し、分割位置の隣接行と単語を記録します。インライン数式は単語の区切りとして扱い、数式内部の文字は検査しません。単語境界や句読点での折り返しは対象外です。したがって `意図 | どおり` は通り、`意図ど | おり` はエラーになります。これは単語単位の検査で、単語境界をまたぐ句全体の不自然さは判定しません。
`section > h2` の題目・副題の各描画行を測り、どちらかが複数行になると `title-wrap` エラーにします。表紙も対象です。
異なるテキスト要素の描画範囲が縦横とも 2px を超えて交差する場合は、フッターを含めてエラーにします。同じ要素内の文字同士、文字と画像の重なり、画像内部の文字はこの検査の対象外です。
本文のテキスト・画像の下端が実際の footer 枠の上端に触れるか越えると `footer-overflow` エラーにします。出力する y 座標は各 section の上端を 0px とした値です。header、footer、ページ番号、情報分類ラベル、背景装飾は対象外です。CSS 疑似要素や DOM にない背景画像は測りません。
本文・図の著者年付き引用に角括弧がない場合、または括弧をリンクに含めた場合はエラーにします。
BLEU の直後に著者・年付きの引用リンクがない場合もエラーにします（正式名称だけ、離れた位置の引用では通りません）。
本文・箇条書きが裸の「必要」で終わる場合はエラーにします。「〜が必要」「〜する必要あり」「〜する必要がある」は対象外です。
資料の `terms.json` に登録した説明必須の用語は、`用語: 定義` または `用語（定義）` の形で正本どおりの定義が少なくとも一度必要です。`解決する問題: 定義（用語）` も認めます。登録語に続く定義の言い換えや欠落はエラーにします。登録していない概念の欠落や説明の妥当性は人が確認します。
左右に置く定義へ `paired-definitions` クラスを付けたページでは、先頭 2 つの定義文の描画上端・高さが揃わない場合もエラーにします。
クラスの有無に関係なく、同じ行で横並びになった section 直下の本文ブロックは、最初の描画行の上端を比較します。差が 2px を超えると `column-alignment` エラーです。先頭に画像がある列と、`align-self: center` で縦中央に置いた列は意図的なずれを避けるため除外します。`paired-definitions` の高さ検査は別に残します。
引用リンク内に複数の `Author+` 表記がある場合と、文字が本文ボックス・スライド外へ出る場合はエラーにします。画像より広いグリッドのキャプションは、そのキャプション自身のボックスで検査します。図・比較枠（blockquote）そのものがスライド外へ出た場合もエラーにします。
MathJax の表示数式が本文の下余白へはみ出した場合もエラーにします。数式内の注釈どうしの重なりは自動判定せず、原寸画像で確認します。
図の `Figure from` 出典ブロックには、軸の説明も同じ blockquote または出典行内に置きます。`縦軸` / `横軸` / `x軸` / `y軸` のどれか一方がある場合、同じ図の出典にもう一方の軸説明がなければエラーです。語句の書かれていない軸説明は検出できません。
同じ親の隣り合う本文段落・リスト間に、指定マージンに加えて 1 行分を超える空白がある場合はエラーにします。図を含むブロックのキャプション間隔は、別の図・出典間隔検査で扱います。
本文のグループ見出し（直後に段落・リストが続く太字だけの段落）は、直前グループから各 section の computed `--list-group-gap` 以上離す必要があります。同じ親要素と前後グループの種類を持つ見出しは、ページ間の gap 中央値から 2px を超えてずれる場合もエラーです。題目直後、図キャプション内、単独列の見出しは除外します。構造で識別できない見出しやキャプションは検出しません。
`mise run pdf` はこの検査を先に実行し、いずれかの検出で終了コード 1 として PDF 生成を止めます。警告扱いで通す項目はありません。保存時の自動実行は設定していません。検査合格は読みやすさの保証ではないため、Codex / Claude Code は原典と原寸画像も確認します。
同じ資料の本文ページ間で、見出し・説明見出し・本文・入れ子・図キャプション・図の出典・引用・情報区分・ページ番号の実際の文字サイズを比較し、不一致をエラーにします。表紙・高橋メソッドのページやプロフィールの人名・連絡先は別の役割として対象外です。
引用図のブロックには `Figure from [引用]: 説明`（空でない説明が必須）を要求します。複数パネルの図では共通の出典行も使えます。出典行と最も近い図の距離が出典の 2 行分を超える場合、および `出典:` / `Source:` の独立行はエラーにします。プロフィールの写真・サムネイルは引用図として扱いません。
本文の文字・画像が見出し下の利用可能な高さの 60%に届かない場合は `sparse-body` エラーにします。空のボックスの高さは算入しません。表紙・高橋メソッドと、`layout-example` を付けたテンプレート見本は対象外です。
フォント・画像の読み込み失敗や実行エラーは非ゼロで終了します。Google Chrome の位置は必要に応じて `CHROME_PATH` で指定できます。
Marp CLI に同梱された Puppeteer を使うため、追加インストールは不要です。Marp 更新時は `mise run test-layout` で検査自体も確認します。

日本語の文節分割は `word-break: auto-phrase`、短い最終行を避ける調整は `text-wrap: pretty` が担当します。
副題には `text-wrap: balance` も適用します。これらは不自然な改行をすべて防ぐ保証ではありません。検査で検出した場合は、文字サイズや閾値を下げず、文章・ボックス幅・図の配置を見直します。
参考: [Chrome の pretty 解説](https://developer.chrome.com/blog/css-text-wrap-pretty)、[BudouX の文節分割](https://github.com/google/budoux/blob/main/README.md)、[Chromium の行分割実装](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/layout/inline/score_line_breaker.cc)。

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

通常の本文スライドでは、情報分類ラベルと見出し、見出しと本文の間隔を `--content-gap`（初期値 16px）で揃えます。中央配置の `first-slide`・`lead`・`takahashi` は対象外です。

`ly` テーマでは、`debug-layout` クラスを付けたページに確認用の枠と用途ラベルを表示します。要素を赤い実線、情報分類ラベルとページ番号を青い破線で囲みます。診断用 CSS は `themes/ly.css` にまとめています。

```markdown
<!-- _class: content-slide-gray classification-public debug-layout -->
```

サンプルは全ページで有効にしています。表示を消すには、対象ページの `_class` から `debug-layout` を外します。`class` に指定した場合は全ページに適用されますが、`_class` のあるページではクラス全体が置き換わるため、そちらにも指定してください。全ページで非表示にする場合は、`class` と各 `_class` から外します。枠線の色・太さやラベルのサイズは `--debug-*` 変数で調整できます。

### 論文紹介の表紙を作る

サンプルの表紙は `_class: paper-title title-slide-big first-slide classification-public` を指定しています。`paper-title` が各ボックスを配置し、`title-slide-big` が背景を選びます。

表紙の Markdown は、見出し `# 論文タイトル`、著者の段落、著者所属の段落、論文リンクの段落、発表者情報の引用ブロック、注記の引用ブロック、ロゴ画像の順に書きます。段落の順序で配置を決めるため、サンプルの構成を保って内容を差し替えてください。発表者情報の引用ブロック内は、所属・氏名・リンクの 3 段落です。

CSS の `grid-template-areas` では、それぞれを `paper-title`・`authors`・`affiliations`・`links`・`presenter`・`note`・`logo` と名付けています。確認用の枠にも用途を表示します。

表紙では各テキストを `_テキスト_` で囲むと、斜体ではなく白いハイライトを付けます。折り返した行ごとに文字の背景を白くし、ボックスの残りの部分には背景の装飾を残します。

ロゴは利用者指定の [Wikimedia Commons の SVG](https://upload.wikimedia.org/wikipedia/commons/6/68/LY_Corp_logo.svg) を `themes/assets/ly/logo.svg` に保存しています。

### 自己紹介スライドを作る

`profile-slide content-slide-gray classification-public` を指定し、`##` の見出し、経歴・研究分野の引用ブロック、写真・関連リンクの引用ブロックの順に書きます。右列の先頭段落に写真を 2 枚、次の段落にプロフィールへのリンクを置きます。その後に `[![説明](assets/画像.png)](URL)` と書くと、リンク付きサムネイルを配置できます。同じ行に続けて `[説明](URL)` を書くと、画像の下部に、不透明度 85%の白背景を付けたテキストリンクを重ねて表示します。リンクは画像の中央を基準に、文字数に応じた幅で 1 行表示します。白背景の標準不透明度は共通変数 `--white-background-opacity` で調整します。値を大きくすると白が濃くなります。画像の高さ上限は `--profile-thumbnail-height`、リンクの背景と余白は `--profile-caption-*` で調整します。`debug-layout` も併用できます。

列幅・文字サイズ・写真の間隔は `themes/ly.css` の `--profile-*` 変数で調整します。研究分野の親項目を `**太字**` にすると赤く強調します。

サンプルの写真は利用者指定の [kitada-ly.jpg](https://shunk031.me/icons/kitada-ly.jpg) と [kitada-kita.jpg](https://shunk031.me/icons/kitada-kita.jpg) を `slides/example/assets/` に保存しています。講座・書籍のサムネイルも利用者提供の画像を同じディレクトリに保存しています。本文は提供された自己紹介スライドを元にしています。

### 本文見出しに説明を添える

`## X **|** _Y_` と書くと、主題 X は通常の 48px、説明 Y は約 25.7px で表示します。Y は斜体にせず、長い場合は残りの幅で折り返します。自動縮小はしません。`**|**` は文字ではなく CSS の縦線として描き、見出しの中央に揃えます。線の太さ・高さは `--heading-separator-*` で調整できます。

```markdown
## 本論文の選定理由 **|** _初稿生成だけでなく「狙って直せる」デザイン生成まで扱う_
```

### 引用を小さく表示する

段落や箇条書きでは、`_[[Author+ ConfName'YY](URL)]_` のようにリンクを `_` で囲むと、斜体にせず共通の 20px で表示します。`--citation-font-size` で調整できます。通常のリンクは元のサイズのままです。

複数研究を並べる例: `LayoutLMv3 _[[Huang+ MM’22](文献URL)]_ / ScreenQA _[[Hsiao+ NAACL’25](文献URL)]_`。リンク先はそれぞれの論文または対応する参考文献項目です。

同一著者の複数論文は `_[[Kitada+ IEEE Access’21](URL1), [Appl. Intell.’22](URL2)]_` とまとめます。括弧とカンマはリンクの外に置きます。

### 図とキャプション

```markdown
> ![Figure 2: 入出力の対応](assets/figure.png)
>
> Figure from [[Huang+ ECCV’26](https://arxiv.org/html/2608.26716v1#S3.F2)]: 画像・メタデータ・質問・回答の対応
```

外側の角括弧は表示用で、リンクには含めません。図の出典・説明は共通の `--figure-caption-font-size`（20px）で中央揃えにします。本文は `--body-font-size`（30px）、2 階層目と 3 階層目以降はそれぞれ `--nested-list-font-size`（26.25px）と `--deep-list-font-size`（同じく 26.25px）を使います。箇条書きの一文内の行間は `--list-line-height`、項目間の余白は `--list-item-gap` で分けて調整します。入れ子のインデントは `--nested-list-indent`、自己紹介の研究分野間の余白は `--profile-list-gap` で調整できます。
切り出した画像の右端を背景へなじませる場合は、画像パスに `#crop-right` を付けます。フェード幅は `--crop-feather-width`（16px）で調整します。元画像は残し、切り出す範囲と境界の処理を別に確認してください。

図の出典表記は [既存資料の 15 ページ](https://speakerdeck.com/shunk031/from-fragment-to-one-piece-a-survey-on-ai-driven-graphic-design?slide=15)・[30 ページ](https://speakerdeck.com/shunk031/from-fragment-to-one-piece-a-survey-on-ai-driven-graphic-design?slide=30)の `Figure from [引用]` を基にしています。

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

## テーマの見た目を調整する

`themes/ly.css` の `:root` に共通設定、`section.paper-title` の先頭に論文表紙の設定をまとめています。

| 調整するもの                     | 主な変数                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| 外側の余白・要素間隔             | `--slide-padding`、`--slide-top`、`--content-gap`                                       |
| 文字色・背景色                   | `--color-heading`、`--color-text`、`--color-background`                                 |
| 本文・見出し                     | `--body-font-size`、`--heading-font-size`、`--heading-description-ratio`                |
| 情報分類・ページ番号・著作権表示 | `--classification-*`、`--pagination-font-size`、`--footer-*`                            |
| 論文表紙の余白・列幅             | `--paper-padding-*`、`--paper-row-gap`、`--paper-column-gap`、`--paper-presenter-width` |
| 論文表紙の文字・ハイライト・ロゴ | `--paper-title-*`、`--paper-authors-*`、`--paper-highlight-color`、`--paper-logo-width` |

行高・箇条書きの字下げ・注記の幅なども変数で調整できます。表紙タイトルの行高を縮める場合は、`g` などの下端が次行のハイライトに隠れないことを確認してください。

## テーマを追加する

`themes/<テーマ名>.css` を作り、先頭に `/* @theme <テーマ名> */` を記載します。`.marprc.cjs` が `themes/` を読み込むので、資料の `theme` を変えるだけで選択できます。

VS Code でも使うテーマは、`.vscode/settings.json` の `markdown.marp.themes` に `./themes/<テーマ名>.css` を追加します。

テーマの背景画像は `themes/assets/<テーマ名>/` に置きます。CSS の画像パスは Markdown の位置を基準に解決されるため、`../../themes/assets/<テーマ名>/background.svg` のように指定します。資料は `slides/<発表名>/slides.md` の階層に揃えてください。

`ly` は利用者提供の非公式テーマを元にしています。LINE ヤフーの公式テンプレートではありません。

Codex と Claude Code の執筆ルールは [AGENTS.md](AGENTS.md) にまとめています。`CLAUDE.md` は同じファイルへのシンボリックリンクです。
