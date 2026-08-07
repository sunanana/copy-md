# copy-md プライバシーポリシー / Privacy Policy

最終更新 / Last updated: 2026-08-08

---

## 日本語

### 1. 開発者による情報収集について

本拡張機能（以下「本拡張」）の開発者は、利用者に関するいかなる情報も収集・保存・送信しません。
アクセス解析、行動トラッキング、クラッシュレポートの仕組みは一切組み込まれていません。
開発者が管理するサーバーは存在しません。

### 2. 端末内にのみ保存される情報

次の情報は利用者の端末内（`chrome.storage.local`）にのみ保存されます。
外部に送信されることはなく、Google アカウントを通じて他の端末に同期されることもありません。

- Jina AI の API キー
- 「直接取得するサイト」の設定内容

拡張機能を削除すると、これらの情報も端末から削除されます。

### 3. 外部サービスへ送信される情報

本拡張は、ツールバーのアイコンがクリックされたときにのみ動作し、次の 2 経路のいずれかでページを取得します。

**(a) 直接取得 — 第三者への送信は発生しません**

閲覧中の URL が「直接取得するサイト」の設定に一致する場合、閲覧中のページと同一のオリジンに対して取得要求を行います。
この経路では、いかなる情報も第三者に送信されません。

**(b) Jina AI Reader 経由 — 第三者への送信が発生します**

上記に一致しない場合、**閲覧中のタブの URL** および **利用者の API キー** が、
第三者サービスである Jina AI Reader (`https://r.jina.ai/`) に送信されます。

送信された情報の取り扱いは、Jina AI（Elastic 社）の利用規約およびプライバシーポリシーに従います。

- https://jina.ai/legal/

取得された Markdown は利用者の端末のクリップボードに書き込まれるのみで、
開発者を含む他の第三者に送信されることはありません。

> **重要**
> 社内システム、限定公開のページ、URL 自体に顧客名や案件名などの秘密情報を含むページで本拡張を使用した場合、
> その URL は上記の第三者サービスに送信されます。
> 該当するサイトは「直接取得するサイト」に登録したうえで使用するか、本拡張を使用しないでください。

### 4. Jina AI との契約関係

API キーは利用者自身が Jina AI から取得します。
したがって Jina AI のサービス利用に関する契約関係は利用者と Jina AI の間に成立し、本拡張の開発者はその当事者ではありません。
API キーの管理責任および当該キーを用いて行われる一切の行為についての責任は、
Jina AI の利用規約に基づき、キーの取得者である利用者が負います。

### 5. 免責事項

- 本拡張は現状有姿（AS IS）で提供されます。開発者は、明示・黙示を問わず、
  商品性、特定目的への適合性、正確性、継続的な提供可能性を含むいかなる保証も行いません。
- 本拡張を用いて取得したコンテンツの著作権その他の権利は、当該コンテンツの権利者に帰属します。
  取得および取得後の利用が、取得先サイトの利用規約、著作権法その他の法令に適合するかどうかの判断と、
  それに伴う一切の責任は、利用者が負うものとします。
- 本拡張の使用または使用不能に起因して生じた損害（情報の漏洩、データの消失、逸失利益、業務の中断等を含みますが、
  これらに限られません）について、開発者は一切の責任を負いません。
- 本拡張は Jina AI およびその関連会社の公式製品ではなく、これらの企業による承認・提携・後援を受けたものでもありません。
  第三者サービスの仕様変更、価格改定、提供終了等により本拡張の機能が利用できなくなる場合がありますが、
  開発者はこれに対して責任を負わず、対応や修正を保証しません。

### 6. 本ポリシーの変更

本ポリシーは予告なく変更されることがあります。変更後の内容は、本ページに掲載された時点で効力を生じます。

### 7. お問い合わせ

本ポリシーおよび本拡張に関するお問い合わせは、次のメールアドレス宛にお願いします。

toraneko.suna@gmail.com

---

## English

### 1. Data collected by the developer

The developer of this extension (the "Extension") does not collect, store, or transmit any information about its users.
No analytics, tracking, or crash-reporting mechanisms are included. The developer operates no server.

### 2. Data stored locally on your device

The following data is stored only on the user's device via `chrome.storage.local`.
It is never transmitted externally and is not synced to other devices through a Google account.

- The user's Jina AI API key
- The user's "direct fetch sites" configuration

Uninstalling the Extension removes this data from the device.

### 3. Data sent to external services

The Extension acts only when the user clicks the toolbar icon, and retrieves the page through one of two paths.

**(a) Direct fetch — no transmission to any third party**

If the current URL matches the user's "direct fetch sites" configuration, the Extension requests the page from the
same origin as the page being viewed. No data is sent to any third party on this path.

**(b) Via Jina AI Reader — data is transmitted to a third party**

Otherwise, **the URL of the active tab** and **the user's API key** are sent to Jina AI Reader
(`https://r.jina.ai/`), a third-party service.

Handling of the transmitted data is governed by the terms and privacy policy of Jina AI (Elastic):

- https://jina.ai/legal/

The resulting Markdown is written only to the user's clipboard. It is not transmitted to the developer or to any
other third party.

> **Important**
> If the Extension is used on internal systems, unlisted pages, or pages whose URL itself contains confidential
> information such as client or project names, that URL will be sent to the third-party service described above.
> Register such sites under "direct fetch sites" before use, or do not use the Extension on them.

### 4. Relationship with Jina AI

Users obtain their own API key directly from Jina AI. The contractual relationship for the use of Jina AI's services
is therefore between the user and Jina AI; the developer of the Extension is not a party to it.
Under Jina AI's terms of service, responsibility for safeguarding the API key and for all activity performed with it
rests with the user who obtained the key.

### 5. Disclaimer

- The Extension is provided "AS IS", without warranty of any kind, express or implied, including but not limited to
  warranties of merchantability, fitness for a particular purpose, accuracy, or continued availability.
- Copyright and other rights in any content retrieved through the Extension remain with the respective rights holders.
  The user is solely responsible for determining whether such retrieval and any subsequent use complies with the terms
  of service of the source site, applicable copyright law, and any other applicable law.
- The developer accepts no liability for any damages arising from the use of or inability to use the Extension,
  including but not limited to disclosure of information, loss of data, lost profits, or business interruption.
- The Extension is not an official product of Jina AI or its affiliates, and is not endorsed by, affiliated with, or
  sponsored by them. Changes to, repricing of, or discontinuation of third-party services may render the Extension
  non-functional; the developer accepts no liability for this and does not guarantee any fix or response.

### 6. Changes to this policy

This policy may be changed without prior notice. Changes take effect when published on this page.

### 7. Contact

For questions about this policy or the Extension, please contact:

toraneko.suna@gmail.com
