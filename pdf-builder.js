function buildPdfDefinition(title, messages, dateStr) {
  var BRAND = "#5a6416";
  var BRAND_BG = "#f9fbe7";
  var TEXT = "#161617";
  var SECONDARY = "#52525B";
  var HELPER = "#71717A";
  var BORDER = "#e4e4e7";
  var SURFACE = "#f4f4f5";
  var USER_BG = "#f9fafb";

  function stripInline(text) {
    return text
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  }

  function richText(text) {
    var parts = [];
    var re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|([^*`]+))/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m[2]) {
        parts.push({ text: m[2], bold: true, italics: true });
      } else if (m[3]) {
        parts.push({ text: m[3], bold: true });
      } else if (m[4]) {
        parts.push({ text: m[4], italics: true });
      } else if (m[5]) {
        parts.push({ text: m[5], font: "Roboto", color: BRAND, background: SURFACE, fontSize: 8 });
      } else if (m[6]) {
        parts.push({ text: m[6] });
      }
    }
    return parts.length > 0 ? parts : [{ text: text }];
  }

  function parseTable(tableLines) {
    var rows = tableLines.map(function(line) {
      return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(function(c) { return c.trim(); });
    });
    if (rows.length < 2) return null;

    var isSep = rows[1].every(function(c) { return /^[-:]+$/.test(c); });
    var headers = rows[0];
    var data = isSep ? rows.slice(2) : rows.slice(1);
    var numCols = headers.length;

    var fontSize;
    var cellPad;
    var tableMarginLR = 0;
    if (numCols > 9) { fontSize = 5; cellPad = 1.5; tableMarginLR = -20; }
    else if (numCols > 7) { fontSize = 5.5; cellPad = 2; tableMarginLR = -15; }
    else if (numCols > 5) { fontSize = 6.5; cellPad = 3; tableMarginLR = -10; }
    else { fontSize = 8; cellPad = 6; }

    var headerRow = headers.map(function(h) {
      return {
        text: stripInline(h).toUpperCase(),
        style: "tableHeader",
        fontSize: fontSize - 0.5
      };
    });

    var bodyRows = data.map(function(row, ri) {
      return headers.map(function(_, ci) {
        return {
          text: stripInline(row[ci] || ""),
          style: "tableCell",
          fontSize: fontSize,
          fillColor: ri % 2 === 0 ? SURFACE : "#ffffff"
        };
      });
    });

    var widths = [];
    for (var c = 0; c < numCols; c++) {
      widths.push("*");
    }

    return {
      table: {
        headerRows: 1,
        widths: widths,
        body: [headerRow].concat(bodyRows),
        dontBreakRows: true
      },
      layout: {
        hLineWidth: function(i, node) { return i === 1 ? 1.5 : 0.5; },
        vLineWidth: function() { return 0; },
        hLineColor: function(i) { return i === 1 ? BRAND : BORDER; },
        fillColor: function(i) { return i === 0 ? BRAND_BG : null; },
        paddingLeft: function() { return cellPad; },
        paddingRight: function() { return cellPad; },
        paddingTop: function() { return 3; },
        paddingBottom: function() { return 3; }
      },
      margin: [tableMarginLR, 6, tableMarginLR, 10]
    };
  }

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function parseChart(jsonStr) {
    try {
      var obj = JSON.parse(jsonStr);
      var chart = obj.chart || obj;
      if (!chart.data || !Array.isArray(chart.data)) return null;

      var data = chart.data;
      var chartTitle = chart.title || "";
      var chartType = chart.type || "line";
      var keys = Object.keys(data[0]).filter(function(k) { return k !== "name"; });
      if (keys.length === 0) return null;

      // detect bar chart: explicit type, or categorical names (non-date-like)
      var isBar = chartType === "bar";
      if (!isBar) {
        var nonDateCount = 0;
        for (var nd = 0; nd < data.length; nd++) {
          var name = data[nd].name;
          if (!/^\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(name)) nonDateCount++;
        }
        if (nonDateCount > data.length / 2) isBar = true;
      }

      // check if labels are long
      var maxLabelLen = 0;
      for (var ml = 0; ml < data.length; ml++) {
        if (data[ml].name.length > maxLabelLen) maxLabelLen = data[ml].name.length;
      }
      var rotateLabels = maxLabelLen > 8 || data.length > 8;

      var min = 0, max = -Infinity;
      for (var d = 0; d < data.length; d++) {
        for (var ki = 0; ki < keys.length; ki++) {
          var v = parseFloat(data[d][keys[ki]]);
          if (!isNaN(v)) {
            if (v > max) max = v;
          }
        }
      }
      if (!isBar) {
        min = Infinity;
        for (d = 0; d < data.length; d++) {
          for (ki = 0; ki < keys.length; ki++) {
            v = parseFloat(data[d][keys[ki]]);
            if (!isNaN(v) && v < min) min = v;
          }
        }
        var pad = (max - min) * 0.15 || 5;
        min = Math.max(0, min - pad);
      }
      max = max * 1.1;
      var range = max - min || 1;

      var W = 453;
      var PB = rotateLabels ? 70 : 45;
      var H = isBar ? Math.max(220, 160 + data.length * 2) : 220;
      var PL = 45;
      var PR = 15;
      var PT = 35;
      var chartW = W - PL - PR;
      var chartH = H - PT - PB;

      var colors = ["#5a6416", "#71717A", "#a1a1aa"];

      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
      svg += '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="6" fill="' + SURFACE + '" stroke="' + BORDER + '" stroke-width="1"/>';

      if (chartTitle) {
        svg += '<text x="' + (W / 2) + '" y="20" text-anchor="middle" font-size="10" font-weight="bold" fill="' + TEXT + '" font-family="Helvetica">' + esc(chartTitle) + '</text>';
      }

      var isPercent = max <= 100 && keys.some(function(k) { return k.toLowerCase().indexOf("%") !== -1 || k.toLowerCase().indexOf("rate") !== -1; });

      function formatAxisVal(val) {
        if (isPercent) return val.toFixed(1) + "%";
        if (val >= 1000000) return (val / 1000000).toFixed(1) + "M";
        if (val >= 1000) return (val / 1000).toFixed(1) + "k";
        return val.toFixed(0);
      }

      // y-axis
      var yTicks = 5;
      for (var t = 0; t <= yTicks; t++) {
        var val = min + (range * t) / yTicks;
        var ly = PT + chartH - (chartH * t) / yTicks;
        svg += '<line x1="' + PL + '" y1="' + ly + '" x2="' + (PL + chartW) + '" y2="' + ly + '" stroke="' + BORDER + '" stroke-width="0.5"/>';
        svg += '<text x="' + (PL - 4) + '" y="' + (ly + 3) + '" text-anchor="end" font-size="7" fill="' + HELPER + '" font-family="Helvetica">' + formatAxisVal(val) + '</text>';
      }

      if (isBar) {
        var barGroupW = chartW / data.length;
        var barW = Math.min(barGroupW * 0.6 / keys.length, 30);
        var barGap = 2;

        for (d = 0; d < data.length; d++) {
          var groupX = PL + barGroupW * d + barGroupW / 2;

          for (ki = 0; ki < keys.length; ki++) {
            var color = colors[ki % colors.length];
            v = parseFloat(data[d][keys[ki]]);
            if (isNaN(v)) continue;
            var barH = (chartH * (v - min)) / range;
            var bx = groupX - (keys.length * (barW + barGap)) / 2 + ki * (barW + barGap);
            var by = PT + chartH - barH;
            svg += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" rx="1" fill="' + color + '"/>';
          }

          // x-axis label
          var labelName = esc(data[d].name);
          if (rotateLabels) {
            var truncName = labelName.length > 15 ? labelName.substring(0, 14) + "..." : labelName;
            svg += '<text x="' + groupX.toFixed(1) + '" y="' + (PT + chartH + 8) + '" text-anchor="end" font-size="6" fill="' + HELPER + '" font-family="Helvetica" transform="rotate(-45 ' + groupX.toFixed(1) + ' ' + (PT + chartH + 8) + ')">' + truncName + '</text>';
          } else {
            svg += '<text x="' + groupX.toFixed(1) + '" y="' + (PT + chartH + 14) + '" text-anchor="middle" font-size="7" fill="' + HELPER + '" font-family="Helvetica">' + labelName + '</text>';
          }
        }
      } else {
        // x-axis labels
        for (d = 0; d < data.length; d++) {
          var lx = PL + (chartW * d) / (data.length - 1 || 1);
          if (rotateLabels) {
            svg += '<text x="' + lx + '" y="' + (PT + chartH + 8) + '" text-anchor="end" font-size="6" fill="' + HELPER + '" font-family="Helvetica" transform="rotate(-45 ' + lx + ' ' + (PT + chartH + 8) + ')">' + esc(data[d].name) + '</text>';
          } else {
            svg += '<text x="' + lx + '" y="' + (PT + chartH + 14) + '" text-anchor="middle" font-size="7" fill="' + HELPER + '" font-family="Helvetica">' + esc(data[d].name) + '</text>';
          }
        }

        // lines and dots
        for (ki = 0; ki < keys.length; ki++) {
          color = colors[ki % colors.length];
          var pathParts = [];
          var dots = [];

          for (d = 0; d < data.length; d++) {
            var px = PL + (chartW * d) / (data.length - 1 || 1);
            v = parseFloat(data[d][keys[ki]]);
            if (isNaN(v)) continue;
            var py = PT + chartH - (chartH * (v - min)) / range;
            pathParts.push((pathParts.length === 0 ? "M" : "L") + px.toFixed(1) + "," + py.toFixed(1));
            dots.push({ x: px, y: py });
          }

          if (pathParts.length > 0) {
            svg += '<path d="' + pathParts.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
            for (var di = 0; di < dots.length; di++) {
              svg += '<circle cx="' + dots[di].x.toFixed(1) + '" cy="' + dots[di].y.toFixed(1) + '" r="3" fill="' + color + '" stroke="white" stroke-width="1.5"/>';
            }
          }
        }
      }

      // legend
      var legendX = PL;
      var legendY = H - 10;
      for (ki = 0; ki < keys.length; ki++) {
        var lc = colors[ki % colors.length];
        svg += '<rect x="' + legendX + '" y="' + (legendY - 6) + '" width="10" height="8" rx="2" fill="' + lc + '"/>';
        svg += '<text x="' + (legendX + 14) + '" y="' + legendY + '" font-size="7" fill="' + SECONDARY + '" font-family="Helvetica">' + esc(keys[ki]) + '</text>';
        legendX += keys[ki].length * 4.5 + 28;
      }

      svg += '</svg>';

      var elements = [];
      elements.push({
        svg: svg,
        width: 453,
        alignment: "center",
        margin: [0, 8, 0, 12]
      });

      return elements;
    } catch(e) {
      return null;
    }
  }

  function parseMarkdown(md) {
    var elements = [];
    var lines = md.split("\n");
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // chart JSON code blocks
      if (line.trim().startsWith("```json")) {
        i++;
        var jsonStr = "";
        while (i < lines.length && lines[i].trim() !== "```") {
          jsonStr += lines[i] + "\n";
          i++;
        }
        i++;
        var chartElements = parseChart(jsonStr);
        if (chartElements) {
          for (var ce = 0; ce < chartElements.length; ce++) {
            elements.push(chartElements[ce]);
          }
        } else {
          elements.push({ text: jsonStr.trim(), style: "code", margin: [0, 4, 0, 4] });
        }
        continue;
      }

      // other code blocks
      if (line.trim().startsWith("```")) {
        i++;
        var code = "";
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          code += lines[i] + "\n";
          i++;
        }
        i++;
        elements.push({
          text: code.trim(),
          style: "code",
          background: SURFACE,
          margin: [0, 4, 0, 4]
        });
        continue;
      }

      // tables
      if (line.includes("|") && line.trim().startsWith("|")) {
        var tableLines = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i]);
          i++;
        }
        var tbl = parseTable(tableLines);
        if (tbl) elements.push(tbl);
        continue;
      }

      // headings
      var headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        var level = headingMatch[1].length;
        var styleName = "h" + Math.min(level, 4);
        elements.push({
          text: richText(headingMatch[2]),
          style: styleName,
          pageBreakBefore: function(currentNode, followingNodesOnPage) {
            // avoid orphaned headings: if heading is the last thing on a page, push to next
            return followingNodesOnPage.length <= 1 && currentNode.startPosition && currentNode.startPosition.top > 230;
          }
        });
        if (level <= 2) {
          elements.push({
            canvas: [{ type: "line", x1: 0, y1: 0, x2: 453, y2: 0, lineWidth: 0.5, lineColor: BORDER }],
            margin: [0, 2, 0, 6]
          });
        }
        i++;
        continue;
      }

      // horizontal rules
      if (/^---+\s*$/.test(line.trim())) {
        elements.push({
          canvas: [{ type: "line", x1: 0, y1: 0, x2: 453, y2: 0, lineWidth: 0.3, lineColor: BORDER }],
          margin: [0, 8, 0, 8]
        });
        i++;
        continue;
      }

      // unordered lists
      if (/^\s*[-*]\s+/.test(line)) {
        var ulItems = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          var content = lines[i].replace(/^\s*[-*]\s+/, "");
          i++;
          while (
            i < lines.length &&
            lines[i].trim() !== "" &&
            !/^\s*[-*]\s+/.test(lines[i]) &&
            !/^\s*\d+\.\s+/.test(lines[i]) &&
            !lines[i].trim().startsWith("|") &&
            !lines[i].trim().startsWith("#") &&
            !lines[i].trim().startsWith("```")
          ) {
            content += " " + lines[i].trim();
            i++;
          }
          ulItems.push({ text: richText(content), margin: [0, 1, 0, 1] });
        }
        elements.push({
          ul: ulItems,
          style: "list",
          markerColor: BRAND,
          margin: [0, 4, 0, 8]
        });
        continue;
      }

      // ordered lists
      if (/^\s*\d+\.\s+/.test(line)) {
        var olItems = [];
        while (i < lines.length) {
          if (lines[i].trim() === "") { i++; continue; }
          if (!/^\s*\d+\.\s+/.test(lines[i])) break;
          var olContent = lines[i].replace(/^\s*\d+\.\s+/, "");
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
            olContent += " " + lines[i].trim();
            i++;
          }
          olItems.push({ text: richText(olContent), margin: [0, 1, 0, 3] });
        }
        elements.push({
          ol: olItems,
          style: "list",
          markerColor: BRAND,
          margin: [0, 4, 0, 8]
        });
        continue;
      }

      // blank lines
      if (line.trim() === "") { i++; continue; }

      // paragraphs
      var para = "";
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
        elements.push({
          text: richText(para),
          style: "body",
          margin: [0, 2, 0, 4]
        });
      }
    }

    return elements;
  }

  // --- Build the document ---
  var content = [];

  // title
  content.push({ text: title, style: "title" });
  content.push({ text: "Exported on " + dateStr, style: "subtitle" });
  content.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 453, y2: 0, lineWidth: 0.5, lineColor: BORDER }],
    margin: [0, 4, 0, 16]
  });

  // messages
  for (var mi = 0; mi < messages.length; mi++) {
    var msg = messages[mi];

    if (msg.role === "user") {
      content.push({
        table: {
          widths: ["*"],
          body: [
            [{ text: "YOU", style: "roleLabel", fillColor: USER_BG }],
            [{
              text: stripInline(msg.text),
              style: "userText",
              fillColor: USER_BG
            }]
          ]
        },
        layout: {
          hLineWidth: function(i, node) { return (i === 0 || i === node.table.body.length) ? 0.5 : 0; },
          vLineWidth: function() { return 0.5; },
          hLineColor: function() { return BORDER; },
          vLineColor: function() { return BORDER; },
          paddingLeft: function() { return 10; },
          paddingRight: function() { return 10; },
          paddingTop: function(i) { return i === 0 ? 8 : 6; },
          paddingBottom: function(i, node) { return i === node.table.body.length - 1 ? 10 : 2; }
        },
        margin: [0, 8, 0, 12],
        dontBreakRows: false
      });
    } else if (msg.role === "assistant") {
      // label
      content.push({
        table: {
          widths: ["*"],
          body: [[{ text: "SMART ANALYST", style: "assistantLabel", fillColor: BRAND_BG }]]
        },
        layout: {
          hLineWidth: function() { return 0; },
          vLineWidth: function() { return 0; },
          paddingLeft: function() { return 10; },
          paddingRight: function() { return 10; },
          paddingTop: function() { return 6; },
          paddingBottom: function() { return 6; }
        },
        margin: [0, 8, 0, 2]
      });

      // content
      var mdElements = parseMarkdown(msg.text);
      for (var ei = 0; ei < mdElements.length; ei++) {
        content.push(mdElements[ei]);
      }

      content.push({
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 453, y2: 0, lineWidth: 0.3, lineColor: BORDER }],
        margin: [0, 10, 0, 10]
      });
    }
  }

  return {
    content: content,
    defaultStyle: {
      font: "Roboto",
      fontSize: 9,
      color: TEXT,
      lineHeight: 1.4
    },
    styles: {
      title: {
        fontSize: 22,
        bold: true,
        color: TEXT,
        margin: [0, 0, 0, 4]
      },
      subtitle: {
        fontSize: 10,
        color: HELPER,
        margin: [0, 0, 0, 4]
      },
      h1: { fontSize: 18, bold: true, color: TEXT, margin: [0, 16, 0, 4] },
      h2: { fontSize: 15, bold: true, color: TEXT, margin: [0, 14, 0, 4] },
      h3: { fontSize: 12, bold: true, color: TEXT, margin: [0, 10, 0, 4] },
      h4: { fontSize: 10, bold: true, color: TEXT, margin: [0, 8, 0, 4] },
      body: { fontSize: 9, color: TEXT },
      list: { fontSize: 9, color: TEXT },
      code: {
        font: "Roboto",
        fontSize: 7.5,
        color: BRAND,
        background: SURFACE
      },
      roleLabel: {
        fontSize: 7,
        bold: true,
        color: SECONDARY,
        letterSpacing: 1
      },
      assistantLabel: {
        fontSize: 7,
        bold: true,
        color: BRAND,
        letterSpacing: 1
      },
      userText: {
        fontSize: 9,
        color: TEXT,
        lineHeight: 1.5,
        preserveLeadingSpaces: true
      },
      tableHeader: {
        fontSize: 7,
        bold: true,
        color: BRAND,
        fillColor: BRAND_BG
      },
      tableCell: {
        fontSize: 8,
        color: SECONDARY
      }
    },
    pageMargins: [25, 35, 25, 40],
    footer: function(currentPage, pageCount) {
      return {
        columns: [
          { text: "Smart Analyst Export", fontSize: 7, color: HELPER, margin: [40, 0, 0, 0] },
          { text: "Page " + currentPage + " of " + pageCount, fontSize: 7, color: HELPER, alignment: "right", margin: [0, 0, 40, 0] }
        ],
        margin: [0, 20, 0, 0]
      };
    }
  };
}

if (typeof window !== "undefined") window.buildPdfDefinition = buildPdfDefinition;
