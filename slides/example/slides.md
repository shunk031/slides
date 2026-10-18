---
marp: true
theme: ly
class: classification-public debug-layout
size: 16:9
lang: ja
footer: © LY Corporation
_class: paper-title title-slide-big first-slide classification-public debug-layout
paginate: true
_paginate: false
---

_Beyond Atomic Layouts:\
Compositional Design Understanding\
with Vision‑Language Models_
===

_Yiyang Huang¹˒²\*, Zhaowen Wang²†, Simon Jenni², Jing Shi²,
Yitian Zhang¹, Yizhou Wang¹, and Yun Fu¹_

_¹Northeastern University, Boston, USA / ²Adobe Research, San Jose, USA_

_Project page: [hukcc.github.io/Beyond-Atomic-Layouts/](https://hukcc.github.io/Beyond-Atomic-Layouts/), arXiv: [arxiv.org/abs/2608.26716](https://arxiv.org/abs/2608.26716)_

> _**AI CBU / Visual Generation Dept.**_
>
> _**Shunsuke Kitada, Ph.D.**_
>
> _HP: [shunk031.me](https://shunk031.me) / X: [@shunk031](https://x.com/shunk031)_

> _※本発表で紹介する図や数式は
> 対象の論文から引用しております_

![LINEヤフー](../../themes/assets/ly/logo.svg)

[![ECCV 2026](assets/eccv-2026-banner.jpg)](https://pbs.twimg.com/profile_banners/1217810344355205125/1779129355/1500x500)

---

<!-- _class: profile-slide content-slide-gray classification-public debug-layout -->

## 自己紹介: 北田俊輔 _Shunsuke KITADA_

> **経歴**
>
> - ’23/04 LINE → ’23/10 LINEヤフー Research Scientist
> - ’23/03 法政大学大学院 彌冨研 博士（工学）/ 学振 DC2
>
> **研究分野**
>
> - 自然言語処理（NLP）/ 画像処理（CV）
>   - 摂動に頑健で解釈可能な深層学習 _[Kitada+ IEEE Access’21](https://shunk031.me/publication/kitada2021making/)_, _[Appl. Intell.’22](https://shunk031.me/publication/kitada2022making/)_
> - 計算機広告（Multi-modal / Vision & Language）
>   - 効果の高いデジタル広告の作成支援 _[Kitada+ KDD’19](https://shunk031.me/publication/kitada2019conversion/)_
>   - 効果の低いデジタル広告の停止支援 _[Kitada+ Appl. Sci.’22](https://shunk031.me/publication/kitada2022ad/)_
> - **デザイン生成 AI**
>   - 離散拡散モデルで生成されたレイアウトの再調整 _[Iwai+ ECCV’24](https://shunk031.me/publication/iwai2024layout/)_
>   - LLM によるレイアウトの生成における自己修正 _[Zhang+ arXiv’24](https://shunk031.me/publication/zhang2024vascar/)_
>   - 田植えをするように潜在表現を植える画像生成 _[Nagai+ CVPR-F’26](https://shunk031.me/publication/nagai2026taue/)_

> ![北田俊輔の写真](assets/kitada-ly.jpg) ![北田俊輔のアイコン](assets/kitada-kita.jpg)
>
> [shunk031.me](https://shunk031.me) [@shunk031](https://x.com/shunk031)
>
> [![講座：画像生成AIにおける拡散モデルの理論と実践](assets/python-image-generation-course.png)](https://bit.ly/KitadaXColosoJP1) [画像生成AIにおける拡散モデルの理論と実践](https://bit.ly/KitadaXColosoJP1)
>
> [![書籍：Pythonで学ぶ画像生成](assets/python-image-generation-book.png)](https://book.impress.co.jp/books/1123101104) [Pythonで学ぶ画像生成](https://book.impress.co.jp/books/1123101104)

---

<!-- _class: selection-slide content-slide-gray classification-public debug-layout -->
<!-- 発表目安 0:45 -->

## 本論文の選定理由 **|** _デザインの編集には、見た目とレイヤーの関係を同時に理解する必要_

> ![Figure 1(e): 関連レイヤーを理解する design assistant の例](assets/beyond-atomic-fig1e.png)
>
> Figure from [[Huang+ ECCV’26]](https://arxiv.org/html/2608.26716v1#S0.F1.sf5): デザイン支援の例

> **デザインを「作る」だけでなく、\
> 「意図どおりに直す」ことが難しい**
>
> - 文字を人物の背後に差し込む、\
>   文字の一部を図形へ置き換えるなど、\
>   複数のレイヤーで 1 つの視覚効果を表現
>   - 関連レイヤーをまとめて特定してから編集
> - 画像として見えている領域と、\
>   編集すべきレイヤーの単位が\
>   一致しない場合がある
>
> **本論文で注目したい点**
>
> - 完成画像だけでなく、編集可能なレイヤー情報まで使って関連要素を特定できるか
> - 単純に近い／重なる要素ではなく、デザイン上の意図で結びついた要素を推定できるか
> - その能力を何の教師信号で学習させるのか

---

<!-- _class: background-slide content-slide-gray classification-public debug-layout -->
<!-- 発表目安 1:05 -->

## 背景 **|** _独立した要素の理解から、複数レイヤーの合成関係の理解へ_

**Compositional layout: 複数レイヤーが協調して 1 つの表現を構成**

> ![Figure 1(a): Clipping](assets/beyond-atomic-clipping.png)
>
> **(a) Clipping**: 切り抜きを前面に置き、間に別要素を挿入

> ![Figure 1(b): Blending](assets/beyond-atomic-blending.png)
>
> **(b) Blending**: 異なる画像領域を組み合わせ、統一的な形状を構成

> ![Figure 1(c): Overlaying](assets/beyond-atomic-overlaying.png)
>
> **(c) Overlaying**: 輪郭・影などを重ね、要素の視覚的な階層を強調

> ![Figure 1(d): Morphing](assets/beyond-atomic-morphing.png)
>
> **(d) Morphing**: 文字の一部を図形・画像へ置換

Figure from [[Huang+ ECCV’26]](https://arxiv.org/html/2608.26716v1#S0.F1): 4種類の合成関係

---

<!-- _class: comparison-slide content-slide-gray classification-public debug-layout -->

## 既存研究との違い **|** _個別要素や生成から、レイヤー間の関係理解へ_

> **文書・画面理解**
>
> LayoutLMv3 _[Huang+ MM’22](https://arxiv.org/html/2608.26716v1#bib.bib17)_ / ScreenQA _[Hsiao+ NAACL’25](https://arxiv.org/html/2608.26716v1#bib.bib24)_\
> 文書や画面に含まれる**個別要素を理解**

> **デザイン生成**
>
> COLE _[Jia+ arXiv’23](https://arxiv.org/html/2608.26716v1#bib.bib30)_ / ART _[Pu+ CVPR’25](https://arxiv.org/html/2608.26716v1#bib.bib31)_\
> 複数レイヤーからなる**編集可能なデザインを生成**

> **本研究**
>
> **レイヤー間の合成関係を理解**\
> どのレイヤー同士が結びつき、\
> どのデザイン意図を実現しているかを問う

---

<!-- _class: problem-slide content-slide-gray classification-public debug-layout -->
<!-- 発表目安 1:00 -->

## 問題設定 **|** _指定レイヤーと合成関係にある要素を特定・意図を説明_

> ![Figure 2: 完成画像・レイヤーのメタデータ・質問・回答の対応](assets/beyond-atomic-fig2.png)
>
> Figure from [[Huang+ ECCV’26]](https://arxiv.org/html/2608.26716v1#S3.F2): 画像・メタデータ・質問・回答の対応

> **入力: 完成画像 + 各レイヤーのメタデータ**
>
> $$
> \mathcal{L}=(\underbrace{\colorbox{#E2F0D9}{$\mathcal{I}$}}_{\text{完成画像}},\underbrace{\colorbox{#DBEAFE}{$\mathcal{M}$}}_{\text{メタデータ}}),\quad
> \mathcal{M}=\{\mathcal{M}_{e_1},\ldots,\mathcal{M}_{e_n}\}
> $$
>
> - $\mathcal{M}_{e_i}$: 要素識別子（ID）・種類・位置・\
>   不透明度・重なり順などの属性
> - 質問 $Q(e^q)$: 注目する要素 $e^q$ を指定

> **出力: 関連要素の ID とデザイン意図**
>
> - 対応する要素 $e^{comp}$ を同定
> - 2 つの要素が構成する視覚効果を自然言語で説明
> - 単純な重なり・距離ではなく、\
>   合成関係の認識が目的

---

<!-- _class: dataset-slide content-slide-gray classification-public debug-layout -->
<!-- 発表目安 0:55 -->

## CoDeLayout **|** _約2万件の実デザインに関連要素ペアと意図を付与_

> ![Figure 2 左側: 完成画像と各要素のメタデータ](assets/beyond-atomic-fig2-metadata.png#crop-right)
>
> Figure from [[Huang+ ECCV’26]](https://arxiv.org/html/2608.26716v1#S3.F2): デザインとメタデータ

> **1デザインから質問応答形式の教師データ**
>
> - 質問応答（Question Answering; QA）:\
>   質問対象・正解要素のペアと意図説明
> - 完成画像と各要素のJSONメタデータを保持
> - 編集可能な複数レイヤーの構造を保持

> **Train: 20,009 / Test: 387**
>
> - Test は全件人手確認
> - 平均17.4レイヤー\
>   99.8%が45レイヤー未満
>
> **4種類の関係・希少な Morphing も評価**
>
> | 関係         |     Train |       Test |
> | :----------- | --------: | ---------: |
> | Blending     |    56.78% |     40.06% |
> | Overlaying   |    22.83% |     29.95% |
> | Clipping     |    17.76% |     17.75% |
> | **Morphing** | **2.63%** | **12.24%** |
>
> 訓練は自然な偏りを維持\
> テストは Morphing の比率を増やし、\
> 種類別に評価

---

<!-- _class: analysis-slide content-slide-gray classification-public debug-layout -->
<!-- 発表目安 1:00 -->

## 課題分析 **|** _VLM の失敗要因は「要素の取り違え」と「階層関係の曖昧さ」_

視覚言語モデル（Vision-Language Model; VLM）の課題を GPT-4o で分析

> ![Figure 3(a): 要素の対応付けと関連要素の特定精度](assets/beyond-atomic-semantic-drift.svg)
>
> Figure from [[Huang+ ECCV’26]](https://arxiv.org/html/2608.26716v1#S3.F3.sf1): 要素対応付けと特定精度

> ![Figure 3(b): 空間関係の認識と関連要素の特定精度](assets/beyond-atomic-structural-ambiguity.svg)
>
> Figure from [[Huang+ ECCV’26]](https://arxiv.org/html/2608.26716v1#S3.F3.sf2): 空間関係認識と特定精度

> **Semantic drift: 要素の取り違え**
>
> - 重なって隠れた指定要素を画像中で見失う
> - 切り出し画像と完成画像からの説明を比較\
>   BLEU _[[Papineni+ ACL’02]](https://aclanthology.org/P02-1040/)_\
>   （Bilingual Evaluation Understudy）

> **Structural ambiguity: 階層関係の曖昧さ**
>
> - 前後・包含・重なりは2次元位置だけでは\
>   決まらず、レイヤー間の関係を捉えられない
> - 各デザインから30組の要素ペアを抽出し、\
>   空間関係の質問への正答率を測定

**➜ 両者の精度が関連要素の特定精度と連動 → 対応付け・構造理解を分けて改善**

---

<!-- _class: title-slide-big classification-public debug-layout -->

# 表紙用の背景

`_class: title-slide-big classification-public`

---

<!-- _class: content-slide-gray classification-public debug-layout layout-example -->

## 図や説明を置くページ

`_class: content-slide-gray classification-public`

---

<!-- _class: takahashi classification-public debug-layout -->

# 伝えたいことを一つ
