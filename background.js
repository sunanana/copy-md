// Service Worker 本体。
// アイコンクリックを起点に「取得先の解決 → Markdown 取得 → クリップボードへコピー → 通知」を束ねる。

import { resolveTarget } from "./sources.js";
import { copyTextInPage, fetchMarkdownInPage, showToastInPage } from "./injected.js";
import { getApiKey, getDirectSources } from "./settings.js";
import { startSpinner, stopSpinner } from "./spinner.js";

const PAGE_FETCH_TIMEOUT_MS = 15_000;
// MV3 の Service Worker は fetch のレスポンスが 30 秒以内に届かないと強制終了される。
// 上限を超えると AbortController が発火する前に Worker ごと消え、エラー通知すら出せないため 30 秒未満に保つ。
const READER_FETCH_TIMEOUT_MS = 25_000;
const BADGE_RESET_MS = 4_000;

// バッジ解除時に書き戻すツールチップ。空文字を渡すと default_title ではなく拡張機能名が表示されてしまう。
const DEFAULT_ACTION_TITLE = chrome.runtime.getManifest().action?.default_title ?? "";
// APIキーが必要になった時点で開く、設定への誘導ポップアップ
const SETUP_POPUP = "popup.html";
// ポップアップ側が張るポートの名前。表示されたことを検知するために使う。
const SETUP_POPUP_PORT = "setup-popup";
// 設定画面への行き方。トーストを出せないページでもこの文言だけは伝わるようにする。
const SETTINGS_HINT = "拡張アイコンを右クリック →「オプション」から設定できます";

// 同じタブでの二重実行を防ぐガード
const inFlightTabIds = new Set();
// タブごとのバッジ消去タイマー
const badgeResetTimers = new Map();

// ユーザーにそのまま提示してよいエラー。これ以外は予期しないエラーとして扱う。
//   needsSettings : 通知から設定画面へ直接飛べるようにする
//   promptSetup   : 設定を促すポップアップをその場で開く
class CopyMarkdownError extends Error {
  constructor(message, { needsSettings = false, promptSetup = false } = {}) {
    super(message);
    this.needsSettings = needsSettings;
    this.promptSetup = promptSetup;
  }
}

// 通知トーストの「設定を開く」ボタンから呼ばれる
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "open-options") chrome.runtime.openOptionsPage();
  return false;
});

// popup 指定が戻らないまま Service Worker が停止した場合の自己修復。
// 指定が残ったタブではアイコンを押すとポップアップが開くので、必ずここを通る。
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SETUP_POPUP_PORT) return;
  clearActiveTabPopup();
});

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab?.id;
  if (typeof tabId !== "number" || tabId === chrome.tabs.TAB_ID_NONE) return;
  if (inFlightTabIds.has(tabId)) return;

  inFlightTabIds.add(tabId);
  copyPageAsMarkdown(tab).finally(() => inFlightTabIds.delete(tabId));
});

// APIキーが要るのに未設定のとき、設定を促すポップアップをその場で開く。
// openPopup には popup 指定が必要なので対象タブだけに一時的に設定するが、
// 残したままだとそのタブで onClicked が発火しなくなり、キー不要のページまで使えなくなる。
// 表示済みのポップアップは popup 指定を外しても閉じないため、開いた直後に必ず戻す。
// openPopup はブラウザのバージョンやウィンドウの状態によって失敗しうるため、成否を返して
// 呼び出し側がページ内トーストへフォールバックできるようにする。
async function openSetupPopup(tabId) {
  if (typeof chrome.action.openPopup !== "function") return false;
  try {
    await chrome.action.setPopup({ tabId, popup: SETUP_POPUP });
    await chrome.action.openPopup();
    return true;
  } catch {
    return false;
  } finally {
    await clearTemporaryPopup(tabId);
  }
}

async function clearTemporaryPopup(tabId) {
  try {
    await chrome.action.setPopup({ tabId, popup: "" });
  } catch {
    /* タブが閉じられている場合など。popup 指定もタブごと消えるので実害はない */
  }
}

async function clearActiveTabPopup() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (typeof tab?.id === "number") await clearTemporaryPopup(tab.id);
  } catch {
    /* 取得できなければ次にポップアップが開いたときに再試行される */
  }
}

