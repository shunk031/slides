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
style: |
  section * {
    outline: 1px solid #e53935;
  }
  section::before, section::after {
    outline: 1px dashed #1976d2;
  }
  section :is(h1, h2, h3, h4, h5, h6, p, code) {
    position: relative;
  }
  section :is(h1, h2, h3, h4, h5, h6, p, code)::after {
    position: absolute;
    top: 100%;
    right: 0;
    padding: 2px 4px;
    background: #e53935;
    color: white;
    font: 14px/1.2 "LINE Seed JP", sans-serif;
    letter-spacing: 0;
    white-space: nowrap;
  }
  section :is(h1, h2, h3, h4, h5, h6)::after {
    content: "タイトル用";
  }
  section p::after {
    content: "本文用";
  }
  section code::after {
    content: "コード用";
  }
  section.paper-title > h1::after { content: "論文タイトル用"; }
  section.paper-title > p:nth-of-type(1)::after { content: "著者用"; }
  section.paper-title > p:nth-of-type(2)::after { content: "著者所属用"; }
  section.paper-title > p:nth-of-type(3)::after { content: "論文リンク用"; }
  section.paper-title > blockquote:nth-of-type(1) p:nth-of-type(1)::after { content: "発表者所属用"; }
  section.paper-title > blockquote:nth-of-type(1) p:nth-of-type(2)::after { content: "発表者名用"; }
  section.paper-title > blockquote:nth-of-type(1) p:nth-of-type(3)::after { content: "発表者リンク用"; }
  section.paper-title > blockquote:nth-of-type(2) p::after { content: "注記用"; }
  section.paper-title > p:nth-of-type(4)::after { content: "ロゴ用"; }
---

# Beyond Atomic Layouts: Compositional Design Understanding with Vision‑Language Models

Yiyang Huang¹˒²\*, Zhaowen Wang²†, Simon Jenni², Jing Shi²,
Yitian Zhang¹, Yizhou Wang¹, and Yun Fu¹

¹Northeastern University, Boston, USA / ²Adobe Research, San Jose, USA

Project page: [hukcc.github.io/Beyond-Atomic-Layouts/](https://hukcc.github.io/Beyond-Atomic-Layouts/), arXiv: [arxiv.org/abs/2608.26716](https://arxiv.org/abs/2608.26716)

> **AI CBU / Visual Generation Dept.**
>
> **Shunsuke Kitada, Ph.D.**
>
> HP: [shunk031.me](https://shunk031.me) / X: [@shunk031](https://x.com/shunk031)

> ※本発表で紹介する図や数式は
> 対象の論文から引用しております

![LINEヤフー](../../themes/assets/ly/logo.svg)

---

<!-- _class: content-slide-gray classification-public -->

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

<!-- _class: title-slide-big classification-public -->

# 表紙用の背景

`_class: title-slide-big classification-public`

---

<!-- _class: content-slide-gray classification-public -->

## 図や説明を置くページ

`_class: content-slide-gray classification-public`

---

<!-- _class: takahashi classification-public -->

# 伝えたいことを一つ
