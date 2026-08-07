import { getApiKey, getDirectSources, resetDirectSources, saveApiKey, saveDirectSources } from "./settings.js";

// 入力のたびに保存すると書き込みが連続するため、最後の入力から一定時間おいて 1 回だけ走らせる
const SAVE_DELAY_MS = 400;
const debounce = (fn, ms) => {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), ms);
  };
};

const apiKeyInput = document.getElementById("api-key");
const reveal = document.getElementById("reveal");
const apiKeyStatus = document.getElementById("status");

const sourcesBody = document.getElementById("sources-body");
const sourcesTable = document.getElementById("sources");
const sourcesEmpty = document.getElementById("sources-empty");
const sourceRowTemplate = document.getElementById("source-row");
const addSourceButton = document.getElementById("add-source");
const resetSourcesButton = document.getElementById("reset-sources");
const sourcesStatus = document.getElementById("sources-status");

// --- 直接取得するサイト ---

function renderSources(sources) {
  sourcesBody.replaceChildren();
  for (const source of sources) appendSourceRow(source);
  updateEmptyState();
}

function appendSourceRow({ pattern = "", suffix = "" } = {}) {
  const row = sourceRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".pattern").value = pattern;
  row.querySelector(".suffix").value = suffix;
  for (const input of row.querySelectorAll("input")) {
    input.addEventListener("input", persistSourcesSoon);
  }
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    updateEmptyState();
    persistSources();
  });
  sourcesBody.appendChild(row);
  return row;
}

function updateEmptyState() {
  const isEmpty = sourcesBody.children.length === 0;
  sourcesEmpty.hidden = !isEmpty;
  sourcesTable.hidden = isEmpty;
}

function readSourceRows() {
  return [...sourcesBody.children].map((row) => ({
    pattern: row.querySelector(".pattern").value.trim(),
    suffix: row.querySelector(".suffix").value.trim(),
  }));
}

async function persistSources() {
  const rows = readSourceRows();
  const saved = await saveDirectSources(rows);
  // 入力途中の行を消さないよう、保存対象にならなかった行があっても表は書き換えない
  const invalid = rows.filter((row) => row.pattern !== "" && !/^https?:\/\//i.test(row.pattern));
  if (invalid.length > 0) {
    return report(sourcesStatus, "URL は http:// か https:// から始めてください", "ng");
  }
  report(sourcesStatus, saved.length === 0 ? "登録を空にしました" : `保存しました（${saved.length} 件）`, "ok");
}

// 行の入力ハンドラから参照するため、appendSourceRow より前に初期化しておく必要がある
const persistSourcesSoon = debounce(persistSources, SAVE_DELAY_MS);

addSourceButton.addEventListener("click", () => {
  const row = appendSourceRow();
  updateEmptyState();
  row.querySelector(".pattern").focus();
});

resetSourcesButton.addEventListener("click", async () => {
  renderSources(await resetDirectSources());
  report(sourcesStatus, "既定の設定に戻しました", "ok");
});

// --- API キー ---

reveal.addEventListener("change", () => {
  apiKeyInput.type = reveal.checked ? "text" : "password";
});

apiKeyInput.addEventListener(
  "input",
  debounce(async () => {
    const value = apiKeyInput.value.trim();
    await saveApiKey(value);
    if (value === "") {
      return report(apiKeyStatus, "キーを空にしました", "ok");
    }
    // 形式チェックは警告に留める。Jina 側のキー形式が変わっても保存自体は通るようにする。
    report(
      apiKeyStatus,
      value.startsWith("jina_")
        ? "保存しました"
        : "保存しました（jina_ で始まらないキーです。取り違えていないか確認してください）",
      "ok",
    );
  }, SAVE_DELAY_MS),
);

function report(element, message, kind) {
  element.textContent = message;
  element.dataset.kind = kind;
}

// --- 初期表示 ---

apiKeyInput.value = await getApiKey();
renderSources(await getDirectSources());
