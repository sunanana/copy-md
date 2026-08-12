# CONTRIBUTING

## 開発版のインストール

ビルドは不要。素の JS のみで構成されているので、リポジトリをそのまま読み込める。

1. リポジトリをクローンする

   ```console
   $ git clone https://github.com/sunanana/copy-md.git
   ```

2. `chrome://extensions` を開く
3. 右上の「デベロッパーモード」を ON にする
4. 「パッケージ化されていない拡張機能を読み込む」で、クローンしたディレクトリを選択する
5. ツールバーに拡張が現れる（パズルピースのアイコンからピン留めしておくと確認しやすい）

コードを変更したら、`chrome://extensions` の拡張カードにある再読み込みボタンを押す。
`background.js`（Service Worker）を変えた場合は再読み込みが必須。

キーボードショートカットを割り当てたい場合は `chrome://extensions/shortcuts` から設定する
（manifest 側の設定は不要）。

## ストア提出用の ZIP を作る

```console
$ make zip
```

`manifest.json` の `version` を読み取って `dist/copy-md-<version>.zip` を出力する。
拡張本体のファイルだけを含め、`README.md` / `CONTRIBUTING.md` / `PRIVACY.md` / `docs/` /
`Makefile` は入れない。`.DS_Store` と `_metadata/` も除外する。

| コマンド | 内容 |
| --- | --- |
| `make` / `make help` | コマンド一覧を表示 |
| `make zip` | ストア提出用の ZIP を `dist/` に作成 |
| `make check` | パッケージ対象のファイルが揃っているか検査 |
| `make version` | `manifest.json` のバージョンを表示 |
| `make clean` | `dist/` を削除 |

新しいファイルを追加したときは `Makefile` の `SOURCES` にも追記する。
追記を忘れると ZIP に入らないまま提出してしまうため、`make zip` の出力に出るファイル一覧を
毎回確認する。

バージョンを上げるときは `manifest.json` の `version` を編集してから `make zip` を実行する。
ストアは同じバージョン番号の再アップロードを受け付けない。

## ファイル構成

```
manifest.json      権限とエントリポイントの宣言
background.js      Service Worker。取得〜コピー〜通知のオーケストレーション
sources.js         既定ルール・ワイルドカード照合・取得先 URL の解決ロジック
injected.js        ページへ注入して実行する関数群（fetch / clipboard / toast）
spinner.js         取得中にバッジを回すスピナー
settings.js        API キーと直接取得ルールの保存・読み出し（background / options で共有）
options.html/.js/.css   設定画面
popup.html/.js/.css     API キー未設定時に出る誘導ポップアップ
icons/             拡張アイコン
docs/              GitHub Pages で公開する静的ページと README 用の画像
Makefile           ストア提出用 ZIP の作成
```

## 動作確認

### 直接取得の経路

「直接取得するサイト」に登録済みのページを開き、拡張アイコンをクリックする。
外部サービスを経由しないので API キーは不要。

デバッグは `chrome://extensions` の拡張カードにある「Service Worker」リンクから
DevTools を開いて行う。ページ側に注入したコードのログは、対象ページの DevTools に出る。

### Jina AI Reader 経由の経路

登録していないページで確認する。API キーの設定が必要。

`r.jina.ai` は Cloudflare のボット判定の後ろにあり、`Authorization` ヘッダのない
リクエストはブラウザの User-Agent で来ると JavaScript チャレンジ（`cf-mitigated: challenge`
付きの HTTP 403）を返される。Service Worker からの fetch には Chrome 本体の User-Agent が
付くため、キーなしでは必ず 403 になる。API キーは規約面だけでなく、動作させるためにも必要。

## 直接取得するサイトを追加するときの注意

設定画面の表で編集する。コードを触る必要はない。

追加する前に、その URL が本当に Markdown を返すか確認すること。
表に載せた時点でそのサイトは Jina AI Reader 経由の経路から外れるため、
直接取得に失敗すると「追加前は取れていたのに取れなくなる」。

```console
$ curl -sI 'https://example.com/articles/foo.md' | grep -i '^content-type'
content-type: text/markdown; charset=utf-8    # OK
```

`content-type` が `text/html` のものは追加してはいけない。拡張は HTML を受け取ると
「Markdown ではなく HTML を返しました」というエラーにする（未ログイン判定のため）。
HTTP 200 を返していても中身が not-found の HTML というサイトがあるので、
ステータスコードだけで判断しない。

ワイルドカード:

| 記号 | 一致するもの |
| --- | --- |
| `*` | スラッシュを跨がない任意の文字列（パスの 1 階層分、ホスト名のドットは跨ぐ） |
| `**` | スラッシュを含む任意の文字列 |

直接取得は必ずページと同一オリジンで fetch される。別オリジンの API を叩きたい場合は
`host_permissions` の追加と Service Worker 側での fetch が別途必要になる。

## 設計上の判断

### 権限を最小にしている

| 権限 | 理由 |
| --- | --- |
| `activeTab` | ユーザーが明示的に起動したタブに限り、URL の読み取りとスクリプト注入を許可してもらうため |
| `scripting` | `chrome.scripting.executeScript` でアクティブタブに関数を注入するため |
| `clipboardWrite` | 注入したスクリプトからクリップボードへ書き込むため |
| `storage` | API キーと直接取得ルールを `chrome.storage.local` に保存するため |
| `contextMenus` | 選択範囲のコピーを右クリックメニューから起動できるようにするため |

`activeTab` が付与される操作は限られており、この拡張が持つ 3 つの起動経路はいずれもその対象に入る。

| 起動経路 | 付与される操作 |
| --- | --- |
| アイコンのクリック | アクションの実行 |
| ショートカットキー | `commands` API のキーボードショートカットの実行 |
| コンテキストメニュー | コンテキストメニュー項目の実行 |

