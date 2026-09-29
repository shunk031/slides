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

# _Beyond Atomic Layouts: Compositional Design Understanding with Vision‑Language Models_

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

<!-- _class: content-slide-gray classification-public debug-layout -->

## 本論文の選定理由 | _初稿生成だけでなく「狙って直せる」デザイン生成まで扱う_

**デザインの自動生成で気になる問題**

- 最初の見た目を生成する研究は増えている
  - ただし、素材が増えると位置・大きさ・前後関係が崩れやすい
  - 一度生成した後に「この要素だけ直す」を繰り返せる仕組みはまだ弱い
- 実際の制作では、初稿をそのまま採用するとは限らない
  - 個別要素の修正 → 全体の再調整を何度も繰り返す
  - 生成品質だけでなく、修正のしやすさも実用性を左右する

**そこで本研究の紹介**

- 座標を言語モデルで扱うときの不安定さを、どのように学習側から緩和するか
- 配置の正しさと「見た目の良さ」を、異なる学習段階でどう与えるか
- レイアウト推論と画像編集を分けることで、複数回の局所編集をどう実現するか

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