async function copyPageAsMarkdown(tab) {
  const tabId = tab.id;
  startSpinner(tabId);

  try {
    // activeTab 権限はアイコンクリック時に付与されるため、この時点で tab.url を参照できる
    const pageUrl = tab.url || (await readTabUrl(tabId));
    const target = resolveTarget(pageUrl, await getDirectSources());
    if (!target) {
      throw new CopyMarkdownError("対象外のページです。http / https のページで実行してください");
    }

    const markdown =
      target.kind === "direct" ? await fetchFromPage(tabId, target) : await fetchFromReader(target);
    if (!markdown.trim()) {
      throw new CopyMarkdownError(`${target.name} から空の Markdown が返りました`);
    }

    await copyToClipboard(tabId, markdown);
    const size = markdown.length.toLocaleString("ja-JP");
    await announce(tabId, `Markdown をコピーしました（${target.name} / ${size} 文字）`, "success");
  } catch (error) {
    const isKnown = error instanceof CopyMarkdownError;
    const message = isKnown
      ? error.message
      : `予期しないエラーが発生しました（${error?.message ?? error}）`;
    // ポップアップを出せたならトーストは重複するので省き、バッジだけ残す
    const openedPopup = isKnown && error.promptSetup ? await openSetupPopup(tabId) : false;
    await announce(tabId, message, "error", {
      needsSettings: isKnown && error.needsSettings,
      skipToast: openedPopup,
    });
  } finally {
    // announce の中でも止まるが、announce 自体が失敗した場合に回り続けないよう二重に止める
    stopSpinner(tabId);
  }
}

// 設定で直接取得と決めたサイト。ページと同一オリジンで fetch するのでセッション Cookie が使える。
async function fetchFromPage(tabId, target) {
  const result = await runInPage(tabId, fetchMarkdownInPage, [target.markdownUrl, PAGE_FETCH_TIMEOUT_MS]);
  if (!result) {
    throw new CopyMarkdownError(`${target.name} からの取得結果を受け取れませんでした`);
  }
  if (result.error) {
    throw new CopyMarkdownError(`${target.name} の取得に失敗しました（${result.error}）`);
  }
  if (!result.ok) {
    throw describePageFailure(target, result.status);
  }
  if (looksLikeHtml(result.contentType, result.text)) {
    throw new CopyMarkdownError(
      `${target.name} が Markdown ではなく HTML を返しました。ログイン状態と閲覧権限を確認してください`,
    );
  }
  return result.text;
}

