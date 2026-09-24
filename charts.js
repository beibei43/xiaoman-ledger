/* ============================================================
   charts.js — 轻量 SVG 图表（无外部依赖，离线可用）
   返回 HTML 字符串，直接插入容器。
   配色：清新蓝绿 / 米白 / 浅灰，无粉色。
   ============================================================ */
(function (global) {
  'use strict';
  var PFW = global.PFW;

  var CHART_COLORS = ['#3FA796', '#6FB1C9', '#E8B04B', '#9B8CC4', '#2FA8A0', '#D9A86C', '#7E8AA0', '#86C5B0'];

  function shortNum(v) {
    var a = Math.abs(v);
    if (a >= 10000) return (v / 10000).toFixed(1) + 'w';
    if (a >= 1000) return (v / 1000).toFixed(1) + 'k';
    return String(Math.round(v));
  }

  function svgBar(items, opts) {
    opts = opts || {};
    if (!items.length) return '<div class="muted" style="padding:10px">暂无数据</div>';
    var w = 320, h = 180, pad = 26;
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    var n = items.length;
    var slot = (w - pad * 2) / n;
    var bw = Math.min(slot * 0.6, 34);
    var bars = '';
    items.forEach(function (it, idx) {
      var bh = (it.value / max) * (h - pad * 2);
      var x = pad + idx * slot + (slot - bw) / 2;
      var y = h - pad - bh;
      bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(bh, 0).toFixed(1) + '" rx="4" fill="' + (it.color || opts.color || '#3FA796') + '"/>';
      bars += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (h - pad + 12).toFixed(1) + '" font-size="9" text-anchor="middle" fill="#7c8a86">' + it.label + '</text>';
      bars += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" font-size="9" text-anchor="middle" fill="#3a4a47">' + shortNum(it.value) + '</text>';
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" preserveAspectRatio="xMidYMid meet">' + bars + '</svg>';
  }

  function svgPie(items) {
    if (!items.length) return '<div class="muted" style="padding:10px">暂无数据</div>';
    var w = 180, h = 180, cx = 90, cy = 90, r = 74;
    var total = items.reduce(function (s, i) { return s + i.value; }, 0) || 1;
    var ang = -Math.PI / 2, paths = '';
    items.forEach(function (it, idx) {
      var frac = it.value / total;
      if (frac <= 0) return;
      var a2 = ang + frac * Math.PI * 2;
      var x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
      var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      var large = (a2 - ang) > Math.PI ? 1 : 0;
      paths += '<path d="M' + cx + ' ' + cy + ' L' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z" fill="' + (it.color || CHART_COLORS[idx % CHART_COLORS.length]) + '"/>';
      ang = a2;
    });
    var legend = '';
    items.forEach(function (it, idx) {
      var pct = ((it.value / total) * 100).toFixed(0);
      legend += '<div class="legend"><span class="dot" style="background:' + (it.color || CHART_COLORS[idx % CHART_COLORS.length]) + '"></span>' + it.label + ' ' + PFW.fmtMoney(it.value) + ' · ' + pct + '%</div>';
    });
    return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center">' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" width="150" height="150">' + paths + '</svg>' +
      '<div class="legend-box" style="flex:1;min-width:120px">' + legend + '</div></div>';
  }

  function svgLine(points, opts) {
    opts = opts || {};
    if (!points.length) return '<div class="muted" style="padding:10px">暂无数据</div>';
    var w = 320, h = 180, pad = 26;
    var vals = points.map(function (p) { return p.value; });
    var max = Math.max.apply(null, vals.concat([1]));
    var min = Math.min.apply(null, vals.concat([0]));
    var range = (max - min) || 1;
    var n = points.length;
    var path = '', dots = '', labels = '', hits = '';
    points.forEach(function (p, idx) {
      var x = n > 1 ? pad + idx * (w - pad * 2) / (n - 1) : w / 2;
      var y = h - pad - (p.value - min) / range * (h - pad * 2);
      path += (idx === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      dots += '<circle class="ln-dot" data-idx="' + idx + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.2" fill="' + (opts.color || '#3FA796') + '"/>';
      if (opts.interactive) {
        hits += '<circle class="pt-hit" data-idx="' + idx + '" data-date="' + (p.date || '') + '" data-label="' + (p.label || '') + '" data-val="' + p.value + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="15" fill="transparent" style="cursor:pointer"/>';
      }
      if (n <= 12) labels += '<text x="' + x.toFixed(1) + '" y="' + (h - pad + 12).toFixed(1) + '" font-size="9" text-anchor="middle" fill="#7c8a86">' + p.label + '</text>';
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" preserveAspectRatio="xMidYMid meet" class="' + (opts.interactive ? 'interactive' : '') + '">' +
      '<path d="' + path + '" fill="none" stroke="' + (opts.color || '#3FA796') + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + labels + hits + '</svg>';
  }

  global.PFW_CHARTS = { bar: svgBar, pie: svgPie, line: svgLine, colors: CHART_COLORS, shortNum: shortNum };
})(typeof window !== 'undefined' ? window : this);