`contextMenus` はユーザー向けの権限警告を伴わない。既存ユーザーの拡張が
「新しい権限の承認待ち」で無効化されることもない。

`host_permissions` は `https://r.jina.ai/*` のみ。直接取得するサイトについては宣言していない。
ユーザーが起動した瞬間に `activeTab` が付与され、その権限でページに関数を注入し、
ページ自身のオリジンから fetch するため。この方式を採る理由は 2 つある。

1. **Cookie が確実に送られる**。Service Worker からの `credentials: "include"` は `SameSite`
   属性の扱いによって送信されないことがあるが、ページコンテキストからの同一オリジン fetch なら
   確実にセッションが乗る
2. **設定でサイトを追加しても `host_permissions` が増えない**

### プロキシへ渡す URL をエスケープしている

`https://r.jina.ai/{元のURL}` の連結時に `encodeURIComponent` を挟んでいる。生のまま繋ぐと、
対象 URL のパスに含まれる `%2F` や `%23` がプロキシ側のデコードで区切り文字に化け、
別のページの内容がエラーにならずコピーされてしまう。

### タイムアウトを 30 秒未満にしている

直接取得が 15 秒、Jina AI Reader 経由が 25 秒。Manifest V3 の Service Worker は
「fetch のレスポンスが 30 秒以内に届かない」場合に強制終了され、それを超えると
エラー通知すら出せなくなるため。

### ショートカットに `_execute_action` を使っている

独自コマンド名 + `chrome.commands.onCommand` ではなく予約コマンドの `_execute_action` を宣言している。
アクションそのものを起動するため、キーボードからでもアイコンクリックと完全に同じ経路
（`chrome.action.onClicked`、APIキー未設定時のポップアップ表示を含む）を通り、分岐を持たずに済む。

`suggested_key` はあくまで既定値で、ユーザーは `chrome://extensions/shortcuts` から変更できる。
拡張側から割当を書き換える API は存在せず、`chrome.commands.getAll` による読み取りのみ可能。

キーの組み合わせは Chromium 側のパーサ（`ui/base/accelerators/command.cc` の `ParseImpl`）で
`+` 区切り 3 トークンまでに制限されている。つまり **修飾キーは 2 つまで**で、
`Cmd + Ctrl + Shift + W` のような指定は manifest でも設定画面でも受け付けられない。
macOS 向けの `Ctrl` は `Ctrl` と書くと `Command` に正規化されるため、
Ctrl キーそのものを使いたい場合は `mac` セクションで `MacCtrl` と書く必要がある。
なお `Alt` と `Ctrl`／`Command` の同時指定は AltGr との衝突を避けるため Chromium 自体が拒否する。

`W` を使う組み合わせは、ウィンドウ／タブを閉じる系の標準ショートカットとの衝突に注意がいる。
`Ctrl + W`（macOS では `⌘W`）はタブを閉じる、`Ctrl + Shift + W`（同 `⇧⌘W`）はウィンドウを閉じる。
これらウィンドウ管理系の標準ショートカットは常に優先され拡張から上書きできないため、
割り当てても押した瞬間にウィンドウが閉じるだけになる。
そのため macOS は `Command` を避けた `⌃⇧W`（`MacCtrl+Shift+W`）、
Windows / Linux は `Ctrl` を避けた `Alt+Shift+W` にしている。

なお `suggested_key` が他の拡張に先取りされている場合、Chrome は警告を出さず自動割当を
見送る（`AddKeybindingPref` が上書き不可で false を返す）。このとき設定画面には manifest の
提案値がそのまま表示されるため、割り当て済みに見えてしまう。実際の割当は
`chrome.commands.getAll()` の `shortcut` が空でないかで判断する。

### 選択範囲の Markdown 化をページ側で行っている

Service Worker には DOM も `DOMParser` も無く、HTML を解析する手段がない。
一方ページには解析済みの DOM がそのまま存在するので、選択範囲を DOM として辿れる。
そのため変換処理は `markdown.js` に置き、注入して実行している。

`chrome.scripting.executeScript` は関数を文字列化して注入するため、
`markdown.js` が公開する関数は外部スコープを一切参照できない。
定数も補助関数もすべて関数の内側に閉じている。`injected.js` と同じ制約が働く。

選択範囲は `Range.cloneContents()` で複製するが、これは**共通祖先そのものを複製しない**。
リストの途中や表の途中を選ぶと `<ul>` や `<table>` が欠けた断片が返り、
箇条書きや表として組み立てられなくなる。そのため祖先を内側から辿り、
文脈を持つ要素（`ul` / `ol` / `li` / `blockquote` / `pre` / `table` 系）だけを
浅い複製で包み直してから変換している。

外部ライブラリを同梱せず自前で実装しているのは、Manifest V3 がリモートコードの実行を
禁じており同梱が前提になること、そして審査では難読化・minify されたコードの検証が
難しいとされるためである。対応要素を絞れば数百行に収まる。

### インラインフレーム内の選択を扱わない

最上位フレームにのみ注入する構成にしている。選択がフレームの内側にある場合、
最上位フレームの `window.getSelection()` は空になる一方、
`chrome.contextMenus.onClicked` が渡す `info.selectionText` には選択した文字列が入る。
この食い違いで「選択はフレームの内側にある」と判定し、その旨を通知して終える。

`info.frameId` を `executeScript` の `target.frameIds` に渡せばフレーム内も扱えるが、
起動経路ごとに注入先を切り替える分岐が増える。頻度の低いケースなので通知に留めている。

## docs/ の公開

`docs/` は GitHub Pages で公開している。`main` に push すると自動で反映される
（ワークフローの追加は不要）。
