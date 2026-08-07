# Service Worker のキャッシュ戦略を 3 つに絞る

TECHLOG 編集部 | 2026/08/09

タグ: Web / ServiceWorker / PWA / パフォーマンス

## はじめに

Service Worker のキャッシュ戦略は、名前の付いたパターンだけでも 6 種類ほど知られている。
しかし実際のプロダクトで運用してみると、**使い分けが必要なのは 3 つだけ**だった。
残りは組み合わせで表現できるか、そもそも選ぶべき場面がほとんどない。

この記事では、社内の管理画面（月間 40 万リクエスト）を 8 ヶ月運用した結果をもとに、
戦略を 3 つに絞った経緯と、絞ったあとに何が楽になったかをまとめる。

## 3 つに絞った結果

採用したのは次の 3 つ。判断は「更新の速さ」と「オフラインでの生存」のどちらを優先するかだけで決まる。

| 戦略 | 適用先 | 選ぶ理由 |
| --- | --- | --- |
| `cache-first` | ハッシュ付き静的アセット | 内容が変わればファイル名が変わるので、古い版を返す事故が起きない |
| `network-first` | API レスポンス | 鮮度が最優先。落ちたときだけキャッシュに退避する |
| `stale-while-revalidate` | アバター・OGP 画像 | 多少古くても実害がなく、体感速度への寄与が大きい |

> 迷ったら `network-first` にしておく。表示が遅いのは苦情で済むが、古いデータを見せるのは事故になる。

## 実装

ルーティングは 1 箇所に集約した。戦略ごとに `fetch` ハンドラを分けると、
どのリクエストがどの経路に乗るのか追えなくなる。

```js
// リクエストの種類から戦略を 1 つだけ選ぶ
const pickStrategy = (request) => {
  const url = new URL(request.url);

  if (url.pathname.startsWith('/assets/')) return cacheFirst;
  if (url.pathname.startsWith('/api/'))    return networkFirst;
  if (request.destination === 'image')       return staleWhileRevalidate;

  return networkFirst;
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(pickStrategy(event.request)(event.request));
});
```

### キャッシュ名にバージョンを埋める

デプロイのたびに古いキャッシュを消したくなるが、消すのは `activate` の中だけに限定したほうがよい。

- キャッシュ名は `assets-v12` のように単調増加させる
- 削除は `activate` で、現行バージョン以外をまとめて捨てる
- `install` では消さない。前の版がまだ動いている可能性がある

## 計測結果

絞る前後で、初回表示以外の指標を 4 週間ずつ比較した。

| 指標 | 絞る前 | 絞った後 |
| --- | --- | --- |
| 再訪問時の LCP 中央値 | 1.42 s | 0.86 s |
| キャッシュ起因の不具合報告 | 月 3.2 件 | 月 0.4 件 |
| sw.js の行数 | 418 行 | 146 行 |

効果が大きかったのは速度より **不具合報告の減少**だった。
戦略が 3 つなら、報告を受けた時点でどの経路を疑えばよいかが即座に決まる。

## まとめ

1. 戦略は 3 つに絞る。増やすほど障害調査の初動が遅くなる
2. ルーティングは 1 関数に集約し、上から順に評価する
3. 迷ったら `network-first`。古いデータを見せない側に倒す

---

このページは Chrome 拡張 [copy-md](https://github.com/sunanana/copy-md) の動作確認用に用意したデモ記事です。
