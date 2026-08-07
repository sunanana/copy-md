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
| `activeTab` | アイコンをクリックしたタブに限り、URL の読み取りとスクリプト注入を許可してもらうため |
| `scripting` | `chrome.scripting.executeScript` でアクティブタブに関数を注入するため |
| `clipboardWrite` | 注入したスクリプトからクリップボードへ書き込むため |
| `storage` | API キーと直接取得ルールを `chrome.storage.local` に保存するため |

`host_permissions` は `https://r.jina.ai/*` のみ。直接取得するサイトについては宣言していない。
アイコンをクリックした瞬間に `activeTab` が付与され、その権限でページに関数を注入し、
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

## docs/ の公開

`docs/` は GitHub Pages で公開している。`main` に push すると自動で反映される
（ワークフローの追加は不要）。
