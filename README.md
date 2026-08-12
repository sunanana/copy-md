# copy-md

開いているページの内容を Markdown として取得し、クリップボードにコピーする Chrome 拡張。

| やりたいこと | 操作 |
| --- | --- |
| ページ全体をコピー | ツールバーのアイコンをクリック、またはショートカットキー |
| 選択した範囲だけコピー | テキストを選択して右クリック →「選択範囲を Markdown としてコピー」 |

## インストール

Chrome ウェブストアから追加できる。

[<img src="docs/images/chrome-web-store-badge.png" alt="Chrome ウェブストアから入手" width="248">](https://chromewebstore.google.com/detail/copy-md/lokkcglgmalbleieekepcafdkiaegkcm)

インストール後、下記の[セットアップ](#セットアップ)で API キーを設定する。

## セットアップ

サービスから直接 Markdown を取得できるサイト以外のページは Jina AI Reader を経由するため、
API キーの設定が必要。

1. [https://jina.ai/](https://jina.ai/) で `jina_` から始まる API キーを取得する
2. ツールバーの拡張アイコンを**右クリック**して「オプション」を選ぶ
3. キーを貼り付ける（入力が止まると自動で保存される）

設定は `chrome.storage.local` にこの端末のみで保存される。

## ショートカットキー

アイコンのクリックと同じ動作をキーボードから実行できる。

| OS | 既定のキー |
| --- | --- |
| macOS | `Ctrl + Shift + W` |
| Windows / Linux | `Alt + Shift + W` |

`chrome://extensions/shortcuts` から各自で変更できる。ただし Chrome の制限で
**修飾キーは 2 つまで**（`Cmd + Ctrl + Shift + W` のような 3 つの組み合わせは登録できない）。
また、`Ctrl + Shift + W` のようなウィンドウ管理系の Chrome 標準ショートカットは
拡張から上書きできないため、割り当てても動作しない。

## 選択範囲のコピー

テキストを選択して右クリックすると、コンテキストメニューに
「選択範囲を Markdown としてコピー」が現れる。選択していないときは表示されない。

こちらは外部サービスを一切経由せず、選択範囲の DOM をその場で Markdown に組み立てる。
API キーの設定は不要で、ページ全体の取得とは独立して使える。

対応している要素は以下。これ以外はテキストとして取り込まれる。

| 種別 | 対応 |
| --- | --- |
| 見出し | `h1` 〜 `h6` |
| 段落・改行 | `p`、`br` |
| 強調 | `strong` / `b`、`em` / `i`、`del` / `s` |
| リンク・画像 | `a`、`img`（相対 URL は絶対 URL に変換） |
| リスト | `ul`、`ol`（`start` 属性と入れ子に対応） |
| コード | `code`、`pre`（`language-*` クラスから言語名を拾う） |
| 引用・区切り | `blockquote`、`hr` |
| 表 | `table`（見出しのない表には空の見出し行を補う） |

## Markdown を取得するまでの流れ

![Markdown を取得するまでのフロー図](docs/images/flow.png)

「直接取得するサイト」は設定画面の表で追加・削除できる。
なお、この流れはページ全体の取得のみに関わる。選択範囲のコピーはここを通らない。

## 既知の制限

- Jina AI Reader にはレート制限がある
- ログインが必要なページは、「直接取得するサイト」に登録していないと取得できない
- `chrome://` や Chrome ウェブストアなど、Chrome がスクリプト注入を禁止しているページでは動作しない
- インラインフレームの中の選択範囲は取得できない（その旨を通知する）
- 表のセル結合（`colspan` / `rowspan`）は Markdown に表現がないため、結合前の升目として出力される

## プライバシー

どの情報が端末内に留まり、どの情報が外部へ出るかは [PRIVACY.md](PRIVACY.md) に記載している。

## 開発

開発環境の準備と動作確認の手順は [CONTRIBUTING.md](CONTRIBUTING.md) を参照。

## ライセンス

[MIT](LICENSE)
