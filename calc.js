/* ============================================================
 * 个人财务工作台 — 计算逻辑
 * 依赖 data.js (window.PFW)
 * ============================================================ */
(function (global) {
  'use strict';
  var PFW = global.PFW;
  var D = global.PFW;

  /* ---------- 流动资金（按月） ---------- */
  function sum(arr, f) {
    if (!arr) return 0;
    var t = 0; for (var i = 0; i < arr.length; i++) t += Number(f ? f(arr[i]) : arr[i].amount) || 0;
    return t;
  }

  function monthIncome(rec) {
    // 本月收入 = 新增资金 + 已报销垫付
    // 仅“流动资金”渠道的报销算作流动资金收入；
    // 从存钱罐垫付的报销回到存钱罐账户、从微信零钱/余额宝/银行/其他垫付的报销回到对应账户余额，均不计流动资金收入
    var inc = sum(rec.incomes);
    var reimb = sum(rec.advances, function (a) { return (a.reimbursed && a.channel === '流动资金') ? a.amount : 0; });
    return inc + reimb;
  }
  function largeExpenseTotal(rec) { return sum(rec.largeExpenses); }
  function repaymentTotal(rec) { return sum(rec.repayments); }
  function advanceTotal(rec) { return sum(rec.advances); }
  function advanceUnreimbursed(rec) {
    // 统计“流动资金/微信零钱/余额宝/银行/其他”渠道的未报销垫付；从存钱罐垫付的不影响流动资金结余
    return sum(rec.advances, function (a) { return (!a.reimbursed && a.channel !== '存钱罐') ? a.amount : 0; });
  }
  // 投资支出：按月段记录（不绑定具体日期），可跨多月；跨多月按月均摊计入每月支出
  function ymMonths(s, e) {
    var a = String(s).split('-'), b = String(e).split('-');
    return Math.max(1, (Number(b[0]) * 12 + Number(b[1])) - (Number(a[0]) * 12 + Number(a[1])) + 1);
  }
  // 遍历所有账本，返回覆盖到 (y,m) 的投资支出（含该月应摊金额）
  function investExpsForMonth(data, y, m) {
    var key = y + '-' + (m < 10 ? '0' + m : '' + m);
    var out = [];
    (data.currentFunds || []).forEach(function (rec) {
      (rec.investExps || []).forEach(function (e) {
        var s = e.startYM || (rec.year + '-' + (rec.month < 10 ? '0' + rec.month : rec.month));
        var en = e.endYM || s;
        if (s <= key && key <= en) {
          var months = ymMonths(s, en);
          out.push({ entry: e, rec: rec, allocated: (Number(e.amount) || 0) / months });
        }
      });
    });
    return out;
  }
  // 某月「投资支出」应计入总额（按时间段均摊）
  function investExpenseForMonth(data, y, m) {
    var t = 0;
    investExpsForMonth(data, y, m).forEach(function (it) { t += it.allocated; });
    return t;
  }

  // 其他日常消费（小额未记账）＝ 期初 ＋ 收入(含报销) − 期末(＝次月期初) − 大额 − 还款 − 投资支出 − 垫付(未报销·流动资金)
  // 次月未建立时期末未知，返回 null（界面提示“待录入次月期初后计算”）
  function otherDaily(rec, data) {
    data = data || (typeof D !== 'undefined' ? D.getData() : null);
    if (!data) return null;
    var closing = closingOf(data, rec);
    if (closing == null) return null;
    return (Number(rec.openingBalance) || 0)
      + monthIncome(rec)
      - closing
      - largeExpenseTotal(rec)
      - repaymentTotal(rec)
      - investExpenseForMonth(data, rec.year, rec.month)
      - advanceUnreimbursed(rec);
  }
  // 本月消费 = 大额 + 还款 + 投资支出 + 其他日常
  function monthConsumption(rec, data) {
    var other = otherDaily(rec, data);
    return other == null ? null : largeExpenseTotal(rec) + repaymentTotal(rec) + investExpenseForMonth(data, rec.year, rec.month) + other;
  }

  /* ---------- 流动资金：当前可用总额（最新已知余额） ---------- */
  function latestFlowRec(data) {
    if (!data.currentFunds.length) return null;
    var sorted = data.currentFunds.slice().sort(function (a, b) {
      return (a.year - b.year) || (a.month - b.month);
    });
    return sorted[sorted.length - 1];
  }
  function nextRec(data, rec) {
    var ny = rec.month === 12 ? rec.year + 1 : rec.year;
    var nm = rec.month === 12 ? 1 : rec.month + 1;
    return data.currentFunds.filter(function (r) { return r.year === ny && r.month === nm; })[0] || null;
  }
  // 期末余额 = 次月期初（次月未建立则为 null）
  function closingOf(data, rec) {
    data = data || (typeof D !== 'undefined' ? D.getData() : null);
    if (!data || !rec) return null;
    var nx = nextRec(data, rec);
    return nx ? (Number(nx.openingBalance) || 0) : null;
  }
  // 实时结余估算（不依赖次月期初）：期初 + 收入 - 已记录流出
  // 已记录流出 = 大额支出 + 还款资金 + 未报销垫付（流动资金渠道）
  function monthBalanceEstimate(rec, data) {
    data = data || (typeof D !== 'undefined' ? D.getData() : null);
    if (!rec || !data) return 0;
    return (Number(rec.openingBalance) || 0)
      + monthIncome(rec)
      - largeExpenseTotal(rec)
      - repaymentTotal(rec)
      - investExpenseForMonth(data, rec.year, rec.month)
      - advanceUnreimbursed(rec);
  }
  function flowAvailable(data) {
    data = data || (typeof D !== 'undefined' ? D.getData() : null);
    if (!data) return 0;
    var rec = latestFlowRec(data);
    if (!rec) return 0;
    var nx = nextRec(data, rec);
    // 有次月 → 期末（次月期初）；否则按实时估算
    return nx ? (Number(nx.openingBalance) || 0) : monthBalanceEstimate(rec, data);
  }

  /* ---------- 存款总额 ---------- */
  function depositTotal(data) {
    return sum(data.fixedDeposits, function (d) { return d.amount; });
  }

  /* ---------- 基金：当前金额 / 累计投入本金 / 持有收益 ---------- */
  // 当前金额由用户每月手动更新（对应支付宝基金页“金额”）
  function fundMarketValue(f) {
    return Number(f.currentAmount) || 0;
  }
  function fundProfit(f) {
    return fundMarketValue(f) - (Number(f.principal) || 0);
  }
  // 累计投入本金 = 初始本金 ± 后续交易金额（买入+ / 卖出-）
  function recomputePrincipal(f) {
    var s = 0;
    (f.transactions || []).forEach(function (t) { s += (t.type === '买入' ? 1 : -1) * (Number(t.amount) || 0); });
    f.principal = (Number(f.initialPrincipal) || 0) + s;
    return f.principal;
  }
  function portfolioStat(funds) {
    var invested = 0, market = 0;
    funds.forEach(function (f) { invested += Number(f.principal) || 0; market += fundMarketValue(f); });
    return { invested: invested, market: market, profit: market - invested };
  }

  /* ---------- 总资产 ---------- */
  function totalAssets(data) {
    return depositTotal(data) + flowAvailable(data)
      + portfolioStat(data.educationFunds).market
      + portfolioStat(data.riskFunds).market;
  }

  /* ---------- 预算：付款现金流 vs 摊销成本 ---------- */
  function bStart(b) { return D.parseYmd(b.amortStart || b.estStart); }
  function bEnd(b) { return D.parseYmd(b.amortEnd || b.estEnd); }
  // 某月(year,m)是否落在摊销区间 [s, e) 内（期末当日不计入）
  function monthCovered(s, e, year, m) {
    var ms = new Date(year, m, 1);       // 该月首日
    var me = new Date(year, m + 1, 0);   // 该月末日
    return ms < e && me >= s;            // 与 [s, e) 有重叠即计入
  }
  // 摊销总月数：自起始月起，凡是落在 [s, e) 内的自然月都计入，至少 1
  function amortTotalMonths(b) {
    var s = bStart(b), e = bEnd(b);
    if (!s) return 1;
    if (!e || e <= s) e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
    var count = 0, y = s.getFullYear(), m = s.getMonth();
    while (new Date(y, m, 1) < e) {
      count++;
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return Math.max(1, count);
  }
  // 某年覆盖的摊销月数（按自然月重叠判定，期末当月若在 [s,e) 内则计入）
  function amortMonthsInYear(b, year) {
    var s = bStart(b), e = bEnd(b);
    if (!s) return 0;
    if (!e || e <= s) e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
    var count = 0;
    for (var m = 0; m < 12; m++) if (monthCovered(s, e, year, m)) count++;
    return count;
  }
  // 摊销自然天数（含首尾，用于按天均摊）
  function amortTotalDays(b) {
    var s = bStart(b), e = bEnd(b);
    if (!s || !e) return 0;
    if (e < s) e = s;
    return Math.max(1, D.daysBetween(s, e));
  }
  // 单日摊销成本（合同总额 / 摊销总天数）
  function budgetDailyAmort(b) {
    var total = Number(b.total) || 0;
    var days = amortTotalDays(b);
    return days ? total / days : 0;
  }
  function budgetYearStatus(b, year) {
    var s = bStart(b), e = bEnd(b);
    if (!s) return '未开始';
    var sY = s.getFullYear(), eY = e ? e.getFullYear() : sY;
    if (year < sY) return '未开始';
    if (year > eY) return '已结束';
    return '进行中';
  }

  /* 单预算按查看年份的统计（区分“付款现金流”与“摊销成本”） */
  function budgetYearData(b, year) {
    var total = Number(b.total) || 0;
    var status = budgetYearStatus(b, year);
    var totalMonths = amortTotalMonths(b);
    var monthsInYear = amortMonthsInYear(b, year);
    var monthlyAvg = totalMonths ? total / totalMonths : 0;     // 全局月均摊销成本（无论看哪年都固定）
    var alloc = totalMonths ? total * (monthsInYear / totalMonths) : 0; // 本年应摊销额（成本，按当年覆盖月数比例）
    // 付款计划子表：本年实际付款额（现金流）＝ 付款日期在本年度的金额之和
    var paidThisYear = 0;
    (b.payments || []).forEach(function (p) {
      var pd = D.parseYmd(p.date);
      if (pd && pd.getFullYear() === year) paidThisYear += Number(p.amount) || 0;
    });
    var remainToPay = total - paidThisYear;                     // 本年剩余待付款（一次性付清则为 0）
    return {
      total: total,
      amortMonths: totalMonths,
      monthsInYear: monthsInYear,
      monthlyAvg: monthlyAvg,
      alloc: alloc,
      paidThisYear: paidThisYear,
      remainToPay: remainToPay,
      status: status,
      totalDays: amortTotalDays(b)
    };
  }
  function budgetYearAlloc(b, year) { return budgetYearData(b, year).alloc; }
  function budgetYearRemain(b, year) { return budgetYearData(b, year).remainToPay; }
  function budgetYearSpent(b, year) { return budgetYearData(b, year).paidThisYear; }

  /* 跨年付款：付款日期不在查看年份的，提示“已于 YYYY 年支付” */
  function budgetCrossYearPayments(b, year) {
    var list = [];
    (b.payments || []).forEach(function (p) {
      var pd = D.parseYmd(p.date);
      if (pd && pd.getFullYear() !== year) list.push({ date: p.date, amount: Number(p.amount) || 0, payYear: pd.getFullYear() });
    });
    return list;
  }

  /* 单分类年度汇总：区分现金流与摊销成本 */
  function budgetCategorySummary(data, year, catId) {
    var bs = (data.budgets || []).filter(function (b) { return (b.categoryId || null) === catId; });
    var sumTotal = 0, paidCash = 0, alloc = 0, monthlyAvg = 0, remain = 0;
    bs.forEach(function (b) {
      var d = budgetYearData(b, year);
      sumTotal += d.total; paidCash += d.paidThisYear; alloc += d.alloc; monthlyAvg += d.monthlyAvg; remain += d.remainToPay;
    });
    return { sumTotal: sumTotal, paidCash: paidCash, alloc: alloc, monthlyAvg: monthlyAvg, remain: remain, count: bs.length };
  }

  /* 所有分类的年度汇总列表（含未分类） */
  function budgetCategoryList(data, year) {
    var cats = data.budgetCategories || [];
    var rows = cats.map(function (c) {
      return { id: c.id, name: c.name, summary: budgetCategorySummary(data, year, c.id) };
    });
    var uncat = (data.budgets || []).filter(function (b) { return !(b.categoryId) || !cats.some(function (c) { return c.id === b.categoryId; }); });
    if (uncat.length) {
      rows.push({ id: null, name: '未分类', summary: budgetCategorySummary(data, year, null) });
    }
    return rows;
  }

  /* 年度预算总览（某年）：区分现金流与摊销成本 */
  function budgetYearOverview(data, year) {
    var paidCashTotal = 0, allocTotal = 0, monthlyAvgTotal = 0, sumTotal = 0, remainTotal = 0;
    (data.budgets || []).forEach(function (b) {
      var d = budgetYearData(b, year);
      paidCashTotal += d.paidThisYear;
      allocTotal += d.alloc;
      monthlyAvgTotal += d.monthlyAvg;
      sumTotal += d.total;
      remainTotal += d.remainToPay;
    });
    return {
      paidCashTotal: paidCashTotal,
      allocTotal: allocTotal,
      monthlyAvgTotal: monthlyAvgTotal,
      sumTotal: sumTotal,
      remainTotal: remainTotal
    };
  }

  /* ---------- 保险：年度保费合计（全家）与月均 ---------- */
  // amount 取每张保单的“年保费”，年度累计 = Σ(年保费)；月均 = 年度累计 / 12
  function insuranceAnnualTotal(data) {
    return sum(data.insurances, function (x) { return x.amount; });
  }
  function insuranceMonthlyAvg(data) {
    return insuranceAnnualTotal(data) / 12;
  }
  function insuranceCount(data) { return (data.insurances || []).length; }
  // 某成员的年保费合计
  function insuranceAnnualByMember(data, memberId) {
    return sum((data.insurances || []).filter(function (x) { return x.memberId === memberId; }), function (x) { return x.amount; });
  }

  /* ---------- 保险：全年逐月预估支出（保险月历） ----------
   * 根据每张保单的交费方式(payFreq)与提醒日(remindMd：每年 MM-DD)，
   * 推算“查看年份”内每个月要预留的保险费，避免某月资金突然不足。
   * 规则：
   *  - 年交 / 趸交：在提醒月一次性支出全额年保费
   *      其中趸交仅在生效起始年(首年)的提醒月支出
   *  - 半年交：提醒月 + 提醒月+6 月，各半额
   *  - 季交：提醒月、+3、+6、+9 月，各 1/4
   *  - 月交：每月（落在保障期限内的）各 1/12
   * 仅当查看年份落在提醒生效年范围 [remindFromYear, remindToYear] 才计入；
   * 月/季/半年交进一步受保障期限 [payStart, payEnd]（按月）约束。
   */
  function extractMd(payDate) {
    var m = (payDate || '').match(/(\d{1,2})月(\d{1,2})日/);
    if (!m) return null;
    var a = m[1].length === 1 ? '0' + m[1] : m[1];
    var b = m[2].length === 1 ? '0' + m[2] : m[2];
    return a + '-' + b;
  }
  function inCoverageYm(year, month, ps, pe) {
    var ym = year * 12 + (month - 1);
    var sYm = ps.getFullYear() * 12 + ps.getMonth();
    var eYm = pe.getFullYear() * 12 + pe.getMonth();
    return ym >= sYm && ym <= eYm;
  }
  function insurancePaymentMonthsInYear(ins, year) {
    var freq = ins.payFreq || '年交';
    var md = ins.remindMd || extractMd(ins.payDate);
    var rMonth = md ? Number(md.substring(0, 2)) : null;
    var fromY = (ins.remindFromYear != null) ? ins.remindFromYear : year;
    var toY = (ins.remindToYear != null) ? ins.remindToYear : year;
    var pay = Number(ins.amount) || 0;
    if (year < fromY || year > toY || !rMonth) return [];
    var out = [];
    if (freq === '年交' || freq === '年缴') {
      out.push({ month: rMonth, amount: pay });
    } else if (freq === '趸交' || freq === '趸交（一次性）') {
      if (year === fromY) out.push({ month: rMonth, amount: pay });
    } else if (freq === '半年交' || freq === '半年缴') {
      [0, 6].forEach(function (off) { var m = rMonth + off; if (m <= 12) out.push({ month: m, amount: pay / 2 }); });
    } else if (freq === '季交' || freq === '季缴') {
      [0, 3, 6, 9].forEach(function (off) { var m = rMonth + off; if (m <= 12) out.push({ month: m, amount: pay / 4 }); });
    } else if (freq === '月交' || freq === '月缴') {
      var ps = ins.payStart ? D.parseYmd(ins.payStart) : null;
      var pe = ins.payEnd ? D.parseYmd(ins.payEnd) : null;
      for (var m = 1; m <= 12; m++) {
        if (ps && pe && !inCoverageYm(year, m, ps, pe)) continue;
        out.push({ month: m, amount: pay / 12 });
      }
    }
    return out;
  }
  function insuranceMonthlyForecast(data, year, memberId) {
    var arr = [];
    for (var m = 1; m <= 12; m++) arr.push({ month: m, total: 0, items: [] });
    (data.insurances || []).forEach(function (ins) {
      if (memberId && ins.memberId !== memberId) return;
      insurancePaymentMonthsInYear(ins, year).forEach(function (pm) {
        var idx = pm.month - 1;
        arr[idx].total += pm.amount;
        arr[idx].items.push({ id: ins.id, name: ins.name, type: ins.type, memberId: ins.memberId, amount: pm.amount, freq: ins.payFreq });
      });
    });
    var total = 0, peak = 0, peakMonth = 0;
    arr.forEach(function (r) { total += r.total; if (r.total > peak) { peak = r.total; peakMonth = r.month; } });
    return { months: arr, total: total, monthlyAvg: total / 12, peak: peak, peakMonth: peakMonth };
  }

  /* ---------- 近 7 天消费趋势（大额 + 还款，不含垫付） ---------- */
  function last7DaysTrend(data, refDate) {
    var ref = refDate ? D.parseYmd(refDate) : new Date();
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = D.addDays(ref, -i);
      days.push({ date: D.ymd(d), label: (d.getMonth() + 1) + '/' + d.getDate(), value: 0 });
    }
    var map = {};
    days.forEach(function (x) { map[x.date] = x; });
    data.currentFunds.forEach(function (rec) {
      (rec.largeExpenses || []).forEach(function (e) {
        if (map[e.date]) map[e.date].value += Number(e.amount) || 0;
      });
      (rec.repayments || []).forEach(function (r) {
        if (map[r.date]) map[r.date].value += Number(r.amount) || 0;
      });
    });
    return days;
  }

  /* ---------- 某月消费分类统计（用于饼图/柱状图） ---------- */
  function monthCategoryBreakdown(data, year, month) {
    var rec = data.currentFunds.filter(function (r) { return r.year === year && r.month === month; })[0];
    var cats = {};
    if (rec) {
      (rec.largeExpenses || []).forEach(function (e) {
        cats[e.category || '其他'] = (cats[e.category || '其他'] || 0) + (Number(e.amount) || 0);
      });
      (rec.repayments || []).forEach(function (r) {
        cats['还款·' + (r.platform || '其他')] = (cats['还款·' + (r.platform || '其他')] || 0) + (Number(r.amount) || 0);
      });
      investExpsForMonth(data, year, month).forEach(function (it) {
        cats['投资支出'] = (cats['投资支出'] || 0) + it.allocated;
      });
    }
    return cats;
  }
  // 本年各月消费（柱状图）
  function yearMonthConsumption(data, year) {
    var arr = [];
    for (var m = 1; m <= 12; m++) {
      var rec = data.currentFunds.filter(function (r) { return r.year === year && r.month === m; })[0];
      arr.push({ month: m, value: rec ? monthConsumption(rec) : 0 });
    }
    return arr;
  }

  /* ---------- 全球股市指数（东方财富批量行情） ---------- */
  var INDICES = [
    { secid: '1.000001', name: '上证指数', code: '000001' },
    { secid: '0.399001', name: '深证成指', code: '399001' },
    { secid: '0.399006', name: '创业板指', code: '399006' },
    { secid: '100.DJIA', name: '道琼斯', code: 'DJIA' },
    { secid: '100.NDX', name: '纳斯达克', code: 'NDX' },
    { secid: '100.SPX', name: '标普500', code: 'SPX' }
  ];
  function fetchGlobalIndices(cb) {
    cb = cb || function () {};
    var script = document.createElement('script');
    var cbName = 'pfw_idx_cb_' + Date.now();
    var done = false;
    function finish(err, val) {
      if (done) return; done = true;
      try { delete global[cbName]; } catch (e) {}
      if (script.parentNode) script.parentNode.removeChild(script);
      cb(err, val);
    }
    global[cbName] = function (json) {
      try {
        var diff = json && json.data && json.data.diff;
        if (!diff) return finish('no data');
        var map = {};
        INDICES.forEach(function (w) { map[w.secid] = w; });
        var arr = Array.isArray(diff) ? diff : Object.keys(diff).map(function (k) { return diff[k]; });
        var found = {};
        arr.forEach(function (it) {
          var secid = (it.f13 == null ? '' : String(it.f13)) + '.' + (it.f12 || '');
          var w = map[secid]; if (!w) return;
          found[secid] = {
            name: w.name, code: w.code, value: Number(it.f2) || 0,
            pct: Number(it.f3) || 0, change: Number(it.f4) || 0, secid: secid
          };
        });
        var ordered = [];
        INDICES.forEach(function (w) { if (found[w.secid]) ordered.push(found[w.secid]); });
        if (!ordered.length) return finish('no data');
        var now = new Date();
        finish(null, { items: ordered, date: D.todayYmd(), time: PFW.pad2(now.getHours()) + ':' + PFW.pad2(now.getMinutes()) });
      } catch (e) { finish(e); }
    };
    script.onerror = function () { finish('network'); };
    var secids = INDICES.map(function (w) { return w.secid; }).join(',');
    script.src = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f3,f4,f152&secids=' + encodeURIComponent(secids) + '&ut=fa5fd1943c7b386f172d6893dbfba10b&cb=' + cbName;
    document.body.appendChild(script);
    setTimeout(function () { finish('timeout'); }, 6000);
  }

  /* ---------- 上证指数（尝试自动获取，失败回退手动） ---------- */
  function fetchSHIndex(cb) {
    cb = cb || function () {};
    var script = document.createElement('script');
    var cbName = 'pfw_sh_cb_' + Date.now();
    var done = false;
    function finish(err, val) {
      if (done) return; done = true;
      try { delete window[cbName]; } catch (e) {}
      if (script.parentNode) script.parentNode.removeChild(script);
      cb(err, val);
    }
    global[cbName] = function (json) {
      try {
        var node = json && (json.data || json);
        var price = node && node.f43 != null ? Number(node.f43) : null;
        var pct = node && node.f170 != null ? Number(node.f170) : null;
        if (price == null || isNaN(price)) return finish('no data');
        // 东方财富 f43 为 价格*1000 整数
        var realPrice = price > 100000 ? price / 1000 : price;
        var realPct = pct != null && !isNaN(pct) ? (pct > 1000 ? pct / 100 : pct) : null;
        finish(null, { value: realPrice, pct: realPct, date: D.todayYmd(), manual: false });
      } catch (e) { finish(e); }
    };
    script.onerror = function () { finish('network'); };
    script.src = 'https://push2.eastmoney.com/api/qt/stock/get?secid=1.000001&ut=fa5fd1943c7b386f172d6893dbfba10b&fields=f43,f58,f169,f170&cb=' + cbName;
    document.body.appendChild(script);
    setTimeout(function () { finish('timeout'); }, 6000);
  }

  /* ---------- 基金名称识别（天天基金搜索 JSONP） ---------- */
  function fetchFundInfo(code, cb) {
    cb = cb || function () {};
    var script = document.createElement('script');
    var cbName = 'pfw_fund_cb_' + Date.now();
    var done = false;
    function finish(err, val) {
      if (done) return; done = true;
      try { delete window[cbName]; } catch (e) {}
      if (script.parentNode) script.parentNode.removeChild(script);
      cb(err, val);
    }
    global[cbName] = function (json) {
      try {
        var list = json && json.Data;
        if (!list || !list.length) return finish('no data');
        var d = list[0];
        finish(null, { name: d.NAME || '', sector: d.FUND_TYPE || d.TYPE || '' });
      } catch (e) { finish(e); }
    };
    script.onerror = function () { finish('network'); };
    script.src = 'https://fundapi.eastmoney.com/fundtradenew/search?callback=' + cbName + '&keyword=' + encodeURIComponent(code);
    document.body.appendChild(script);
    setTimeout(function () { finish('timeout'); }, 6000);
  }

  global.PFW_CALC = {
    sum: sum,
    monthIncome: monthIncome,
    largeExpenseTotal: largeExpenseTotal,
    repaymentTotal: repaymentTotal,
    advanceTotal: advanceTotal,
    advanceUnreimbursed: advanceUnreimbursed,
    otherDaily: otherDaily,
    monthConsumption: monthConsumption,
    monthBalanceEstimate: monthBalanceEstimate,
    investExpenseForMonth: investExpenseForMonth,
    investExpsForMonth: investExpsForMonth,
    latestFlowRec: latestFlowRec,
    flowAvailable: flowAvailable,
    nextRec: nextRec,
    closingOf: closingOf,
    depositTotal: depositTotal,
    fundMarketValue: fundMarketValue,
    fundProfit: fundProfit,
    recomputePrincipal: recomputePrincipal,
    portfolioStat: portfolioStat,
    totalAssets: totalAssets,
    budgetYearData: budgetYearData,
    budgetYearAlloc: budgetYearAlloc,
    budgetYearRemain: budgetYearRemain,
    budgetYearOverview: budgetYearOverview,
    budgetCrossYearPayments: budgetCrossYearPayments,
    amortTotalMonths: amortTotalMonths,
    amortMonthsInYear: amortMonthsInYear,
    budgetDailyAmort: budgetDailyAmort,
    budgetYearStatus: budgetYearStatus,
    budgetCategorySummary: budgetCategorySummary,
    budgetCategoryList: budgetCategoryList,
    last7DaysTrend: last7DaysTrend,
    monthCategoryBreakdown: monthCategoryBreakdown,
    yearMonthConsumption: yearMonthConsumption,
    insuranceAnnualTotal: insuranceAnnualTotal,
    insuranceMonthlyAvg: insuranceMonthlyAvg,
    insuranceCount: insuranceCount,
    insuranceAnnualByMember: insuranceAnnualByMember,
    insuranceMonthlyForecast: insuranceMonthlyForecast,
    insurancePaymentMonthsInYear: insurancePaymentMonthsInYear,
    fetchSHIndex: fetchSHIndex,
    fetchGlobalIndices: fetchGlobalIndices,
    fetchFundInfo: fetchFundInfo
  };
})(typeof window !== 'undefined' ? window : this);
