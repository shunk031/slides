---
marp: true
theme: ly
class: classification-public
size: 16:9
lang: ja
_class: lead first-slide classification-public
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
    top: 0;
    right: 0;
    transform: translateY(-100%);
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
---

# 非公式 LINE ヤフー Marp テンプレートを作ってみた / DIY: Unofficial LY Marp Template

---

## Why

スライドも markdown で書きたい…。

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
