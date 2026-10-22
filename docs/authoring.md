# スライドの執筆

## 準備と PDF 出力

Node.js と Marp CLI のバージョンは [mise.toml](../mise.toml) で管理します。`ly` テーマの LINE Seed JP は同梱済みで、フォントのインストールや取得用のネット接続は不要です。入手元とライセンスは [フォントの README](../themes/assets/ly/fonts/README.md) と [OFL.txt](../themes/assets/ly/fonts/OFL.txt) にあります。

```sh
mise run pdf
```

`slides/` 内の全資料を変換し、`dist/<発表名>/slides.pdf` に出力します。`dist/` は Git 管理対象外です。

PDF 生成前にレイアウト検査が走り、エラーがあると生成を止めます。プレビューサーバーを動かしたまま実行する場合は、別のターミナルを使ってください。

## 資料を追加する

[サンプルの Markdown](../slides/example/slides.md) を `slides/<発表名>/slides.md` にコピーし、本文を差し替えます。図は同じディレクトリの `assets/` に置き、`![図の説明](assets/figure.png)` と参照します。この階層を保つと、テーマ内の素材パスも解決できます。

冒頭の `theme: ly` でテーマ、`footer:` で著作権表示を指定します。ページを区切るには `---` を使い、本文ページには `## 見出し` を置きます。`paginate: true` と表紙の `_paginate: false` を併用すると、表紙は番号を隠し、本文の番号は 2 から始まります。

`class` は資料全体、`_class` はそのページに適用します。`_class` はクラス全体を置き換えるため、情報分類など共通のクラスも含めてください。

## 見出しに説明を添える

`## 主題 **|** _説明_` と書くと、主題は 48px、説明は約 25.7px で表示します。`**|**` は中央揃えの縦線になり、説明は斜体になりません。長い説明は残りの幅で折り返しますが、検査では題目・説明ともに 1 行を要求します。自動縮小はしないため、文章や幅を調整してください。

## 引用・図・キャプションを書く

本文の括弧補足 `(zero-shot)` などは Marp プラグインが自動で囲み、括弧も含めて引用と同じ 20px（`--citation-font-size`）で表示します。数式・コード・URL・引用リンク・表紙・スライド題目は対象外です。装飾をまたぐ括弧は自動変換せず、検査のレビュー候補になります。

段落・箇条書きの引用は `_[[Author+ ConfName’YY](URL)]_` と書くと、斜体の代わりに共通の 20px で表示します。通常リンクのサイズは変わりません。複数研究は `LayoutLMv3 _[[Huang+ MM’22](文献URL)]_ / ScreenQA _[[Hsiao+ NAACL’25](文献URL)]_` のように各研究名の直後へ置きます。同一著者の複数論文は `_[[Kitada+ IEEE Access’21](URL1), [Appl. Intell.’22](URL2)]_` とまとめ、角括弧とカンマをリンクの外に置きます。リンク先は各論文か対応する参考文献項目です。

```markdown
> ![Figure 2: 入出力の対応](assets/figure.png)
>
> Figure from [[Huang+ ECCV’26](https://arxiv.org/html/2608.26716v1#S3.F2)]: 画像・メタデータ・質問・回答の対応
```

図の出典は図の直下か隣に置き、空でない説明を付けます。角括弧は表示用で、リンクに含めません。出典・説明は共通の 20px で中央揃えです。表記は [既存資料の 15 ページ](https://speakerdeck.com/shunk031/from-fragment-to-one-piece-a-survey-on-ai-driven-graphic-design?slide=15)・[30 ページ](https://speakerdeck.com/shunk031/from-fragment-to-one-piece-a-survey-on-ai-driven-graphic-design?slide=30) を基にしています。

切り出した画像の右端を背景へなじませるには、パスに `#crop-right` を付けます。フェード幅は `--crop-feather-width`（16px）で調整します。元画像は残し、切り出す範囲と境界の処理を確認してください。

## 情報分類を表示する

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

## 論文表紙と自己紹介

論文表紙は、`# 論文タイトル`、著者、著者所属、論文リンク、発表者情報の引用ブロック、注記の引用ブロック、ロゴ画像の順に書きます。発表者情報は所属・氏名・リンクの 3 段落です。`paper-title` が配置、`title-slide-big` が背景を指定するため、サンプルの段落順を保って内容を差し替えてください。CSS の領域名は順に `paper-title`・`authors`・`affiliations`・`links`・`presenter`・`note`・`logo` です。

表紙の `_テキスト_` は斜体の代わりに白いハイライトを付けます。背景は文字のある行だけ白くなり、ボックスの残りには装飾が残ります。タイトルの行高を縮めるときは、`g` などの下端が次行のハイライトに隠れないか確認します。ロゴは [Wikimedia Commons の SVG](https://upload.wikimedia.org/wikipedia/commons/6/68/LY_Corp_logo.svg) を `themes/assets/ly/logo.svg` に保存しています。

自己紹介は `##` の見出し、経歴・研究分野の引用ブロック、写真・関連リンクの引用ブロックの順です。右列の先頭段落に写真 2 枚、次の段落にプロフィールリンクを置きます。以降は `[![説明](assets/画像.png)](URL) [説明](URL)` の組で、サムネイル下部にテキストリンクを重ねます。リンクは画像中央を基準に文字数に応じた幅で 1 行表示し、標準で不透明度 85% の白背景が付きます。研究分野の親項目を `**太字**` にすると赤く強調します。

見本の写真は [kitada-ly.jpg](https://shunk031.me/icons/kitada-ly.jpg)・[kitada-kita.jpg](https://shunk031.me/icons/kitada-kita.jpg) を `slides/example/assets/` に保存しています。見本の自己紹介文は差し替え用の作例です。

## VS Code のプレビュー

編集には VS Code と推奨拡張の [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode) も使えます。ローカルの `ly` テーマは `.vscode/settings.json` に登録済みです。ただし、VS Code の Marp プレビューはリポジトリの engine プラグイン（情報分類・数式の検証、括弧補足のサイズ調整）を実行しません。正確な表示は `mise run preview` のブラウザで確認してください。
