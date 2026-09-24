/* ============================================================
 * 小满账本 — UI 层（五大页面 + 历史日历 + AI 分析）
 * 依赖 data.js / calc.js / charts.js
 * ============================================================ */
(function (global) {
  'use strict';
  var P = global.PFW, C = global.PFW_CALC, CH = global.PFW_CHARTS;
  var D = P.getData();
  function save() {
    D = P.getData();
    try { P.saveData(); }
    catch (e) {
      if (e && e.strippedAttachments) {
        toast('⚠️ 已保存，但部分保险附件因体积过大未能保存，请减少附件后再添加');
      } else if (e && (e.name === 'QuotaExceededError' || /quota|exceeded/i.test(String((e && (e.message || e.name)) || '')))) {
        toast('⚠️ 保存失败：本地存储空间已满（多为附件过多/过大）。请删除部分附件或导出备份后再试。');
      } else {
        throw e;
      }
    }
  }

  /* ---------- DOM 助手 ---------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'html') el.innerHTML = attrs[k];
        else if (k === 'text') el.textContent = attrs[k];
        else if (k.indexOf('data-') === 0) el.setAttribute(k, attrs[k]);
        else if (k === 'onclick') el.onclick = attrs[k];
        else if (k === 'style' && typeof attrs[k] === 'object') { Object.assign(el.style, attrs[k]); }
        else el.setAttribute(k, attrs[k]);
      });
    }
    if (children != null) {
      if (!Array.isArray(children)) children = [children];
      (function add(ns) {
        ns.forEach(function (c) {
          if (c == null || c === false) return;
          if (Array.isArray(c)) { add(c); return; }   // 递归展平嵌套数组（如 .map 生成的分期列表）
          el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
        });
      })(children);
    }
    return el;
  }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function money(n) { return P.fmtMoney(n); }
  function num(n, dec) { return P.fmtNum(n, dec); }

  /* ---------- 状态 ---------- */
  var state = {
    page: 'home',
    flowYear: (function () { var r = C.latestFlowRec(D); return r ? r.year : new Date().getFullYear(); })(),
    flowMonth: (function () { var r = C.latestFlowRec(D); return r ? r.month : new Date().getMonth() + 1; })(),
    invTab: 'risk',
    aiOpen: false,
    histYear: new Date().getFullYear(),
    histMonth: new Date().getMonth() + 1,
    histSel: null,
    insMember: null,
    budgetExpanded: {}
  };

  /* ---------- Toast / Modal / 动作面板 ---------- */
  function toast(msg) {
    var root = q('#toast-root');
    var t = h('div', { class: 'toast' }, msg);
    root.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 1900);
  }
  function closeModal() { var m = q('.modal-mask'); if (m) m.remove(); }
  function openModal(title, body, actions) {
    closeModal();
    var dialog = h('div', { class: 'dialog' }, [
      h('div', { class: 'dialog-head' }, [
        h('h3', {}, title),
        h('button', { class: 'x', onclick: closeModal }, '×')
      ]),
      body,
      actions ? h('div', { class: 'dialog-actions' }, actions) : null
    ]);
    var mask = h('div', { class: 'modal-mask', onclick: function (e) { if (e.target === mask) closeModal(); } }, dialog);
    q('#modal-root').appendChild(mask);
    return dialog;
  }
  function openActionSheet(title, items) {
    var body = h('div', { class: 'sheet-body' }, items.map(function (it) {
      return h('button', { class: 'sheet-item ' + (it.cls || ''), onclick: function () { closeModal(); it.onClick(); } }, it.label);
    }));
    body.appendChild(h('button', { class: 'sheet-item sheet-cancel', onclick: closeModal }, '取消'));
    var sheet = h('div', { class: 'sheet' }, [h('div', { class: 'sheet-head' }, title), body]);
    var mask = h('div', { class: 'modal-mask sheet-mask', onclick: function (e) { if (e.target === mask) closeModal(); } }, sheet);
    q('#modal-root').appendChild(mask);
  }
  function confirmDialog(title, msg, onYes, yesLabel) {
    openModal(title, h('div', { class: 'card', style: { boxShadow: 'none', margin: 0 } }, msg),
      [
        h('button', { class: 'btn', onclick: closeModal }, '取消'),
        h('button', { class: 'btn btn-danger', onclick: function () { closeModal(); onYes(); } }, yesLabel || '确定')
      ]);
  }
  function field(label, input, hint) {
    return h('div', { class: 'field' }, [
      label ? h('label', {}, label) : null,
      input,
      hint ? h('div', { class: 'hint' }, hint) : null
    ]);
  }
  function input(opts) {
    opts = opts || {};
    var el = h('input', { class: 'input' });
    if (opts.type) el.type = opts.type;
    if (opts.value != null) el.value = opts.value;
    if (opts.placeholder) el.placeholder = opts.placeholder;
    if (opts.step) el.step = opts.step;
    if (opts.id) el.id = opts.id;
    return el;
  }
  function select(opts, options) {
    var el = h('select', { class: 'select' });
    if (opts.id) el.id = opts.id;
    options.forEach(function (o) {
      var op = h('option', { value: o.value }, o.label);
      if (o.value === opts.value) op.selected = true;
      el.appendChild(op);
    });
    return el;
  }

  /* =========================================================
   * 页面切换
   * ========================================================= */
  var TITLES = { home: '首页', deposit: '存钱罐', flow: '流动资金', budget: '年度预算', invest: '投资', insurance: '保险记录' };
  function showPage(page) {
    state.page = page;
    qa('.nav-item[data-page]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-page') === page); });
    qa('.page').forEach(function (s) { s.classList.remove('active'); });
    var sec = q('#page-' + page); if (sec) sec.classList.add('active');
    q('#topTitle').textContent = TITLES[page] || '首页';
    renderTopActions(page);
    renderPage(page);
    document.querySelector('.app').classList.remove('nav-open');
  }
  function renderTopActions(page) {
    var box = q('#topActions'); box.innerHTML = '';
    var acts = [];
    if (page === 'deposit') acts = [['add-deposit', '➕ 账户', 'btn-primary']];
    else if (page === 'flow') acts = [['open-history', '📅 历史', 'btn-ghost']];
    else if (page === 'budget') acts = [['add-budget', '➕ 预算', 'btn-primary']];
    else if (page === 'invest') acts = [['run-ai', '✨ AI', ''], ['open-history', '📅', 'btn-ghost']];
    else if (page === 'insurance') acts = state.insMember ? [['ins-back', '← 返回', 'btn-ghost'], ['add-insurance', '➕ 保险', 'btn-primary']] : [];
    else if (page === 'home') acts = [['open-history', '📅 历史', 'btn-ghost']];
    acts.forEach(function (a) {
      box.appendChild(h('button', { class: 'btn btn-sm ' + (a[2] || ''), 'data-action': a[0] }, a[1]));
    });
  }
  function renderPage(page) {
    if (page === 'home') renderHome();
    else if (page === 'deposit') renderDeposit();
    else if (page === 'flow') renderFlow();
    else if (page === 'budget') renderBudget();
    else if (page === 'invest') renderInvest();
    else if (page === 'insurance') renderInsurance();
  }

  /* =========================================================
   * 首页
   * ========================================================= */
  function renderHome() {
    var sec = q('#page-home'); sec.innerHTML = '';
    var dep = C.depositTotal(D);
    var flow = C.flowAvailable(D);
    var edu = C.portfolioStat(D.educationFunds);
    var risk = C.portfolioStat(D.riskFunds);
    var inv = edu.market + risk.market;
    var total = dep + flow + inv;
    var now = new Date();
    var slogan = P.todaySlogan();

    // 时间卡片（与每日一句卡片风格统一）
    sec.appendChild(h('div', { class: 'time-card' }, [
      h('div', { class: 'time-card-header' }, [
        h('span', { class: 'time-dot' }, ''),
        h('span', { class: 'time-now' }, '现在')
      ]),
      h('div', { class: 'home-time' }, P.fmtTime(now)),
      h('div', { class: 'home-date-line' }, [
        now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日',
        h('span', { class: 'date-sep' }, '·'),
        P.weekdayName(now)
      ]),
      h('div', { class: 'home-greet' }, [P.greeting(now) + '，beibei', h('span', { class: 'heart' }, '♡'), ' 记得记账休息~'])
    ]));

    // 每日一句（双语粉色卡片，按日更新）
    sec.appendChild(h('div', { class: 'slogan-card' }, [
      h('div', { class: 'slogan-head' }, ['📅 今日一句 · ' + (now.getMonth() + 1) + '月' + now.getDate() + '日']),
      h('div', { class: 'slogan-cn' }, slogan.cn),
      h('div', { class: 'slogan-en' }, slogan.en)
    ]));

    // Hero（总资产）—— 两行两列资产卡片
    var hero = h('div', { class: 'hero' }, [
      h('div', { class: 'hero-total-label' }, '💎 总资产'),
      h('div', { class: 'hero-total' }, money(total)),
      h('div', { class: 'hero-grid two-by-two' }, [
        h('div', { class: 'hero-cell' }, [h('div', { class: 'hc-label' }, '🏦 存钱罐'), h('div', { class: 'hc-value' }, money(dep))]),
        h('div', { class: 'hero-cell' }, [h('div', { class: 'hc-label' }, '💧 流动资金'), h('div', { class: 'hc-value' }, money(flow))]),
        h('div', { class: 'hero-cell' }, [h('div', { class: 'hc-label' }, '🚀 风险投资市值'), h('div', { class: 'hc-value' }, money(risk.market))]),
        h('div', { class: 'hero-cell' }, [h('div', { class: 'hc-label' }, '🌱 教育金投资市值'), h('div', { class: 'hc-value' }, money(edu.market))])
      ])
    ]);
    sec.appendChild(hero);

    // 总资产趋势（按月）
    var trend = homeTrend();
    sec.appendChild(h('div', { class: 'card', 'data-action': 'open-history', style: { cursor: 'pointer' } }, [
      h('div', { class: 'card-title' }, [h('span', { class: 'tt-ico' }, '📊'), '总资产趋势 ', h('span', { class: 'muted', style: { fontWeight: 400, fontSize: 12 } }, '(点击查看历史)')]),
      h('div', { class: 'chart-wrap', html: CH.line(trend, { color: '#6B4E71' }) })
    ]));

    // 投资概览小卡
    sec.appendChild(h('div', { class: 'section-label' }, ['💼 投资概览']));
    sec.appendChild(h('div', { class: 'stat-grid' }, [
      investStatCard('教育金投资', edu, '🌱'),
      investStatCard('风险投资', risk, '🚀')
    ]));

    // 预算/消费速览
    var ov = C.budgetYearOverview(D, D.viewYear);
    sec.appendChild(h('div', { class: 'section-label' }, ['🎯 今年预算']));
    sec.appendChild(h('div', { class: 'stat-grid three' }, [
      stat('本年实际已付现金', money(ov.paidCashTotal), 'gold'),
      stat('年度摊销成本', money(ov.allocTotal), 'mint'),
      h('div', { class: 'stat accent tappable', 'data-action': 'explain-monthly', style: { cursor: 'pointer' } }, [
        h('div', { class: 's-label' }, '当前月均支出'),
        h('div', { class: 's-value' }, money(ov.monthlyAvgTotal)),
        h('div', { class: 'li-sub' }, '👆 点我看计算')
      ])
    ]));
  }

  /* 预算计算说明弹窗 */
  function explainMonthly() {
    var y = D.viewYear;
    var ov = C.budgetYearOverview(D, y);
    var rows = (D.budgets || []).map(function (b) {
      var d = C.budgetYearData(b, y);
      return h('div', { class: 'li-row' }, [
        h('div', { class: 'li-main' }, [h('div', { class: 'li-title' }, b.name), h('div', { class: 'li-sub' }, '本年实际付款 / 应摊销')]),
        h('div', { class: 'li-amount' }, money(d.paidThisYear) + ' / ' + money(d.alloc))
      ]);
    });
    var body = h('div', {}, [
      h('div', { class: 'ins-key-box' }, [
        h('div', { class: 'ins-key-title' }, '📐 计算口径'),
        h('div', { class: 'ins-key-text' }, '① 本年实际付款额（现金流）＝ 付款计划子表中“付款日期在本年”的金额之和。② 本年应摊销额（成本）＝ 合同总额 ×（本年覆盖的摊销月数 ÷ 摊销总月数）。③ 月度均摊成本＝ 合同总额 ÷ 摊销总月数（无论看哪年都固定）。')
      ]),
      h('div', { class: 'stat-grid' }, [
        stat('本年实际已付现金', money(ov.paidCashTotal), 'gold'),
        stat('年度摊销成本', money(ov.allocTotal), 'mint'),
        stat('当前月均预算支出', money(ov.monthlyAvgTotal), 'blue')
      ]),
      h('div', { class: 'section-label', style: { margin: '14px 0 8px' } }, ['各预算明细']),
      rows.length ? rows : h('div', { class: 'li-sub' }, '今年还没有预算记录')
    ]);
    openModal('💡 预算是怎么算的', body, [h('button', { class: 'btn btn-primary btn-block', onclick: closeModal }, '知道了')]);
  }

  function investStatCard(name, st, ico) {
    var cls = st.profit >= 0 ? 'up' : 'down';
    return h('div', { class: 'stat cute-stat ' + (name.indexOf('教育') >= 0 ? 'mint' : 'rose') }, [
      h('div', { class: 's-label' }, [h('span', { style: { fontSize: '20px' } }, ico), name]),
      h('div', { class: 's-value' }, money(st.market)),
      h('div', { class: 'invest-meta' }, [
        h('div', { class: 'li-sub' }, ['投入 ', money(st.invested)]),
        h('div', { class: 'li-sub' }, [h('span', { class: cls }, (st.profit >= 0 ? '收益 ' : '亏损 ') + money(st.profit))])
      ])
    ]);
  }
  function stat(label, value, extra) {
    return h('div', { class: 'stat ' + (extra || '') }, [
      h('div', { class: 's-label' }, label),
      h('div', { class: 's-value' }, value)
    ]);
  }
  function homeTrend() {
    var months = [];
    var ymSet = {};
    D.currentFunds.forEach(function (r) { ymSet[r.year + '-' + r.month] = true; });
    var keys = Object.keys(ymSet).sort();
    var now = new Date();
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var k = d.getFullYear() + '-' + (d.getMonth() + 1);
      if (!ymSet[k]) keys.push(k);
    }
    keys.sort();
    var dep = C.depositTotal(D), edu = C.portfolioStat(D.educationFunds).market, risk = C.portfolioStat(D.riskFunds).market;
    keys.forEach(function (k) {
      var p = k.split('-'); var y = +p[0], m = +p[1];
      var rec = D.currentFunds.filter(function (r) { return r.year === y && r.month === m; })[0];
      var flow = 0;
      if (rec) {
        var ny = rec.month === 12 ? rec.year + 1 : rec.year, nm = rec.month === 12 ? 1 : rec.month + 1;
        var nx = D.currentFunds.filter(function (r) { return r.year === ny && r.month === nm; })[0];
        flow = nx ? (Number(nx.openingBalance) || 0) : (Number(rec.openingBalance) || 0);
      }
      months.push({ label: m + '月', value: dep + flow + edu + risk });
    });
    return months.slice(-12);
  }

  /* =========================================================
   * 存钱罐
   * ========================================================= */
  function renderDeposit() {
    var sec = q('#page-deposit'); sec.innerHTML = '';
    var total = C.depositTotal(D);
    sec.appendChild(h('div', { class: 'stat accent big' }, [
      h('div', { class: 's-label' }, ['🏦 存钱罐总额']),
      h('div', { class: 's-value xl' }, money(total))
    ]));
    sec.appendChild(h('div', { class: 'btn-row', style: { margin: '4px 0 12px' } }, [
      h('button', { class: 'btn btn-primary', 'data-action': 'add-deposit' }, '➕ 新增存钱罐'),
      h('button', { class: 'btn', 'data-action': 'open-history' }, '📅 日历快照')
    ]));
    if (!D.fixedDeposits.length) {
      sec.appendChild(h('div', { class: 'empty' }, [h('span', { class: 'em-ico' }, '🏦'), '还没有存钱罐，点上方按钮添加吧～']));
      return;
    }
    D.fixedDeposits.forEach(function (d) {
      var sub = [d.type];
      if (d.bank) sub.push(d.bank);
      if (d.type === '定期' && d.dueDate) sub.push('到期 ' + d.dueDate);
      var mat = depositMaturity(d);
      if (mat != null) sub.push('预计到期 ' + money(mat));
      sec.appendChild(h('div', { class: 'list-item tappable', 'data-action': 'row-actions', 'data-kind': 'deposit', 'data-id': d.id }, [
        h('div', { class: 'li-main' }, [
          h('div', { class: 'li-title' }, d.name),
          h('div', { class: 'li-sub' }, sub.join(' · '))
        ]),
        h('div', { class: 'li-amount' }, money(d.amount))
      ]));
    });
  }
  function stop(fn) { return function (e) { e.stopPropagation(); fn(e); }; }

  function depositMaturity(d) {
    if (d.type !== '定期' || !d.dueDate || d.rate == null || d.rate === '') return null;
    var ms = new Date(d.dueDate) - new Date();
    if (ms <= 0) return null;
    var years = ms / 86400000 / 365;
    return d.amount * (1 + Number(d.rate) / 100 * years);
  }
  function addDepositForm(id) {
    var d = id ? D.fixedDeposits.filter(function (x) { return x.id === id; })[0] : null;
    var name = input({ value: d ? d.name : '', placeholder: '如：工商银行定期' });
    var bank = input({ value: d ? d.bank : '', placeholder: '可选，如：工商银行' });
    var amount = input({ type: 'number', step: '0.01', value: d ? d.amount : '' });
    var type = select({ value: d ? d.type : '定期' }, [{ value: '定期', label: '定期' }, { value: '随时可取', label: '随时可取' }]);
    var due = input({ type: 'date', value: d ? d.dueDate : '' });
    var rate = input({ type: 'number', step: '0.01', value: d && d.rate != null ? d.rate : '', placeholder: '如 1.5' });
    var note = input({ value: d ? d.note : '', placeholder: '可选备注' });
    var estEl = h('div', { class: 'hint', style: { marginTop: 6 } });
    function updateEst() {
      if (type.value !== '定期') { estEl.textContent = ''; return; }
      var mat = depositMaturity({ type: '定期', amount: Number(amount.value) || 0, dueDate: due.value, rate: rate.value });
      if (mat == null) { estEl.textContent = rate.value ? '请填写到期日期以计算' : '填写利率与到期日期后显示预计到期金额'; return; }
      estEl.textContent = '📈 预计到期可领回：' + money(mat) + '（含利息）';
    }
    function syncType() {
      termWrap.style.display = type.value === '定期' ? '' : 'none';
      updateEst();
    }
    var termWrap = h('div', {}, [
      field('到期日期（仅定期必填）', due, '定期请填写；随时可取可留空'),
      field('年利率 %（仅定期）', rate, '如 1.5 表示年息 1.5%'),
      estEl
    ]);
    var body = h('div', {}, [
      field('存钱罐名称', name),
      field('所属银行', bank),
      field('金额', amount),
      field('类型', type),
      termWrap,
      field('备注', note)
    ]);
    amount.oninput = updateEst; due.oninput = updateEst; rate.oninput = updateEst; type.onchange = syncType;
    openModal(d ? '编辑存钱罐' : '新增存钱罐', body, [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        var obj = {
          name: name.value.trim() || '未命名账户', bank: bank.value.trim(),
          amount: Number(amount.value) || 0, type: type.value,
          dueDate: type.value === '定期' ? due.value : '',
          rate: type.value === '定期' ? (rate.value === '' ? '' : (Number(rate.value) || 0)) : '',
          note: note.value.trim()
        };
        if (d) { Object.assign(d, obj); } else { obj.id = P.uid('d'); D.fixedDeposits.push(obj); }
        save(); toast(d ? '已更新' : '已添加'); closeModal(); showPage('deposit');
      } }, '保存')
    ]);
    syncType();
  }
  function depositDetail(id) {
    var d = D.fixedDeposits.filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var mat = depositMaturity(d);
    var rows = [
      ['类型', d.type],
      ['金额', money(d.amount)],
      d.bank ? ['所属银行', d.bank] : null,
      d.type === '定期' ? ['到期日期', d.dueDate || '—'] : null,
      d.type === '定期' ? ['年利率', (d.rate != null && d.rate !== '') ? (Number(d.rate)) + ' %' : '未设置'] : null
    ];
    if (d.type === '定期' && mat != null) rows.push(['预计到期可领回', money(mat)]);
    if (d.type === '定期' && mat == null && d.rate != null && d.rate !== '') rows.push(['预计到期可领回', '请补全到期日期']);
    if (d.note) rows.push(['备注', d.note]);
    var body = h('div', { class: 'detail-card' }, rows.filter(Boolean).map(function (r) {
      return h('div', { class: 'detail-row' }, [h('span', { class: 'dr-k' }, r[0]), h('span', { class: 'dr-v' }, r[1])]);
    }));
    if (d.type === '定期' && (d.rate == null || d.rate === '')) {
      body.appendChild(h('div', { class: 'hint', style: { marginTop: 8 } }, '提示：在「修改」里填年利率，即可看到预计到期可领回金额。'));
    }
    openModal(d.name, body, [
      h('button', { class: 'btn', onclick: function () { closeModal(); addDepositForm(id); } }, '✏️ 修改'),
      h('button', { class: 'btn btn-danger', onclick: function () { closeModal(); delDeposit(id); } }, '🗑 删除')
    ]);
  }
  function delDeposit(id) {
    confirmDialog('删除账户', '确定删除该存款账户吗？', function () {
      D.fixedDeposits = D.fixedDeposits.filter(function (x) { return x.id !== id; });
      save(); toast('已删除'); showPage('deposit');
    });
  }

  /* =========================================================
   * 流动资金
   * ========================================================= */
  function getFlowRec(y, m) { return D.currentFunds.filter(function (r) { return r.year === y && r.month === m; })[0]; }
  function ensureFlowRec(y, m) {
    var rec = getFlowRec(y, m);
    if (!rec) {
      var prev = prevMonthRec(y, m);
      var accounts = (prev && prev.accounts)
        ? prev.accounts.map(function (a) { return { id: P.uid('ac'), kind: a.kind, label: a.label, amount: Number(a.amount) || 0, note: a.note || '' }; })
        : (P.defaultAccounts ? P.defaultAccounts() : []);
      rec = { id: P.uid('c'), year: y, month: m, openingBalance: prev ? (Number(prev.closingBalance) || 0) : 0, closingBalance: 0, note: '', incomes: [], largeExpenses: [], repayments: [], advances: [], investExps: [], accounts: accounts };
      D.currentFunds.push(rec);
      recomputeClosings();
      save();
    }
    return rec;
  }
  // 期末余额 = 次月期初：每次修改某月期初后，把上月 closingBalance 同步为次月期初
  function recomputeClosings() {
    D.currentFunds.forEach(function (rec) {
      var ny = rec.month === 12 ? rec.year + 1 : rec.year, nm = rec.month === 12 ? 1 : rec.month + 1;
      var nx = D.currentFunds.filter(function (r) { return r.year === ny && r.month === nm; })[0];
      rec.closingBalance = nx ? (Number(nx.openingBalance) || 0) : (rec.closingBalance || 0);
    });
  }
  function prevMonthRec(y, m) {
    var py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return getFlowRec(py, pm);
  }

  // 期初余额构成：微信零钱 / 余额宝 / 银行 / 其他（四项之和 = 期初余额）
  function accIcon(kind) {
    return { wechat: '💬', yuebao: '🐝', bank: '🏦', other: '💼' }[kind] || '💰';
  }
  function channelLabel(ch) {
    return { wechat: '微信零钱', yuebao: '余额宝', bank: '银行', other: '其他', '存钱罐': '存钱罐', '流动资金': '流动资金' }[ch] || ch;
  }
  // 跨月查找垫付（往月未报销的垫付存于原账本，需全局查找）
  function findAdvance(id) {
    for (var i = 0; i < D.currentFunds.length; i++) {
      var rec = D.currentFunds[i];
      var a = (rec.advances || []).filter(function (x) { return x.id === id; })[0];
      if (a) return { rec: rec, a: a };
    }
    return null;
  }
  // 收集早于 (y,m) 的未报销垫付（用于本月垫付资金区展示往月待报销）
  function collectPendingAdvances(y, m) {
    var cur = y * 12 + m, out = [];
    D.currentFunds.forEach(function (rec) {
      if ((rec.year * 12 + rec.month) < cur) {
        (rec.advances || []).forEach(function (a) { if (!a.reimbursed) out.push({ rec: rec, a: a }); });
      }
    });
    return out;
  }
  function advanceRow(a, isPending, srcRec) {
    var ch = channelLabel(a.channel || '流动资金');
    var chipCls = a.channel === '存钱罐' ? 'teal' : (a.channel === '流动资金' ? 'blue' : 'violet');
    return h('div', { class: 'list-item tappable' + (isPending ? ' pending' : ''), 'data-action': 'row-actions', 'data-kind': 'advance', 'data-id': a.id }, [
      h('div', { class: 'li-main' }, [
        h('div', { class: 'li-title' }, [a.purpose || '垫付', ' ',
          a.reimbursed ? h('span', { class: 'chip gold' }, '已报销') : h('span', { class: 'chip gray' }, '未报销'), ' ',
          h('span', { class: 'chip ' + chipCls }, ch),
          isPending ? h('span', { class: 'chip orange' }, '往月·' + (srcRec.year % 100) + '/' + srcRec.month + '月') : null
        ]),
        h('div', { class: 'li-sub' }, a.date + (a.reimbursed && a.reimburseDate ? ' · 报销于 ' + a.reimburseDate : ''))
      ]),
      h('div', { class: 'li-amount' }, money(a.amount))
    ]);
  }
  function accountTotal(rec) {
    return (rec.accounts || []).reduce(function (s, a) { return s + (Number(a.amount) || 0); }, 0);
  }

  function renderFlow() {
    var sec = q('#page-flow'); sec.innerHTML = '';
    var y = state.flowYear, m = state.flowMonth;
    var rec = getFlowRec(y, m);
    // 当前真实年月：未来月不允许填期初（谁也预测不了下月期初）
    var now = new Date();
    var curY = now.getFullYear(), curM = now.getMonth() + 1;
    var isFuture = (y * 12 + m) > (curY * 12 + curM);
    // 该月是否为最新（无次月）：只有最新月才允许撤销，避免破坏期末=次月期初的链路
    var isLatest = !D.currentFunds.some(function (r) { return (r.year === (m === 12 ? y + 1 : y)) && (r.month === (m === 12 ? 1 : m + 1)); });

    // ① 月份块（置顶）
    var tools = [];
    if (rec) {
      if (!isFuture) tools.push(h('button', { class: 'btn btn-sm', 'data-action': 'preview-flow-balance' }, '👁 余额明细'));
      if (!isFuture) tools.push(h('button', { class: 'btn btn-sm', 'data-action': 'open-stats' }, '📊 统计'));
      tools.push(h('button', { class: 'btn btn-sm', 'data-action': 'open-opening-history' }, '📜 期初历史'));
      if (isLatest) tools.push(h('button', { class: 'btn btn-sm btn-danger-soft', 'data-action': 'undo-flow-month' }, '🗑 撤销本月'));
    } else if (!isFuture) {
      tools.push(h('button', { class: 'btn btn-sm btn-primary', 'data-action': 'init-flow-month' }, '➕ 建立本月账本'));
    }
    sec.appendChild(h('div', { class: 'flow-month-row' }, [
      h('div', { class: 'seg' }, [
        h('button', { class: 'seg-btn', 'data-action': 'flow-prev' }, '‹'),
        h('div', { class: 'seg-label' }, y + ' 年 ' + m + ' 月'),
        h('button', { class: 'seg-btn', 'data-action': 'flow-next' }, '›')
      ]),
      h('div', { class: 'flow-month-tools' }, tools)
    ]));

    // ② 本月结余：非最新月用次月期初；最新月用实时估算（期初 + 收入 - 已记录流出）
    var closing = rec ? C.closingOf(D, rec) : null;
    var balance = closing != null ? closing : (rec ? C.monthBalanceEstimate(rec, D) : null);
    sec.appendChild(h('div', { class: 'stat accent big tappable', 'data-action': 'preview-flow-balance', title: '点我看余额明细' }, [
      h('div', { class: 's-label' }, ['💧 本月结余' + (closing == null && rec ? '（实时估算）' : '') + '  👆 点看明细']),
      h('div', { class: 's-value xl' }, balance != null ? money(balance) : '—')
    ]));

    // ②-1 期初余额构成已移至「余额」录入弹窗内分项填写，并可在「📜 期初历史」查看，本页不再直接展示

    // ③ 本月收入 / 本月支出（合计，各带 +）
    var incVal = rec ? C.monthIncome(rec) : 0;
    var expVal = rec ? C.monthConsumption(rec, D) : 0;
    sec.appendChild(h('div', { class: 'flow-summary' }, [
      sumLine('🟢 本月收入', money(incVal), 'add-income'),
      sumLine('🔴 本月支出', money(expVal), 'add-consumption')
    ]));

    if (!rec) {
      if (isFuture) {
        sec.appendChild(h('div', { class: 'empty' }, [h('span', { class: 'em-ico' }, '⏳'), '该月还没到，无需提前填期初余额（没人能预测下月期初）。等到了 ' + y + '年' + m + '月再记录即可。']));
      } else {
        sec.appendChild(h('div', { class: 'empty' }, [h('span', { class: 'em-ico' }, '💧'), '本月还没有记录，点下方按钮开始记录吧～',
          h('div', { style: { marginTop: 12 } }, h('button', { class: 'btn btn-primary', 'data-action': 'init-flow-month' }, '➕ 建立本月账本'))]));
      }
      return;
    }

    // ④ 细项（标题更醒目）
    sec.appendChild(flowSecHead('💰 新增收入（' + rec.incomes.length + '）'));
    if (rec.incomes.length) rec.incomes.forEach(function (it) {
      sec.appendChild(h('div', { class: 'list-item tappable', 'data-action': 'row-actions', 'data-kind': 'income', 'data-id': it.id }, [
        h('div', { class: 'li-main' }, [h('div', { class: 'li-title' }, (it.source || '收入')), h('div', { class: 'li-sub' }, it.date)]),
        h('div', { class: 'li-amount up' }, '+' + money(it.amount))
      ]));
    }); else sec.appendChild(h('div', { class: 'muted', style: { padding: '4px 6px' } }, '暂无，点上方“＋”记录工资/转账等'));

    sec.appendChild(flowSecHead('🛍️ 大额支出（' + rec.largeExpenses.length + '）'));
    if (rec.largeExpenses.length) rec.largeExpenses.forEach(function (e) {
      sec.appendChild(expenseRow(e));
    }); else sec.appendChild(h('div', { class: 'muted', style: { padding: '4px 6px' } }, '暂无大额支出'));

    sec.appendChild(flowSecHead('💳 还款资金（' + rec.repayments.length + '）'));
    if (rec.repayments.length) rec.repayments.forEach(function (r) {
      var ch = channelLabel(r.channel || 'other');
      var chipCls = r.channel === '存钱罐' ? 'teal' : 'violet';
      var linked = r.creditId ? creditById(r.creditId) : null;
      sec.appendChild(h('div', { class: 'list-item tappable', 'data-action': 'row-actions', 'data-kind': 'repay', 'data-id': r.id }, [
        h('div', { class: 'li-main' }, [
          h('div', { class: 'li-title' }, [r.platform || '还款', ' ', h('span', { class: 'chip ' + chipCls }, ch),
            linked ? h('span', { class: 'chip gray' }, '↔ ' + linked.name) : null]),
          h('div', { class: 'li-sub' }, r.date)
        ]),
        h('div', { class: 'li-amount' }, money(r.amount))
      ]));
    }); else sec.appendChild(h('div', { class: 'muted', style: { padding: '4px 6px' } }, '暂无还款记录'));

    // 信用负债（还款关联对象，剩余欠款随还款自动扣减）
    var credits = D.creditLiabilities || [];
    sec.appendChild(flowSecHead2('💳 信用负债（剩余欠款）', [
      h('button', { class: 'btn btn-sm', 'data-action': 'manage-credits' }, '管理')
    ]));
    if (credits.length) credits.forEach(function (c) {
      sec.appendChild(h('div', { class: 'list-item' }, [
        h('div', { class: 'li-main' }, [h('div', { class: 'li-title' }, c.name), h('div', { class: 'li-sub' }, '关联还款自动扣减剩余欠款')]),
        h('div', { class: 'li-amount ' + (c.remaining < 0 ? 'up' : '') }, c.remaining < 0 ? '结余 ' + money(-c.remaining) : money(c.remaining))
      ]));
    }); else sec.appendChild(h('div', { class: 'muted', style: { padding: '4px 6px' } }, '暂无信用负债，点「管理」添加（如花呗/信用卡）'));

    sec.appendChild(flowSecHead('📨 垫付资金（本月累计 ' + money(C.advanceTotal(rec)) + '）'));
    if (rec.advances.length) rec.advances.forEach(function (a) { sec.appendChild(advanceRow(a, false, rec)); });
    else sec.appendChild(h('div', { class: 'muted', style: { padding: '4px 6px' } }, '暂无本月垫付记录'));
    // 往月未报销的垫付，也在本月垫付资金区体现，可点“已报销”冲回
    var pending = collectPendingAdvances(y, m);
    if (pending.length) {
      sec.appendChild(h('div', { class: 'sub-head' }, '⏳ 往月待报销（' + pending.length + '）'));
      pending.forEach(function (p) { sec.appendChild(advanceRow(p.a, true, p.rec)); });
    }

    // 投资支出（按月段记录，不绑定具体日期；跨多月按月均摊计入本月支出）
    var invItems = C.investExpsForMonth(D, y, m);
    sec.appendChild(flowSecHead('📈 投资支出（' + invItems.length + '）'));
    if (invItems.length) invItems.forEach(function (it) {
      var e = it.entry;
      var months = ymMonths(e.startYM, e.endYM || e.startYM);
      var periodLabel = (e.startYM === (e.endYM || e.startYM)) ? e.startYM : (e.startYM + ' ~ ' + e.endYM);
      var ch = channelLabel(e.channel || 'wechat');
      var chCls = e.channel === '存钱罐' ? 'teal' : 'violet';
      sec.appendChild(h('div', { class: 'list-item tappable', 'data-action': 'row-actions', 'data-kind': 'invest', 'data-id': e.id }, [
        h('div', { class: 'li-main' }, [
          h('div', { class: 'li-title' }, [(e.note || '投资支出'), ' ', months > 1 ? h('span', { class: 'chip gray' }, '跨' + months + '月均摊') : null]),
          h('div', { class: 'li-sub' }, [h('span', { class: 'chip ' + chCls }, ch), ' ', periodLabel])
        ]),
        h('div', { class: 'li-amount' }, money(it.allocated))
      ]));
    }); else sec.appendChild(h('div', { class: 'muted', style: { padding: '4px 6px' } }, '暂无投资支出'));

    // 小额未记账（自动计算，点击金额显示完整计算过程）
    var other = C.otherDaily(rec, D);
    var closing = C.closingOf(D, rec);
    var invVal = C.investExpenseForMonth(D, rec.year, rec.month);
    var lgVal = C.largeExpenseTotal(rec);
    var rpVal = C.repaymentTotal(rec);
    var adVal = C.advanceUnreimbursed(rec);
    function calcRow(label, val, sign) {
      return h('div', { class: 'calc-row' }, [
        h('span', { class: 'calc-sign ' + (sign === '+' ? 'plus' : 'minus') }, sign),
        h('span', { class: 'calc-label' }, label),
        h('span', { class: 'calc-val' }, money(val))
      ]);
    }
    sec.appendChild(flowSecHead('🧮 小额未记账（自动估算）'));
    var otherAmount = h('div', { class: 'other-amount tappable' }, [
      other == null ? '—' : money(other),
      h('span', { class: 'other-hint' }, other == null ? '👆 次月期初未填' : '👆 点金额看计算')
    ]);
    var otherDetail;
    if (other == null) {
      otherDetail = h('div', { class: 'other-detail' }, '次月期初余额尚未录入，无法计算本月小额未记账（期末余额 = 次月期初）。请先建立次月账本并填入期初余额。');
    } else {
      otherDetail = h('div', { class: 'other-detail calc-steps' }, [
        h('div', { class: 'calc-formula' }, '公式：小额未记账 ＝ 期初 ＋ 收入 − 期末(次月期初) − 大额 − 还款 − 投资支出 − 垫付(未报销)'),
        calcRow('期初余额', rec.openingBalance, '+'),
        calcRow('＋ 本月收入（含报销）', incVal, '+'),
        calcRow('− 期末余额（＝次月期初）', closing, '-'),
        calcRow('− 大额支出', lgVal, '-'),
        calcRow('− 还款资金', rpVal, '-'),
        calcRow('− 投资支出（本月均摊）', invVal, '-'),
        calcRow('− 垫付(未报销·流动资金)', adVal, '-'),
        h('div', { class: 'calc-result' }, [h('span', {}, '＝ 小额未记账'), h('b', {}, money(other))])
      ]);
    }
    if (other != null) {
      otherAmount.addEventListener('click', function () {
        var open = otherDetail.classList.toggle('show');
        otherAmount.classList.toggle('open', open);
        otherAmount.querySelector('.other-hint').textContent = open ? '👆 收起' : '👆 点金额看计算';
      });
    } else {
      otherAmount.style.opacity = .7; otherAmount.style.cursor = 'default';
    }
    sec.appendChild(h('div', { class: 'other-box' }, [otherAmount, otherDetail]));

    // 余额与消费结构（置于趋势之前，仅显示期初/期末两项）
    sec.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, [h('span', { class: 'tt-ico' }, '🔢'), '本月余额与消费结构']),
      h('div', { class: 'stat-grid' }, [
        stat('期初余额', money(rec.openingBalance)),
        stat('期末余额', closing == null ? h('span', { class: 'placeholder-text' }, '待次月填期初') : money(closing))
      ])
    ]));

    // 近7天趋势（最底部，可点击圆点查看当日金额）
    var trend = C.last7DaysTrend(D);
    var trendWrap = h('div', { class: 'chart-wrap trend-chart' });
    trendWrap.innerHTML = CH.line(trend, { color: '#E8B04B', interactive: true });
    var tip = h('div', { class: 'chart-tip' });
    trendWrap.appendChild(tip);
    trendWrap.addEventListener('click', function (ev) {
      var hit = ev.target && ev.target.closest ? ev.target.closest('.pt-hit') : null;
      if (!hit) { tip.classList.remove('show'); return; }
      var idx = +hit.getAttribute('data-idx');
      var p = trend[idx];
      if (!p) return;
      var wrapRect = trendWrap.getBoundingClientRect();
      var r = hit.getBoundingClientRect();
      var cx = r.left + r.width / 2 - wrapRect.left;
      var cy = r.top + r.height / 2 - wrapRect.top;
      var above = cy > 52;
      tip.innerHTML = '<div class="ct-date">' + (p.date || p.label) + '</div><div class="ct-val">' + P.fmtMoney(p.value) + '</div>';
      tip.style.left = cx + 'px';
      tip.style.top = (above ? cy - 10 : cy + 18) + 'px';
      tip.style.transform = above ? 'translate(-50%,-100%)' : 'translate(-50%,0)';
      tip.classList.toggle('below', !above);
      tip.classList.add('show');
    });
    sec.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, [h('span', { class: 'tt-ico' }, '📉'), '近 7 天消费趋势']),
      h('div', { class: 'muted', style: { fontSize: 12, marginBottom: 6 } }, '👆 点击圆点查看当日金额'),
      trendWrap
    ]));
  }
  function sumLine(label, amount, action) {
    return h('div', { class: 'sum-line' }, [
      h('div', { class: 'sum-info' }, [
        h('div', { class: 'sum-label' }, label),
        h('div', { class: 'sum-amount' }, amount)
      ]),
      h('button', { class: 'sum-add', 'data-action': action, title: '新增' }, '＋')
    ]);
  }
  function flowSecHead(title) { return h('div', { class: 'flow-sec', style: { marginTop: 18 } }, [title]); }
  function flowSecHead2(title, actions) {
    return h('div', { class: 'flow-sec', style: { marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
      h('span', {}, [title]),
      actions ? h('div', { style: { flexShrink: 0 } }, actions) : null
    ]);
  }
  function listHead(title) { return h('div', { class: 'section-label', style: { marginTop: 16 } }, [title]); }

  function expenseRow(e) {
    var payLabel = channelLabel(e.payment);
    var payCls = e.payment === '存钱罐' ? 'teal' : 'gray';
    var chip = h('span', { class: 'chip ' + payCls }, payLabel);
    var link = e.budgetLink ? h('span', { class: 'chip gold' }, '🔗预算') : null;
    return h('div', { class: 'list-item tappable', 'data-action': 'row-actions', 'data-kind': 'large', 'data-id': e.id }, [
      h('div', { class: 'li-main' }, [
        h('div', { class: 'li-title' }, [e.category || '其他', ' ', chip, ' ', link]),
        h('div', { class: 'li-sub' }, e.date + (e.note ? ' · ' + e.note : ''))
      ]),
      h('div', { class: 'li-amount' }, money(e.amount))
    ]);
  }

  /* ---------- 存钱罐扣减（消费/还款支付渠道为“存钱罐”时） ---------- */
  function depositById(id) { return D.fixedDeposits.filter(function (x) { return x.id === id; })[0]; }
  function isPiggy(e) { return e && (e.payment === '存钱罐' || e.channel === '存钱罐') && e.depositId; }
  function revertDepositDeduction(e) {
    if (isPiggy(e)) {
      var d = depositById(e.depositId);
      if (d) d.amount = (Number(d.amount) || 0) + (Number(e.amount) || 0);
    }
  }
  function applyDepositDeduction(e) {
    if (isPiggy(e)) {
      var d = depositById(e.depositId);
      if (d) d.amount = Math.max(0, (Number(d.amount) || 0) - (Number(e.amount) || 0));
    }
  }
  /* ---------- 信用负债同步（还款关联后自动扣减剩余欠款） ---------- */
  function creditById(id) { return (D.creditLiabilities || []).filter(function (x) { return x.id === id; })[0]; }
  function revertRepayCredit(rp) {
    if (rp && rp.creditId) {
      var c = creditById(rp.creditId);
      if (c) c.remaining = (Number(c.remaining) || 0) + (Number(rp.amount) || 0);
    }
  }
  function applyRepayCredit(rp) {
    if (rp && rp.creditId) {
      var c = creditById(rp.creditId);
      if (c) c.remaining = (Number(c.remaining) || 0) - (Number(rp.amount) || 0);
    }
  }
  /* ---------- 垫付：存钱罐渠道扣减 / 报销返还 ---------- */
  function revertAdvanceDeduction(a) {
    // 仅当该垫付当前确实在账户上扣着（未报销的存钱罐垫付）才返还，避免重复加回
    if (a && a.channel === '存钱罐' && a.depositId && !a.reimbursed) {
      var d = depositById(a.depositId);
      if (d) d.amount = (Number(d.amount) || 0) + (Number(a.amount) || 0);
    }
  }
  function applyAdvanceDeduction(a) {
    // 仅“存钱罐”渠道、且未报销时扣减账户；已报销则钱款已返还（不扣减）
    if (a && a.channel === '存钱罐' && a.depositId && !a.reimbursed) {
      var d = depositById(a.depositId);
      if (d) d.amount = Math.max(0, (Number(d.amount) || 0) - (Number(a.amount) || 0));
    }
  }
  /* ---------- 垫付：报销返还到对应支付渠道账户 ---------- */
  // 报销后资金回到支付渠道账户：存钱罐→存钱罐账户；微信零钱/余额宝/银行/其他→对应账户余额＋本月流动资金；流动资金→由本月收入体现
  function returnAdvanceToChannel(a, rec) {
    var amt = Number(a.amount) || 0;
    if (!amt) return;
    if (a.channel === '存钱罐') {
      var d = a.depositId ? depositById(a.depositId) : null;
      if (d) d.amount = (Number(d.amount) || 0) + amt;
    } else if (a.channel === '流动资金') {
      // 回到流动资金：由本月收入体现，无需单独账户操作
    } else {
      // 微信零钱/余额宝/银行/其他 → 回到对应账户余额，并同步本月流动资金
      rec.openingBalance = (Number(rec.openingBalance) || 0) + amt;
      var acc = (rec.accounts || []).filter(function (x) { return x.kind === a.channel; })[0];
      if (acc) acc.amount = (Number(acc.amount) || 0) + amt;
    }
  }
  function undoReturnAdvance(a, rec) {
    var amt = Number(a.amount) || 0;
    if (!amt) return;
    if (a.channel === '存钱罐') {
      var d = a.depositId ? depositById(a.depositId) : null;
      if (d) d.amount = Math.max(0, (Number(d.amount) || 0) - amt);
    } else if (a.channel === '流动资金') {
      // no-op
    } else {
      rec.openingBalance = (Number(rec.openingBalance) || 0) - amt;
      var acc = (rec.accounts || []).filter(function (x) { return x.kind === a.channel; })[0];
      if (acc) acc.amount = Math.max(0, (Number(acc.amount) || 0) - amt);
    }
  }

  function delIncome(id) {
    var r = getFlowRec(state.flowYear, state.flowMonth);
    confirmDialog('删除收入', '确定删除该收入记录吗？', function () {
      r.incomes = r.incomes.filter(function (x) { return x.id !== id; }); save(); renderFlow();
    });
  }
  function delRepay(id) {
    var r = getFlowRec(state.flowYear, state.flowMonth);
    var rp = r.repayments.filter(function (x) { return x.id === id; })[0];
    if (!rp) return;
    confirmDialog('删除还款', '确定删除该还款记录吗？', function () {
      revertRepayCredit(rp);     // 回滚：剩余欠款加回
      revertDepositDeduction(rp); // 回滚：存钱罐账户返还
      r.repayments = r.repayments.filter(function (x) { return x.id !== id; }); save(); renderFlow();
    });
  }
  function delAdvance(id) {
    var found = findAdvance(id);
    if (!found) return;
    var a = found.a, origRec = found.rec;
    confirmDialog('删除垫付', '确定删除该垫付记录吗？', function () {
      var cur = ensureFlowRec(state.flowYear, state.flowMonth);
      revertAdvanceDeduction(a);                  // 存钱罐：返还已扣减
      if (a.reimbursed) undoReturnAdvance(a, cur); // 撤销报销返还（当前月）
      origRec.advances = origRec.advances.filter(function (x) { return x.id !== id; });
      save(); renderFlow();
    });
  }
  function delLarge(id) {
    var r = getFlowRec(state.flowYear, state.flowMonth);
    var e = r.largeExpenses.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    confirmDialog('删除大额支出', '确定删除该支出？', function () {
      revertDepositDeduction(e);
      if (e.budgetLink && e.budgetId) {
        var b = D.budgets.filter(function (x) { return x.id === e.budgetId; })[0];
        if (b && b.payments) b.payments = b.payments.filter(function (p) { return p._src !== e.id; });
      }
      r.largeExpenses = r.largeExpenses.filter(function (x) { return x.id !== id; });
      save(); renderFlow();
    });
  }
  function delInvest(id) {
    confirmDialog('删除投资支出', '确定删除该投资支出记录吗？', function () {
      var found = findInvestExp(id);
      if (found) {
        if (found.entry.channel === '存钱罐' && found.entry.depositId) {
          var dd = depositById(found.entry.depositId);
          if (dd) dd.amount = (Number(dd.amount) || 0) + (Number(found.entry.amount) || 0);
        }
        found.rec.investExps = found.rec.investExps.filter(function (x) { return x.id !== id; });
      }
      save(); renderFlow();
    });
  }
  function doReimburse(id) {
    var found = findAdvance(id);
    if (!found) return;
    var a = found.a;
    var rec = ensureFlowRec(state.flowYear, state.flowMonth);
    if (!a.reimbursed) {
      returnAdvanceToChannel(a, rec); // 报销 → 资金回到对应支付渠道账户（本月）
      a.reimbursed = true; a.reimburseDate = P.todayYmd();
      toast('已报销，资金已回到「' + channelLabel(a.channel) + '」账户 🎉');
    } else {
      undoReturnAdvance(a, rec);
      a.reimbursed = false; a.reimburseDate = null;
      toast('已撤销报销');
    }
    save(); renderFlow();
  }

  /* ---------- 收入 / 还款 / 垫付 表单（新增与修改共用） ---------- */
  function incomeForm(existing) {
    var r = ensureFlowRec(state.flowYear, state.flowMonth);
    var amount = input({ type: 'number', step: '0.01', value: existing ? existing.amount : '', placeholder: '金额' });
    var source = input({ value: existing ? existing.source : '', placeholder: '来源（如：工资/转账，可空）' });
    var date = input({ type: 'date', value: existing ? existing.date : P.todayYmd() });
    openModal(existing ? '编辑收入' : '新增资金', h('div', {}, [field('金额', amount), field('来源', source), field('日期', date)]), [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!amount.value) return toast('请输入金额');
        if (existing) { existing.amount = Number(amount.value) || 0; existing.source = source.value.trim(); existing.date = date.value || P.todayYmd(); }
        else r.incomes.push({ id: P.uid('i'), amount: Number(amount.value) || 0, source: source.value.trim(), date: date.value || P.todayYmd() });
        save(); toast(existing ? '已更新' : '已记录'); closeModal(); showPage('flow');
      } }, '保存')
    ]);
  }
  function repayForm(existing) {
    var r = ensureFlowRec(state.flowYear, state.flowMonth);
    var plat = input({ value: existing ? existing.platform : '', placeholder: '平台，如：花呗/白条/抖音月付' });
    var amt = input({ type: 'number', step: '0.01', value: existing ? existing.amount : '', placeholder: '还款金额' });
    var chSel = select({ value: existing ? (existing.channel || 'other') : 'other' }, [
      { value: 'wechat', label: '微信零钱' },
      { value: 'yuebao', label: '余额宝' },
      { value: 'bank', label: '银行' },
      { value: 'other', label: '其他' },
      { value: '存钱罐', label: '存钱罐' }
    ]);
    var depSel = select({ value: existing && existing.depositId ? existing.depositId : '' },
      [{ value: '', label: '选择存钱罐账户' }].concat(D.fixedDeposits.map(function (d) { return { value: d.id, label: d.name + '（' + money(d.amount) + '）' }; })));
    var depWrap = h('div', {});
    function syncDep() { depWrap.innerHTML = ''; if (chSel.value === '存钱罐') { depWrap.appendChild(field('存钱罐账户', depSel)); depWrap.appendChild(h('div', { class: 'hint' }, '从存钱罐账户扣减该笔还款金额')); } }
    chSel.onchange = syncDep; if (existing && existing.channel === '存钱罐') syncDep();

    var credits = D.creditLiabilities || [];
    var linkSel = select({ value: existing && existing.creditId ? '是' : '否' }, [{ value: '否', label: '否' }, { value: '是', label: '是' }]);
    var creditSel = select({ value: existing && existing.creditId ? existing.creditId : '', disabled: !(existing && existing.creditId) },
      [{ value: '', label: credits.length ? '选择信用负债' : '（暂无，先去添加）' }].concat(credits.map(function (c) { return { value: c.id, label: c.name + '（剩余 ' + money(c.remaining) + '）' }; })));
    var linkWrap = h('div', {});
    function syncLink() {
      linkWrap.innerHTML = '';
      creditSel.disabled = linkSel.value !== '是';
      linkWrap.appendChild(field('关联信用负债（同步剩余欠款）', h('div', { class: 'row2' }, [linkSel, creditSel])));
      if (linkSel.value === '是' && !credits.length) linkWrap.appendChild(h('div', { class: 'hint' }, '在下方「💳 信用负债」区可新增'));
    }
    linkSel.onchange = syncLink; syncLink();

    var dt = input({ type: 'date', value: existing ? existing.date : P.todayYmd() });
    openModal(existing ? '编辑还款' : '记录还款', h('div', {}, [
      field('还款平台', plat), field('还款金额', amt),
      field('还款渠道', chSel), depWrap,
      field('关联信用负债', linkWrap),
      field('日期', dt)
    ]), [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!amt.value) return toast('请输入金额');
        var channel = chSel.value;
        var depositId = channel === '存钱罐' ? (depSel.value || null) : null;
        var cid = (linkSel.value === '是') ? (creditSel.value || null) : null;
        if (linkSel.value === '是' && !cid) return toast('请选择要关联的信用负债');
        if (channel === '存钱罐' && !depSel.value) return toast('请选择存钱罐账户');
        var newAmt = Number(amt.value) || 0;
        var newPlat = plat.value.trim() || '其他';
        var newDate = dt.value || P.todayYmd();
        if (existing) {
          revertRepayCredit(existing); revertDepositDeduction(existing);
          existing.platform = newPlat; existing.amount = newAmt; existing.date = newDate;
          existing.channel = channel; existing.depositId = depositId; existing.creditId = cid;
          applyDepositDeduction(existing); applyRepayCredit(existing);
        } else {
          var rec2 = { id: P.uid('r'), platform: newPlat, amount: newAmt, date: newDate, channel: channel, depositId: depositId, creditId: cid };
          r.repayments.push(rec2);
          applyDepositDeduction(rec2); applyRepayCredit(rec2);
        }
        save(); toast(existing ? '已更新' : '已记录'); closeModal(); showPage('flow');
      } }, '保存')
    ]);
  }
  function advanceForm(existing) {
    var r = ensureFlowRec(state.flowYear, state.flowMonth);
    var amt = input({ type: 'number', step: '0.01', value: existing ? existing.amount : '', placeholder: '垫付金额' });
    var purp = input({ value: existing ? existing.purpose : '', placeholder: '用途' });
    var dt = input({ type: 'date', value: existing ? existing.date : P.todayYmd() });
    var chSel = select({ value: existing ? (existing.channel || '流动资金') : 'wechat' }, [
      { value: 'wechat', label: '微信零钱' },
      { value: 'yuebao', label: '余额宝' },
      { value: 'bank', label: '银行' },
      { value: 'other', label: '其他' },
      { value: '存钱罐', label: '存钱罐' }
    ]);
    var depSel = select({ value: existing && existing.depositId ? existing.depositId : '' },
      [{ value: '', label: '选择存钱罐账户' }].concat(D.fixedDeposits.map(function (d) { return { value: d.id, label: d.name + '（' + money(d.amount) + '）' }; })));
    var depWrap = h('div', {});
    function syncDep() {
      depWrap.innerHTML = '';
      if (chSel.value === '存钱罐') {
        depWrap.appendChild(field('存钱罐账户', depSel));
        depWrap.appendChild(h('div', { class: 'hint' }, '报销前自动扣减该账户；选“已报销”后自动返还'));
      } else if (chSel.value === '流动资金') {
        depWrap.appendChild(h('div', { class: 'hint' }, '报销后作为本月收入回流到流动资金'));
      } else {
        depWrap.appendChild(h('div', { class: 'hint' }, '报销后资金自动加回「' + channelLabel(chSel.value) + '」账户余额，并同步本月流动资金'));
      }
    }
    chSel.onchange = syncDep; if (existing && existing.channel === '存钱罐') syncDep();
    var reimbChk = input({ type: 'checkbox' }); reimbChk.checked = existing ? !!existing.reimbursed : false;
    var reimbDate = input({ type: 'date', value: existing && existing.reimburseDate ? existing.reimburseDate : P.todayYmd() });

    openModal(existing ? '编辑垫付' : '记录垫付', h('div', {}, [
      field('垫付金额', amt), field('用途', purp), field('日期', dt),
      field('支付渠道', chSel), depWrap,
      h('label', { class: 'chk-row' }, [reimbChk, h('span', {}, '已报销（钱款返回支付渠道账户）')]),
      field('报销日期', reimbDate)
    ]), [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!amt.value) return toast('请输入金额');
        if (chSel.value === '存钱罐' && !depSel.value) return toast('请选择存钱罐账户');
        var old = existing ? { channel: existing.channel, depositId: existing.depositId, amount: existing.amount, reimbursed: existing.reimbursed } : null;
        var channel = chSel.value;
        var depositId = channel === '存钱罐' ? (depSel.value || null) : null;
        var reimb = reimbChk.checked;
        if (existing) {
          existing.amount = Number(amt.value) || 0; existing.purpose = purp.value.trim(); existing.date = dt.value || P.todayYmd();
          existing.channel = channel; existing.depositId = depositId;
          existing.reimbursed = reimb; existing.reimburseDate = reimb ? (reimbDate.value || P.todayYmd()) : null;
        } else {
          r.advances.push({ id: P.uid('a'), amount: Number(amt.value) || 0, purpose: purp.value.trim(), date: dt.value || P.todayYmd(), channel: channel, depositId: depositId, reimbursed: reimb, reimburseDate: reimb ? (reimbDate.value || P.todayYmd()) : null });
        }
        var target = existing || r.advances[r.advances.length - 1];
        // 存钱罐扣减管理
        if (old) revertAdvanceDeduction(old);
        applyAdvanceDeduction(target);
        // 报销返还：资金回到对应支付渠道账户（本月）
        if (old) {
          if (old.reimbursed && !target.reimbursed) undoReturnAdvance(old, r);
          else if (!old.reimbursed && target.reimbursed) returnAdvanceToChannel(target, r);
          else if (old.reimbursed && target.reimbursed && old.channel !== target.channel) { undoReturnAdvance(old, r); returnAdvanceToChannel(target, r); }
        } else if (target.reimbursed) {
          returnAdvanceToChannel(target, r);
        }
        save(); toast(existing ? '已更新' : '已记录'); closeModal(); showPage('flow');
      } }, '保存')
    ]);
  }

  /* ---------- 记录消费：先选类型，再进入对应表单 ---------- */
  function addConsumptionForm() {
    openActionSheet('记录消费 · 选择类型', [
      { label: '🛍️ 大额支出', onClick: function () { consumptionForm(null); } },
      { label: '💳 还款资金', onClick: function () { repayForm(null); } },
      { label: '📨 垫付资金', onClick: function () { advanceForm(null); } },
      { label: '📈 投资支出', onClick: function () { investExpenseForm(null); } },
      { label: '🧾 其他支出', onClick: function () { consumptionForm(null, true); } }
    ]);
  }

  /* ---------- 大额 / 其他支出表单（含支付方式与预算关联） ---------- */
  function consumptionForm(existing, asOther) {
    var r = ensureFlowRec(state.flowYear, state.flowMonth);
    var isEdit = !!existing;
    var amount = input({ type: 'number', step: '0.01', value: existing ? existing.amount : '', placeholder: '金额' });
    var cat = input({ value: existing ? existing.category : '', placeholder: '类别，如：教育/医疗/购物' });
    var pay = select({ value: existing ? existing.payment : 'wechat' }, [
      { value: 'wechat', label: '微信零钱' },
      { value: 'yuebao', label: '余额宝' },
      { value: 'bank', label: '银行' },
      { value: 'other', label: '其他' },
      { value: '存钱罐', label: '存钱罐' }
    ]);
    var depositSel = select({ value: existing && existing.depositId ? existing.depositId : '' },
      [{ value: '', label: '选择存钱罐账户' }].concat(D.fixedDeposits.map(function (d) { return { value: d.id, label: d.name + '（' + money(d.amount) + '）' }; })));
    var depositWrap = h('div', {});
    function syncDeposit() { depositWrap.innerHTML = ''; depositWrap.appendChild(field('存钱罐账户', depositSel)); depositWrap.appendChild(h('div', { class: 'hint' }, '选择存钱罐将自动扣减该账户金额')); }
    pay.onchange = function () { if (pay.value === '存钱罐') syncDeposit(); else depositWrap.innerHTML = ''; };
    if (existing && existing.payment === '存钱罐') syncDeposit();

    var children = [field('金额', amount)];
    if (!asOther) children.push(field('类别', cat));
    children.push(field('支付渠道', pay));
    children.push(depositWrap);

    var link = select({ value: existing && existing.budgetLink ? '是' : '否' }, [{ value: '否', label: '否' }, { value: '是', label: '是' }]);
    var budgetSel = select({ value: existing && existing.budgetId ? existing.budgetId : '' },
      [{ value: '', label: '选择预算项目' }].concat(D.budgets.map(function (b) { return { value: b.id, label: b.name }; })));
    var linkWrap = h('div', {});
    function syncLink() { linkWrap.innerHTML = ''; budgetSel.disabled = link.value !== '是'; linkWrap.appendChild(field('关联预算项目', h('div', { class: 'row2' }, [link, budgetSel]))); }
    link.onchange = syncLink; syncLink();
    children.push(field('日期', input({ type: 'date', value: existing ? existing.date : P.todayYmd() })));
    children.push(field('备注', input({ value: existing ? existing.note : '', placeholder: '备注' })));
    children.push(linkWrap);
    var dateEl = children.filter(function (c) { return c && c.querySelector && c.querySelector('input[type=date]'); })[0];

    openModal(existing ? '编辑支出' : '记录消费', h('div', {}, children), [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!amount.value) return toast('请输入金额');
        var dateVal = existing ? existing.date : P.todayYmd();
        var noteVal = existing ? existing.note : '';
        var catVal = existing ? existing.category : (asOther ? '其他' : '');
        var formDate = dateEl ? dateEl.querySelector('input[type=date]').value : dateVal;
        var formNote = (function () { var n = children.filter(function (c) { return c && c.querySelector && c.querySelector('input[placeholder="备注"]'); }); return n.length ? n[0].querySelector('input').value : noteVal; })();
        var oldRef = isEdit ? existing : null;
        if (oldRef) revertDepositDeduction(oldRef);
        var obj = {
          id: existing ? existing.id : P.uid('e'),
          date: formDate || dateVal,
          amount: Number(amount.value) || 0,
          category: asOther ? '其他' : (cat.value.trim() || '其他'),
          payment: pay.value,
          depositId: pay.value === '存钱罐' ? depositSel.value || null : null,
          note: formNote || noteVal,
          budgetLink: link.value === '是',
          budgetId: (link.value === '是') ? budgetSel.value || null : null
        };
        if (isEdit) Object.assign(existing, obj); else r.largeExpenses.push(obj);
        // 预算扣减：关联预算时，把这笔大额支出自动记入该预算的“付款计划”子表
        if (!asOther && isEdit && oldRef && oldRef.budgetLink && oldRef.budgetId && oldRef.budgetId !== obj.budgetId) {
          var ob = D.budgets.filter(function (x) { return x.id === oldRef.budgetId; })[0];
          if (ob && ob.payments) ob.payments = ob.payments.filter(function (p) { return p._src !== oldRef.id; });
        }
        var linkedBudget = null;
        if (!asOther && obj.budgetLink && obj.budgetId) {
          var b = D.budgets.filter(function (x) { return x.id === obj.budgetId; })[0];
          if (b) {
            linkedBudget = b;
            b.payments = b.payments || [];
            b.payments = b.payments.filter(function (p) { return p._src !== obj.id; });
            var m = ({ 'wechat': '微信', 'yuebao': '转账', 'bank': '银行', 'other': '现金', '存钱罐': '转账' })[obj.payment] || '转账';
            b.payments.push({ id: P.uid('p'), date: obj.date, amount: obj.amount, method: m, _src: obj.id });
          }
        }
        applyDepositDeduction(obj);
        save();
        if (linkedBudget) {
          var bname = linkedBudget.name;
          toast('已记录'); closeModal(); showPage('flow');
          // 明确提示：这笔钱已自动归入预算的付款计划
          confirmDialog('已记入预算付款', '这笔 ¥' + money(obj.amount) + '（' + obj.date + '）已自动加入「' + bname + '」的付款计划。点“查看”可去核对该预算的付款明细。', function () { showPage('budget'); budgetDetail(linkedBudget.id); });
        } else {
          toast(existing ? '已更新' : '已记录'); closeModal(); showPage('flow');
        }
      } }, '保存')
    ]);
  }

  /* ---------- 投资支出：按月段记录（不绑定具体日期），可跨多月均摊 ---------- */
  function findInvestExp(id) {
    var found = null;
    (D.currentFunds || []).forEach(function (rec) {
      (rec.investExps || []).forEach(function (e) {
        if (e.id === id) found = { rec: rec, entry: e };
      });
    });
    return found;
  }
  function ymMonths(s, e) {
    var a = String(s).split('-'), b = String(e).split('-');
    return Math.max(1, (Number(b[0]) * 12 + Number(b[1])) - (Number(a[0]) * 12 + Number(a[1])) + 1);
  }
  function parseYM(s) { var p = String(s).split('-'); return { y: Number(p[0]), m: Number(p[1]) }; }
  function ymSelect(defYear, defMonth) {
    var cy = new Date().getFullYear();
    var yOpts = []; for (var y = cy - 2; y <= cy + 2; y++) yOpts.push({ value: String(y), label: String(y) + '年' });
    var mOpts = []; for (var i = 1; i <= 12; i++) mOpts.push({ value: P.pad2(i), label: i + '月' });
    var ys = select({ value: String(defYear) }, yOpts);
    var ms = select({ value: P.pad2(defMonth) }, mOpts);
    return { ys: ys, ms: ms, get: function () { return ys.value + '-' + ms.value; } };
  }
  function investExpenseForm(existing) {
    var isEdit = !!existing;
    var r = ensureFlowRec(state.flowYear, state.flowMonth);
    var amount = input({ type: 'number', step: '0.01', value: existing ? existing.amount : '', placeholder: '该时间段内投资支出合计' });
    var note = input({ value: existing ? existing.note : '', placeholder: '用途，如：基金定投 / 股票建仓' });
    var chSel = select({ value: existing ? (existing.channel || 'wechat') : 'wechat' }, [
      { value: 'wechat', label: '微信零钱' },
      { value: 'yuebao', label: '余额宝' },
      { value: 'bank', label: '银行' },
      { value: 'other', label: '其他' },
      { value: '存钱罐', label: '存钱罐' }
    ]);
    var depSel = select({ value: existing && existing.depositId ? existing.depositId : '' },
      [{ value: '', label: '选择存钱罐账户' }].concat(D.fixedDeposits.map(function (d) { return { value: d.id, label: d.name + '（' + money(d.amount) + '）' }; })));
    var depWrap = h('div', {});
    function syncDep() {
      depWrap.innerHTML = '';
      if (chSel.value === '存钱罐') {
        depWrap.appendChild(field('存钱罐账户', depSel));
        depWrap.appendChild(h('div', { class: 'hint' }, '记录时自动从该账户扣减这笔金额'));
      }
    }
    chSel.onchange = syncDep; if (existing && existing.channel === '存钱罐') syncDep();
    var def = existing ? parseYM(existing.startYM) : { y: state.flowYear, m: state.flowMonth };
    var defEnd = existing ? parseYM(existing.endYM || existing.startYM) : { y: state.flowYear, m: state.flowMonth };
    var start = ymSelect(def.y, def.m);
    var end = ymSelect(defEnd.y, defEnd.m);
    var perMonthHint = h('div', { class: 'hint' }, '');
    function updHint() {
      var s = start.get(), e = end.get(); if (s > e) e = s;
      var months = ymMonths(s, e);
      var amt = Number(amount.value) || 0;
      perMonthHint.textContent = months > 1
        ? ('跨 ' + months + ' 个月，每月约计入 ' + money(amt / months) + '（本月支出将按月均摊）')
        : '单月记录，全部计入所选月份';
    }
    amount.oninput = updHint; start.ys.onchange = updHint; start.ms.onchange = updHint; end.ys.onchange = updHint; end.ms.onchange = updHint;
    var children = [
      field('金额', amount),
      field('用途 / 备注', note),
      field('支付渠道', chSel),
      depWrap,
      field('起始年月', h('div', { class: 'row2' }, [start.ys, start.ms])),
      field('结束年月', h('div', { class: 'row2' }, [end.ys, end.ms])),
      perMonthHint
    ];
    updHint();
    openModal(existing ? '编辑投资支出' : '记录投资支出', h('div', {}, children), [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!amount.value) return toast('请输入金额');
        if (chSel.value === '存钱罐' && !depSel.value) return toast('请选择存钱罐账户');
        var channel = chSel.value;
        var depositId = channel === '存钱罐' ? (depSel.value || null) : null;
        var s = start.get(), e = end.get(); if (s > e) e = s;
        var sy = Number(s.split('-')[0]), sm = Number(s.split('-')[1]);
        var startRec = ensureFlowRec(sy, sm);
        var obj = {
          id: existing ? existing.id : P.uid('ie'),
          amount: Number(amount.value) || 0,
          startYM: s,
          endYM: e,
          note: note.value.trim(),
          channel: channel,
          depositId: depositId
        };
        if (isEdit) {
          var old = findInvestExp(obj.id);
          if (old) {
            // 回滚旧的存钱罐扣减
            if (old.entry.channel === '存钱罐' && old.entry.depositId) {
              var dd = depositById(old.entry.depositId);
              if (dd) dd.amount = (Number(dd.amount) || 0) + (Number(old.entry.amount) || 0);
            }
            old.rec.investExps = old.rec.investExps.filter(function (x) { return x.id !== obj.id; });
          }
        }
        // 存钱罐渠道：扣减对应账户
        if (channel === '存钱罐' && depositId) {
          var d = depositById(depositId);
          if (d) d.amount = Math.max(0, (Number(d.amount) || 0) - obj.amount);
        }
        startRec.investExps.push(obj);
        save(); toast(existing ? '已更新' : '已记录'); closeModal(); showPage('flow');
      } }, '保存')
    ]);
  }

  function editFlowMonthForm() {
    var r = ensureFlowRec(state.flowYear, state.flowMonth);
    if (!r.accounts || !r.accounts.length) r.accounts = P.defaultAccounts ? P.defaultAccounts() : [];
    var rows = r.accounts.map(function (a) {
      var amt = input({ type: 'number', step: '0.01', value: a.amount });
      a._amt = amt;
      var children = [field(a.label, amt)];
      if (a.kind === 'bank' || a.kind === 'other') {
        var noteInput = input({ value: a.note || '', placeholder: a.kind === 'bank' ? '如：招商银行' : '备注说明' });
        a._note = noteInput;
        children.push(field('备注', noteInput));
      } else {
        a._note = null;
      }
      return h('div', { class: 'acc-edit-row' }, children);
    });
    // 实时合计 = 期初余额
    function recalc() {
      var s = 0; r.accounts.forEach(function (a) { s += Number(a._amt.value) || 0; });
      var el = q('#acc-sum'); if (el) el.textContent = money(s);
      return s;
    }
    rows.forEach(function (row, i) { r.accounts[i]._amt.oninput = recalc; });
    var closing = C.closingOf(D, r);
    var note = input({ value: r.note || '', placeholder: '备注' });
    var totalRow = h('div', { class: 'acc-total' }, [h('span', {}, '期初余额合计'), h('span', { id: 'acc-sum' }, money(accountTotal(r)))]);
    openModal(state.flowYear + '年' + state.flowMonth + '月 期初余额', h('div', {}, [
      h('div', { class: 'hint' }, '分别填写各账户月初余额，合计自动作为本月「期初余额」。银行请填备注说明哪家银行，其他项填备注。')
    ].concat(rows).concat([
      totalRow,
      h('div', { class: 'hint' }, '期末余额 = 次月填的期初，无需在此填写' + (closing != null ? '（当前次月期初：' + money(closing) + '）' : '')),
      field('备注', note)
    ])), [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        var sum = 0;
        r.accounts.forEach(function (a) {
          a.amount = Number(a._amt.value) || 0; sum += a.amount;
          if (a._note) a.note = a._note.value.trim();
        });
        r.openingBalance = sum;
        r.note = note.value.trim();
        recomputeClosings();
        save(); toast('已保存'); closeModal(); showPage('flow');
      } }, '保存')
    ]);
  }

  // 余额明细预览：先展示本月期初余额的全部账户构成，再给一个「编辑」按钮进入录入表单
  function flowBalancePreview() {
    var r = getFlowRec(state.flowYear, state.flowMonth) || ensureFlowRec(state.flowYear, state.flowMonth);
    if (!r.accounts || !r.accounts.length) r.accounts = P.defaultAccounts ? P.defaultAccounts() : [];
    var accs = r.accounts || [];
    var total = accountTotal(r);
    var body = h('div', {});
    body.appendChild(h('div', { class: 'hint', style: { marginBottom: 12 } }, '本月「期初余额」由以下账户余额构成，合计 = 期初余额。点「✎ 编辑」可修改每一项金额与备注。'));
    body.appendChild(h('div', { class: 'acc-list' }, accs.map(function (a) {
      return h('div', { class: 'acc-row' }, [
        h('div', { class: 'acc-left' }, [
          h('span', { class: 'acc-ico' }, accIcon(a.kind)),
          h('div', { class: 'acc-meta' }, [
            h('div', { class: 'acc-name' }, a.label),
            ((a.kind === 'bank' || a.kind === 'other') && a.note) ? h('div', { class: 'acc-note' }, a.note) : null
          ])
        ]),
        h('div', { class: 'acc-amt' }, money(a.amount))
      ]);
    })));
    body.appendChild(h('div', { class: 'acc-total' }, [h('span', {}, '期初余额合计'), h('span', {}, money(total))]));
    if (r.note) body.appendChild(h('div', { class: 'acc-note', style: { marginTop: 10 } }, '备注：' + r.note));
    openModal(state.flowYear + '年' + state.flowMonth + '月 余额明细', body, [
      h('button', { class: 'btn', onclick: closeModal }, '关闭'),
      h('button', { class: 'btn btn-primary', onclick: function () { closeModal(); editFlowMonthForm(); } }, '✎ 编辑')
    ]);
  }

  // 编辑期初余额构成（微信零钱 / 余额宝 / 银行 / 其他）
  // 期初余额历史：列出各月录入的期初余额总额与账户构成
  function openingHistory() {
    var recs = (D.currentFunds || []).slice().sort(function (a, b) {
      return (a.year - b.year) || (a.month - b.month);
    });
    var body = h('div', {});
    if (!recs.length) {
      body.appendChild(h('div', { class: 'muted' }, '还没有任何月份的期初余额记录'));
    } else {
      body.appendChild(h('div', { class: 'hint', style: { marginBottom: 10 } }, '各月「期初余额」总额及其账户构成（微信零钱 / 余额宝 / 银行 / 其他）'));
      recs.forEach(function (r) {
        var accs = r.accounts || [];
        var total = accountTotal(r);
        var comp = h('div', { class: 'acc-list' }, accs.map(function (a) {
          return h('div', { class: 'acc-row' }, [
            h('div', { class: 'acc-left' }, [
              h('span', { class: 'acc-ico' }, accIcon(a.kind)),
              h('div', { class: 'acc-meta' }, [
                h('div', { class: 'acc-name' }, a.label),
                ((a.kind === 'bank' || a.kind === 'other') && a.note) ? h('div', { class: 'acc-note' }, a.note) : null
              ])
            ]),
            h('div', { class: 'acc-amt' }, money(a.amount))
          ]);
        }));
        body.appendChild(h('div', { class: 'card acc-hist' }, [
          h('div', { class: 'acc-hist-head' }, [
            h('span', { class: 'acc-hist-month' }, r.year + '年' + r.month + '月'),
            h('span', { class: 'acc-hist-total' }, money(total))
          ]),
          comp
        ]));
      });
    }
    openModal('期初余额历史', body, [
      h('button', { class: 'btn btn-primary', onclick: closeModal }, '关闭')
    ]);
  }

  // 撤销本月账本：只能撤销“最新月”（无次月），避免破坏 期末=次月期初 的链路
  function undoFlowMonth() {
    var y = state.flowYear, m = state.flowMonth;
    var rec = getFlowRec(y, m);
    if (!rec) { toast('本月还没有账本'); return; }
    var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    var nx = D.currentFunds.filter(function (r) { return r.year === ny && r.month === nm; })[0];
    if (nx) { toast('请先撤销更近的月份（' + nx.year + '年' + nx.month + '月）'); return; }
    confirmDialog(y + '年' + m + '月 撤销', '确定撤销本月的账本吗？将删除该月全部收入 / 支出 / 还款 / 垫付记录，且无法恢复。', function () {
      D.currentFunds = D.currentFunds.filter(function (r) { return !(r.year === y && r.month === m); });
      recomputeClosings(); save();
      // 回到上一（最新）月
      if (D.currentFunds.length) {
        var sorted = D.currentFunds.slice().sort(function (a, b) { return (a.year - b.year) || (a.month - b.month); });
        var last = sorted[sorted.length - 1];
        state.flowYear = last.year; state.flowMonth = last.month;
      }
      toast('已撤销'); renderFlow();
    }, '撤销');
  }

  /* =========================================================
   * 年度预算
   * ========================================================= */
  function budgetStatusChip(d) {
    if (d.remainToPay < 0) return h('span', { class: 'chip danger' }, '超支');
    if (d.status === '未开始') return h('span', { class: 'chip gray' }, '未开始');
    if (d.status === '已结束') return h('span', { class: 'chip gray' }, '已结束');
    return h('span', { class: 'chip teal' }, '进行中');
  }
  /* 顶部总览小卡 */
  function bovTile(label, value, kind) {
    return h('div', { class: 'bov-tile ' + (kind || '') }, [
      h('div', { class: 'bov-tile-label' }, label),
      h('div', { class: 'bov-tile-value' }, value)
    ]);
  }
  /* 预算卡片统计格 */
  function bStat(label, value, over) {
    return h('div', { class: 'budget-stat' }, [
      h('div', { class: 'budget-stat-label' }, label),
      h('div', { class: 'budget-stat-value' + (over ? ' over' : '') }, money(value))
    ]);
  }
  /* 详情统计格 */
  function bdStat(label, value, over) {
    var v = (typeof value === 'number') ? money(value) : (value || '');
    return h('div', { class: 'budget-detail-stat' }, [
      h('div', { class: 'bds-label' }, label),
      h('div', { class: 'bds-value' + (over ? ' over' : '') }, v)
    ]);
  }
  function catName(id) {
    var c = (D.budgetCategories || []).filter(function (x) { return x.id === id; })[0];
    return c ? c.name : '未分类';
  }
  function renderBudget() {
    var sec = q('#page-budget'); sec.innerHTML = '';
    var y = D.viewYear;
    var ov = C.budgetYearOverview(D, y);

    // 顶部总览：区分“付款现金流”与“摊销成本”
    sec.appendChild(h('div', { class: 'budget-overview-card' }, [
      h('div', { class: 'bov-head' }, [
        h('div', { class: 'bov-title' }, [h('span', {}, '📊'), '年度预算']),
        h('div', { class: 'bov-remain' }, '全部合同总额 ' + money(ov.sumTotal))
      ]),
      h('div', { class: 'bov-tiles' }, [
        bovTile('本年实际已付现金', money(ov.paidCashTotal), 'cash'),
        bovTile('年度摊销成本', money(ov.allocTotal), 'cost'),
        bovTile('当前月均预算支出', money(ov.monthlyAvgTotal), 'avg')
      ]),
      h('div', { class: 'bov-feet bov-feet-2' }, [
        h('span', {}, ['本年剩余待付款 ', h('span', { class: 'big' }, money(ov.remainTotal))]),
        h('span', {}, ['本年已付占比 ', h('span', { class: 'big' }, (ov.sumTotal ? Math.round(ov.paidCashTotal / ov.sumTotal * 100) : 0) + '%')])
      ])
    ]));

    sec.appendChild(h('div', { class: 'seg', style: { margin: '6px 0 12px' } }, [
      h('button', { class: 'seg-btn', 'data-action': 'year-prev' }, '‹'),
      h('div', { class: 'seg-label' }, y + ' 年预算'),
      h('button', { class: 'seg-btn', 'data-action': 'year-next' }, '›'),
      h('button', { class: 'btn btn-sm', 'data-action': 'manage-categories' }, '分类'),
      h('button', { class: 'btn btn-sm', 'data-action': 'add-budget' }, '＋')
    ]));
    if (!D.budgets.length) {
      sec.appendChild(h('div', { class: 'empty' }, [h('span', { class: 'em-ico' }, '🎯'), '还没有预算项目，点上方“＋”添加吧～']));
      return;
    }
    // 按分类分组（可折叠）
    var groups = C.budgetCategoryList(D, y);
    groups.forEach(function (g) {
      if (!g.summary.count && g.id !== null) return; // 空分类（非未分类）不显示
      var s = g.summary;
      var catKey = g.id || 'null';
      var expanded = !!state.budgetExpanded[catKey];
      var groupEl = h('div', { class: 'budget-cat-group' });
      groupEl.appendChild(h('div', {
        class: 'budget-cat-head tappable',
        'data-action': 'toggle-budget-cat',
        'data-cat-id': catKey
      }, [
        h('div', { class: 'budget-cat-name' }, (expanded ? '▼ ' : '▶ ') + (g.id ? '🏷 ' : '📦 ') + g.name),
        h('div', { class: 'budget-cat-sum' }, [
          h('span', { class: 'bcs-item' }, ['合同总额 ', h('b', {}, money(s.sumTotal))]),
          h('span', { class: 'bcs-item' }, ['本年已付 ', h('b', {}, money(s.paidCash))]),
          h('span', { class: 'bcs-item' }, ['月均 ', h('b', {}, money(s.monthlyAvg))])
        ])
      ]));
      var items = h('div', { class: 'budget-cat-items' + (expanded ? '' : ' collapsed') });
      D.budgets.forEach(function (b) {
        if ((b.categoryId || null) !== g.id) return;
        var d = C.budgetYearData(b, y);
        var statusChip = budgetStatusChip(d);
        items.appendChild(h('div', {
          class: 'card budget-card tappable',
          'data-action': 'view-budget-detail',
          'data-id': b.id
        }, [
          h('div', { class: 'budget-card-head' }, [
            h('div', { class: 'budget-card-name' }, b.name),
            statusChip,
            h('span', { class: 'budget-card-arrow' }, '›')
          ]),
          h('div', { class: 'budget-card-stats' }, [
            bStat('本年实际付款', d.paidThisYear),
            bStat('本年应摊销额', d.alloc),
            bStat('月度均摊', d.monthlyAvg),
            bStat(d.remainToPay < 0 ? '超支' : '剩余待付', d.remainToPay < 0 ? -d.remainToPay : d.remainToPay, d.remainToPay < 0)
          ])
        ]));
      });
      groupEl.appendChild(items);
      sec.appendChild(groupEl);
    });
  }

  function crossYearNote(b, y) {
    var list = C.budgetCrossYearPayments(b, y);
    if (!list.length) return null;
    return h('div', { class: 'budget-cross-note' }, [
      h('div', { class: 'section-label', style: { margin: '14px 0 6px' } }, ['🔗 跨年付款（' + list.length + '笔）']),
      h('div', { class: 'li-sub' }, '以下款项已于其他年份支付，不计入 ' + y + ' 年已花费，但已发生：'),
      list.map(function (p) {
        return h('div', { class: 'detail-payment-row' }, [
          h('span', { class: 'dp-date' }, p.date),
          h('span', { class: 'dp-amount' }, money(p.amount)),
          h('span', { class: 'dp-tag' }, '已于 ' + p.payYear + ' 年支付')
        ]);
      })
    ]);
  }
  /* 旧“分期付款计划”模型已废弃，付款改为统一的“付款计划子表”（见 budgetForm / budgetPaymentForm） */
  function budgetDetail(id) {
    var b = D.budgets.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    var y = D.viewYear;
    var d = C.budgetYearData(b, y);
    var statusChip = budgetStatusChip(d);

    // 付款计划子表
    var payList = h('div', { class: 'detail-payments' });
    var payments = b.payments || [];
    if (!payments.length) {
      payList.appendChild(h('div', { class: 'empty-sm' }, '暂无付款记录，点下方“＋ 记一笔付款”添加'));
    } else {
      payments.forEach(function (p) {
        payList.appendChild(h('div', { class: 'detail-payment-row tappable', 'data-action': 'edit-budget-payment', 'data-bid': b.id, 'data-pid': p.id }, [
          h('span', { class: 'dp-date' }, p.date),
          h('span', { class: 'dp-method' }, (p.method || '现金')),
          h('span', { class: 'dp-amount' }, money(p.amount)),
          h('span', { class: 'dp-edit' }, '✎')
        ]));
      });
    }

    var body = h('div', {}, [
      h('div', { class: 'budget-detail-head' }, [
        h('div', { class: 'budget-detail-name' }, b.name),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, [
          statusChip,
          h('button', { class: 'btn btn-sm', onclick: function () { closeModal(); budgetForm(id); } }, '✎ 编辑')
        ])
      ]),
      h('div', { class: 'budget-detail-period' }, '摊销周期 ' + (b.amortStart || '-') + ' ~ ' + (b.amortEnd || '-') + ' · 合同总额 ' + money(b.total) + (b.categoryId ? ' · ' + catName(b.categoryId) : '')),
      h('div', { class: 'budget-detail-stats' }, [
        bdStat('合同总金额', b.total),
        bdStat('摊销总月数', d.amortMonths + ' 个月'),
        bdStat('月度均摊成本', d.monthlyAvg),
        bdStat('本年实际付款', d.paidThisYear),
        bdStat('本年应摊销额', d.alloc),
        bdStat(d.remainToPay < 0 ? '超支' : '剩余待付款', d.remainToPay < 0 ? -d.remainToPay : d.remainToPay, d.remainToPay < 0)
      ]),
      // 跨年付款提示：本年之外已付的款，注明“已于 YYYY 年支付”
      crossYearNote(b, y),
      // 付款计划子表
      h('div', { class: 'section-label', style: { margin: '18px 0 8px' } }, ['💸 付款计划（' + payments.length + ' 笔）']),
      payList,
      h('button', { class: 'btn btn-sm btn-block', style: { marginTop: 8 }, 'data-action': 'add-budget-payment', 'data-bid': b.id }, '＋ 记一笔付款'),
      b.note ? h('div', { class: 'budget-detail-note' }, b.note) : null
    ]);
    openModal('预算详情', body, [
      h('button', { class: 'btn', onclick: closeModal }, '关闭'),
      h('button', { class: 'btn btn-ghost', onclick: function () { closeModal(); copyBudgetToNewYear(id); } }, '📋 复制到新年度'),
      h('button', { class: 'btn btn-danger', onclick: function () { closeModal(); delBudget(id); } }, '删除'),
      h('button', { class: 'btn btn-primary', onclick: function () { closeModal(); budgetForm(id); } }, '编辑')
    ]);
  }

  function budgetForm(id) {
    var b = id ? D.budgets.filter(function (x) { return x.id === id; })[0] : null;
    var name = input({ value: b ? b.name : '', placeholder: '如：哥哥英语课' });
    var total = input({ type: 'number', step: '0.01', value: b ? b.total : '' });
    var amortStart = input({ type: 'date', value: b ? b.amortStart : P.todayYmd() });
    var amortEnd = input({ type: 'date', value: b ? b.amortEnd : '' });
    var note = input({ value: b ? b.note : '', placeholder: '可选' });
    var catSel = select({ value: b ? (b.categoryId || '') : ((D.budgetCategories || [])[0] || {}).id || '' },
      [{ value: '', label: '未分类' }].concat((D.budgetCategories || []).map(function (c) { return { value: c.id, label: c.name }; })));
    var defaultMethodSel = select({ value: b ? (b.defaultMethod || '转账') : '转账' }, [
      { value: '现金', label: '现金' },
      { value: '转账', label: '转账' },
      { value: '微信', label: '微信' },
      { value: '支付宝', label: '支付宝' },
      { value: '银行', label: '银行' }
    ]);
    // 实时计算摊销月数 / 月均摊销成本
    var calcHint = h('div', { class: 'li-sub' }, '');
    function updCalc() {
      var m = C.amortTotalMonths({ amortStart: amortStart.value, amortEnd: amortEnd.value, total: Number(total.value) || 0 });
      var avg = m ? (Number(total.value) || 0) / m : 0;
      calcHint.textContent = m ? ('摊销总月数：' + m + ' 个月 · 月均摊销成本：' + money(avg)) : '请填写摊销起止日期';
    }
    amortStart.onchange = updCalc; amortEnd.onchange = updCalc; total.onchange = updCalc;

    // 付款计划子表
    var paymentsBox = h('div', {});
    var payments = b ? (b.payments || []).map(function (p) { return { id: p.id, date: p.date, amount: p.amount, method: p.method || '现金' }; }) : [];
    function renderPayments() {
      paymentsBox.innerHTML = '';
      paymentsBox.appendChild(h('div', { class: 'li-sub' }, '已花费累计按实际付款日期录入（关联大额支出会自动加入）'));
      payments.forEach(function (p, idx) {
        var pd = input({ type: 'date', value: p.date });
        var pa = input({ type: 'number', step: '0.01', value: p.amount });
        var pm = select({ value: p.method }, [
          { value: '现金', label: '现金' }, { value: '转账', label: '转账' },
          { value: '微信', label: '微信' }, { value: '支付宝', label: '支付宝' }, { value: '银行', label: '银行' }
        ]);
        pd.onchange = function () { p.date = pd.value; };
        pa.onchange = function () { p.amount = Number(pa.value) || 0; };
        pm.onchange = function () { p.method = pm.value; };
        paymentsBox.appendChild(h('div', { class: 'pay-edit-row' }, [
          field('付款日期', pd),
          field('金额', pa),
          field('方式', pm),
          h('button', { class: 'btn btn-sm btn-danger', onclick: function () { payments.splice(idx, 1); renderPayments(); } }, '✕')
        ]));
      });
      paymentsBox.appendChild(h('button', { class: 'btn btn-sm', onclick: function () { payments.push({ id: P.uid('p'), date: P.todayYmd(), amount: 0, method: defaultMethodSel.value || '现金' }); renderPayments(); } }, '＋ 添加一笔付款'));
    }
    renderPayments();
    updCalc();

    var body = h('div', {}, [
      field('项目名称', name),
      field('所属分类', catSel),
      field('合同总金额', total),
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, [field('摊销开始日期', amortStart), field('摊销结束日期', amortEnd)]),
      calcHint,
      field('默认付款方式', defaultMethodSel, '新年度复制时沿用'),
      field('备注', note),
      h('div', { class: 'section-label', style: { margin: '14px 0 6px' } }, ['💸 付款计划（子表）']),
      paymentsBox
    ]);
    openModal(b ? '编辑预算' : '新增预算', body, [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!name.value.trim()) return toast('请填写项目名称');
        var obj = {
          name: name.value.trim(), categoryId: catSel.value || null, total: Number(total.value) || 0,
          amortStart: amortStart.value || P.todayYmd(), amortEnd: amortEnd.value || '',
          defaultMethod: defaultMethodSel.value || '转账', note: note.value.trim(),
          payments: payments.map(function (p) { return { id: p.id || P.uid('p'), date: p.date, amount: Number(p.amount) || 0, method: p.method || '现金' }; })
        };
        if (b) { Object.assign(b, obj); } else { obj.id = P.uid('b'); D.budgets.push(obj); }
        save(); toast(b ? '已更新' : '已添加'); closeModal(); showPage('budget');
      } }, '保存')
    ]);
  }

  /* 记一笔 / 编辑一笔付款（付款计划子表） */
  function budgetPaymentForm(bId, pId) {
    var b = D.budgets.filter(function (x) { return x.id === bId; })[0]; if (!b) return;
    b.payments = b.payments || [];
    var pay = pId ? b.payments.filter(function (x) { return x.id === pId; })[0] : null;
    var date = input({ type: 'date', value: pay ? pay.date : P.todayYmd() });
    var amount = input({ type: 'number', step: '0.01', value: pay ? pay.amount : '', placeholder: '付款金额' });
    var method = select({ value: pay ? (pay.method || b.defaultMethod || '现金') : (b.defaultMethod || '现金') }, [
      { value: '现金', label: '现金' }, { value: '转账', label: '转账' },
      { value: '微信', label: '微信' }, { value: '支付宝', label: '支付宝' }, { value: '银行', label: '银行' }
    ]);
    var actions = [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!amount.value) return toast('请输入金额');
        var rec = { id: pay ? pay.id : P.uid('p'), date: date.value || P.todayYmd(), amount: Number(amount.value) || 0, method: method.value };
        if (pay) { var i = b.payments.indexOf(pay); b.payments[i] = rec; } else { b.payments.push(rec); }
        save(); toast(pay ? '已更新付款' : '已记一笔付款'); closeModal(); budgetDetail(bId);
      } }, '保存')
    ];
    if (pay) actions.push(h('button', { class: 'btn btn-danger', onclick: function () {
      confirmDialog('删除付款记录', '确定删除该笔付款吗？', function () { b.payments = b.payments.filter(function (x) { return x.id !== pId; }); save(); toast('已删除'); closeModal(); budgetDetail(bId); });
    } }, '删除'));
    openModal(pay ? '编辑付款' : '记一笔付款 · ' + b.name, h('div', {}, [
      h('div', { class: 'li-sub', style: { marginBottom: 10 } }, '合同总额 ' + money(b.total) + ' · 摊销 ' + (b.amortStart || '-') + ' ~ ' + (b.amortEnd || '-')),
      field('付款日期', date),
      field('付款金额', amount),
      field('付款方式', method)
    ]), actions);
  }

  /* 复制到新年度：摊销周期顺延一年，付款计划清空，动态数据归零 */
  function copyBudgetToNewYear(id) {
    var b = D.budgets.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    var defYear = D.viewYear + 1;
    var yearOpts = []; for (var yy = defYear - 2; yy <= defYear + 3; yy++) yearOpts.push({ value: String(yy), label: yy + ' 年' });
    var yearSel = select({ value: String(defYear) }, yearOpts);
    var suffix = input({ value: '', placeholder: '可选，如：2027' });
    var body = h('div', {}, [
      h('div', { class: 'li-sub', style: { marginBottom: 10 } }, '将复制「' + b.name + '」到新年度：合同总额、摊销月份长度不变，付款计划清空（新年度的钱还没付），动态数据归零。'),
      field('目标年份', yearSel),
      field('名称后缀（可选）', suffix, '留空则沿用原名')
    ]);
    openModal('📋 复制到新年度', body, [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        var ty = Number(yearSel.value) || defYear;
        var s = P.parseYmd(b.amortStart), e = P.parseYmd(b.amortEnd);
        var ns = s ? P.ymd(new Date(ty, s.getMonth(), s.getDate())) : b.amortStart;
        var ne = e ? P.ymd(new Date(ty, e.getMonth(), e.getDate())) : b.amortEnd;
        var clone = {
          id: P.uid('b'),
          name: b.name + (suffix.value ? (' ' + suffix.value.trim()) : ''),
          categoryId: b.categoryId || null,
          total: Number(b.total) || 0,
          amortStart: ns, amortEnd: ne,
          defaultMethod: b.defaultMethod || '转账',
          note: b.note || '',
          payments: []   // 新年度付款清空
        };
        D.budgets.push(clone);
        save(); toast('已复制到 ' + ty + ' 年，去微调吧～');
        closeModal();
        budgetForm(clone.id);   // 跳转新项目编辑页
      } }, '复制并编辑')
    ]);
  }
  function delBudget(id) {
    confirmDialog('删除预算', '确定删除该预算项目吗？', function () {
      D.budgets = D.budgets.filter(function (x) { return x.id !== id; }); save(); toast('已删除'); showPage('budget');
    });
  }

  /* 预算分类管理：新增 / 改名 / 删除（分类名可自己输入、自己改名） */
  function categoryManager() {
    var box = h('div', {});
    var focusId = null;
    function render() {
      box.innerHTML = '';
      (D.budgetCategories || []).forEach(function (c) {
        var nm = input({ value: c.name, placeholder: '输入分类名（如：哥哥）' });
        nm.onchange = function () {
          c.name = nm.value.trim() || '未命名';
          save(); renderBudget();
        };
        nm.onkeydown = function (e) { if (e.key === 'Enter') nm.blur(); };
        if (focusId === c.id) { setTimeout(function () { try { nm.focus(); nm.select(); } catch (e) {} }, 30); focusId = null; }
        box.appendChild(h('div', { class: 'row2', style: { alignItems: 'end', marginBottom: 8 } }, [
          field('分类名称', nm),
          h('div', { class: 'field' }, [h('label', {}, ''), h('button', { class: 'btn btn-sm btn-danger', onclick: function () {
            if ((D.budgetCategories || []).length <= 1) return toast('至少保留一个分类');
            confirmDialog('删除分类', '删除「' + c.name + '」后，其下预算将归入剩余第一个分类。确定？', function () {
              var fallback = (D.budgetCategories || []).filter(function (x) { return x.id !== c.id; })[0];
              D.budgets.forEach(function (b) { if (b.categoryId === c.id) b.categoryId = fallback ? fallback.id : null; });
              D.budgetCategories = D.budgetCategories.filter(function (x) { return x.id !== c.id; });
              save(); render(); renderBudget();
            });
          } }, '删除')])
        ]));
      });
      box.appendChild(h('button', { class: 'btn btn-sm', onclick: function () {
        var nc = { id: P.uid('cat'), name: '' };
        (D.budgetCategories = D.budgetCategories || []).push(nc);
        focusId = nc.id; save(); render();
      } }, '＋ 新增分类'));
    }
    render();
    openModal('预算分类管理', box, [h('button', { class: 'btn btn-primary', onclick: function () { closeModal(); renderBudget(); } }, '完成')]);
  }
  /* 信用负债管理：新增 / 改名 / 改剩余欠款 / 删除（删除时解除关联还款） */
  function manageCredits() {
    var box = h('div', {});
    var focusId = null;
    function render() {
      box.innerHTML = '';
      var credits = D.creditLiabilities = D.creditLiabilities || [];
      credits.forEach(function (c) {
        var nm = input({ value: c.name, placeholder: '如：花呗 / 中信信用卡' });
        nm.onchange = function () { c.name = nm.value.trim() || '未命名'; save(); renderFlow(); };
        nm.onkeydown = function (e) { if (e.key === 'Enter') nm.blur(); };
        if (focusId === c.id) { setTimeout(function () { try { nm.focus(); nm.select(); } catch (e) {} }, 30); focusId = null; }
        var rem = input({ type: 'number', step: '0.01', value: c.remaining });
        rem.onchange = function () { c.remaining = Number(rem.value) || 0; save(); renderFlow(); };
        box.appendChild(h('div', { style: { marginBottom: 10 } }, [
          field('负债名称', nm),
          field('当前剩余欠款', rem),
          h('button', { class: 'btn btn-sm btn-danger', onclick: function () {
            confirmDialog('删除信用负债', '删除「' + c.name + '」后，关联它的还款将不再挂钩（还款记录保留）。确定？', function () {
              D.currentFunds.forEach(function (rec) { (rec.repayments || []).forEach(function (rp) { if (rp.creditId === c.id) rp.creditId = null; }); });
              D.creditLiabilities = D.creditLiabilities.filter(function (x) { return x.id !== c.id; });
              save(); render(); renderFlow();
            });
          } }, '删除')
        ]));
      });
      box.appendChild(h('button', { class: 'btn btn-sm', onclick: function () {
        var nc = { id: P.uid('cr'), name: '', remaining: 0 };
        (D.creditLiabilities = D.creditLiabilities || []).push(nc);
        focusId = nc.id; save(); render();
      } }, '＋ 新增信用负债'));
    }
    render();
    openModal('信用负债管理（还款关联后自动扣减剩余）', box, [h('button', { class: 'btn btn-primary', onclick: function () { closeModal(); renderFlow(); } }, '完成')]);
  }

  /* =========================================================
   * 投资（教育金投资 / 风险投资，纵向堆叠）
   * ========================================================= */
  function renderInvest() {
    var sec = q('#page-invest'); sec.innerHTML = '';
    var edu = C.portfolioStat(D.educationFunds);
    var risk = C.portfolioStat(D.riskFunds);

    // 全球股市指数
    sec.appendChild(renderGlobalIndicesCard());

    // 板块切换（顶部标签页）：点一下即可在「风险投资 / 教育金投资」间切换，无需下滚
    sec.appendChild(h('div', { class: 'tabs' }, [
      h('button', { class: 'tab' + (state.invTab === 'risk' ? ' active' : ''), 'data-action': 'inv-tab', 'data-id': 'risk' }, '🔵 风险投资'),
      h('button', { class: 'tab' + (state.invTab === 'education' ? ' active' : ''), 'data-action': 'inv-tab', 'data-id': 'education' }, '🟢 教育金投资')
    ]));

    // 只渲染当前选中的板块
    if (state.invTab === 'risk') sec.appendChild(investSection('🔵 风险投资（支付宝）', risk, 'risk'));
    else sec.appendChild(investSection('🟢 教育金投资（微信理财通）', edu, 'education'));

    // AI 分析
    sec.appendChild(h('div', { class: 'section-label' }, ['✨ AI 分析建议', spacer(),
      h('button', { class: 'btn btn-sm ' + (state.aiOpen ? 'btn-primary' : ''), 'data-action': 'run-ai' }, state.aiOpen ? '收起' : '展开')]));
    if (state.aiOpen) sec.appendChild(aiCard());
  }
  function renderGlobalIndicesCard() {
    var gi = D.settings.globalIndices || { items: [] };
    var rows = (gi.items || []).map(function (it) {
      var cls = it.pct >= 0 ? 'up' : 'down';
      return h('div', { class: 'index-row' }, [
        h('div', { class: 'idx-info' }, [
          h('div', { class: 'idx-name' }, it.name),
          h('div', { class: 'idx-code' }, it.code)
        ]),
        h('div', { class: 'idx-main' }, [
          h('div', { class: 'idx-price ' + cls }, P.fmtNum(it.value, 2)),
          h('div', { class: 'idx-badges' }, [
            h('span', { class: 'idx-badge idx-pct ' + cls }, (it.pct >= 0 ? '▲ ' : '▼ ') + P.fmtPct(it.pct)),
            h('span', { class: 'idx-badge idx-change ' + cls }, (it.change >= 0 ? '+' : '') + P.fmtNum(it.change, 2))
          ])
        ])
      ]);
    });
    if (!rows.length) {
      rows = [h('div', { class: 'muted', style: { padding: '12px 0' } }, '点击 🔄 获取全球股市指数实时数据')];
    }
    return h('div', { class: 'index-card' }, [
      h('div', { class: 'idx-head' }, [
        h('div', { class: 'idx-title' }, [h('span', {}, '🌐'), '全球股市指数']),
        h('div', {}, [
          h('span', { class: 'idx-live' }, '实时数据'),
          h('button', { class: 'btn btn-sm', style: { marginLeft: 8 }, 'data-action': 'refresh-indices' }, '🔄')
        ])
      ]),
      h('div', { class: 'index-rows' }, rows),
      h('div', { class: 'idx-foot' }, gi.date ? ('数据更新于 ' + gi.date + ' ' + (gi.time || '') + ' · 来源：东方财富') : '')
    ]);
  }
  function investSection(title, st, kind) {
    var box = h('div', { class: 'invest-section full' }, [
      h('div', { class: 'stat-grid' }, [portOverview(title, st)])
    ]);
    var list = kind === 'risk' ? D.riskFunds : D.educationFunds;
    box.appendChild(h('div', { class: 'section-label', style: { marginTop: 10, display: 'flex', alignItems: 'center' } }, [
      h('span', {}, ['基金列表（' + list.length + '）']), spacer(),
      h('button', { class: 'btn btn-sm btn-primary', 'data-action': 'add-fund', 'data-kind': kind }, '＋ 新增基金')
    ]));
    if (!list.length) box.appendChild(h('div', { class: 'empty' }, [h('span', { class: 'em-ico' }, '📈'), '还没有基金，点上方“＋ 新增基金”添加']));
    else list.forEach(function (f) { box.appendChild(fundCard(f, kind)); });
    return box;
  }
  function portOverview(name, st) {
    var cls = st.profit >= 0 ? 'up' : 'down';
    return h('div', { class: 'stat' }, [
      h('div', { class: 's-label' }, name),
      h('div', { class: 's-value' }, money(st.market)),
      h('div', { class: 'li-sub' }, ['总投入 ', money(st.invested)]),
      h('div', { class: 'li-sub' }, [h('span', { class: cls }, (st.profit >= 0 ? '持有收益 ' : '持有亏损 ') + money(st.profit)), ' · 收益率 ', h('span', { class: cls }, P.fmtPct(st.invested ? st.profit / st.invested * 100 : 0))])
    ]);
  }
  function nextInvestDate(f) {
    if (!f.isInvest || !f.investFreq) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var end = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    var ds = scheduledDatesSince(f.investFreq, today, end, f.investDay);
    if (!ds.length) {
      // 频率为「每月」且本月买入日已过：取下一个可用月
      var n = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      ds = scheduledDatesSince(f.investFreq, n, new Date(n.getFullYear() + 1, n.getMonth(), n.getDate()), f.investDay);
    }
    return ds.length ? ds[0] : null;
  }
  function fundCard(f, kind) {
    var mv = C.fundMarketValue(f), profit = C.fundProfit(f), cls = profit >= 0 ? 'up' : 'down';
    var pct = f.principal ? profit / f.principal * 100 : 0;
    var next = nextInvestDate(f);
    return h('div', { class: 'fund-row', 'data-action': 'edit-fund', 'data-id': f.id, 'data-kind': kind }, [
      h('div', { class: 'fund-main' }, [
        h('div', { class: 'fund-name-row' }, [
          h('span', { class: 'fund-name' }, f.name || f.code),
          h('span', { class: 'chip blue' }, f.sector || '未分类'),
          f.isInvest ? h('span', { class: 'chip' }, '定投') : null
        ]),
        h('div', { class: 'fund-sub' }, [
          h('span', { class: 'fund-code' }, f.code),
          f.tradeDate ? ' · ' + f.tradeDate : '',
          f.isInvest && next ? h('span', { class: 'fund-next' }, ' · 下次 ' + next) : null
        ])
      ]),
      h('div', { class: 'fund-figs' }, [
        h('div', { class: 'fund-mv' }, money(mv)),
        h('div', { class: 'fund-profit ' + cls }, (profit >= 0 ? '+' : '') + money(profit) + ' · ' + P.fmtPct(pct))
      ]),
      h('div', { class: 'fund-acts' }, [
        h('button', { class: 'btn btn-xs', 'data-action': 'update-amount', 'data-id': f.id, 'data-kind': kind, onclick: stop(function () { updateAmount(f.id, kind); }) }, '金额'),
        h('button', { class: 'btn btn-xs', 'data-action': 'fund-tx', 'data-id': f.id, 'data-kind': kind, onclick: stop(function () { showTx(f.id, kind); }) }, '交易'),
        h('button', { class: 'btn btn-xs', 'data-action': 'fund-history', 'data-id': f.id, 'data-kind': kind, onclick: stop(function () { showFundHistory(f.id, kind); }) }, '历史')
      ])
    ]);
  }

  function updateAmount(id, kind) {
    var list = kind === 'risk' ? D.riskFunds : D.educationFunds;
    var f = list.filter(function (x) { return x.id === id; })[0]; if (!f) return;
    var amt = input({ type: 'number', step: '0.01', value: f.currentAmount, placeholder: '当前金额' });
    openModal('更新金额 · ' + f.name, field('当前金额（元）', amt, '每月手动更新一次，对应支付宝基金页“金额”'), [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        f.currentAmount = Number(amt.value) || 0;
        f.amountHistory = f.amountHistory || [];
        var ymd = P.todayYmd();
        var ex = (f.amountHistory || []).filter(function (r) { return r.date === ymd; })[0];
        if (ex) ex.amount = f.currentAmount; else f.amountHistory.push({ id: P.uid('h'), date: ymd, amount: f.currentAmount });
        save(); toast('已更新并记录'); closeModal(); showPage('invest');
      } }, '保存')
    ]);
  }
  function showTx(id, kind) {
    var list = kind === 'risk' ? D.riskFunds : D.educationFunds;
    var f = list.filter(function (x) { return x.id === id; })[0]; if (!f) return;
    var box = h('div', {});
    function renderTx() {
      box.innerHTML = '';
      (f.transactions || []).forEach(function (t) {
        box.appendChild(h('div', { class: 'list-item' }, [
          h('div', { class: 'li-main' }, [
            h('div', { class: 'li-title' }, [t.type, ' ', h('span', { class: 'chip gray' }, t.date), t.auto ? h('span', { class: 'chip gray' }, '自动') : null]),
            h('div', { class: 'li-sub' }, '金额 ' + money(t.amount))
          ]),
          h('div', { class: 'li-right' }, [
            h('div', { class: 'li-amount ' + (t.type === '买入' ? 'down' : 'up') }, (t.type === '买入' ? '-' : '+') + money(t.amount)),
            h('div', { class: 'li-tx-acts' }, [
              h('button', { class: 'btn btn-xs', onclick: stop(function () { editTx(t); }) }, '改'),
              h('button', { class: 'btn btn-xs btn-danger', onclick: stop(function () { delTx(t); }) }, '删')
            ])
          ])
        ]));
      });
      if (!(f.transactions || []).length) box.appendChild(h('div', { class: 'muted' }, '暂无交易记录'));
    }
    function syncPrincipal() {
      C.recomputePrincipal(f);
      save();
      renderTx();
    }
    function editTx(t) {
      var amt = input({ type: 'number', step: '0.01', value: t.amount });
      var dt = input({ type: 'date', value: t.date });
      var ty = select({ value: t.type }, [{ value: '买入', label: '买入' }, { value: '卖出', label: '卖出' }]);
      openModal('修改交易', h('div', {}, [
        field('类型', ty),
        h('div', { class: 'row2' }, [field('金额', amt), field('日期', dt)]),
        h('button', { class: 'btn btn-primary btn-block', onclick: function () {
          if (!amt.value) return toast('请输入金额');
          t.type = ty.value; t.amount = Number(amt.value) || 0; t.date = dt.value || P.todayYmd();
          syncPrincipal(); closeModal(); toast('已修改');
        } }, '保存')
      ]), [h('button', { class: 'btn', onclick: closeModal }, '取消')]);
    }
    function delTx(t) {
      confirmDialog('删除交易', '确定删除这笔交易吗？累计投入本金会同步更新。', function () {
        f.transactions = (f.transactions || []).filter(function (x) { return x.id !== t.id; });
        syncPrincipal(); toast('已删除');
      });
    }
    renderTx();
    var amt = input({ type: 'number', step: '0.01', placeholder: '金额' });
    var dt = input({ type: 'date', value: P.todayYmd() });
    var ty = select({ value: '买入' }, [{ value: '买入', label: '买入' }, { value: '卖出', label: '卖出' }]);
    openModal('交易记录 · ' + f.name, h('div', {}, [
      h('div', { class: 'calc-line' }, ['累计投入本金：', h('b', {}, money(f.principal))]),
      box,
      h('div', { class: 'section-label', style: { margin: '12px 0 6px' } }, ['添加交易']),
      field('类型', ty),
      h('div', { class: 'row2' }, [field('金额', amt), field('日期', dt)]),
      h('button', { class: 'btn btn-primary btn-block', onclick: function () {
        if (!amt.value) return toast('请输入金额');
        f.transactions = f.transactions || [];
        f.transactions.push({ id: P.uid('t'), type: ty.value, amount: Number(amt.value) || 0, date: dt.value || P.todayYmd() });
        syncPrincipal();
        amt.value = ''; dt.value = P.todayYmd();
        toast('已添加'); showPage('invest');
      } }, '添加')
    ]), null);
  }

  function fundHistoryChart(rows) {
    if (rows.length < 2) return h('div', { class: 'muted', style: { textAlign: 'center', padding: '14px 0' } }, '记录不足两个月，暂时无法绘制趋势。');
    var vals = rows.map(function (r) { return r.amount; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var w = 300, hgt = 96, pad = 10, span = (max - min) || 1;
    var pts = vals.map(function (v, i) {
      var x = pad + i * (w - pad * 2) / (vals.length - 1);
      var y = hgt - pad - (v - min) / span * (hgt - pad * 2);
      return [x, y];
    });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    return h('div', { class: 'fund-chart', html:
      '<svg viewBox="0 0 ' + w + ' ' + hgt + '" width="100%" height="' + hgt + '">' +
      '<path d="' + d + '" fill="none" stroke="#6B4E71" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.5" fill="#C98AA0"/></svg>' });
  }

  function showFundHistory(id, kind) {
    var list = kind === 'risk' ? D.riskFunds : D.educationFunds;
    var f = list.filter(function (x) { return x.id === id; })[0]; if (!f) return;
    // 按月去重：同一月份只保留记录日期最后（最新）的那条
    var byMonth = {};
    (f.amountHistory || []).forEach(function (r) {
      var ym = (r.date || '').slice(0, 7); if (!ym) return;
      if (!byMonth[ym] || r.date > byMonth[ym].date) byMonth[ym] = r;
    });
    var rows = Object.keys(byMonth).sort().map(function (ym) {
      return { ym: ym, date: byMonth[ym].date, amount: Number(byMonth[ym].amount) || 0 };
    });
    var box = h('div', {});
    function render() {
      box.innerHTML = '';
      if (!rows.length) { box.appendChild(h('div', { class: 'muted' }, '暂无历史记录，每次更新金额会自动留痕。')); return; }
      box.appendChild(fundHistoryChart(rows));
      var n = rows.length;
      rows.slice().reverse().forEach(function (r, i) {
        var prev = i < n - 1 ? rows[n - 1 - i - 1].amount : null;
        var delta = prev != null ? r.amount - prev : null;
        var dcls = delta == null ? '' : (delta >= 0 ? 'up' : 'down');
        box.appendChild(h('div', { class: 'list-item' }, [
          h('div', { class: 'li-main' }, [h('div', { class: 'li-title' }, r.ym), h('div', { class: 'li-sub' }, '记录于 ' + r.date)]),
          h('div', { class: 'li-amount ' + dcls }, money(r.amount) + (delta == null ? '' : '  ' + (delta >= 0 ? '+' : '') + money(delta)))
        ]));
      });
    }
    render();
    openModal('金额历史 · ' + (f.name || f.code), box, null);
  }

  function fundForm(id) {
    var list = state.invTab === 'education' ? D.educationFunds : D.riskFunds;
    var f = id ? list.filter(function (x) { return x.id === id; })[0] : null;
    var code = input({ value: f ? f.code : '', placeholder: '如：110011' });
    var name = input({ value: f ? f.name : '', placeholder: '输入代码后自动识别' });
    var sector = input({ value: f ? f.sector : '', placeholder: '板块（自动或手填）' });
    var tradeDate = input({ type: 'date', value: f ? f.tradeDate : P.todayYmd() });
    var isInvest = select({ value: f ? (f.isInvest ? '是' : '否') : '是' }, [{ value: '是', label: '是' }, { value: '否', label: '否' }]);
    var investBox = h('div', {});
    function rebuildInvest() {
      investBox.innerHTML = '';
      if (isInvest.value === '是') {
        var amt = input({ type: 'number', step: '0.01', value: f ? f.investAmount : '' });
        var freq = select({ value: f ? f.investFreq : '每月' }, [{ value: '每月', label: '每月' }, { value: '每周', label: '每周' }, { value: '每工作日', label: '每工作日' }]);
        var dayWrap = h('div', {});
        function rebuildDay() {
          dayWrap.innerHTML = '';
          if (freq.value === '每月') {
            var dn = input({ type: 'number', min: 1, max: 31, value: f && f.investFreq === '每月' ? (f.investDay || '15') : '15', placeholder: '几号' });
            dayWrap.appendChild(field('每月几号买入', dn));
            dayWrap._val = function () { return dn.value.trim(); };
          } else if (freq.value === '每周') {
            var cur = f && f.investFreq === '每周' ? (f.investDay || '1') : '1';
            var opts = [1, 2, 3, 4, 5, 6, 7].map(function (n) { return { value: '' + n, label: '周' + '日一二三四五六'.charAt(n % 7) }; });
            var wd = select({ value: cur }, opts);
            dayWrap.appendChild(field('每周几买入', wd));
            dayWrap._val = function () { return wd.value; };
          } else {
            dayWrap.appendChild(h('div', { class: 'muted', style: { padding: '6px 0' } }, '每个工作日自动买入'));
            dayWrap._val = function () { return '1'; };
          }
        }
        freq.onchange = rebuildDay; rebuildDay();
        investBox.appendChild(field('定投金额', amt));
        investBox.appendChild(field('定投频率', freq));
        investBox.appendChild(dayWrap);
        investBox._vals = function () { return { investAmount: Number(amt.value) || 0, investFreq: freq.value, investDay: dayWrap._val() }; };
      } else { investBox._vals = function () { return { investAmount: 0, investFreq: '', investDay: '' }; }; }
    }
    isInvest.onchange = rebuildInvest; rebuildInvest();
    var initialPrincipal = input({ type: 'number', step: '0.01', value: f ? (f.initialPrincipal || 0) : '', placeholder: '创建时已有的本金' });
    var currentAmount = input({ type: 'number', step: '0.01', value: f ? f.currentAmount : '', placeholder: '当前金额（如：份额×净值）' });

    function doLookup() {
      if (!code.value.trim()) return toast('请输入基金代码');
      toast('正在识别…');
      C.fetchFundInfo(code.value.trim(), function (err, info) {
        if (!err && info && info.name) {
          name.value = info.name;
          if (info.sector) sector.value = info.sector;
          D.settings.fundNameMap[code.value.trim()] = { name: info.name, sector: info.sector || '' };
          save(); toast('已识别：' + info.name);
        } else {
          var m = D.settings.fundNameMap[code.value.trim()];
          if (m && m.name) { name.value = m.name; if (m.sector) sector.value = m.sector; toast('使用已存名称'); }
          else toast('自动识别失败，请手填名称');
        }
      });
    }
    code.oninput = function () { if (/^\d{6}$/.test(code.value.trim())) doLookup(); };
    var actions = [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!code.value.trim()) return toast('请输入基金代码');
        var iv = investBox._vals();
        var obj = { code: code.value.trim(), name: name.value.trim() || code.value.trim(), sector: sector.value.trim(), tradeDate: tradeDate.value || P.todayYmd(), isInvest: isInvest.value === '是', investAmount: iv.investAmount, investFreq: iv.investFreq, investDay: iv.investDay, initialPrincipal: Number(initialPrincipal.value) || 0, currentAmount: Number(currentAmount.value) || 0, note: '' };
        if (f) { Object.assign(f, obj); C.recomputePrincipal(f); } else { obj.id = P.uid('f'); obj.transactions = []; C.recomputePrincipal(obj); list.push(obj); }
        save(); toast(f ? '已更新' : '已添加'); closeModal(); showPage('invest');
      } }, '保存')
    ];
    if (f) actions.push(h('button', { class: 'btn btn-danger', onclick: function () {
      confirmDialog('删除基金', '确定删除该基金吗？', function () { var arr = state.invTab === 'education' ? D.educationFunds : D.riskFunds; arr = arr.filter(function (x) { return x.id !== id; }); save(); toast('已删除'); closeModal(); showPage('invest'); });
    } }, '删除'));
    var body = h('div', {}, [
      field('基金代码', h('div', { style: { display: 'flex', gap: 6 } }, [code, h('button', { class: 'btn btn-sm', onclick: doLookup }, '🔍 识别')]), '输入6位代码后自动识别名称；也可点此识别'),
      field('基金名称', name),
      field('关联板块', sector, '自动失败时可手动选择/填写'),
      field('交易日期', tradeDate),
      field('是否定投', isInvest),
      investBox,
      field('初始本金（创建时填入）', initialPrincipal, '之后由「交易」自动累加 ±'),
      h('div', { class: 'muted', style: { fontSize: 12, margin: '-4px 0 8px' } }, '累计投入本金 = 初始本金 + 买入 − 卖出（在「交易」里自动计算）'),
      field('当前金额', currentAmount, '当前市值（元），每月手动更新')
    ]);
    openModal(f ? '编辑基金' : '新增基金', body, actions);
  }
  function delFund(id) {
    var list = state.invTab === 'education' ? D.educationFunds : D.riskFunds;
    confirmDialog('删除基金', '确定删除该基金吗？', function () {
      var arr = state.invTab === 'education' ? 'educationFunds' : 'riskFunds';
      D[arr] = D[arr].filter(function (x) { return x.id !== id; }); save(); toast('已删除'); showPage('invest');
    });
  }

  /* =========================================================
   * 保险记录（家庭成员 → 保单 → 交费记录）
   * ========================================================= */
  var INSURANCE_TYPES = ['重疾险', '意外险', '医疗险', '寿险', '其他'];
  var PAY_FREQS = ['年交', '半年交', '季交', '月交', '趸交（一次性）'];
  // 交费账户（与垫付支付渠道一致）
  var INSURANCE_PAY_ACCOUNTS = [
    { value: 'wechat', label: '微信零钱' },
    { value: 'yuebao', label: '余额宝' },
    { value: 'bank', label: '银行' },
    { value: 'other', label: '其他' },
    { value: 'deposit', label: '存钱罐' }
  ];
  function payAccountLabel(v) {
    var m = INSURANCE_PAY_ACCOUNTS.filter(function (x) { return x.value === v; })[0];
    return m ? m.label : (v || '—');
  }

  function memberById(id) {
    return (D.members || []).filter(function (m) { return m.id === id; })[0] || { name: '未知', avatar: '👤', color: '#888' };
  }
  // 交费起止（精确日期）折算“共 X 年”
  function periodYears(start, end) {
    if (!start || !end) return null;
    var s = P.parseYmd(start), e = P.parseYmd(end);
    if (!s || !e) return null;
    var days = Math.round((e.getTime() - s.getTime()) / 86400000);
    if (days <= 0) return 0;
    return Math.max(1, Math.round(days / 365.25));
  }
  // MM-DD → “M月D日”
  function formatMd(md) {
    if (!md) return '—';
    var p = String(md).split('-');
    return Number(p[0]) + '月' + Number(p[1]) + '日';
  }
  // 累计理赔金额
  function claimTotal(ins) {
    var cls = ins.claims || [];
    var s = 0; cls.forEach(function (c) { s += Number(c.amount) || 0; });
    return s;
  }

  function renderInsurance() {
    var sec = q('#page-insurance'); sec.innerHTML = '';
    if (!state.insMember) renderInsuranceHome(sec);
    else renderInsuranceMember(sec, state.insMember);
  }

  function renderInsuranceHome(sec) {
    var annual = C.insuranceAnnualTotal(D);
    var monthly = C.insuranceMonthlyAvg(D);
    var cnt = C.insuranceCount(D);
    var mcnt = (D.members || []).length;
    var claimSum = 0, claimCnt = 0;
    (D.insurances || []).forEach(function (ins) { (ins.claims || []).forEach(function (c) { claimSum += Number(c.amount) || 0; claimCnt++; }); });

    // 顶部总览：年度保费合计 + 本月月均 + 累计理赔
    sec.appendChild(h('div', { class: 'ins-hero' }, [
      h('div', { class: 'ins-hero-cell' }, [
        h('div', { class: 'ins-hero-label' }, '年度保费合计（全家）'),
        h('div', { class: 'ins-hero-value' }, money(annual)),
        h('div', { class: 'ins-hero-sub' }, '共 ' + cnt + ' 张保单 · ' + mcnt + ' 位家庭成员')
      ]),
      h('div', { class: 'ins-hero-cell' }, [
        h('div', { class: 'ins-hero-label' }, '本年度月均'),
        h('div', { class: 'ins-hero-value' }, money(monthly)),
        h('div', { class: 'ins-hero-sub' }, '≈ 年保费 ÷ 12')
      ]),
      claimSum > 0 ? h('div', { class: 'ins-hero-cell' }, [
        h('div', { class: 'ins-hero-label' }, '累计理赔（全家）'),
        h('div', { class: 'ins-hero-value' }, money(claimSum)),
        h('div', { class: 'ins-hero-sub' }, '共 ' + claimCnt + ' 笔理赔记录')
      ]) : null
    ]));

    // ⭐ 保险月历：全年逐月预估保险费（全家）
    sec.appendChild(insuranceForecastSection(null));

    // 家庭成员网格
    sec.appendChild(h('div', { class: 'section-label' }, ['👨‍👩‍👧‍👦 家庭成员（点击查看 / 新增保险）']));
    var grid = h('div', { class: 'member-grid' });
    (D.members || []).forEach(function (m) {
      var ma = C.insuranceAnnualByMember(D, m.id);
      var mc = (D.insurances || []).filter(function (x) { return x.memberId === m.id; }).length;
      grid.appendChild(h('div', { class: 'member-card tappable', 'data-action': 'ins-open-member', 'data-id': m.id }, [
        h('div', { class: 'member-avatar', style: { background: m.color + '22', border: '2px solid ' + m.color } }, m.avatar),
        h('div', { class: 'member-name', 'data-action': 'ins-edit-member', 'data-id': m.id, style: { cursor: 'pointer' }, title: '点击修改名称' }, m.name),
        h('div', { class: 'member-sub' }, mc + ' 张保单 · ' + money(ma) + '/年')
      ]));
    });
    grid.appendChild(h('div', { class: 'member-card add tappable', 'data-action': 'ins-add-member', title: '新增家庭成员' }, [
      h('div', { class: 'member-avatar add' }, '+'),
      h('div', { class: 'member-name' }, '新增成员'),
      h('div', { class: 'member-sub' }, '点击添加')
    ]));
    sec.appendChild(grid);
  }

  function renderInsuranceMember(sec, memberId) {
    var m = memberById(memberId);
    var ma = C.insuranceAnnualByMember(D, memberId);
    var list = (D.insurances || []).filter(function (x) { return x.memberId === memberId; });

    sec.appendChild(h('div', { class: 'ins-member-head' }, [
      h('div', { class: 'member-avatar lg', style: { background: m.color + '22', border: '2px solid ' + m.color } }, m.avatar),
      h('div', { class: 'ins-member-info' }, [
        h('div', { class: 'ins-member-name', 'data-action': 'ins-edit-member', 'data-id': m.id, style: { cursor: 'pointer' }, title: '点击修改名称' }, m.name),
        h('div', { class: 'li-sub' }, '年保费合计 ' + money(ma) + ' · ' + list.length + ' 张保单')
      ])
    ]));

    // ⭐ 保险月历：该成员全年逐月预估保险费
    sec.appendChild(insuranceForecastSection(memberId));

    sec.appendChild(h('div', { class: 'section-label', style: { display: 'flex', alignItems: 'center' } }, [
      h('span', {}, ['保险明细']), spacer(),
      h('button', { class: 'btn btn-sm btn-primary', 'data-action': 'add-insurance' }, '＋ 新增保险')
    ]));

    if (!list.length) {
      sec.appendChild(h('div', { class: 'empty' }, [h('span', { class: 'em-ico' }, '🛡️'), m.name + ' 还没有保险，点上方“＋ 新增保险”添加']));
    } else {
      list.forEach(function (ins) { sec.appendChild(insuranceCard(ins, m)); });
    }
  }

  // 紧凑金额（用于月历柱顶）：≥1万显示“x.x万”，否则取整
  function moneyShort(n) {
    n = Number(n) || 0;
    if (n >= 10000) {
      var w = n / 10000;
      return '¥' + (w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)) + '万';
    }
    return '¥' + Math.round(n);
  }

  // ⭐ 保险月历：全年逐月预估保险费（可指定 memberId 只看某人）
  function insuranceForecastSection(memberId) {
    var year = D.viewYear;
    var fc = C.insuranceMonthlyForecast(D, year, memberId);
    var now = new Date();
    var curMonth = (now.getFullYear() === year) ? (now.getMonth() + 1) : 0;
    var max = Math.max(fc.peak, 1);
    var bars = fc.months.map(function (r) {
      var isCur = (r.month === curMonth);
      var hgt = r.total > 0 ? Math.max(8, Math.round((r.total / max) * 100)) : 4;
      return h('div', {
        class: 'ins-fc-col' + (isCur ? ' cur' : '') + (r.total <= 0 ? ' zero' : ''),
        'data-action': 'ins-month-detail', 'data-month': r.month,
        title: r.month + '月 预估 ' + money(r.total) + '（点击查看明细）'
      }, [
        r.total > 0 ? h('div', { class: 'ins-fc-val' }, moneyShort(r.total)) : null,
        h('div', { class: 'ins-fc-bar', style: { height: hgt + 'px' } }, []),
        h('div', { class: 'ins-fc-m' }, r.month + '月')
      ]);
    });
    return h('div', { class: 'ins-forecast' }, [
      h('div', { class: 'section-label' }, ['📅 ' + year + ' 年每月预估保险费']),
      h('div', { class: 'ins-fc-summary' }, [
        h('span', { class: 'chip' }, '全年合计 ' + money(fc.total)),
        h('span', { class: 'chip' }, '月均 ' + money(fc.monthlyAvg)),
        fc.peakMonth ? h('span', { class: 'chip red' }, '峰值 ' + fc.peakMonth + '月 ' + money(fc.peak)) : null
      ]),
      h('div', { class: 'ins-fc-bars' }, bars),
      h('div', { class: 'ins-fc-hint' }, '根据每张保单的交费方式（年交 / 半年交 / 季交 / 月交 / 趸交）与提醒日推算；点某月看明细。仅计入提醒生效年份内的保单。')
    ]);
  }

  // 某月预估保险费明细弹窗
  function insuranceMonthDetail(month) {
    var year = D.viewYear;
    var fc = C.insuranceMonthlyForecast(D, year, null);
    var r = fc.months[month - 1];
    var rows = r.items.slice().sort(function (a, b) { return b.amount - a.amount; }).map(function (it) {
      var m = memberById(it.memberId);
      return h('div', { class: 'li tappable', 'data-action': 'ins-detail', 'data-id': it.id }, [
        h('div', { class: 'li-left' }, [
          h('div', { class: 'li-title' }, [h('span', { class: 'chip' }, it.type), ' ', it.name]),
          h('div', { class: 'li-sub' }, (m ? m.name + ' · ' : '') + (it.freq || '年交'))
        ]),
        h('div', { class: 'li-right' }, [h('div', { class: 'li-amount' }, money(it.amount)), h('div', { class: 'li-sub' }, month + '月支出')])
      ]);
    });
    if (!rows.length) rows = [h('div', { class: 'empty-sm' }, '该月没有预估保险支出')];
    openModal(year + ' 年 ' + month + '月 · 预估保险费 ' + money(r.total), h('div', {}, [
      h('div', { class: 'ins-fc-month-total' }, ['当月合计 ', h('b', {}, money(r.total))]),
      h('div', { class: 'list' }, rows)
    ]));
  }

  function insuranceCard(ins, m) {
    var due = isInsDue(ins);
    var ppYears = periodYears(ins.payPeriodStart, ins.payPeriodEnd);
    return h('div', { class: 'card tappable ins-card' + (due ? ' ins-due' : ''), 'data-action': 'ins-detail', 'data-id': ins.id }, [
      h('div', { class: 'li-title', style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
        h('span', { class: 'chip' }, ins.type),
        ins.company ? h('span', { class: 'li-sub', style: { fontWeight: 600, color: 'var(--ink)' } }, ins.company) : null,
        due ? h('span', { class: 'chip red' }, '⏰ 待交费') : null,
        h('span', { class: 'ins-card-arrow' }, '›')
      ]),
      h('div', { class: 'ins-card-amount' }, money(ins.amount), h('span', { class: 'ins-card-unit' }, ' /年')),
      h('div', { class: 'li-sub' }, [h('span', { class: 'chip gray' }, '保障'), ' ', ins.payStart || '—', ' ~ ', ins.payEnd || '—']),
      ppYears ? h('div', { class: 'li-sub' }, [h('span', { class: 'chip gray' }, '交费年期'), ' ', ins.payPeriodStart, ' – ', ins.payPeriodEnd, '（共 ' + ppYears + ' 年）']) : null,
      h('div', { class: 'li-sub' }, [h('span', { class: 'chip gray' }, '交费'), ' ', (ins.payFreq || '年交'), (ins.remindMd ? ' · 每年' + formatMd(ins.remindMd) + '提醒' + remindYearText(ins) : '')]),
      h('div', { class: 'li-sub' }, [
        ins.channel ? h('span', { class: 'chip blue' }, '渠道·' + ins.channel) : null,
        ins.payAccount ? h('span', { class: 'chip teal' }, '账户·' + payAccountLabel(ins.payAccount)) : null
      ]),
      ins.remark ? h('div', { class: 'ins-key' }, '📝 ' + ins.remark) : null,
      ins.keyContent ? h('div', { class: 'ins-key' }, '📌 ' + ins.keyContent) : null,
      h('div', { class: 'li-sub' }, [
        (ins.attachments && ins.attachments.length) ? h('span', {}, '📎 ' + ins.attachments.length + ' 个附件') : null,
        (claimTotal(ins) > 0) ? h('span', { class: 'chip orange' }, '累计理赔 ' + money(claimTotal(ins)) + '（' + (ins.claims || []).length + '）') : null
      ])
    ]);
  }

  function insuranceDetail(id) {
    var ins = (D.insurances || []).filter(function (x) { return x.id === id; })[0]; if (!ins) return;
    var m = memberById(ins.memberId);
    var ppYears = periodYears(ins.payPeriodStart, ins.payPeriodEnd);
    var payBox = h('div', { class: 'detail-payments' });
    function renderPays() {
      payBox.innerHTML = '';
      var pays = (ins.payments || []).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      if (!pays.length) { payBox.appendChild(h('div', { class: 'empty-sm' }, '暂无交费记录')); return; }
      pays.forEach(function (p) {
        var bName = '';
        if (p.budgetId) { var b = (D.budgets || []).filter(function (x) { return x.id === p.budgetId; })[0]; if (b) bName = b.name; }
        payBox.appendChild(h('div', { class: 'list-item tappable', 'data-action': 'ins-edit-payment', 'data-ins': ins.id, 'data-pay': p.id }, [
          h('div', { class: 'li-main' }, [
            h('div', { class: 'li-title' }, [money(p.amount), ' ', p.date ? h('span', { class: 'chip gray' }, p.date) : null]),
            h('div', { class: 'li-sub' }, [p.note || '交费', bName ? h('span', { class: 'chip blue', style: { marginLeft: 6 } }, '关联：' + bName) : null])
          ]),
          h('div', { class: 'li-amount' }, '›')
        ]));
      });
    }
    renderPays();

    var body = h('div', {}, [
      h('div', { class: 'li-title', style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } }, [
        h('span', { class: 'chip' }, ins.type), ins.company ? h('span', { class: 'li-sub', style: { fontWeight: 700, color: 'var(--ink)' } }, ins.company) : null,
        isInsDue(ins) ? h('span', { class: 'chip red' }, '⏰ 待交费') : null
      ]),
      h('div', { class: 'ins-detail-amount' }, money(ins.amount), h('span', { class: 'ins-card-unit' }, ' /年')),
      ins.name ? h('div', { class: 'li-sub' }, '产品：' + ins.name) : null,
      isInsDue(ins) ? h('button', { class: 'btn btn-primary btn-block', style: { margin: '10px 0' }, onclick: function () { markInsuranceDone(ins.id); } }, '✅ 我已交费（标记完成）') : null,
      h('div', { class: 'ins-detail-grid' }, [
        insField('所属成员', m.name),
        insField('保险种类', ins.type),
        insField('所属公司', ins.company || '—'),
        insField('交费方式', (ins.payFreq || '年交') + (ins.payDate ? '（' + ins.payDate + '）' : '')),
        insField('购买渠道', ins.channel || '—'),
        insField('交费账户', payAccountLabel(ins.payAccount) || '—'),
        insField('交费年期', (ins.payPeriodStart ? ins.payPeriodStart + ' – ' + ins.payPeriodEnd : '—') + (ppYears ? '（共 ' + ppYears + ' 年）' : '')),
        insField('提醒交费时间', ins.remindMd ? '每年 ' + formatMd(ins.remindMd) + ' 提醒' + remindYearText(ins) : '—'),
        insField('保障起', ins.payStart || '—'),
        insField('保障止', ins.payEnd || '—')
      ]),
      ins.keyContent ? h('div', { class: 'ins-key-box' }, [h('div', { class: 'ins-key-title' }, '📌 保障重点内容'), h('div', { class: 'ins-key-text' }, ins.keyContent)]) : null,
      ins.remark ? h('div', { class: 'ins-key-box' }, [h('div', { class: 'ins-key-title' }, '📝 备注'), h('div', { class: 'ins-key-text' }, ins.remark)]) : null,
      (ins.attachments && ins.attachments.length) ? h('div', { class: 'ins-key-box' }, [h('div', { class: 'ins-key-title' }, '📎 附件（' + ins.attachments.length + '，点击可放大预览）'), h('div', { class: 'att-display' },
        ins.attachments.map(function (a) {
          if (a.type && a.type.indexOf('image/') === 0) return h('img', { class: 'att-disp-img', src: a.dataUrl, alt: a.name, onclick: function () { openAttachmentPreview(a); } });
          return h('a', { class: 'att-disp-file', href: a.dataUrl, download: a.name, onclick: function (e) { e.preventDefault(); openAttachmentPreview(a); } }, [h('span', {}, '📄'), h('span', {}, a.name)]);
        })
      )]) : null,
      h('div', { class: 'section-label', style: { margin: '16px 0 8px', display: 'flex', alignItems: 'center' } }, [
        h('span', {}, ['🩺 理赔记录（' + (ins.claims || []).length + '）']), spacer(),
        h('button', { class: 'btn btn-sm', 'data-action': 'ins-add-claim', 'data-ins': ins.id }, '＋ 记一笔理赔')
      ]),
      (function () {
        var cls = (ins.claims || []).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        var sum = claimTotal(ins);
        var box = h('div', { class: 'detail-claims' });
        if (sum > 0) box.appendChild(h('div', { class: 'claim-sum', style: { marginBottom: 8 } }, '累计理赔 ' + money(sum) + '（' + cls.length + ' 笔）'));
        if (!cls.length) { box.appendChild(h('div', { class: 'empty-sm' }, '暂无理赔记录')); return box; }
        cls.forEach(function (c) {
          box.appendChild(h('div', { class: 'list-item tappable', 'data-action': 'ins-edit-claim', 'data-ins': ins.id, 'data-claim': c.id }, [
            h('div', { class: 'li-main' }, [
              h('div', { class: 'li-title' }, [money(c.amount), ' ', c.date ? h('span', { class: 'chip gray' }, c.date) : null]),
              h('div', { class: 'li-sub' }, c.reason || '理赔')
            ]),
            h('div', { class: 'li-amount' }, '›')
          ]));
        });
        return box;
      })(),
      h('div', { class: 'section-label', style: { margin: '16px 0 8px' } }, ['💰 历史缴费记录（' + (ins.payments || []).length + '）']),
      payBox,
      h('button', { class: 'btn btn-primary btn-block', style: { marginTop: 10 }, 'data-action': 'ins-add-payment', 'data-ins': ins.id }, '＋ 记一笔交费')
    ]);
    openModal(ins.type + ' · ' + m.name, body, [
      h('button', { class: 'btn', onclick: closeModal }, '关闭'),
      h('button', { class: 'btn btn-danger', onclick: function () { delInsurance(ins.id); } }, '删除'),
      h('button', { class: 'btn btn-primary', onclick: function () { closeModal(); insuranceForm(ins.id); } }, '编辑')
    ]);
  }
  function insField(label, val) {
    return h('div', { class: 'ins-detail-cell' }, [h('div', { class: 'ins-detail-k' }, label), h('div', { class: 'ins-detail-v' }, val || '—')]);
  }
  // 附件灯箱：图片放大预览 / 文件打开预览
  function openAttachmentPreview(att) {
    if (!att) return;
    var ov = document.getElementById('att-lightbox');
    if (!ov) { ov = h('div', { id: 'att-lightbox', class: 'att-lightbox' }); document.body.appendChild(ov); }
    function close() { ov.classList.remove('open'); ov.innerHTML = ''; }
    ov.onclick = close;
    ov.innerHTML = '';
    if (att.type && att.type.indexOf('image/') === 0) {
      var img = h('img', { class: 'att-lightbox-img', src: att.dataUrl, alt: att.name });
      ov.appendChild(h('div', { class: 'att-lightbox-content', onclick: function (e) { e.stopPropagation(); } }, [img]));
    } else {
      ov.appendChild(h('div', { class: 'att-lightbox-content', onclick: function (e) { e.stopPropagation(); } }, [
        h('div', { class: 'att-lightbox-file-ico' }, '📄'),
        h('div', { class: 'att-lightbox-fname' }, att.name || '文件'),
        h('a', { class: 'btn btn-primary', href: att.dataUrl, target: '_blank', download: att.name }, '⬇ 打开 / 下载文件'),
        h('div', { class: 'att-lightbox-tip' }, '如无法自动打开，请点右上角 × 关闭后长按原链接')
      ]));
    }
    ov.appendChild(h('div', { class: 'att-lightbox-close', onclick: close }, '×'));
    ov.classList.add('open');
  }

  /* 新增 / 编辑家庭成员（弹窗表单，取代原生 prompt） */
  function memberForm(id) {
    var m = id ? memberById(id) : null;
    var name = input({ value: m ? m.name : '', placeholder: '如：小姨' });
    var avatar = input({ value: m ? m.avatar : '👤', placeholder: 'emoji，如 👩' });
    var palette = ['#6B4E71', '#C98AA0', '#5E8B7E', '#C99E5A', '#8E7CC3', '#D66A84', '#7A9E7E'];

    var actions = [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!name.value.trim()) return toast('请输入成员名称');
        if (m) {
          m.name = name.value.trim(); m.avatar = (avatar.value.trim() || '👤');
          save(); toast('已更新'); closeModal(); renderInsurance();
        } else {
          var color = palette[(D.members || []).length % palette.length];
          var nm = name.value.trim();
          var obj = { id: 'm_' + Date.now(), name: nm, avatar: (avatar.value.trim() || '👤'), color: color };
          D.members = D.members || []; D.members.push(obj);
          save(); toast('已添加：' + nm); closeModal();
          state.insMember = obj.id; renderInsurance();
        }
      } }, '保存')
    ];
    if (m) actions.push(h('button', { class: 'btn btn-danger', onclick: function () {
      confirmDialog('删除成员', '确定删除“' + m.name + '”吗？其名下保险记录也会一并删除。', function () {
        D.members = (D.members || []).filter(function (x) { return x.id !== id; });
        D.insurances = (D.insurances || []).filter(function (x) { return x.memberId !== id; });
        if (state.insMember === id) state.insMember = null;
        save(); toast('已删除'); closeModal(); renderInsurance();
      });
    } }, '删除'));

    openModal(m ? '编辑家庭成员' : '新增家庭成员', h('div', {}, [
      h('div', { class: 'li-sub', style: { marginBottom: 10 } }, m ? '修改成员名称或头像；改名后立即生效。' : '添加后可直接进入该成员页面，点“＋ 新增保险”录入保险明细。'),
      field('成员名称', name),
      field('头像 emoji', avatar, '网格中显示的图标，可粘贴任意 emoji')
    ]), actions);
  }

  function insuranceForm(id) {
    var ins = id ? (D.insurances || []).filter(function (x) { return x.id === id; })[0] : null;
    var memberId = ins ? ins.memberId : (state.insMember || (D.members[0] && D.members[0].id));
    var m = memberById(memberId);

    var typeSel = select({ value: ins ? ins.type : '重疾险' }, INSURANCE_TYPES.map(function (t) { return { value: t, label: t }; }));
    var name = input({ value: ins ? ins.name : '', placeholder: '如：平安福重疾险' });
    var company = input({ value: ins ? ins.company : '', placeholder: '如：中国平安' });
    var amount = input({ type: 'number', step: '0.01', value: ins ? ins.amount : '', placeholder: '年保费（元）' });
    var payStart = input({ type: 'date', value: ins ? ins.payStart : P.todayYmd() });
    var payEnd = input({ type: 'date', value: ins ? ins.payEnd : '' });
    var payFreq = select({ value: ins ? ins.payFreq : '年交' }, PAY_FREQS.map(function (t) { return { value: t, label: t }; }));
    var channel = input({ value: ins ? ins.channel : '', placeholder: '如：保险代理人 / 支付宝 / 银行 / 经纪公司' });
    var payAccount = select({ value: ins ? (ins.payAccount || 'bank') : 'bank' }, INSURANCE_PAY_ACCOUNTS.map(function (t) { return { value: t.value, label: t.label }; }));
    var curYear = new Date().getFullYear();
    var ppStart = input({ type: 'date', value: ins ? ins.payPeriodStart : P.todayYmd(), placeholder: '交费起始日' });
    var ppEnd = input({ type: 'date', value: ins ? ins.payPeriodEnd : '', placeholder: '交费截止日' });
    var periodHint = h('div', { class: 'hint' }, '');
    function recalcPeriod() {
      var y = periodYears(ppStart.value, ppEnd.value);
      if (y != null) periodHint.textContent = '实际交费 ' + y + ' 年（保障期可能更长，如交10年保30年）';
      else periodHint.textContent = '交费起止可与保障期不同，例如交10年保30年';
    }
    ppStart.addEventListener('input', recalcPeriod); ppEnd.addEventListener('input', recalcPeriod); recalcPeriod();
    var remindMdInput = input({ type: 'date', value: ins && ins.remindMd ? '2000-' + ins.remindMd : '', placeholder: '选月日' });
    var ppSYear = ppStart.value ? Number(ppStart.value.substring(0, 4)) : curYear;
    var ppEYear = ppEnd.value ? Number(ppEnd.value.substring(0, 4)) : curYear;
    var remindFromYear = input({ type: 'number', value: ins ? (ins.remindFromYear != null ? ins.remindFromYear : ppSYear) : ppSYear, placeholder: '起始年' });
    var remindToYear = input({ type: 'number', value: ins ? (ins.remindToYear != null ? ins.remindToYear : ppEYear) : ppEYear, placeholder: '截止年' });
    var keyContent = input({ value: ins ? ins.keyContent : '', placeholder: '如：交10年保30年，最高赔付50万' });
    var remark = input({ value: ins ? ins.remark : '', placeholder: '其它想记的内容' });

    // 附件（保障重点内容：图片 / 文件）
    var atts = (ins ? (ins.attachments || []) : []).map(function (a) { return { id: a.id, name: a.name, type: a.type, dataUrl: a.dataUrl, size: a.size }; });
    var attBox = h('div', { class: 'att-box' });
    function renderAtts() {
      attBox.innerHTML = '';
      atts.forEach(function (a, idx) {
        var isImg = a.type && a.type.indexOf('image/') === 0;
        var thumb = isImg
          ? h('img', { class: 'att-thumb', src: a.dataUrl, alt: a.name, onclick: function () { openAttachmentPreview(a); } })
          : h('div', { class: 'att-file', onclick: function () { openAttachmentPreview(a); } }, [h('span', {}, '📄'), h('span', { class: 'att-name' }, a.name)]);
        attBox.appendChild(h('div', { class: 'att-item' }, [
          thumb,
          h('button', { class: 'att-del', type: 'button', onclick: function (e) { e.stopPropagation(); atts.splice(idx, 1); renderAtts(); } }, '×')
        ]));
      });
      if (!atts.length) attBox.appendChild(h('div', { class: 'muted', style: { padding: '4px 0' } }, '暂无附件'));
    }
    renderAtts();
    var fileInput = h('input', { type: 'file', multiple: true, accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx', style: { display: 'none' } });
    // 把图片缩放压缩后再存为 base64，避免体积过大撑爆 localStorage（保险附件丢失的根因）
    function compressImageFile(f, onOk, onFail) {
      try {
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            var maxW = 1024, maxH = 1024;
            var w = img.width, hh = img.height;
            if (w > maxW || hh > maxH) {
              var r = Math.min(maxW / w, maxH / hh);
              w = Math.round(w * r); hh = Math.round(hh * r);
            }
            var canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = hh;
            canvas.getContext('2d').drawImage(img, 0, 0, w, hh);
            try { onOk(canvas.toDataURL('image/jpeg', 0.72)); }
            catch (e) { onFail(); }
          };
          img.onerror = function () { onFail(); };
          img.src = reader.result;
        };
        reader.onerror = function () { onFail(); };
        reader.readAsDataURL(f);
      } catch (e) { onFail(); }
    }
    fileInput.addEventListener('change', function (e) {
      var files = e.target.files || [];
      Array.prototype.forEach.call(files, function (f) {
        var isImg = f.type && f.type.indexOf('image/') === 0;
        if (isImg) {
          if (f.size > 8 * 1024 * 1024) { toast('「' + f.name + '」超过 8MB，请压缩后再传'); return; }
          compressImageFile(f, function (dataUrl) {
            atts.push({ id: P.uid('at'), name: f.name, type: f.type || 'image/jpeg', dataUrl: dataUrl, size: Math.round(dataUrl.length * 0.75) });
            renderAtts();
          }, function () {
            // 环境不支持 canvas 压缩时降级为原图 base64
            var r = new FileReader();
            r.onload = function () { atts.push({ id: P.uid('at'), name: f.name, type: f.type || 'image/jpeg', dataUrl: r.result, size: f.size }); renderAtts(); };
            r.onerror = function () { toast('文件读取失败'); };
            r.readAsDataURL(f);
          });
        } else {
          if (f.size > 2 * 1024 * 1024) { toast('「' + f.name + '」超过 2MB，请压缩后再传'); return; }
          var reader = new FileReader();
          reader.onload = function () {
            atts.push({ id: P.uid('at'), name: f.name, type: f.type || 'file', dataUrl: reader.result, size: f.size });
            renderAtts();
          };
          reader.onerror = function () { toast('文件读取失败'); };
          reader.readAsDataURL(f);
        }
      });
      fileInput.value = '';
    });
    var upBtn = h('button', { class: 'btn btn-sm', type: 'button', onclick: function () { fileInput.click(); } }, '＋ 上传图片/文件');

    var actions = [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!company.value.trim() && !name.value.trim()) return toast('请填写保险公司或产品名称');
        var obj = {
          memberId: memberId, type: typeSel.value, name: name.value.trim(), company: company.value.trim(),
          amount: Number(amount.value) || 0, payStart: payStart.value || null, payEnd: payEnd.value || null,
          payFreq: payFreq.value, payDate: ins ? ins.payDate : '',
          channel: channel.value.trim(), payAccount: payAccount.value,
          payPeriodStart: ppStart.value || null, payPeriodEnd: ppEnd.value || null,
          remindMd: remindMdInput.value ? remindMdInput.value.substring(5) : null,
          remindFromYear: remindFromYear.value ? Number(remindFromYear.value) : null,
          remindToYear: remindToYear.value ? Number(remindToYear.value) : null,
          keyContent: keyContent.value.trim(), remark: remark.value.trim(),
          attachments: atts, payments: ins ? ins.payments : []
        };
        if (ins) { Object.assign(ins, obj); } else { obj.id = P.uid('ins'); obj.payments = []; D.insurances.push(obj); }
        save(); toast(ins ? '已更新' : '已添加'); closeModal(); renderInsurance();
      } }, '保存')
    ];
    if (ins) actions.push(h('button', { class: 'btn btn-danger', onclick: function () { delInsurance(ins.id); } }, '删除'));

    openModal(ins ? '编辑保险 · ' + m.name : '新增保险 · ' + m.name, h('div', {}, [
      field('保险种类', typeSel),
      field('产品名称（选填）', name),
      field('所属保险公司', company),
      field('金额（年保费，元）', amount, '用于首页“年度保费合计”统计'),
      h('div', { class: 'row2' }, [field('保障起', payStart), field('保障止', payEnd)]),
      h('div', { class: 'row2' }, [field('交费频率', payFreq), field('购买渠道', channel)]),
      field('交费账户', payAccount, '保费从哪个账户扣（用于你核对资金去向）'),
      h('div', { class: 'row2' }, [field('交费起', ppStart), field('交费止', ppEnd)]),
      periodHint,
      field('每年提醒日（月/日）', remindMdInput, '选好月日，每年这一天打开 APP 都会提醒你去交费（可忽略或标记已完成）'),
      h('div', { class: 'row2' }, [field('提醒起始年', remindFromYear), field('提醒截止年', remindToYear)]),
      h('div', { class: 'hint' }, '提醒只在「起始年–截止年」内触发。默认等于交费起止年（如交20年则提醒20年，交满后不再提醒）。例：缴费20年但保到70岁，只在这20年提醒即可。'),
      field('保障重点内容', keyContent, '如：交10年保30年，最高赔付50万'),
      field('附件（保障重点 / 条款）', h('div', {}, [upBtn, attBox]), '可上传图片或文件，单文件 ≤ 3MB，存为本地数据'),
      field('备注', remark, '其它想记的内容')
    ]), actions);
  }

  function insurancePaymentForm(insId, payId) {
    var ins = (D.insurances || []).filter(function (x) { return x.id === insId; })[0]; if (!ins) return;
    var pay = payId ? (ins.payments || []).filter(function (x) { return x.id === payId; })[0] : null;
    var date = input({ type: 'date', value: pay ? pay.date : P.todayYmd() });
    var curY = new Date().getFullYear();
    var amount = input({ type: 'number', step: '0.01', value: pay ? pay.amount : (ins.remindDoneYear === curY ? ins.amount : ''), placeholder: '交费金额' });
    var note = input({ value: pay ? pay.note : '', placeholder: '选填，如：续保 / 首期' });
    var budgetOpts = [{ value: '', label: '不关联预算' }].concat((D.budgets || []).map(function (b) { return { value: b.id, label: b.name }; }));
    var budgetSel = select({ value: pay ? (pay.budgetId || '') : '' }, budgetOpts);
    var nextRemind = input({ type: 'date', value: pay ? (pay.nextRemind || '') : (ins.remindMd ? '2000-' + ins.remindMd : ''), placeholder: '选月日' });
    var prevRemindMd = ins.remindMd;

    var actions = [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!amount.value) return toast('请输入交费金额');
        var bId = budgetSel.value || null;
        var rec = { id: pay ? pay.id : P.uid('p'), date: date.value || P.todayYmd(), amount: Number(amount.value) || 0, note: note.value.trim(), budgetLink: !!bId, budgetId: bId, nextRemind: nextRemind.value || null };
        ins.payments = ins.payments || [];
        if (pay) { var i = ins.payments.indexOf(pay); ins.payments[i] = rec; } else { ins.payments.push(rec); }
        // 更新提醒（月/日）：改了则重置“本年已完成”状态，下个提醒日再弹
        var md = nextRemind.value ? nextRemind.value.substring(5) : null;
        if (md) {
          ins.remindMd = md;
          ins.remindDoneYear = (md === prevRemindMd) ? ins.remindDoneYear : null;
        }
        save(); toast('已保存交费记录'); closeModal(); insuranceDetail(insId);
      } }, '保存')
    ];
    if (pay) actions.push(h('button', { class: 'btn btn-danger', onclick: function () {
      confirmDialog('删除交费记录', '确定删除该笔交费吗？', function () { ins.payments = (ins.payments || []).filter(function (x) { return x.id !== payId; }); save(); toast('已删除'); closeModal(); insuranceDetail(insId); });
    } }, '删除'));

    openModal(pay ? '编辑交费记录' : '记一笔交费 · ' + ins.type, h('div', {}, [
      h('div', { class: 'li-sub', style: { marginBottom: 10 } }, '成员：' + memberById(ins.memberId).name + ' · ' + ins.type + (ins.company ? '（' + ins.company + '）' : '')),
      field('交费日期', date),
      field('交费金额', amount),
      field('备注', note),
      field('关联预算', budgetSel, '关联后该笔交费会计入对应年度预算的已花费'),
      field('提醒日（月/日，可选）', nextRemind, '设置后每年这一天提醒；留空则不更改')
    ]), actions);
  }

  function claimForm(insId, claimId) {
    var ins = (D.insurances || []).filter(function (x) { return x.id === insId; })[0]; if (!ins) return;
    var cl = claimId ? (ins.claims || []).filter(function (x) { return x.id === claimId; })[0] : null;
    var date = input({ type: 'date', value: cl ? cl.date : P.todayYmd() });
    var amount = input({ type: 'number', step: '0.01', value: cl ? cl.amount : '', placeholder: '理赔金额（元）' });
    var reason = input({ value: cl ? cl.reason : '', placeholder: '如：甲状腺癌手术 / 肺炎住院' });
    var note = input({ value: cl ? cl.note : '', placeholder: '选填，如：轻症赔付、已到账' });

    var actions = [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-primary', onclick: function () {
        if (!amount.value) return toast('请输入理赔金额');
        var rec = { id: cl ? cl.id : P.uid('cl'), date: date.value || P.todayYmd(), amount: Number(amount.value) || 0, reason: reason.value.trim(), note: note.value.trim() };
        ins.claims = ins.claims || [];
        if (cl) { var i = ins.claims.indexOf(cl); ins.claims[i] = rec; } else { ins.claims.push(rec); }
        save(); toast(cl ? '已更新理赔记录' : '已添加理赔记录'); closeModal(); insuranceDetail(insId);
      } }, '保存')
    ];
    if (cl) actions.push(h('button', { class: 'btn btn-danger', onclick: function () {
      confirmDialog('删除理赔记录', '确定删除该笔理赔吗？累计理赔金额会相应减少。', function () { ins.claims = (ins.claims || []).filter(function (x) { return x.id !== claimId; }); save(); toast('已删除'); closeModal(); insuranceDetail(insId); });
    } }, '删除'));

    openModal(cl ? '编辑理赔记录' : '记一笔理赔 · ' + ins.type, h('div', {}, [
      h('div', { class: 'li-sub', style: { marginBottom: 10 } }, '成员：' + memberById(ins.memberId).name + ' · ' + ins.type + (ins.company ? '（' + ins.company + '）' : '')),
      field('理赔日期', date),
      field('理赔金额', amount, '计入该保单的累计理赔金额'),
      field('理赔事由', reason, '如：甲状腺癌手术 / 意外骨折 / 肺炎住院'),
      field('备注', note, '选填：如轻症赔付、社保报销后剩余部分、是否到账')
    ]), actions);
  }

  function delInsurance(id) {
    confirmDialog('删除保险', '确定删除该保险吗？相关交费记录与理赔记录也会一并删除。', function () {
      D.insurances = (D.insurances || []).filter(function (x) { return x.id !== id; }); save(); toast('已删除'); closeModal(); renderInsurance();
    });
  }

  /* ---------- 交费提醒（每年 MM-DD 循环，限定提醒年范围） ---------- */
  function inRemindYear(ins) {
    var curY = Number(P.todayYmd().substring(0, 4));
    if (ins.remindFromYear != null && curY < ins.remindFromYear) return false;
    if (ins.remindToYear != null && curY > ins.remindToYear) return false;
    return true;
  }
  function remindYearText(ins) {
    if (ins.remindFromYear != null && ins.remindToYear != null) return '（' + ins.remindFromYear + '–' + ins.remindToYear + '）';
    if (ins.remindFromYear != null) return '（' + ins.remindFromYear + '年起）';
    if (ins.remindToYear != null) return '（至' + ins.remindToYear + '年）';
    return '';
  }
  function isInsDue(ins) {
    if (!ins.remindMd) return false;
    if (!inRemindYear(ins)) return false; // 超出提醒年范围（如已交满20年）不再提醒
    var cur = P.todayYmd();
    var curY = cur.substring(0, 4);
    if (cur < (curY + '-' + ins.remindMd)) return false; // 今年的提醒日还没到
    return ins.remindDoneYear !== Number(curY);           // 今年还没标记完成
  }
  function dueInsurances() {
    var cur = P.todayYmd();
    var curY = cur.substring(0, 4);
    return (D.insurances || []).filter(function (ins) {
      if (!ins.remindMd) return false;
      if (!inRemindYear(ins)) return false;
      if (cur < (curY + '-' + ins.remindMd)) return false;
      return ins.remindDoneYear !== Number(curY);
    });
  }
  // 年度循环提醒，“下次提醒”即同一月日（年交/月交/季交都统一为每年这一天）
  function suggestNextRemind(ins) {
    return ins.remindMd || '';
  }
  // 打开 APP 时调用：弹出到期未交费的提醒
  function checkInsuranceReminders() {
    try {
      var due = dueInsurances();
      if (!due.length) return;
      var body = h('div', {}, [
        h('div', { class: 'li-sub', style: { marginBottom: 10 } }, '以下保险的交费时间已到，记得去交费～（点“忽略”后下次打开仍会提醒）')
      ]);
      due.forEach(function (ins) {
        var m = memberById(ins.memberId);
        var row = h('div', { class: 'remind-row' }, [
          h('div', { class: 'remind-main' }, [
            h('div', { class: 'li-title' }, [m.name + ' · ' + ins.type, ins.company ? h('span', { class: 'li-sub', style: { fontWeight: 600 } }, ' ' + ins.company) : null]),
            h('div', { class: 'li-sub' }, [money(ins.amount), ' /年', ' · 每年' + formatMd(ins.remindMd) + '提醒' + remindYearText(ins)])
          ]),
          h('div', { class: 'remind-acts' }, [
            h('button', { class: 'btn btn-sm', type: 'button', onclick: function () { closeModal(); toast('已忽略，下次打开仍会提醒'); } }, '忽略'),
            h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: function () { markInsuranceDone(ins.id); } }, '已完成')
          ])
        ]);
        body.appendChild(row);
      });
      openModal('⏰ 交费提醒（' + due.length + '）', body, [h('button', { class: 'btn', onclick: closeModal }, '稍后处理')]);
    } catch (e) { /* ignore */ }
  }
  // 标记已完成：记录已处理，并跳转到该保险详情页（可记交费 / 编辑更新；历史缴费记录始终保留）
  function markInsuranceDone(insId) {
    var ins = (D.insurances || []).filter(function (x) { return x.id === insId; })[0];
    if (!ins) return;
    ins.remindDoneYear = Number(P.todayYmd().substring(0, 4));
    save();
    closeModal();
    toast('已标记完成，去详情页记一笔交费或更新信息 💰');
    insuranceDetail(insId);
  }

  /* ---------- AI 分析 ---------- */
  function aiCard() {
    var all = D.educationFunds.concat(D.riskFunds);
    if (!all.length) return h('div', { class: 'ai-card' }, [h('p', {}, '暂无持仓，添加基金后可获得 AI 分析建议。')]);
    var totalMarket = 0, up = 0, down = 0, best = null, worst = null;
    var sectors = {};
    all.forEach(function (f) {
      var mv = C.fundMarketValue(f), p = C.fundProfit(f);
      totalMarket += mv;
      var pct = f.principal ? p / f.principal * 100 : 0;
      if (pct >= 0) up++; else down++;
      if (!best || pct > best.pct) best = { f: f, pct: pct };
      if (!worst || pct < worst.pct) worst = { f: f, pct: pct };
      var s = f.sector || '未分类';
      sectors[s] = (sectors[s] || 0) + mv;
    });
    var topSector = null, topVal = 0;
    Object.keys(sectors).forEach(function (s) { if (sectors[s] > topVal) { topVal = sectors[s]; topSector = s; } });
    var concentration = totalMarket ? topVal / totalMarket : 0;
    var suggestions = [];
    all.forEach(function (f) {
      var pct = f.principal ? C.fundProfit(f) / f.principal * 100 : 0;
      if (pct > 10) suggestions.push({ f: f, tag: 'tag-sell', text: '止盈/减仓', why: '累计收益 ' + pct.toFixed(1) + '% 偏高' });
      else if (pct < -5) suggestions.push({ f: f, tag: 'tag-buy', text: '考虑加仓', why: '回撤 ' + pct.toFixed(1) + '%' });
      else suggestions.push({ f: f, tag: 'tag-hold', text: '定投继续', why: '波动温和' });
    });
    var mood = up > down ? '市场情绪偏乐观（上涨标的居多）' : (down > up ? '市场情绪偏谨慎（下跌标的居多）' : '市场情绪中性');
    var riskNote = concentration > 0.5 ? ('⚠️ 板块「' + topSector + '」占比 ' + (concentration * 100).toFixed(0) + '%，集中度偏高，注意分散风险。') : '组合板块分布较均衡，分散度良好。';

    return h('div', { class: 'ai-card' }, [
      h('h4', {}, ['🤖 AI 市场分析']),
      h('div', { class: 'ai-sec' }, [h('div', { class: 'ai-h' }, '市场概况'), h('p', {}, mood + '。持仓 ' + all.length + ' 只，上涨 ' + up + ' / 下跌 ' + down + '。')]),
      h('div', { class: 'ai-sec' }, [h('div', { class: 'ai-h' }, '组合诊断'), h('p', {}, '总市值 ' + money(totalMarket) + '，最大板块「' + topSector + '」占 ' + (concentration * 100).toFixed(0) + '%。' + riskNote)]),
      h('div', { class: 'ai-sec' }, [h('div', { class: 'ai-h' }, '操作建议'),
        h('div', {}, suggestions.map(function (s) { return h('div', { style: { marginBottom: 6 } }, [h('span', { class: 'tag-sug ' + s.tag }, s.text), ' ', h('span', { class: 'li-sub' }, s.f.name + '（' + s.why + '）')]); }))]),
      h('div', { class: 'ai-sec' }, [h('div', { class: 'ai-h' }, '风险提示'), h('p', {}, '基金有波动，定投可平滑成本；以上为基于持仓的简单规则分析，非投资建议。' + (worst ? ('当前最弱：' + worst.f.name + '（' + worst.pct.toFixed(1) + '%）') : ''))])
    ]);
  }

  /* ---------- 全球股市指数 ---------- */
  function refreshIndices() {
    toast('正在获取全球股市指数…');
    C.fetchGlobalIndices(function (err, info) {
      if (!err && info && info.items && info.items.length) {
        D.settings.globalIndices = { items: info.items, date: info.date, time: info.time };
        save(); toast('全球指数已更新');
      } else {
        toast('自动获取失败，请检查网络');
      }
      showPage('invest');
    });
  }

  /* ---------- 上证指数（保留兼容） ---------- */
  function refreshSH() {
    toast('正在获取上证指数…');
    C.fetchSHIndex(function (err, info) {
      if (!err && info && info.value) {
        D.settings.shIndex = { value: info.value, pct: info.pct, date: info.date, manual: false };
        save(); toast('上证指数已更新：' + num(info.value));
      } else {
        var v = input({ type: 'number', step: '0.01', placeholder: '上证指数点位' });
        var p = input({ type: 'number', step: '0.01', placeholder: '涨跌幅%（可选）' });
        openModal('手动填写上证指数', h('div', {}, [field('指数点位', v), field('涨跌幅 %', p, '自动获取失败，可手动填写')]), [
          h('button', { class: 'btn', onclick: closeModal }, '取消'),
          h('button', { class: 'btn btn-primary', onclick: function () { D.settings.shIndex = { value: Number(v.value) || null, pct: p.value !== '' ? Number(p.value) : null, date: P.todayYmd(), manual: true }; save(); toast('已保存'); closeModal(); showPage('invest'); } }, '保存')
        ]);
      }
      showPage('invest');
    });
  }

  /* =========================================================
   * 历史记录（日历）
   * ========================================================= */
  function openHistory() {
    state.histSel = null;
    var body = h('div', {});
    function render() {
      body.innerHTML = '';
      var y = state.histYear, m = state.histMonth;
      var hasSet = {};
      D.currentFunds.forEach(function (r) {
        if (r.year !== y || r.month !== m) return;
        [].concat(r.largeExpenses || [], r.repayments || [], r.advances || []).forEach(function (x) {
          if (x.date && x.date.indexOf(y + '-' + P.pad2(m)) === 0) hasSet[x.date] = true;
        });
      });
      var first = new Date(y, m - 1, 1);
      var startDow = (first.getDay() + 6) % 7;
      var daysInMonth = new Date(y, m, 0).getDate();
      var cells = [];
      var dows = ['一', '二', '三', '四', '五', '六', '日'];
      dows.forEach(function (d) { cells.push(h('div', { class: 'cal-dow' }, d)); });
      for (var i = 0; i < startDow; i++) cells.push(h('div', { class: 'cal-cell out' }, ''));
      var today = P.todayYmd();
      for (var d = 1; d <= daysInMonth; d++) {
        var ds = y + '-' + P.pad2(m) + '-' + P.pad2(d);
        var cls = 'cal-cell' + (hasSet[ds] ? ' has' : '') + (ds === today ? ' today' : '') + (ds === state.histSel ? ' sel' : '');
        (function (ds) {
          cells.push(h('div', { class: cls, 'data-action': 'hist-pick', 'data-id': ds }, String(d)));
        })(ds);
      }
      var grid = h('div', { class: 'cal-grid' }, cells);
      var head = h('div', { class: 'cal-head' }, [
        h('button', { class: 'btn btn-sm', onclick: function () { var n = new Date(y, m - 2, 1); state.histYear = n.getFullYear(); state.histMonth = n.getMonth() + 1; render(); } }, '‹'),
        h('div', { style: { fontWeight: 800 } }, y + ' 年 ' + m + ' 月'),
        h('button', { class: 'btn btn-sm', onclick: function () { var n = new Date(y, m, 1); state.histYear = n.getFullYear(); state.histMonth = n.getMonth() + 1; render(); } }, '›')
      ]);
      body.appendChild(head); body.appendChild(grid);
      if (state.histSel) body.appendChild(histDetail(state.histSel));
    }
    render();
    openModal('📅 历史记录', h('div', {}, [body, h('div', { class: 'li-sub', style: { marginTop: 8 } }, '点击有圆点的日期查看当日明细')]), null);
  }
  function histPick(ds) { state.histSel = ds; openHistory(); }
  function histDetail(ds) {
    var rec = D.currentFunds.filter(function (r) { return ds.indexOf(r.year + '-' + P.pad2(r.month)) === 0; })[0];
    var daySpend = 0, rows = [];
    if (rec) {
      (rec.largeExpenses || []).forEach(function (e) { if (e.date === ds) { daySpend += Number(e.amount) || 0; rows.push('大额·' + (e.category || '其他') + ' ' + money(e.amount)); } });
      (rec.repayments || []).forEach(function (r) { if (r.date === ds) { daySpend += Number(r.amount) || 0; rows.push('还款·' + (r.platform || '') + '（' + channelLabel(r.channel || 'other') + '） ' + money(r.amount)); } });
      (rec.advances || []).forEach(function (a) { if (a.date === ds) { daySpend += Number(a.amount) || 0; rows.push('垫付·' + (a.purpose || '') + ' ' + money(a.amount)); } });
    }
    // 预算：当日实际付款额 & 当日摊销成本（按天均摊）
    var dayPay = 0, dayAmort = 0;
    (D.budgets || []).forEach(function (b) {
      (b.payments || []).forEach(function (p) { if (p.date === ds) dayPay += Number(p.amount) || 0; });
      var s = P.parseYmd(b.amortStart || b.estStart), e = P.parseYmd(b.amortEnd || b.estEnd), dd = P.parseYmd(ds);
      if (s && e && dd && dd >= s && dd <= e) dayAmort += C.budgetDailyAmort(b);
    });
    var box = h('div', { class: 'card', style: { marginTop: 12, boxShadow: 'none' } }, [
      h('div', { class: 'card-title' }, ['📌 ' + ds + ' 当日明细']),
      h('div', { class: 'li-sub' }, '当日支出合计：' + money(daySpend)),
      h('div', { class: 'li-sub', style: { marginTop: 4 } }, [
        h('span', { class: 'budget-day-pay' }, '预算实际付款 ' + money(dayPay)),
        h('span', { class: 'budget-day-amort' }, '预算摊销成本 ' + money(dayAmort))
      ]),
      rec ? h('div', { class: 'li-sub' }, '当月期末余额：' + money(rec.closingBalance)) : null,
      h('div', { class: 'li-sub', style: { marginTop: 4 } }, '存钱罐总额快照：' + money(C.depositTotal(D))),
      h('div', { class: 'li-sub' }, '投资市值：' + money(C.portfolioStat(D.educationFunds).market + C.portfolioStat(D.riskFunds).market)),
      rows.length ? h('div', { style: { marginTop: 8 } }, rows.map(function (t) { return h('div', { class: 'list-item', style: { marginBottom: 5 } }, [h('div', { class: 'li-main' }, [h('div', { class: 'li-title', style: { fontSize: 14 } }, t)])]); })) : h('div', { class: 'muted', style: { marginTop: 6 } }, '当日无消费记录')
    ]);
    return box;
  }

  /* =========================================================
   * 统计分析
   * ========================================================= */
  function openStats() {
    var mode = '本月';
    var year = state.flowYear, month = state.flowMonth;
    var modeSel = select({ value: '本月' }, [{ value: '本月', label: '本月' }, { value: '本年', label: '本年' }, { value: '自定义', label: '自定义年月' }]);
    var picker = h('div', { style: { display: 'none' } }, [
      h('div', { class: 'row2' }, [field('年份', (function () { var y = input({ type: 'number', value: year }); y.id = 'st-y'; return y; })()), field('月份', (function () { var m = input({ type: 'number', value: month, placeholder: '1-12' }); m.id = 'st-m'; return m; })())])
    ]);
    modeSel.onchange = function () { picker.style.display = modeSel.value === '自定义' ? 'block' : 'none'; };
    var chartBox = h('div', {});
    function render() {
      var y = year, m = month;
      if (modeSel.value === '本年') { y = state.flowYear; }
      else if (modeSel.value === '自定义') { y = Number(q('#st-y').value) || year; m = Number(q('#st-m').value) || month; }
      if (modeSel.value === '本年') {
        var mm = C.yearMonthConsumption(D, y);
        chartBox.innerHTML = '';
        chartBox.appendChild(h('div', { class: 'card-title' }, ['📊 ' + y + ' 年各月消费']));
        chartBox.appendChild(h('div', { class: 'chart-wrap', html: CH.bar(mm.map(function (x) { return { label: x.month + '月', value: x.value }; }), { color: '#3FA796' }) }));
      } else {
        var cats = C.monthCategoryBreakdown(D, y, m);
        var items = Object.keys(cats).map(function (k, i) { return { label: k, value: cats[k], color: CH.colors[i % CH.colors.length] }; });
        chartBox.innerHTML = '';
        chartBox.appendChild(h('div', { class: 'card-title' }, ['🥧 ' + y + ' 年 ' + m + ' 月消费结构']));
        chartBox.appendChild(h('div', { class: 'chart-wrap', html: CH.pie(items) }));
      }
    }
    modeSel.onchange = function () { picker.style.display = modeSel.value === '自定义' ? 'block' : 'none'; render(); };
    var body = h('div', {}, [field('统计范围', modeSel), picker, h('div', { id: 'stats-chart' }, chartBox)]);
    openModal('📊 消费统计', body, [h('button', { class: 'btn btn-primary btn-block', onclick: function () { render(); } }, '查看')]);
    render();
  }

  /* =========================================================
   * 设置 / 数据
   * ========================================================= */
  function openSettings() {
    var thr = input({ type: 'number', step: '1', value: D.settings.largeExpenseThreshold });
    var warn = input({ type: 'number', step: '0.05', value: D.settings.budgetWarnRatio, placeholder: '0.2' });
    var sh = input({ type: 'number', step: '0.01', value: D.settings.shIndex && D.settings.shIndex.value != null ? D.settings.shIndex.value : '' });
    var body = h('div', {}, [
      field('大额支出阈值', thr, '单笔达到该金额记为大额支出'),
      field('预算告急比例', warn, '剩余额度低于该比例时提醒（如 0.2）'),
      field('上证指数（手动）', sh, '可手动填写，或在投资页点🔄自动获取'),
      h('div', { class: 'section-label', style: { margin: '14px 0 6px' } }, ['数据管理']),
      h('div', { class: 'hint', style: { marginBottom: '6px' } }, ['换手机 / 换链接迁移数据：在旧版点「复制数据」→ 切到新版点「粘贴导入」即可，最稳。']),
      h('div', { class: 'btn-row' }, [
        h('button', { class: 'btn', 'data-action': 'copy-data' }, '📋 复制数据'),
        h('button', { class: 'btn', 'data-action': 'paste-import' }, '📥 粘贴导入'),
        h('button', { class: 'btn', 'data-action': 'export-json' }, '⤓ 导出文件'),
        h('button', { class: 'btn', 'data-action': 'import-json' }, '⤒ 导入文件'),
        h('button', { class: 'btn', 'data-action': 'sample' }, '🌱 示例'),
        h('button', { class: 'btn btn-danger', 'data-action': 'clear' }, '🗑 清空')
      ])
    ]);
    openModal('⚙️ 设置', body, [h('button', { class: 'btn btn-primary btn-block', onclick: function () {
      D.settings.largeExpenseThreshold = Number(thr.value) || 500;
      D.settings.budgetWarnRatio = Number(warn.value) || 0.2;
      if (sh.value !== '') D.settings.shIndex = { value: Number(sh.value), pct: null, date: P.todayYmd(), manual: true };
      save(); toast('已保存'); closeModal();
    } }, '保存设置')]);
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'xiaoman-data-' + P.todayYmd() + '.json' });
    document.body.appendChild(a); a.click(); a.remove(); toast('已导出');
    setBackupSnooze(); removeBackupHint();
  }
  function importJSON() {
    var inp = h('input', { type: 'file', accept: '.json', style: { display: 'none' } });
    inp.onchange = function () {
      var file = inp.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var obj = JSON.parse(reader.result);
          if (!isValidData(obj)) { toast('文件不是有效的账本数据'); return; }
          confirmDialog('导入数据', '将覆盖当前所有数据，确定导入？', function () { P.setData(obj); D = P.getData(); toast('导入成功'); showPage(state.page); });
        } catch (e) { toast('文件解析失败'); }
      };
      reader.readAsText(file);
    };
    document.body.appendChild(inp); inp.click(); inp.remove();
  }
  // 校验是否为本应用导出的数据结构
  function isValidData(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    var keys = ['profile', 'settings', 'insurances', 'budgets', 'flows', 'deposits', 'advances', 'investments', 'categories', 'funds', 'cash'];
    return keys.some(function (k) { return k in obj; });
  }
  function closeAllModals() { qa('.modal-mask').forEach(function (m) { m.remove(); }); }
  // 复制全部数据为文本（手机跨源迁移最稳的方式）
  function copyDataText() {
    var text = JSON.stringify(D);
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('已复制全部数据，去新版本「粘贴导入」'); setBackupSnooze(); removeBackupHint();
      }, function () { showCopyBox(text); });
    } else { showCopyBox(text); }
  }
  function showCopyBox(text) {
    var ta = h('textarea', { class: 'input', style: { height: '42vh', fontSize: '12px' } });
    ta.value = text;
    var body = h('div', {}, [
      h('div', { class: 'hint' }, ['全选下方内容并复制，再到新版本「设置 → 粘贴导入」粘贴。']),
      ta
    ]);
    openModal('复制数据', body, [
      h('button', { class: 'btn btn-primary btn-block', onclick: function () { ta.select(); try { document.execCommand('copy'); } catch (e) {} toast('已全选，请手动复制'); } }, '全选并复制')
    ]);
  }
  // 从文本粘贴导入（与 copyDataText 配对，跨源迁移用）
  function pasteImport() {
    var ta = h('textarea', { class: 'input', style: { height: '42vh', fontSize: '12px' }, placeholder: '在此粘贴从旧版本「复制数据」得到的文本' });
    var body = h('div', {}, [
      h('div', { class: 'hint' }, ['把旧版本复制的内容粘贴到此处，将覆盖当前所有数据。']),
      ta
    ]);
    openModal('粘贴导入', body, [
      h('button', { class: 'btn', onclick: closeModal }, '取消'),
      h('button', { class: 'btn btn-danger', onclick: function () {
        var v = (ta.value || '').trim(); if (!v) { toast('请先粘贴数据'); return; }
        var obj; try { obj = JSON.parse(v); } catch (e) { toast('文本不是有效数据'); return; }
        if (!isValidData(obj)) { toast('数据格式不正确'); return; }
        P.setData(obj); D = P.getData(); toast('导入成功'); closeAllModals(); showPage(state.page);
      } }, '导入')
    ]);
  }
  function loadSample() {
    confirmDialog('加载示例数据', '将覆盖当前数据并写入一套演示数据，确定？', function () { P.setData(P.sampleData()); D = P.getData(); toast('已加载示例数据'); showPage(state.page); }, '加载');
  }
  function clearData() {
    confirmDialog('清空数据', '将删除全部数据且无法恢复，确定？', function () { P.setData(P.defaultData()); D = P.getData(); toast('已清空'); showPage(state.page); }, '清空');
  }

  /* =========================================================
   * 行点击 → 修改 / 删除 动作面板
   * ========================================================= */
  function spacer() { return h('span', { style: { flex: 1 } }); }
  function openItemActions(kind, id) {
    var r = getFlowRec(state.flowYear, state.flowMonth);
    if (kind === 'deposit') {
      depositDetail(id);
      return;
    }
    if (kind === 'income') {
      var it = r.incomes.filter(function (x) { return x.id === id; })[0];
      openActionSheet('收入记录', [
        { label: '✏️ 修改', onClick: function () { incomeForm(it); } },
        { label: '🗑 删除', cls: 'danger', onClick: function () { delIncome(id); } }
      ]);
      return;
    }
    if (kind === 'large') {
      var e = r.largeExpenses.filter(function (x) { return x.id === id; })[0];
      openActionSheet('大额支出', [
        { label: '✏️ 修改', onClick: function () { consumptionForm(e); } },
        { label: '🗑 删除', cls: 'danger', onClick: function () { delLarge(id); } }
      ]);
      return;
    }
    if (kind === 'repay') {
      var rp = r.repayments.filter(function (x) { return x.id === id; })[0];
      openActionSheet('还款记录', [
        { label: '✏️ 修改', onClick: function () { repayForm(rp); } },
        { label: '🗑 删除', cls: 'danger', onClick: function () { delRepay(id); } }
      ]);
      return;
    }
    if (kind === 'advance') {
      var found = findAdvance(id);
      if (!found) { toast('记录不存在'); return; }
      var av = found.a;
      var items = [
        { label: '✏️ 修改', onClick: function () { advanceForm(av); } },
        { label: '🗑 删除', cls: 'danger', onClick: function () { delAdvance(id); } }
      ];
      if (av.reimbursed) items.unshift({ label: '↩️ 撤销报销', onClick: function () { doReimburse(id); } });
      else items.unshift({ label: '✅ 标记为已报销', onClick: function () { doReimburse(id); } });
      openActionSheet('垫付记录', items);
      return;
    }
    if (kind === 'invest') {
      var found = findInvestExp(id);
      if (!found) { toast('记录不存在'); return; }
      var inv = found.entry;
      var periodLabel = (inv.startYM === (inv.endYM || inv.startYM)) ? inv.startYM : (inv.startYM + ' ~ ' + inv.endYM);
      openActionSheet('投资支出 · ' + periodLabel, [
        { label: '✏️ 修改', onClick: function () { investExpenseForm(inv); } },
        { label: '🗑 删除', cls: 'danger', onClick: function () { delInvest(id); } }
      ]);
      return;
    }
  }

  /* =========================================================
   * 事件委托
   * ========================================================= */
  function handleAction(action, el) {
    var id = el && el.getAttribute ? el.getAttribute('data-id') : null;
    switch (action) {
      case 'add-deposit': addDepositForm(); break;
      case 'row-actions': openItemActions(el.getAttribute('data-kind'), id); break;
      case 'add-income': incomeForm(null); break;
      case 'add-consumption': addConsumptionForm(); break;
      case 'edit-flow-month': editFlowMonthForm(); break;
      case 'preview-flow-balance': flowBalancePreview(); break;
      case 'open-opening-history': openingHistory(); break;
      case 'undo-flow-month': undoFlowMonth(); break;
      case 'init-flow-month': ensureFlowRec(state.flowYear, state.flowMonth); renderFlow(); break;
      case 'flow-prev': stepMonth(-1); break;
      case 'flow-next': stepMonth(1); break;
      case 'add-budget': budgetForm(); break;
      case 'edit-budget': budgetForm(id); break;
      case 'view-budget-detail': budgetDetail(id); break;
      case 'add-budget-payment': budgetPaymentForm(el.getAttribute('data-bid'), null); break;
      case 'edit-budget-payment': budgetPaymentForm(el.getAttribute('data-bid'), el.getAttribute('data-pid')); break;
      case 'del-budget': delBudget(id); break;
      case 'manage-categories': categoryManager(); break;
      case 'manage-credits': manageCredits(); break;
      case 'toggle-budget-cat':
        var ck = el && el.getAttribute ? el.getAttribute('data-cat-id') : null;
        if (ck) { state.budgetExpanded[ck] = !state.budgetExpanded[ck]; renderBudget(); }
        break;
      case 'year-prev': D.viewYear--; save(); renderBudget(); break;
      case 'year-next': D.viewYear++; save(); renderBudget(); break;
      case 'add-fund': { var kd = el.getAttribute('data-kind'); state.invTab = kd === 'risk' ? 'risk' : 'education'; fundForm(); break; }
      case 'edit-fund': { var kf = el.getAttribute('data-kind'); state.invTab = kf === 'risk' ? 'risk' : 'education'; fundForm(id); break; }
      case 'update-amount': { var ka = el.getAttribute('data-kind'); state.invTab = ka === 'risk' ? 'risk' : 'education'; updateAmount(id, ka); break; }
      case 'fund-tx': { var kt = el.getAttribute('data-kind'); state.invTab = kt === 'risk' ? 'risk' : 'education'; showTx(id, kt); break; }
      case 'fund-history': { var kh = el.getAttribute('data-kind'); state.invTab = kh === 'risk' ? 'risk' : 'education'; showFundHistory(id, kh); break; }
      case 'inv-tab': state.invTab = id; renderInvest(); break;
      case 'run-ai': state.aiOpen = !state.aiOpen; renderInvest(); break;
      case 'refresh-sh': refreshSH(); break;
      case 'refresh-indices': refreshIndices(); break;
      case 'open-settings': openSettings(); break;
      case 'open-history': openHistory(); break;
      case 'upload-avatar': { var inp = q('#avatarInput'); if (inp) inp.click(); break; }
      case 'edit-name': {
        var nn = prompt('修改账本名称', (D.profile && D.profile.name) || 'beibei的账本');
        if (nn != null && nn.trim() !== '') { D.profile = D.profile || {}; D.profile.name = nn.trim(); save(); renderBrand(); }
        break;
      }
      case 'edit-motto': {
        var mm = prompt('修改签名', (D.profile && D.profile.motto) || '慢慢变富');
        if (mm != null && mm.trim() !== '') { D.profile = D.profile || {}; D.profile.motto = mm.trim(); save(); renderBrand(); }
        break;
      }
      case 'open-stats': openStats(); break;
      case 'hist-pick': histPick(id); break;
      case 'export-json': exportJSON(); break;
      case 'import-json': importJSON(); break;
      case 'copy-data': copyDataText(); break;
      case 'paste-import': pasteImport(); break;
      case 'sample': loadSample(); break;
      case 'clear': clearData(); break;
      case 'ins-open-member': state.insMember = id; renderInsurance(); break;
      case 'ins-add-member': memberForm(null); break;
      case 'ins-edit-member': memberForm(id); break;
      case 'explain-monthly': explainMonthly(); break;
      case 'ins-back': state.insMember = null; renderInsurance(); break;
      case 'add-insurance': insuranceForm(null); break;
      case 'ins-detail': insuranceDetail(id); break;
      case 'edit-insurance': insuranceForm(id); break;
      case 'del-insurance': delInsurance(id); break;
      case 'ins-add-payment': insurancePaymentForm(el.getAttribute('data-ins'), null); break;
      case 'ins-edit-payment': insurancePaymentForm(el.getAttribute('data-ins'), el.getAttribute('data-pay')); break;
      case 'ins-add-claim': claimForm(el.getAttribute('data-ins'), null); break;
      case 'ins-edit-claim': claimForm(el.getAttribute('data-ins'), el.getAttribute('data-claim')); break;
      case 'ins-month-detail': insuranceMonthDetail(Number(el.getAttribute('data-month'))); break;
      case 'dismiss-install-hint': { var hn = q('.install-hint'); if (hn) hn.parentNode.removeChild(hn); break; }
      case 'backup-now': { exportJSON(); break; }
      case 'backup-later': { setBackupSnooze(); removeBackupHint(); break; }
    }
  }
  function stepMonth(delta) {
    var n = new Date(state.flowYear, state.flowMonth - 1 + delta, 1);
    state.flowYear = n.getFullYear(); state.flowMonth = n.getMonth() + 1; renderFlow();
  }

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-action]');
      if (t && t.getAttribute('data-action')) { handleAction(t.getAttribute('data-action'), t); return; }
      var nav = e.target.closest('.nav-item[data-page]');
      if (nav) { showPage(nav.getAttribute('data-page')); return; }
    });
    q('#menuBtn').addEventListener('click', function () { q('.app').classList.toggle('nav-open'); });
    q('#scrim').addEventListener('click', function () { q('.app').classList.remove('nav-open'); });
    var avInp = q('#avatarInput'); if (avInp) avInp.addEventListener('change', onAvatarPick);
  }

  /* ---------- 侧边栏品牌区（用户头像 / 名称 / 签名） ---------- */
  function renderBrand() {
    var p = D.profile || { name: 'beibei的账本', avatar: '', motto: '慢慢变富' };
    var av = q('#brandAvatar');
    if (av) {
      if (p.avatar) { av.style.backgroundImage = 'url(' + p.avatar + ')'; av.textContent = ''; }
      else { av.style.backgroundImage = ''; av.textContent = '🙂'; }
    }
    var nm = q('#brandName'); if (nm) nm.textContent = p.name || 'beibei的账本';
    var mt = q('#brandMotto'); if (mt) mt.textContent = p.motto || '慢慢变富';
  }
  function onAvatarPick(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        // 缩放压缩，避免 base64 过大撑爆 localStorage
        var size = 160, canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        var ctx = canvas.getContext('2d');
        var s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        var data = canvas.toDataURL('image/jpeg', 0.82);
        D.profile = D.profile || {}; D.profile.avatar = data; save(); renderBrand();
        toast('头像已更新');
      };
      img.onerror = function () { toast('图片读取失败'); };
      img.src = reader.result;
    };
    reader.onerror = function () { toast('文件读取失败'); };
    reader.readAsDataURL(file);
    e.target.value = ''; // 允许重复选择同一张
  }

  /* ---------- PWA：注册 Service Worker（离线 + 可安装到主屏幕） ---------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    // 监听 SW 消息：当页面实际运行在“缓存兜底”模式（预览链接过期 / 离线）时，
    // SW 会发 PFW_STALE，前端弹出横幅，避免用户在不知情下一直用旧版（旧版可能含已修复的 bug）
    if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e && e.data && e.data.type === 'PFW_STALE') showStaleBanner();
      });
    }
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
  var _staleShown = false;
  function showStaleBanner() {
    if (_staleShown) return; _staleShown = true;
    try {
      var bn = h('div', { class: 'stale-banner', onclick: function () { if (bn.parentNode) bn.parentNode.removeChild(bn); } }, [
        h('span', { html: '⚠️ 暂时使用<strong>本机缓存版本</strong>运行，数据仍安全保存在本机。通常是网络波动或预览链接临时失效，正在自动重试恢复… 点此关闭。' })
      ]);
      document.body.appendChild(bn);
      startStaleRecheck(bn);
    } catch (e) {}
  }
  // 黄条显示后定期探测：网络恢复（响应不带离线标记）时自动撤掉黄条并提示刷新
  function startStaleRecheck(bn) {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var url = location.pathname + location.search + (location.search ? '&' : '?') + '_pfwchk=' + Date.now();
      fetch(url, { cache: 'no-store' }).then(function (r) {
        if (r && r.status >= 200 && r.status < 400 && r.status !== 401 && !r.headers.get('X-PFW-Stale')) {
          clearInterval(timer);
          if (bn.parentNode) bn.parentNode.removeChild(bn);
          toast('网络已恢复，下拉刷新即可更新到最新版');
        } else if (tries >= 20) clearInterval(timer);
      }).catch(function () { if (tries >= 20) clearInterval(timer); });
    }, 15000);
  }

  /* ---------- 备份提醒：每 30 天提示导出一次 JSON ---------- */
  var BACKUP_KEY = 'pfw_backup_remind';
  var BACKUP_GAP = 30 * 86400000;
  function setBackupSnooze() { try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch (e) {} }
  function removeBackupHint() { var b = q('.backup-hint'); if (b) b.parentNode.removeChild(b); }
  function maybeShowBackupHint() {
    try {
      var last = Number(localStorage.getItem(BACKUP_KEY) || 0);
      if (last && (Date.now() - last) < BACKUP_GAP) return;
      var hint = h('div', { class: 'install-hint backup-hint' }, [
        h('span', { html: '💾 每月备份一次更安心：导出 JSON 存到手机，链接失效也不怕。' }),
        h('button', { class: 'btn-mini', 'data-action': 'backup-now', html: '现在备份' }),
        h('button', { class: 'install-hint-close', 'data-action': 'backup-later', html: '✕', title: '以后再说' })
      ]);
      document.body.appendChild(hint);
    } catch (e) {}
  }

  /* ---------- PWA：首次使用提示「添加到主屏幕」 ---------- */
  function maybeShowInstallHint() {
    try {
      var key = 'pfw_pwa_hint';
      if (localStorage.getItem(key)) return;
      // iOS Safari 不会弹安装条，需手动引导；其它浏览器点地址栏右侧菜单安装
      var isIOS = /iP(ad|hone|od)/.test(navigator.userAgent) ||
        (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
      var hint = h('div', { class: 'install-hint' }, [
        isIOS
          ? h('span', { html: '📲 想当 App 用？点 <b>分享</b> 按钮 → <b>添加到主屏幕</b>' })
          : h('span', { html: '📲 想当 App 用？点浏览器菜单（⋮ / 分享）→ <b>安装到主屏幕</b>' }),
        h('button', {
          class: 'install-hint-close', 'data-action': 'dismiss-install-hint',
          html: '✕', title: '知道了'
        })
      ]);
      document.body.appendChild(hint);
      localStorage.setItem(key, '1');
    } catch (e) {}
  }

  /* ---------- 定投自动执行 ---------- */
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); } // m 为 0 基
  // 返回 from(不含) ~ to(含) 之间的所有应定投日期（YYYY-MM-DD）
  function scheduledDatesSince(freq, from, to, day) {
    var out = [];
    if (freq === '每月') {
      var dnum = Math.min(31, Math.max(1, parseInt(day, 10) || 1));
      var y = from.getFullYear(), m = from.getMonth();
      function curMonth() { var dim = daysInMonth(y, m); return new Date(y, m, Math.min(dnum, dim), 0, 0, 0, 0); }
      var c = curMonth();
      if (c <= from) { m++; if (m > 11) { m = 0; y++; } c = curMonth(); }
      while (c <= to) { out.push(P.ymd(c)); y = c.getFullYear(); m = c.getMonth() + 1; if (m > 11) { m = 0; y++; } c = curMonth(); }
    } else if (freq === '每周') {
      var wd = parseInt(day, 10) % 7; // 1=周一..7=周日 → JS getDay 0=周日
      var c2 = new Date(from); c2.setHours(0, 0, 0, 0); c2.setDate(c2.getDate() + 1);
      while (c2 <= to) { if (c2.getDay() === wd) out.push(P.ymd(c2)); c2.setDate(c2.getDate() + 1); }
    } else if (freq === '每工作日') {
      var c3 = new Date(from); c3.setHours(0, 0, 0, 0); c3.setDate(c3.getDate() + 1);
      while (c3 <= to) { var dow = c3.getDay(); if (dow >= 1 && dow <= 5) out.push(P.ymd(c3)); c3.setDate(c3.getDate() + 1); }
    }
    return out;
  }
  // 应用启动时调用：补录自上次自动定投以来的所有到期买入
  function runAutoInvest() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var maxFrom = new Date(today); maxFrom.setDate(maxFrom.getDate() - 400); // 最多往前补 400 天，避免一次灌爆
    var added = 0;
    ['educationFunds', 'riskFunds'].forEach(function (key) {
      (D[key] || []).forEach(function (f) {
        if (!f.isInvest) return;
        var amt = Number(f.investAmount) || 0;
        if (amt <= 0) return;
        var freq = f.investFreq; if (!freq) return;
        var last = f.lastAutoInvest ? P.parseYmd(f.lastAutoInvest) : null;
        var base = last ? new Date(last) : (f.tradeDate ? P.parseYmd(f.tradeDate) : null);
        var from = base ? new Date(base) : null;
        // 已手动记录的交易日期之后才补录，避免重复
        var lastTxDate = null;
        (f.transactions || []).forEach(function (t) { if (!lastTxDate || t.date > lastTxDate) lastTxDate = t.date; });
        if (lastTxDate) { var lt = P.parseYmd(lastTxDate); if (!from || lt > from) from = lt; }
        if (!from || from < maxFrom) from = new Date(maxFrom);
        from.setHours(0, 0, 0, 0);
        var dates = scheduledDatesSince(freq, from, today, f.investDay);
        if (dates.length > 60) dates = dates.slice(dates.length - 60); // 硬上限，防止极端情况
        f.transactions = f.transactions || [];
        dates.forEach(function (dStr) {
          f.transactions.push({ id: P.uid('t'), type: '买入', amount: amt, date: dStr, auto: true });
          added++;
        });
        if (dates.length) { C.recomputePrincipal(f); f.lastAutoInvest = dates[dates.length - 1]; }
      });
    });
    if (added) save();
    return added;
  }

  /* ---------- 初始化 ---------- */
  function     init() {
    D = P.getData();
    bindEvents();
    renderBrand();
    registerSW();
    maybeShowInstallHint();
    maybeShowBackupHint();
    var autoAdded = runAutoInvest();
    showPage('home');
    checkInsuranceReminders();
    if (autoAdded > 0) toast('已自动补录 ' + autoAdded + ' 笔定投');
    if (!D.settings.shIndex || D.settings.shIndex.value == null) {
      C.fetchSHIndex(function (err, info) {
        if (!err && info && info.value) { D.settings.shIndex = { value: info.value, pct: info.pct, date: info.date, manual: false }; save(); if (state.page === 'invest') renderInvest(); }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // 暴露给测试
  global.__APP__ = { showPage: showPage, handleAction: handleAction, state: state, renderFlow: renderFlow, renderBudget: renderBudget, renderInvest: renderInvest, renderInsurance: renderInsurance, runAutoInvest: runAutoInvest, scheduledDatesSince: scheduledDatesSince, recomputePrincipal: C.recomputePrincipal, investExpenseForMonth: C.investExpenseForMonth, investExpsForMonth: C.investExpsForMonth, findAdvance: findAdvance, collectPendingAdvances: collectPendingAdvances, returnAdvanceToChannel: returnAdvanceToChannel, undoReturnAdvance: undoReturnAdvance, channelLabel: channelLabel, doReimburse: doReimburse, delAdvance: delAdvance, isInsDue: isInsDue, dueInsurances: dueInsurances, checkInsuranceReminders: checkInsuranceReminders, markInsuranceDone: markInsuranceDone, suggestNextRemind: suggestNextRemind, payAccountLabel: payAccountLabel, periodYears: periodYears, formatMd: formatMd, claimTotal: claimTotal, remindYearText: remindYearText, inRemindYear: inRemindYear, openAttachmentPreview: openAttachmentPreview, D: function () { return D; } };
})(typeof window !== 'undefined' ? window : this);
