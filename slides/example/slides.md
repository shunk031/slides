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
> **Figure 1(e)** 関連レイヤーを理解するデザイン支援の例
>
> 出典: [Huang+ ECCV’26, Sec. 1, Fig. 1](https://arxiv.org/html/2608.26716v1#S0.F1.sf5)

> **デザインを「作る」だけでなく「意図どおりに直す」ことが難しい**
>
> - 文字を人物の背後に差し込む、文字の一部を図形へ置き換えるなど、複数のレイヤーで 1 つの視覚効果を表現
>   - 1 つの見た目を編集するにも、関連レイヤーをまとめて見つける必要
> - 画像として見えている領域と、編集すべきレイヤーの単位が一致しない場合がある _[Huang+ ECCV’26](https://arxiv.org/html/2608.26716v1#S1)_
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
> **(a) Clipping**: 元画像から切り抜いた領域を前面へ配置し、途中に別要素を挿入

> ![Figure 1(b): Blending](assets/beyond-atomic-blending.png)
>
> **(b) Blending**: 異なる画像領域を組み合わせ、統一的な形状を構成

> ![Figure 1(c): Overlaying](assets/beyond-atomic-overlaying.png)
>
> **(c) Overlaying**: 輪郭・影などを重ね、要素の視覚的な階層を強調

> ![Figure 1(d): Morphing](assets/beyond-atomic-morphing.png)
>
> **(d) Morphing**: 文字の一部を図形・画像へ置換

**既存研究との違い**

- **文書・画面理解**: LayoutLMv3 / ScreenQA は、主に文書や画面の個別要素を理解 _[Huang+ MM’22 / Hsiao+ NAACL’25](https://arxiv.org/html/2608.26716v1#S2.SS3)_
- **デザイン生成**: COLE / ART は、複数レイヤーからなる編集可能なデザインを生成 _[Jia+ arXiv’23 / Pu+ CVPR’25](https://arxiv.org/html/2608.26716v1#S2.SS2)_
- **本研究**: どのレイヤー同士が結びつき、どのデザイン意図を実現しているかを問う

出典: [Huang+ ECCV’26, Sec. 1–2, Fig. 1(a–d), Table 1](https://arxiv.org/html/2608.26716v1#S0.F1)

---

<!-- _class: title-slide-big classification-public debug-layout -->

# 表紙用の背景

`_class: title-slide-big classification-public`

---

<!-- _class: content-slide-gray classification-public debug-layout -->

## 図や説明を置くページ

`_class: content-slide-gray classification-public`

---

<!-- _class: takahashi classification-public debug-layout -->

# 伝えたいことを一つ
