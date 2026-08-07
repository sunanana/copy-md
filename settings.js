// 拡張の設定値の保管場所。Service Worker・設定画面・ポップアップから共有される。
// APIキーは秘密情報なので chrome.storage.sync（他端末へ同期される）ではなく local に置く。

import { DEFAULT_DIRECT_SOURCES } from "./sources.js";

export const API_KEY_STORAGE_KEY = "jinaApiKey";
export const DIRECT_SOURCES_STORAGE_KEY = "directSources";

export async function getApiKey() {
  const stored = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
  const value = stored[API_KEY_STORAGE_KEY];
  return typeof value === "string" ? value.trim() : "";
}

export async function saveApiKey(value) {
  const trimmed = String(value).trim();
  // 入力欄を空にすることが削除操作にあたるので、空文字は保存せず取り除く
  if (trimmed === "") return await clearApiKey();
  await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: trimmed });
}

export async function clearApiKey() {
  await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
}

// 直接取得ルール。未保存のときだけ既定値を返す。
// 利用者が全行を消した場合は空配列が保存され、既定値には戻さない。
export async function getDirectSources() {
  const stored = await chrome.storage.local.get(DIRECT_SOURCES_STORAGE_KEY);
  const value = stored[DIRECT_SOURCES_STORAGE_KEY];
  if (!Array.isArray(value)) return DEFAULT_DIRECT_SOURCES;
  return value.filter(isDirectSource);
}

export async function saveDirectSources(sources) {
  const normalized = (Array.isArray(sources) ? sources : [])
    .map((source) => ({
      pattern: String(source?.pattern ?? "").trim(),
      suffix: String(source?.suffix ?? "").trim(),
    }))
    .filter((source) => source.pattern !== "");
  await chrome.storage.local.set({ [DIRECT_SOURCES_STORAGE_KEY]: normalized });
  return normalized;
}

export async function resetDirectSources() {
  await chrome.storage.local.remove(DIRECT_SOURCES_STORAGE_KEY);
  return DEFAULT_DIRECT_SOURCES;
}

function isDirectSource(source) {
  return Boolean(source) && typeof source.pattern === "string" && source.pattern.trim() !== "";
}
