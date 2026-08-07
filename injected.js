// タブのページコンテキストへ注入して実行する関数群。
//
// chrome.scripting.executeScript は関数を文字列化して注入するため、
// ここに置く関数は「外部スコープを一切参照しない自己完結な実装」でなければならない。
// import した定数やユーティリティを参照すると注入先で ReferenceError になる。

// ページと同一オリジンで Markdown を取得する。
// Service Worker からの fetch と違い、ページのセッション Cookie がそのまま送られるため、
// esa のようなログインが必要なサービスでも認証済みの本文を取得できる。
export async function fetchMarkdownInPage(markdownUrl, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(markdownUrl, {
      credentials: "same-origin",
      redirect: "follow",
      cache: "no-store",
      headers: { Accept: "text/markdown, text/plain;q=0.9, */*;q=0.1" },
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || "",
      text: await response.text(),
    };
  } catch (error) {
    const aborted = error && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      error: aborted ? "タイムアウトしました" : String((error && error.message) || error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// クリップボードへ書き込む。
// navigator.clipboard はドキュメントが未フォーカスの場合に失敗することがあるため、
// 失敗時は execCommand("copy") へフォールバックする。
export function copyTextInPage(text) {
  const copyViaExecCommand = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    const container = document.body || document.documentElement;
    container.appendChild(textarea);

    const selection = document.getSelection();
    const savedRanges = [];
    if (selection) {
      for (let i = 0; i < selection.rangeCount; i += 1) savedRanges.push(selection.getRangeAt(i));
    }

    // execCommand("copy") はページ側の copy リスナにも配送され、そこで setData / preventDefault
    // されるとクリップボードの内容を差し替えられてしまう。しかも execCommand は横取りされても
    // true を返すため、放置すると「誤った内容を成功として通知する」状態になる。
    // イベントパス最上位（window の capture）で伝播を止めてページ側へ渡さず、
    // 自前のリスナに届いたか・届いた時点で既に preventDefault されていたかで横取りを検知する。
    let reached = false;
    let hijacked = false;
    const onCopy = (event) => {
      reached = true;
      // ここに届く前に preventDefault されていたら、より早く登録されたページ側リスナに奪われている
      if (event.defaultPrevented) hijacked = true;
      // preventDefault はしない。伝播だけ止めて、textarea の選択内容をコピーする既定動作に委ねる
      event.stopImmediatePropagation();
    };
    window.addEventListener("copy", onCopy, true);

    let executed = false;
    try {
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      executed = document.execCommand("copy");
    } catch {
      executed = false;
    } finally {
      window.removeEventListener("copy", onCopy, true);
      textarea.remove();
      if (selection && savedRanges.length > 0) {
        selection.removeAllRanges();
        for (const range of savedRanges) selection.addRange(range);
      }
    }

    if (!executed) return { ok: false, error: "このページではクリップボードへ書き込めません" };
    if (!reached || hijacked) {
      return { ok: false, error: "ページ側のスクリプトにコピー操作を横取りされました" };
    }
    return { ok: true, method: "exec-command" };
  };

  try {
    window.focus();
  } catch {
    /* フォーカス取得の失敗はコピー可否に直結しないため無視する */
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => ({ ok: true, method: "clipboard-api" }),
      (error) => {
        const fallback = copyViaExecCommand();
        if (fallback.ok) return fallback;
        return { ok: false, error: fallback.error || String((error && error.message) || error) };
      },
    );
  }

  return copyViaExecCommand();
}

// 結果をページ右上のトーストで知らせる。
// ページ側の CSS の影響を受けないよう Shadow DOM に閉じ、スタイルは要素の style 属性で与える
// （インライン <style> はページの CSP に阻まれることがあるため）。
// actionLabel を渡すと設定画面を開くボタンを添え、読む時間を確保するため表示時間も延ばす。
export function showToastInPage(message, kind, actionLabel) {
  const HOST_ID = "copy-as-markdown-toast-host";
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  const palette = {
    success: { background: "#15803d", color: "#f0fdf4" },
    error: { background: "#b91c1c", color: "#fef2f2" },
    info: { background: "#334155", color: "#f8fafc" },
  };
  const colors = palette[kind] || palette.info;
  const hasAction = Boolean(actionLabel);

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = [
    "all:initial",
    "display:block",
    "position:fixed",
    "top:16px",
    "right:16px",
    "z-index:2147483647",
    hasAction ? "pointer-events:auto" : "pointer-events:none",
  ].join(";");

  const shadow = host.attachShadow({ mode: "closed" });
  const toast = document.createElement("div");
  toast.style.cssText = [
    `background:${colors.background}`,
    `color:${colors.color}`,
    "font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif",
    "font-size:13px",
    "font-weight:600",
    "line-height:1.6",
    "padding:10px 14px",
    "border-radius:8px",
    "box-shadow:0 6px 24px rgba(0,0,0,0.28)",
    "max-width:360px",
    "opacity:0",
    "transform:translateY(-6px)",
    "transition:opacity 160ms ease,transform 160ms ease",
  ].join(";");

  const body = document.createElement("div");
  body.textContent = message;
  body.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere";
  toast.appendChild(body);

  if (hasAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionLabel;
    button.style.cssText = [
      "all:unset",
      "display:inline-block",
      "margin-top:10px",
      "padding:6px 12px",
      `background:${colors.color}`,
      `color:${colors.background}`,
      "font-family:inherit",
      "font-size:12px",
      "font-weight:700",
      "border-radius:6px",
      "cursor:pointer",
    ].join(";");
    button.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-options" });
      host.remove();
    });
    toast.appendChild(button);
  }

  shadow.appendChild(toast);
  // body に transform / filter / will-change / contain が指定されていると position:fixed の基準が
  // ビューポートから body に切り替わり、スクロール中はトーストが画面外に描画される。
  // body を経由せず documentElement 直下へ挿す。
  document.documentElement.appendChild(host);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(
    () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-6px)";
      setTimeout(() => host.remove(), 240);
    },
    hasAction ? 12_000 : 2_600,
  );
}
