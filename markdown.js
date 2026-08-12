// 選択範囲を Markdown へ変換する処理。
//
// 変換をページ側で行うのは、Service Worker には DOM も DOMParser も無いため。
// ページには解析済みの DOM がそのまま存在するので、選択範囲を DOM として辿れる。
//
// chrome.scripting.executeScript は関数を文字列化して注入する。
// そのためこの関数は外部スコープを一切参照できず、補助処理はすべて内側に閉じている。

export function selectionToMarkdownInPage() {
  // 選択範囲に紛れ込んでも Markdown にする意味がない要素
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "OBJECT", "EMBED",
    "CANVAS", "SVG", "VIDEO", "AUDIO", "SELECT", "TEXTAREA", "INPUT", "BUTTON",
  ]);

  // 前後に空行を要求する要素
  const BLOCK_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DETAILS", "DIV", "DL", "DT",
    "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6",
    "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "UL",
  ]);

  // 部分選択で複製されずに失われる親要素。箇条書きや表として組み立てるのに必要な文脈を持つ。
  const CONTEXT_TAGS = new Set([
    "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "DL",
  ]);

  const HEADING_LEVEL = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return { empty: true };

  const range = selection.getRangeAt(0);
  const plainText = selection.toString();
  if (!plainText.trim()) return { empty: true };

  const markdown = tidy(renderContainer(buildRoot(range)));
  // 変換対象になる要素が無かった場合でも、選択したテキストだけは返す
  return { markdown: markdown || plainText.trim() };

  // Range.cloneContents は共通祖先そのものを複製しない。リストや表の途中を選ぶと
  // 親要素が失われて箇条書き・表として組み立てられなくなるため、
  // 祖先を内側から辿り、文脈を持つものだけ浅い複製で包み直す。
  function buildRoot(sourceRange) {
    let content = sourceRange.cloneContents();
    let ancestor = sourceRange.commonAncestorContainer;
    if (ancestor.nodeType !== Node.ELEMENT_NODE) ancestor = ancestor.parentElement;

    for (let node = ancestor; node && node !== document.body; node = node.parentElement) {
      if (!CONTEXT_TAGS.has(tagOf(node))) continue;
      const wrapper = node.cloneNode(false);
      wrapper.appendChild(content);
      content = wrapper;
    }

    const root = document.createElement("div");
    root.appendChild(content);
    return root;
  }

  // ブロックとインラインが混在する子ノード列を、空行区切りのブロック列に組み立てる
  function renderContainer(parent) {
    const blocks = [];
    let inline = "";
    const flushInline = () => {
      const text = tidyInline(inline);
      if (text) blocks.push(text);
      inline = "";
    };

    for (const child of parent.childNodes) {
      if (SKIP_TAGS.has(tagOf(child))) continue;
      if (isBlock(child)) {
        flushInline();
        const block = renderBlock(child);
        if (block) blocks.push(block);
      } else {
        inline += renderInline(child);
      }
    }
    flushInline();
    return blocks.join("\n\n");
  }

  function renderBlock(element) {
    const tag = tagOf(element);

    if (tag === "HR") return "---";
    if (HEADING_LEVEL[tag]) {
      const text = tidyInline(renderInlineChildren(element)).replace(/\s*\n+\s*/g, " ");
      return text ? `${"#".repeat(HEADING_LEVEL[tag])} ${text}` : "";
    }
    if (tag === "PRE") return renderCodeBlock(element);
    if (tag === "BLOCKQUOTE") {
      const inner = renderContainer(element);
      return inner ? prefixLines(inner, "> ") : "";
    }
    if (tag === "UL" || tag === "OL") return renderList(element);
    if (tag === "TABLE") return renderTable(element);
    if (tag === "DT") {
      const text = tidyInline(renderInlineChildren(element));
      return text ? `**${text}**` : "";
    }
    // 親を伴わない li。単独では順序が決まらないため箇条書きとして扱う
    if (tag === "LI") return renderListItem(element, "- ");
    return renderContainer(element);
  }

  function renderList(list) {
    const ordered = tagOf(list) === "OL";
    const start = ordered ? Number.parseInt(list.getAttribute("start") || "1", 10) || 1 : 1;
    const items = [];
    let index = 0;

    for (const child of list.children) {
      if (tagOf(child) !== "LI") continue;
      const item = renderListItem(child, ordered ? `${start + index}. ` : "- ");
      if (item) items.push(item);
      index += 1;
    }
    return items.join("\n");
  }

  // 項目の 2 行目以降は marker の幅だけ字下げして継続させる。
  // 入れ子のリストだけは空行を挟まず直後に続け、箇条書きが分断されないようにする。
  function renderListItem(item, marker) {
    const chunks = [];
    let inline = "";
    const flushInline = () => {
      const text = tidyInline(inline);
      if (text) chunks.push({ tight: false, value: text });
      inline = "";
    };

    for (const child of item.childNodes) {
      const tag = tagOf(child);
      if (SKIP_TAGS.has(tag)) continue;
      if (tag === "UL" || tag === "OL") {
        flushInline();
        const nested = renderList(child);
        if (nested) chunks.push({ tight: true, value: nested });
      } else if (isBlock(child)) {
        flushInline();
        const block = renderBlock(child);
        if (block) chunks.push({ tight: false, value: block });
      } else {
        inline += renderInline(child);
      }
    }
    flushInline();
    if (chunks.length === 0) return "";

    let text = chunks[0].value;
    for (let i = 1; i < chunks.length; i += 1) {
      text += (chunks[i].tight ? "\n" : "\n\n") + chunks[i].value;
    }
    const pad = " ".repeat(marker.length);
    return marker + prefixLines(text, pad).slice(pad.length);
  }

  function renderCodeBlock(pre) {
    const code = pre.querySelector("code") || pre;
    const text = (code.textContent || "").replace(/\n+$/, "");
    if (!text.trim()) return "";
    const fence = "`".repeat(Math.max(3, longestBacktickRun(text) + 1));
    return `${fence}${detectLanguage(code) || detectLanguage(pre)}\n${text}\n${fence}`;
  }

  // ハイライタが付与する language-xxx / lang-xxx から言語名を拾う
  function detectLanguage(element) {
    const className = (element.getAttribute && element.getAttribute("class")) || "";
    const matched = className.match(/(?:^|\s)(?:language|lang)-([A-Za-z0-9+#-]+)/);
    return matched ? matched[1] : "";
  }

  function renderTable(table) {
    const rows = [];
    for (const row of table.rows) {
      const cells = [];
      for (const cell of row.cells) {
        // セルは 1 行に収める必要があるため改行を潰し、区切り記号と衝突する | を退避する
        cells.push(renderContainer(cell).replace(/\s*\n+\s*/g, " ").replace(/\|/g, "\\|").trim());
      }
      if (cells.length > 0) rows.push({ cells, header: isHeaderRow(row) });
    }
    if (rows.length === 0) return "";

    const width = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
    // GFM の表は見出し行と区切り行が必須。見出しを持たない表には空の見出し行を補う。
    const head = rows[0].header ? rows.shift() : { cells: [] };
    const lines = [toRow(head.cells, width), toRow(new Array(width).fill("---"), width)];
    for (const row of rows) lines.push(toRow(row.cells, width));
    return lines.join("\n");
  }

  function toRow(cells, width) {
    const padded = cells.slice(0, width);
    while (padded.length < width) padded.push("");
    return `| ${padded.join(" | ")} |`;
  }

  function isHeaderRow(row) {
    if (tagOf(row.parentElement) === "THEAD") return true;
    return row.cells.length > 0 && Array.from(row.cells).every((cell) => tagOf(cell) === "TH");
  }

  function renderInlineChildren(element) {
    let text = "";
    for (const child of element.childNodes) {
      if (SKIP_TAGS.has(tagOf(child))) continue;
      text += renderInline(child);
    }
    return text;
  }

  function renderInline(node) {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.nodeValue || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = tagOf(node);
    if (SKIP_TAGS.has(tag)) return "";
    if (tag === "BR") return "\n";
    if (tag === "IMG") return renderImage(node);
    if (tag === "A") return renderLink(node);
    if (tag === "CODE" || tag === "KBD" || tag === "SAMP") return renderInlineCode(node);
    // レイアウト目的の div などがインライン位置に現れた場合は 1 行に潰して取り込む
    if (isBlock(node)) return ` ${renderContainer(node).replace(/\s*\n+\s*/g, " ")} `;

    const inner = renderInlineChildren(node);
    if (!inner.trim()) return inner;
    if (tag === "STRONG" || tag === "B") return wrapInline(inner, "**");
    if (tag === "EM" || tag === "I") return wrapInline(inner, "*");
    if (tag === "DEL" || tag === "S" || tag === "STRIKE") return wrapInline(inner, "~~");
    return inner;
  }

  function renderLink(anchor) {
    const label = renderInlineChildren(anchor).trim();
    if (!label) return "";
    const href = absoluteUrl(anchor.getAttribute("href"));
    return href ? `[${label}](${encloseUrl(href)})` : label;
  }

  function renderImage(image) {
    const alt = (image.getAttribute("alt") || "").trim();
    const src = (image.getAttribute("src") || "").trim();
    // data: URI をそのまま貼ると本文が巨大になるため、代替テキストだけ残す
    if (/^data:/i.test(src)) return alt ? escapeText(alt) : "";
    const url = absoluteUrl(src);
    if (!url) return alt ? escapeText(alt) : "";
    return `![${escapeText(alt)}](${encloseUrl(url)})`;
  }

  // 貼り付け先でも辿れるよう、相対 URL はページを基準に絶対 URL へ直す
  function absoluteUrl(value) {
    const raw = (value || "").trim();
    if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw)) return "";
    try {
      return new URL(raw, document.baseURI).href;
    } catch {
      return "";
    }
  }

  // 空白や括弧を含む URL は山括弧で囲まないとリンクが途中で切れる
  function encloseUrl(url) {
    return /[()\s]/.test(url) ? `<${url}>` : url;
  }

  function renderInlineCode(element) {
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    const fence = "`".repeat(longestBacktickRun(text) + 1);
    // 前後がバッククォートだと区切りが融合するため空白で逃がす
    const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
    return `${fence}${pad}${text}${pad}${fence}`;
  }

  function longestBacktickRun(text) {
    return (text.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 0);
  }

  // 記号の内側に空白があると強調として解釈されないため、空白は外へ出す
  function wrapInline(text, marker) {
    const matched = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return `${matched[1]}${marker}${matched[2]}${marker}${matched[3]}`;
  }

  // Markdown として再解釈されると困る記号だけを落とす。
  // 語中のアンダースコアは GFM では強調にならないため、読みやすさを優先して残す。
  function escapeText(text) {
    return text.replace(/\s+/g, " ").replace(/([\\`*[\]])/g, "\\$1");
  }

  function isBlock(node) {
    return BLOCK_TAGS.has(tagOf(node));
  }

  function tagOf(node) {
    return node && node.nodeType === Node.ELEMENT_NODE ? node.tagName.toUpperCase() : "";
  }

  function prefixLines(text, prefix) {
    return text
      .split("\n")
      .map((line) => (line ? prefix + line : prefix.trimEnd()))
      .join("\n");
  }

  // インライン片を 1 つの段落に整える。<br> 由来の改行は行末の空白 2 つで改行として保つ。
  function tidyInline(text) {
    const lines = [];
    for (const line of text.split("\n")) {
      const trimmed = line.replace(/[ \t]+/g, " ").trim();
      if (!trimmed && (lines.length === 0 || !lines[lines.length - 1])) continue;
      lines.push(trimmed);
    }
    while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
    return lines.map((line, i) => (line && lines[i + 1] ? `${line}  ` : line)).join("\n");
  }

  function tidy(text) {
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }
}
