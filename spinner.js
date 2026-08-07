// 取得中の待ち時間をアイコンのバッジで示すスピナー。
//
// setBadgeText の呼び出しは Service Worker のアイドルタイマーをリセットするため、
// 回している間は Worker が停止しない。止め忘れると Worker が居座り続けるので、
// start と stop は必ず対で呼ぶこと。

// 端末でおなじみの回転棒。1 本の線が向きを変えるだけなので、
// バッジの狭い領域でも輪郭が潰れずに動きが読み取れる。
// 横棒は罫線素片を使う。ハイフンだと短すぎて他のコマと長さが揃わない。
const FRAMES = ["|", "/", "─", "\\"];
const INTERVAL_MS = 100;
// 一瞬で終わる取得でスピナーがチラつかないよう、少し待ってから回し始める
const DELAY_MS = 180;
// 線が細いぶん、背景を濃くして白文字とのコントラストを稼ぐ
const COLOR = "#16283c";
const TITLE = "Markdown を取得中…";

const running = new Map();

export function startSpinner(tabId) {
  stopSpinner(tabId);

  const state = { frame: 0, intervalId: null, timeoutId: null };
  const render = () => {
    const text = FRAMES[state.frame % FRAMES.length];
    state.frame += 1;
    chrome.action.setBadgeText({ tabId, text }).catch(() => stopSpinner(tabId));
  };

  state.timeoutId = setTimeout(() => {
    state.timeoutId = null;
    render();
    state.intervalId = setInterval(render, INTERVAL_MS);
  }, DELAY_MS);

  running.set(tabId, state);

  chrome.action.setBadgeBackgroundColor({ tabId, color: COLOR }).catch(() => {});
  chrome.action.setTitle({ tabId, title: TITLE }).catch(() => {});
}

export function stopSpinner(tabId) {
  const state = running.get(tabId);
  if (!state) return;
  running.delete(tabId);
  clearTimeout(state.timeoutId);
  clearInterval(state.intervalId);
}

// 回転中のタブ数。動作確認用。
export function runningSpinnerCount() {
  return running.size;
}