// 直接取得の対象外。外部プロキシへは Service Worker から fetch する
// （ページから叩くと CORS に阻まれるうえ、ページのオリジンを外部に晒すことになるため）。
async function fetchFromReader(target) {
  // 直接取得できるサイトはここを通らないので、キーが要るページで初めて未設定を問題にする
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new CopyMarkdownError(
      `このページの取得には ${target.name} のAPIキーが必要です。\n${SETTINGS_HINT}`,
      { needsSettings: true, promptSetup: true },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), READER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(target.markdownUrl, {
      credentials: "omit",
      headers: {
        Accept: "text/plain, text/markdown;q=0.9, */*;q=0.1",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw describeReaderFailure(target, response.status, {
        detail: await readErrorDetail(response),
        // Cloudflare のボット判定によるブロックはキーの問題ではないので区別する
        blockedByBotCheck:
          response.headers.get("cf-mitigated") !== null ||
          (response.headers.get("content-type") || "").toLowerCase().includes("text/html"),
      });
    }
    // fetch はヘッダ受信時点で解決するため、本文の読み取りも try の内側に置く。
    // ここを外に出すと、ボディ送信が途中で止まったときにタイムアウトが効かず処理がハングする。
    return await response.text();
  } catch (error) {
    if (error instanceof CopyMarkdownError) throw error;
    throw new CopyMarkdownError(
      error?.name === "AbortError"
        ? `${target.name} がタイムアウトしました`
        : `${target.name} への接続に失敗しました（${error?.message ?? error}）`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function copyToClipboard(tabId, markdown) {
  const result = await runInPage(tabId, copyTextInPage, [markdown]);
  if (!result?.ok) {
    throw new CopyMarkdownError(
      `クリップボードへのコピーに失敗しました（${result?.error ?? "原因不明"}）`,
    );
  }
}

async function runInPage(tabId, func, args) {
  let injections;
  try {
    injections = await chrome.scripting.executeScript({ target: { tabId }, world: "ISOLATED", func, args });
  } catch (error) {
    throw new CopyMarkdownError(
      `このページではスクリプトを実行できません（${error?.message ?? error}）`,
    );
  }

  const injection = injections?.[0];
  if (!injection) {
    throw new CopyMarkdownError("ページから応答がありませんでした");
  }
  if (injection.error) {
    throw new CopyMarkdownError(`ページ内でエラーが発生しました（${injection.error}）`);
  }
  return injection.result;
}

function describePageFailure(target, status) {
  if (status === 401 || status === 403) {
    return new CopyMarkdownError(
      `${target.name} へのアクセスが拒否されました（HTTP ${status}）。ログイン状態と閲覧権限を確認してください`,
    );
  }
  return new CopyMarkdownError(describeCommonHttpFailure(target.name, status));
}

// APIキーを必ず添えて送っているので、認証系のエラーは「キーが無効／残高切れ」と断定できる。
// ただし 403 は前段の Cloudflare がボット判定で返すこともあり、それはキーの問題ではない。
function describeReaderFailure(target, status, { detail = "", blockedByBotCheck = false } = {}) {
  const suffix = detail ? `\n${detail}` : "";
  if (status === 403 && blockedByBotCheck) {
    return new CopyMarkdownError(
      `${target.name} の前段のボット判定にブロックされました（HTTP 403）。しばらく待ってから再実行してください${suffix}`,
    );
  }
  if (status === 401 || status === 403) {
    return new CopyMarkdownError(
      `APIキーが無効です。設定を行ってください。\n${SETTINGS_HINT}${suffix}`,
      { needsSettings: true },
    );
  }
  if (status === 402) {
    return new CopyMarkdownError(
      `${target.name} のトークン残高がありません。トークンを追加購入するか、別のAPIキーを設定してください。\n${SETTINGS_HINT}${suffix}`,
      { needsSettings: true },
    );
  }
  return new CopyMarkdownError(`${describeCommonHttpFailure(target.name, status)}${suffix}`);
}

function describeCommonHttpFailure(name, status) {
  if (status === 404) {
    return `${name} でページが見つかりませんでした（HTTP 404）`;
  }
  if (status === 429) {
    return `${name} のレート制限に達しました（HTTP 429）。しばらく待ってから再実行してください`;
  }
  if (status >= 500) {
    return `${name} でサーバーエラーが発生しました（HTTP ${status}）`;
  }
  return `${name} の取得に失敗しました（HTTP ${status}）`;
}

// エラー時の JSON ボディから、そのまま提示できる説明文だけを取り出す
async function readErrorDetail(response) {
  try {
    const body = await response.text();
    const parsed = JSON.parse(body);
    return String(parsed?.readableMessage ?? parsed?.message ?? "").trim();
  } catch {
    return "";
  }
}

// 未ログイン時のログイン画面リダイレクトなど、200 でも本文が HTML で返るケースを弾く
function looksLikeHtml(contentType, text) {
  if (contentType && contentType.toLowerCase().includes("text/html")) return true;
  const head = (text || "").trimStart().slice(0, 64).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

// バッジ（＋ツールチップ）とページ内トーストの二段構えで結果を伝える。
// chrome:// などトーストを出せないページでも、バッジとツールチップだけは必ず残る。
async function announce(tabId, message, kind, { needsSettings = false, skipToast = false } = {}) {
  const isSuccess = kind === "success";
  await setBadge(tabId, {
    text: isSuccess ? "✓" : "!",
    color: isSuccess ? "#16a34a" : "#dc2626",
    title: message,
    resetAfterMs: BADGE_RESET_MS,
  });

  if (skipToast) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: showToastInPage,
      args: [message, kind, needsSettings ? "設定を開く" : ""],
    });
  } catch {
    /* 注入不可のページではバッジ表示のみで通知する */
  }
}

async function setBadge(tabId, { text, color, title, resetAfterMs }) {
  // 回転中のフレームに上書きされないよう、バッジを書き換える前にスピナーを止める
  stopSpinner(tabId);
  clearTimeout(badgeResetTimers.get(tabId));
  badgeResetTimers.delete(tabId);

  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setTitle({ tabId, title });
  } catch {
    return; // タブが閉じられた場合など
  }

  if (!resetAfterMs) return;
  badgeResetTimers.set(
    tabId,
    setTimeout(() => {
      badgeResetTimers.delete(tabId);
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
      chrome.action.setTitle({ tabId, title: DEFAULT_ACTION_TITLE }).catch(() => {});
    }, resetAfterMs),
  );
}

async function readTabUrl(tabId) {
  try {
    return (await chrome.tabs.get(tabId)).url;
  } catch {
    return undefined;
  }
}
