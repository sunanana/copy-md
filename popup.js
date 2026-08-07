// このポートが切れたことで Service Worker 側がポップアップの終了を検知し、
// 一時的に設定した action の popup 指定を戻す。
chrome.runtime.connect({ name: "setup-popup" });

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
