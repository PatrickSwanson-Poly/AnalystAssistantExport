(function () {
  if (window.__smartAnalystExportLoaded) return;
  window.__smartAnalystExportLoaded = true;

  const MENU_SELECTOR = '[role="menu"][aria-orientation="vertical"]';
  const RENAME_SELECTOR = '[data-test-id="chat-history-menu-rename"]';
  const TITLE_SELECTOR = '[data-test-id="smart-analyst-chat-panel-title"]';
  const MESSAGES_SELECTOR = '[data-test-id="chatMessages"]';
  const MESSAGE_SELECTOR = '[data-test-id="chat-message-text"]';

  function extractMessages() {
    const container = document.querySelector(MESSAGES_SELECTOR);
    if (!container) return [];

    const bubbles = container.querySelectorAll(MESSAGE_SELECTOR);
    const messages = [];

    for (const bubble of bubbles) {
      const role = bubble.getAttribute("role");
      const rawContent = bubble.getAttribute("content");
      if (!role || !rawContent) continue;

      let text = "";
      if (role === "assistant") {
        text = parseAssistantContent(rawContent);
      } else {
        text = rawContent;
      }

      messages.push({ role, text: text.trim() });
    }

    return messages;
  }

  function parseAssistantContent(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.answer === "string") {
        return parsed.answer;
      }
    } catch {
      // not JSON
    }
    return raw;
  }

  function getChatTitle() {
    const el = document.querySelector(TITLE_SELECTOR);
    return el ? el.textContent.trim() : "Smart Analyst Chat";
  }

  // --- Markdown to HTML conversion ---

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function convertMarkdownToHtml(md) {
    let html = "";
    const lines = md.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // chart JSON code blocks
      if (line.trim().startsWith("```json") || line.trim() === "```") {
        const blockStart = i;
        if (line.trim().startsWith("```json")) {
          i++;
          let jsonStr = "";
          while (i < lines.length && lines[i].trim() !== "```") {
            jsonStr += lines[i] + "\n";
            i++;
          }
          i++; // skip closing ```
          const chartHtml = tryRenderChart(jsonStr);
          if (chartHtml) {
            html += chartHtml;
          } else {
            html +=
              "<pre><code>" + escapeHtml(jsonStr.trim()) + "</code></pre>";
          }
        } else {
          i++;
        }
        continue;
      }

      // other code blocks
      if (line.trim().startsWith("```")) {
        i++;
        let code = "";
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          code += lines[i] + "\n";
          i++;
        }
        i++;
        html += "<pre><code>" + escapeHtml(code.trimEnd()) + "</code></pre>";
        continue;
      }

      // tables
      if (line.includes("|") && line.trim().startsWith("|")) {
        const tableLines = [];
        while (
          i < lines.length &&
          lines[i].includes("|") &&
          lines[i].trim().startsWith("|")
        ) {
          tableLines.push(lines[i]);
          i++;
        }
        html += convertTable(tableLines);
        continue;
      }

      // headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        html += `<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`;
        i++;
        continue;
      }

      // horizontal rules
      if (/^---+\s*$/.test(line.trim())) {
        html += "<hr>";
        i++;
        continue;
      }

      // unordered lists
      if (/^\s*[-*]\s+/.test(line)) {
        html += "<ul>";
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          const content = lines[i].replace(/^\s*[-*]\s+/, "");
          html += "<li>" + inlineFormat(content);
          i++;
          // continuation lines (indented non-list text within a list item)
          while (
            i < lines.length &&
            lines[i].trim() !== "" &&
            !/^\s*[-*]\s+/.test(lines[i]) &&
            !/^\s*\d+\.\s+/.test(lines[i]) &&
            !lines[i].trim().startsWith("|") &&
            !lines[i].trim().startsWith("#") &&
            !lines[i].trim().startsWith("```")
          ) {
            html += "<br>" + inlineFormat(lines[i].trim());
            i++;
          }
          html += "</li>";
        }
        html += "</ul>";
        continue;
      }

      // ordered lists
      if (/^\s*\d+\.\s+/.test(line)) {
        html += "<ol>";
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          const content = lines[i].replace(/^\s*\d+\.\s+/, "");
          html += "<li>" + inlineFormat(content);
          i++;
          while (
            i < lines.length &&
            lines[i].trim() !== "" &&
            !/^\s*\d+\.\s+/.test(lines[i]) &&
            !/^\s*[-*]\s+/.test(lines[i]) &&
            !lines[i].trim().startsWith("|") &&
            !lines[i].trim().startsWith("#") &&
            !lines[i].trim().startsWith("```")
          ) {
            html += "<br>" + inlineFormat(lines[i].trim());
            i++;
          }
          html += "</li>";
        }
        html += "</ol>";
        continue;
      }

      // blank lines
      if (line.trim() === "") {
        i++;
        continue;
      }

      // paragraphs
      let para = "";
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !lines[i].trim().startsWith("#") &&
        !lines[i].trim().startsWith("|") &&
        !lines[i].trim().startsWith("```") &&
        !/^---+\s*$/.test(lines[i].trim()) &&
        !/^\s*[-*]\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i])
      ) {
        para += (para ? " " : "") + lines[i].trim();
        i++;
      }
      if (para) {
        html += "<p>" + inlineFormat(para) + "</p>";
      }
    }

    return html;
  }

  function inlineFormat(text) {
    // bold + italic
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    // bold
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // italic
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // inline code
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    return text;
  }

  function convertTable(tableLines) {
    const rows = tableLines.map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim())
    );

    if (rows.length < 2) return "";

    // detect separator row (row 1 should be like ---|---|---)
    const isSep = rows[1].every((c) => /^[-:]+$/.test(c));
    const headerRow = rows[0];
    const dataRows = isSep ? rows.slice(2) : rows.slice(1);

    let html = '<div class="table-wrap"><table><thead><tr>';
    for (const cell of headerRow) {
      html += "<th>" + inlineFormat(cell) + "</th>";
    }
    html += "</tr></thead><tbody>";

    for (const row of dataRows) {
      html += "<tr>";
      for (let j = 0; j < headerRow.length; j++) {
        html += "<td>" + inlineFormat(row[j] || "") + "</td>";
      }
      html += "</tr>";
    }

    html += "</tbody></table></div>";
    return html;
  }

  // --- Chart rendering ---

  function tryRenderChart(jsonStr) {
    try {
      const obj = JSON.parse(jsonStr);
      const chart = obj.chart || obj;
      if (!chart.data || !Array.isArray(chart.data)) return null;

      const data = chart.data;
      const title = chart.title || "";
      const chartType = chart.type || "line";

      const keys = Object.keys(data[0]).filter((k) => k !== "name");
      if (keys.length === 0) return null;

      // detect bar chart: explicit type, or categorical names
      let isBar = chartType === "bar";
      if (!isBar) {
        let nonDateCount = 0;
        for (const d of data) {
          if (!/^\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(d.name)) nonDateCount++;
        }
        if (nonDateCount > data.length / 2) isBar = true;
      }

      // check if labels are long
      const maxLabelLen = Math.max(...data.map(d => d.name.length));
      const rotateLabels = maxLabelLen > 8 || data.length > 8;

      let min = isBar ? 0 : Infinity;
      let max = -Infinity;
      for (const d of data) {
        for (const k of keys) {
          const v = parseFloat(d[k]);
          if (!isNaN(v)) {
            if (v > max) max = v;
            if (!isBar && v < min) min = v;
          }
        }
      }

      if (!isBar) {
        const padding = (max - min) * 0.15 || 5;
        min = Math.max(0, min - padding);
      }
      max = max * 1.1;
      const range = max - min || 1;

      const W = 700;
      const PB = rotateLabels ? 90 : 60;
      const H = isBar ? Math.max(280, 220 + data.length * 3) : 280;
      const PL = 55;
      const PR = 20;
      const PT = 40;
      const chartW = W - PL - PR;
      const chartH = H - PT - PB;

      const colors = ["#D9EE50", "#A1A1AA", "#71717A", "#b0c13d", "#52525B"];

      let svg = `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

      if (title) {
        svg += `<text x="${W / 2}" y="20" text-anchor="middle" font-size="13" font-weight="600" class="chart-title">${escapeHtml(title)}</text>`;
      }

      const isPercent = max <= 100 && keys.some(k => k.toLowerCase().includes("%") || k.toLowerCase().includes("rate") || k.toLowerCase().includes("percent"));

      function formatAxisVal(val) {
        if (isPercent) return val.toFixed(1) + "%";
        if (val >= 1000000) return (val / 1000000).toFixed(1) + "M";
        if (val >= 1000) return (val / 1000).toFixed(1) + "k";
        return val.toFixed(0);
      }

      // y-axis
      const yTicks = 5;
      for (let t = 0; t <= yTicks; t++) {
        const val = min + (range * t) / yTicks;
        const y = PT + chartH - (chartH * t) / yTicks;
        svg += `<line x1="${PL}" y1="${y}" x2="${PL + chartW}" y2="${y}" class="chart-grid" stroke-width="0.5"/>`;
        svg += `<text x="${PL - 8}" y="${y + 4}" text-anchor="end" font-size="10" class="chart-label">${formatAxisVal(val)}</text>`;
      }

      if (isBar) {
        const barGroupW = chartW / data.length;
        const barW = Math.min(barGroupW * 0.6 / keys.length, 40);
        const barGap = 2;

        for (let d = 0; d < data.length; d++) {
          const groupX = PL + barGroupW * d + barGroupW / 2;

          keys.forEach((key, ki) => {
            const color = colors[ki % colors.length];
            const v = parseFloat(data[d][key]);
            if (isNaN(v)) return;
            const barH = (chartH * (v - min)) / range;
            const bx = groupX - (keys.length * (barW + barGap)) / 2 + ki * (barW + barGap);
            const by = PT + chartH - barH;
            svg += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="${color}"/>`;
          });

          const labelName = escapeHtml(data[d].name);
          if (rotateLabels) {
            const truncName = labelName.length > 20 ? labelName.substring(0, 19) + "..." : labelName;
            svg += `<text x="${groupX}" y="${PT + chartH + 10}" text-anchor="end" font-size="8" class="chart-label" transform="rotate(-45 ${groupX} ${PT + chartH + 10})">${truncName}</text>`;
          } else {
            svg += `<text x="${groupX}" y="${PT + chartH + 18}" text-anchor="middle" font-size="9" class="chart-label">${labelName}</text>`;
          }
        }
      } else {
        // x-axis labels
        for (let d = 0; d < data.length; d++) {
          const x = PL + (chartW * d) / (data.length - 1 || 1);
          if (rotateLabels) {
            svg += `<text x="${x}" y="${PT + chartH + 10}" text-anchor="end" font-size="8" class="chart-label" transform="rotate(-45 ${x} ${PT + chartH + 10})">${escapeHtml(data[d].name)}</text>`;
          } else {
            svg += `<text x="${x}" y="${H - PB + 18}" text-anchor="middle" font-size="9" class="chart-label">${escapeHtml(data[d].name)}</text>`;
          }
        }

        // lines + dots
        keys.forEach((key, ki) => {
          const color = colors[ki % colors.length];
          let path = "";
          const dots = [];

          for (let d = 0; d < data.length; d++) {
            const x = PL + (chartW * d) / (data.length - 1 || 1);
            const v = parseFloat(data[d][key]);
            if (isNaN(v)) continue;
            const y = PT + chartH - (chartH * (v - min)) / range;
            path += (path ? " L" : "M") + ` ${x.toFixed(1)} ${y.toFixed(1)}`;
            dots.push({ x, y, v });
          }

          svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
          for (const dot of dots) {
            svg += `<circle cx="${dot.x.toFixed(1)}" cy="${dot.y.toFixed(1)}" r="3.5" fill="${color}" class="chart-dot-stroke" stroke-width="1.5"/>`;
          }
        });
      }

      // legend
      const legendY = H - 12;
      let legendX = PL;
      keys.forEach((key, ki) => {
        const color = colors[ki % colors.length];
        svg += `<rect x="${legendX}" y="${legendY - 6}" width="10" height="10" rx="2" fill="${color}"/>`;
        svg += `<text x="${legendX + 14}" y="${legendY + 3}" font-size="10" fill="#A1A1AA">${escapeHtml(key)}</text>`;
        legendX += key.length * 6.5 + 30;
      });

      svg += "</svg></div>";
      return svg;
    } catch {
      return null;
    }
  }

  // --- HTML page assembly ---

  function buildHtmlPage(title, messages, pdfScripts) {
    const now = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let bodyContent = "";

    for (const msg of messages) {
      if (msg.role === "user") {
        bodyContent += `<div class="message user-message"><div class="role-label user-label">You</div><div class="message-body">${convertMarkdownToHtml(msg.text)}</div></div>`;
      } else if (msg.role === "assistant") {
        bodyContent += `<div class="message assistant-message"><div class="role-label assistant-label">Smart Analyst</div><div class="message-body">${convertMarkdownToHtml(msg.text)}</div></div>`;
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Export</title>
<style>
  :root {
    --bg: #050509;
    --surface: #121217;
    --surface-hover: #18181B;
    --border: #27272A;
    --border-strong: #3F3F46;
    --text: #EDEDED;
    --text-secondary: #A1A1AA;
    --text-helper: #8E8E93;
    --brand: #D9EE50;
    --brand-hover: #b0c13d;
    --brand-text: #161617;
    --user-bg: #18181B;
    --assistant-bg: #121217;
    --thead-bg: #0c0c10;
    --code-bg: #27272A;
    --code-color: var(--brand);
    --pre-bg: var(--bg);
    --td-border: var(--border);
    --row-even: var(--bg);
    --row-odd: var(--surface);
    --chart-bg: var(--bg);
  }

  body.light-mode {
    --bg: #ffffff;
    --surface: #f4f4f5;
    --surface-hover: #e4e4e7;
    --border: #e4e4e7;
    --border-strong: #d4d4d8;
    --text: #161617;
    --text-secondary: #52525B;
    --text-helper: #71717A;
    --brand: #5a6416;
    --brand-hover: #3d4410;
    --brand-text: #ffffff;
    --user-bg: #f9fafb;
    --assistant-bg: #ffffff;
    --thead-bg: #f9fbe7;
    --code-bg: #f4f4f5;
    --code-color: #5a6416;
    --pre-bg: #fafafa;
    --td-border: #f4f4f5;
    --row-even: #fafafa;
    --row-odd: #ffffff;
    --chart-bg: #fafafa;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: "Proxima Nova", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.7;
    padding: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    backdrop-filter: blur(12px);
  }

  .toolbar-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .toolbar-logo {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .toolbar-actions { display: flex; gap: 8px; }

  .local-notice {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 6px 32px;
    font-size: 11px;
    color: var(--text-helper);
    text-align: center;
  }

  .btn {
    padding: 8px 18px;
    border-radius: 20px;
    border: 1px solid var(--border);
    background: var(--surface-hover);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: inherit;
  }
  .btn:hover { background: var(--surface); border-color: var(--border-strong); color: var(--text); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary {
    background: var(--brand);
    border-color: var(--brand);
    color: var(--brand-text);
  }
  .btn-primary:hover { background: var(--brand-hover); color: var(--brand-text); }

  .container {
    max-width: 820px;
    margin: 0 auto;
    padding: 40px 32px 80px;
  }

  .export-header {
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }
  .export-header h1 {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 6px;
    letter-spacing: -0.3px;
    color: var(--text);
  }
  .export-header .meta {
    font-size: 13px;
    color: var(--text-helper);
  }

  .message {
    margin-bottom: 32px;
    border-radius: 12px;
    border: 1px solid var(--border);
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .role-label {
    padding: 10px 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .user-label {
    background: var(--user-bg);
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
  }
  .assistant-label {
    background: var(--thead-bg);
    color: var(--brand);
    border-bottom: 1px solid var(--border);
  }

  .message-body {
    padding: 20px 24px;
  }

  .user-message { border-color: var(--border); }
  .user-message .message-body {
    background: var(--user-bg);
    white-space: pre-wrap;
  }
  .assistant-message .message-body { background: var(--assistant-bg); }

  h1, h2, h3, h4, h5, h6 {
    color: var(--text);
    margin: 28px 0 12px;
    letter-spacing: -0.2px;
  }
  h1 { font-size: 24px; }
  h2 { font-size: 20px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  h3 { font-size: 17px; }
  h4 { font-size: 15px; }

  .message-body > h2:first-child,
  .message-body > h3:first-child {
    margin-top: 0;
  }

  p { margin: 10px 0; }

  strong { color: var(--text); }
  em { color: var(--text-secondary); }
  code {
    background: var(--code-bg);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: "Roboto Mono", "SF Mono", "Fira Code", monospace;
    color: var(--code-color);
  }
  pre {
    background: var(--pre-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    margin: 16px 0;
  }
  pre code {
    background: none;
    padding: 0;
    color: var(--text-secondary);
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 24px 0;
  }

  ul, ol {
    margin: 10px 0;
    padding-left: 24px;
  }
  li {
    margin: 6px 0;
    padding-left: 4px;
  }
  li::marker { color: var(--brand); }

  /* Tables */
  .table-wrap {
    overflow-x: auto;
    margin: 16px 0;
    border-radius: 10px;
    border: 1px solid var(--border);
    page-break-inside: avoid;
    break-inside: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    min-width: 500px;
  }
  thead {
    background: var(--thead-bg);
  }
  th {
    padding: 10px 14px;
    text-align: left;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--brand);
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 9px 14px;
    border-bottom: 1px solid var(--td-border);
    color: var(--text-secondary);
  }
  tbody tr:nth-child(even) { background: var(--row-even); }
  tbody tr:nth-child(odd) { background: var(--row-odd); }
  tbody tr:hover { background: var(--surface-hover); }

  /* Charts */
  .chart-wrap {
    background: var(--chart-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    margin: 20px 0;
    overflow-x: auto;
  }
  .chart-wrap svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .chart-title { fill: var(--text); }
  .chart-label { fill: var(--text-helper); }
  .chart-grid { stroke: var(--border); }
  .chart-dot-stroke { stroke: var(--bg); }

  .save-tip {
    max-width: 820px;
    margin: 0 auto 0;
    padding: 16px 32px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 12px;
    color: var(--text-helper);
    line-height: 1.5;
  }
  .save-tip-title { font-weight: 700; color: var(--text-secondary); margin-bottom: 4px; }
  .save-tip ul { margin: 0; padding-left: 18px; }
  .save-tip li { margin: 2px 0; }
  .save-tip strong { color: var(--text-secondary); }

  /* Print styles */
  @media print {
    .save-tip { display: none; }
    .toolbar { display: none; }
    .local-notice { display: none; }
    .container { padding: 20px 0; }
    .message { break-inside: avoid; }
    tbody tr:hover { background: inherit; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <span class="toolbar-title">
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACAklEQVR4AZVSQWsTQRT+ZpN6aNEmogcRygZREyi4gngqZNerSBdvHkRy89CiJ+stelNPCfoDAoLe3AXx4iUG6kE9ZC+SeJBdFPHQ0mYLLZTSTt+bZKeTHkr7YNj3ZuZ979tvPoFD0Vv33RwwLwEfErbaFIgEEO0CzyvFMDHviyzprvuFqT08kwKPcEQIgcYmAV0vhgMNwM2TEm1KHRwvoi0Bj0Esrniy2fxteRX37yzjhv0JV8+GKv/w7o8J4EwBdcWA/tm2JOLs5PWLPt686qu8UCio72Cg2GLhSRmLT8saZW8XnpUbIXHwFLO53W4jCAINxGffiZ3WI495i5TW1IP3BzQdx0Gz2USr1VK5ZviyfwAg4Ytfa77MNvh/zXBdF1JKdDodvXdmegI/4tu6tsyG03Ro2zbiOEa321XUeXHNi/ONdGdsCAMkWVGZnUaSJGox7WwxaCbmzblzZn+UJ2OExPIxVxdnJoGvQK1WUwLW60N9GdDzPJXfvTeju6kvEr0V36WnYBPh1rXP+Pd3S1+oVqtI01QB8PTFpTIWloxn3EbJqpwPv5CajaGsQx0ePLykqLJ4v+OfuDKbx9uPc2PNNL1RuRAmysoxWXmHrCxPYuWUrFwaWblEnp4gb2smRwRPzppHpMej99+3xSnUSVxmoxhJfimJMGeJ8HIx6Jj39wGDo8pPY7CpggAAAABJRU5ErkJggg==" width="16" height="16" alt="" class="toolbar-logo">
    Smart Analyst Export
  </span>
  <div class="toolbar-actions">
    <button class="btn" id="theme-toggle-btn">
      <svg id="theme-icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <svg id="theme-icon-moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
      <span id="theme-label">Light Mode</span>
    </button>
    <button class="btn" id="download-html-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Save HTML
    </button>
    <button class="btn btn-primary" id="download-pdf-btn" disabled>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span id="pdf-btn-label">Loading PDF...</span>
    </button>
  </div>
</div>
<div class="local-notice">This preview is local to your browser. Nothing is uploaded or shared. Do not refresh — the preview cannot be restored.</div>
<div class="save-tip" id="save-tip" style="display:none">
  <div class="save-tip-title">Need a different format?</div>
  <ul>
    <li><strong>PDF:</strong> Use <strong>Ctrl+P</strong> (Windows) or <strong>Cmd+P</strong> (Mac), then choose <strong>Save as PDF</strong> as the destination</li>
    <li><strong>Word / Google Docs:</strong> Select all (<strong>Ctrl+A</strong> / <strong>Cmd+A</strong>), copy, and paste into a new document</li>
  </ul>
</div>
<div class="container" id="export-content">
  <div class="export-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Exported on ${now}</div>
  </div>
  ${bodyContent}
</div>
${pdfScripts ? "<script>" + pdfScripts + "<" + "/script>" : ""}
<script>
(function() {
  window.addEventListener("beforeunload", function(e) {
    e.preventDefault();
    e.returnValue = "";
  });

  var themeBtn = document.getElementById("theme-toggle-btn");
  var sunIcon = document.getElementById("theme-icon-sun");
  var moonIcon = document.getElementById("theme-icon-moon");
  var themeLabel = document.getElementById("theme-label");
  themeBtn.addEventListener("click", function() {
    var isLight = document.body.classList.toggle("light-mode");
    sunIcon.style.display = isLight ? "none" : "";
    moonIcon.style.display = isLight ? "" : "none";
    themeLabel.textContent = isLight ? "Dark Mode" : "Light Mode";
  });

  document.getElementById("download-html-btn").addEventListener("click", function() {
    var toolbar = document.querySelector(".toolbar");
    var notice = document.querySelector(".local-notice");
    var saveTip = document.getElementById("save-tip");
    var wasLight = document.body.classList.contains("light-mode");

    toolbar.style.display = "none";
    notice.style.display = "none";
    if (saveTip) saveTip.style.display = "";
    if (!wasLight) document.body.classList.add("light-mode");

    var clone = document.documentElement.cloneNode(true);
    var scripts = clone.querySelectorAll("script");
    scripts.forEach(function(s) { s.remove(); });

    var html = "<!DOCTYPE html>" + clone.outerHTML;

    toolbar.style.display = "";
    notice.style.display = "";
    if (saveTip) saveTip.style.display = "none";
    if (!wasLight) document.body.classList.remove("light-mode");

    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = document.title.replace(" — Export", "") + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  var pdfBtn = document.getElementById("download-pdf-btn");
  var pdfLabel = document.getElementById("pdf-btn-label");

  function pdfReady() {
    return typeof pdfMake !== "undefined" && typeof vfs !== "undefined" && typeof buildPdfDefinition !== "undefined";
  }

  if (pdfReady()) {
    pdfLabel.textContent = "Save PDF";
    pdfBtn.disabled = false;
  } else {
    var check = setInterval(function() {
      if (pdfReady()) {
        clearInterval(check);
        pdfLabel.textContent = "Save PDF";
        pdfBtn.disabled = false;
      }
    }, 200);
    setTimeout(function() { clearInterval(check); if (pdfBtn.disabled) pdfLabel.textContent = "PDF unavailable"; }, 10000);
  }

  pdfBtn.addEventListener("click", function() {
    if (pdfBtn.disabled) return;
    pdfLabel.textContent = "Generating...";
    pdfBtn.disabled = true;

    try {
      pdfMake.vfs = vfs;

      var title = document.querySelector(".export-header h1").textContent;
      var msgs = window.__exportMessages;
      var dateStr = document.querySelector(".export-header .meta").textContent.replace("Exported on ", "");
      var docDef = buildPdfDefinition(title, msgs, dateStr);
      var filename = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) + ".pdf";

      pdfMake.createPdf(docDef).download(filename, function() {
        pdfLabel.textContent = "Save PDF";
        pdfBtn.disabled = false;
      });
    } catch(e) {
      pdfLabel.textContent = "Error - retry";
      pdfBtn.disabled = false;
    }
  });
})();
<` + `/script>
</body>
</html>`;
  }

  // --- Export handler ---

  function slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
  }

  async function fetchExtFile(filename) {
    try {
      const url = chrome.runtime.getURL(filename);
      const resp = await fetch(url);
      return await resp.text();
    } catch {
      return "";
    }
  }

  let pdfScriptsCache = null;

  async function loadPdfScripts() {
    if (pdfScriptsCache !== null) return pdfScriptsCache;
    const [pdfmakeCode, vfsCode, builderCode] = await Promise.all([
      fetchExtFile("pdfmake.min.js"),
      fetchExtFile("vfs_fonts.js"),
      fetchExtFile("pdf-builder.js"),
    ]);
    pdfScriptsCache = pdfmakeCode + "\n" + vfsCode + "\n" + builderCode;
    return pdfScriptsCache;
  }

  async function handleExportClick() {
    const title = getChatTitle();
    const messages = extractMessages();

    if (messages.length === 0) {
      alert("No messages found to export.");
      return;
    }

    const pdfScripts = await loadPdfScripts();
    const messagesJson = "window.__exportMessages = " + JSON.stringify(messages) + ";";
    const html = buildHtmlPage(title, messages, pdfScripts + "\n" + messagesJson);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const tab = window.open(url, "_blank");
    if (!tab) {
      alert("Pop-up blocked. Please allow pop-ups for this site and try again.");
    }
  }

  // --- Menu injection ---

  function isActiveChat() {
    const pressedBtn = document.querySelector('[data-test-id="chat-history-item-menu-btn"][data-pressed]');
    if (!pressedBtn) return false;
    const chatItem = pressedBtn.closest('[data-test-id="chat-history-active-item"]');
    return !!chatItem;
  }

  function injectExportButton(menu) {
    if (menu.querySelector("[data-export-btn]")) return;
    if (!isActiveChat()) return;

    const renameItem = menu.querySelector(RENAME_SELECTOR);
    if (!renameItem) return;

    const exportItem = document.createElement("div");
    exportItem.setAttribute("role", "menuitem");
    exportItem.setAttribute("tabindex", "-1");
    exportItem.setAttribute("data-export-btn", "true");
    exportItem.className = renameItem.className;
    exportItem.textContent = "Export";

    exportItem.addEventListener("mouseenter", () => exportItem.setAttribute("data-highlighted", ""));
    exportItem.addEventListener("mouseleave", () => exportItem.removeAttribute("data-highlighted"));
    exportItem.addEventListener("click", (e) => {
      e.stopPropagation();
      handleExportClick();
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });

    const separator = menu.querySelector('[role="separator"]');
    if (separator) {
      const newSep = document.createElement("div");
      newSep.setAttribute("data-orientation", "horizontal");
      newSep.setAttribute("role", "separator");
      newSep.setAttribute("aria-orientation", "horizontal");
      newSep.className = separator.className;
      separator.before(exportItem);
      separator.before(newSep);
    } else {
      renameItem.after(exportItem);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const menus = [];
        if (node.matches && node.matches(MENU_SELECTOR)) {
          menus.push(node);
        }
        menus.push(...node.querySelectorAll(MENU_SELECTOR));

        for (const menu of menus) {
          if (menu.querySelector(RENAME_SELECTOR)) {
            injectExportButton(menu);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
