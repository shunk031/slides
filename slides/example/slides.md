---
marp: true
theme: ly
class: classification-public
size: 16:9
lang: ja
footer: © LY Corporation
_class: paper-title title-slide-big first-slide classification-public
paginate: true
_paginate: false
---

_発表タイトルの作例:\
ly テーマで作る\
技術スライド_
===

_著者名 A¹, 著者名 B²_

_¹ 所属 A / ² 所属 B_

_資料リンク: [example.org](https://example.org)_

> _**発表者の所属**_
>
> _**発表者の氏名**_
>
> _[プロフィールへのリンク](https://example.org)_

> _paper-title の配置見本。\
> タイトル・著者・所属・リンクを\
> 自分の発表内容へ差し替えます。_

![LINEヤフー](../../themes/assets/ly/logo.svg)

---

<!-- _class: profile-slide content-slide-gray classification-public -->

## 自己紹介の配置 _氏名の表示例_

> **左列: 経歴と関心分野**
>
> - 所属・役割を最初に記載
>   - 聞き手と関わる仕事を一つ紹介
> - 経歴は年と出来事を対応付ける
>   - 例: ’26/04 新しい研究チームへ参加
>
> **右列: 写真と関連リンク**
>
> - 先頭の段落に写真を 2 枚配置
>   - 写真は北田俊輔の提供素材を使用
> - 次の段落にプロフィールリンクを配置
>   - 本文と写真を別の引用ブロックに分ける
>
> `profile-slide content-slide-gray`

> ![北田俊輔の写真](assets/kitada-ly.jpg) ![北田俊輔のアイコン](assets/kitada-kita.jpg)
>
> [shunk031.me](https://shunk031.me) [@shunk031](https://x.com/shunk031)

---

<!-- _class: content-slide-gray classification-public -->

## 見出し **|** _節名と扱う内容を 1 行で示す_

**Markdown: `## 主題 **|** _説明_`**

- 主題には章や節の名前を置く
  - 例: 実験設定、結果、議論
- 説明には、そのページで扱う対象を置く
  - 見出しだけを読んでも内容を追える表現にする

**ページ内の小見出しは `**太字**` で記述**

- 本文を意味のまとまりで分ける
  - 主張の下へ、根拠や条件を字下げして置く
- 長い見出しは文章を見直す
  - 文字を縮めず、原寸画像で 1 行を確認する

---

<!-- _class: content-slide-gray classification-public -->

## 箇条書き **|** _主張・根拠・具体例の階層を保つ_

**通常の本文と入れ子の使用例**

- 親項目: このページで伝えたい主張
  - 子項目: 主張を支える根拠や条件
  - 子項目: 対象をイメージできる具体例
- 研究の紹介には、対応する原論文への引用を添える
  - 例: 自動翻訳の評価を扱う研究 _[[Papineni+ ACL’02](https://aclanthology.org/P02-1040/)]_
  - 著者・会議・年は、リンク先の原典と照合する
  - 表示用の角括弧はリンクの外に置く
- 強調する語は、その文の核となる部分に絞る
  - 例: 比較条件と評価対象を **同じ条件** にそろえる
  - 親項目と具体例を別の行に置き、関係を明示する

---

<!-- _class: analysis-slide efficiency-slide content-slide-gray classification-public -->

## 図とキャプション **|** _図の直下に説明を置く_

> ![Figure 1: 架空の3条件を比べる棒グラフ](assets/layout-chart.svg)
>
> Figure from [[作例](assets/layout-chart.svg)]: 架空の条件別スコア\
> 横軸: 比較条件 A・B・C／縦軸: スコア

> **図と説明を一つの引用ブロックに置く**
>
> - 画像は同じ資料の `assets/` に保存
> - 代替テキストには図番号と内容を記載
> - キャプションは図の中央にそろえる
> - 軸の説明もキャプション内へ置く
> - この図は配置確認用の架空データ
>   - A: 40／B: 60／C: 80

**➜ 図・説明・軸の対応を原寸画像で確認する**

---

<!-- _class: results-slide content-slide-gray classification-public -->

## 表 **|** _同じ役割の情報を列にそろえる_

**Markdown の表で配置する要素**

| 要素     | 書き方       | 確認すること           |
| :------- | :----------- | :--------------------- |
| 見出し   | 先頭行       | 各列で何を比べるか     |
| 左寄せ   | `:---`       | 項目名を読み始める位置 |
| 右寄せ   | `---:`       | 数値の桁と単位         |
| 中央寄せ | `:---:`      | 短い分類ラベル         |
| 強調     | `**文字**`   | 注目する行や値         |
| 単位     | 見出しへ記載 | 数値の解釈             |
| 注記     | 表の直下     | 比較条件と対象範囲     |

- 表の見出しは 1 行で示す
- 数値比較では、条件や単位を省かない
- 原寸画像で列幅と改行を確認する

---

<!-- _class: comparison-slide content-slide-gray classification-public -->

## 左右の比較 **|** _同じ観点を同じ順番で並べる_

> **左列: 文章を中心に説明**
>
> - 対象: 背景や条件を言葉で示す内容
> - 構成: 見出し → 主張 → 根拠
> - 例: 手順の前提となる条件
> - 確認: 文節の切れ目と改行位置
> - 配置: 左右の先頭行をそろえる
> - 記述: 一つ目の引用ブロックを使用

> **右列: 図表を中心に説明**
>
> - 対象: 対応や数量を視覚化する内容
> - 構成: 見出し → 図表 → 説明
> - 例: 二つの条件で得られた結果
> - 確認: 図の読みやすさと単位
> - 配置: 左右の先頭行をそろえる
> - 記述: 二つ目の引用ブロックを使用

> **➜ `comparison-slide` で同じ観点を対応付ける**

---

<!-- _class: content-slide-gray classification-public -->

## 数式の注釈 **|** _記号の意味を式の近くに示す_

**例: 2 条件のスコアの平均を計算**

- $x$: 条件 A で得られたスコア
- $y$: 条件 B で得られたスコア
- $m$: 二つのスコアの平均

$$
\underbrace{m\vphantom{y}}_{\mathclap{\text{平均}}}
=\bigl(\underbrace{x\vphantom{y}}_{\mathclap{\text{条件 A}}}\;+\;\underbrace{y}_{\mathclap{\text{条件 B}}}\bigr)/2
$$

**下括弧の注釈は `\mathclap` で包む**

- 説明に必要な記号だけに注釈を付ける
- 注釈どうしの重なりと、下端の余白を原寸で確認する

---

<!-- _class: content-slide-gray classification-public -->

## 結論行 **|** _根拠を示した後に要点をまとめる_

**資料の構造を確認**

- タイトルで、そのページの対象を示す
  - 見出しだけを順に読んでも話を追える構成にする
- 主張の下に根拠と具体例を置く
  - 字下げで、親項目との対応を示す

**描画結果を確認**

- 図・表・数式の説明を対象の近くへ置く
  - 図のキャプション、表の注記、数式の注釈を照合する
- 原寸画像で改行と余白を確認する

**➜ 使用例をコピーし、自分の発表内容へ差し替える**

---

<!-- _class: title-slide-big classification-public -->

# 表紙用の背景

`_class: title-slide-big classification-public`

背景だけを切り替える使用例

---

<!-- _class: takahashi classification-public -->

# 一枚で一つ伝える

`_class: takahashi classification-public`

---

<!-- _class: content-slide-gray classification-public layout-example -->

## 本文用の背景

`_class: content-slide-gray classification-public layout-example`
