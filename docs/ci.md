# CI でスライドを検査する

## main への変更を CI で検査する

`main` 向けの Pull Request と `main` への push で、[Slides ワークフロー](../.github/workflows/slides.yml) が `mise run check-release`・`mise run test`・`mise run test-layout`・`mise run pdf` を実行します。ローカルと OS・CPU を揃えるため macOS 26 (arm64) を使いますが、Chrome の更新で改行が変わる場合はあります。成功・失敗のどちらでも、生成済みの PDF と原寸 PNG・`review.md` を Actions の `slides-review` artifact から確認できます。

`mise run check-release` はサンプルを含む `slides/` 以下の Markdown を調べ、1 行で書いた `class:` / `_class:` 指定に `debug-layout` があれば失敗します。除外を設ける場合は `scripts/check-release.cjs` の `excludedPaths` を編集します。

検査が通るまでマージできないようにするには、管理者が GitHub の Settings → Rules → Rulesets で `main` を対象にし、Require status checks to pass で **Validate slides** を必須にします。従来の branch protection でも同じチェック名を選べます。一度ワークフローを実行してから設定してください。CI の追加だけでは、このリポジトリ設定は変わりません。
