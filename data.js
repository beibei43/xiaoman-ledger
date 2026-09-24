/* ============================================================
 * 个人财务工作台 — 数据层 / 存储 / 工具函数
 * 纯前端，localStorage 持久化，无后端依赖
 * ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'pfw_data_v2';

  /* ---------- 家庭成员（固定，含头像） ---------- */
  var DEFAULT_MEMBERS = [
    { id: 'm_shen', name: '深哥', avatar: '🧔', color: '#6B4E71' },
    { id: 'm_bei',  name: '贝贝', avatar: '👩', color: '#C98AA0' },
    { id: 'm_ge',   name: '哥哥', avatar: '👨', color: '#5E8B7E' },
    { id: 'm_di',   name: '弟弟', avatar: '🧒', color: '#C99E5A' },
    { id: 'm_qiu',  name: '秋',   avatar: '🐱', color: '#8E7CC3' }
  ];

  /* ---------- 工具：ID 生成 ---------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 日期工具 ---------- */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) {
    d = d ? new Date(d) : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function ymKey(year, month) { return year + '-' + pad2(month); }
  function parseYmd(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    var p = String(s).split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }
  function monthStart(year, month) {
    return new Date(year, month - 1, 1);
  }
  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }
  function daysBetween(a, b) {
    // 含首尾天数
    var ms = parseYmd(b).getTime() - parseYmd(a).getTime();
    return Math.floor(ms / 86400000) + 1;
  }
  function todayYmd() { return ymd(new Date()); }
  function dayOfYear() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / 86400000);
  }

  /* ---------- 金额 / 百分比格式化 ---------- */
  function fmtMoney(n, withSign) {
    n = Number(n) || 0;
    var neg = n < 0;
    var abs = Math.abs(n);
    var s = abs.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var out = (neg ? '-' : (withSign ? '+' : '')) + '¥' + s;
    return out;
  }
  function fmtNum(n, dec) {
    n = Number(n) || 0;
    return n.toLocaleString('zh-CN', { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: dec == null ? 2 : dec });
  }
  function fmtPct(n) {
    n = Number(n) || 0;
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  // 盈亏颜色类：涨=红，跌=绿（A股习惯）
  function pnlClass(n) { return Number(n) >= 0 ? 'up' : 'down'; }

  /* ---------- 人生标语（每日更新，按日种子随机，中英双语） ---------- */
  var SLOGANS = [
    { cn: '种一棵树最好的时间是十年前，其次是现在。', en: 'The best time to plant a tree was ten years ago. The second best time is now.' },
    { cn: '今天的努力，是幸运的伏笔。', en: 'Today\'s efforts are the foreshadowing of future luck.' },
    { cn: '慢慢变富，也是一种浪漫。', en: 'Getting rich slowly is a kind of romance too.' },
    { cn: '每一笔记录，都是对生活的掌控。', en: 'Every record is a grip on your life.' },
    { cn: '小钱不乱花，大钱不慌张。', en: 'Handle small money wisely, and big money will not panic you.' },
    { cn: '今天的预算，是明天的自由。', en: 'Today\'s budget is tomorrow\'s freedom.' },
    { cn: '存下的不是钱，是底气。', en: 'What you save is not just money, but confidence.' },
    { cn: '复利是世界第八大奇迹。', en: 'Compound interest is the eighth wonder of the world.' },
    { cn: '精致生活，从记账开始。', en: 'A refined life starts with bookkeeping.' },
    { cn: '少买一件，多睡一晚安心。', en: 'Buy one less item, sleep one more night at ease.' },
    { cn: '财务自由的第一步：知道钱去哪了。', en: 'First step to financial freedom: know where the money goes.' },
    { cn: '赚钱是能力，守钱是智慧。', en: 'Earning is ability; keeping is wisdom.' },
    { cn: '把日子过成自己喜欢的样子。', en: 'Live the life you truly like.' },
    { cn: '每个月都是新的开始。', en: 'Every month is a fresh start.' },
    { cn: '投资自己，永远不亏。', en: 'Investing in yourself is never a loss.' },
    { cn: '慢慢来，比较快。', en: 'Slow is smooth, and smooth is fast.' },
    { cn: '保持清醒，保持余额。', en: 'Stay awake, and keep a healthy balance.' },
    { cn: '你认真生活的样子，很好看。', en: 'You look great when you take life seriously.' },
    { cn: '生活明朗，万物可爱。', en: 'Life is bright, and everything is lovely.' },
    { cn: '愿所有的美好都如期而至。', en: 'May all the good things arrive as promised.' }
  ];
  // 按日期播种：同一天稳定、跨天变化、且不再按 1→2→3 的呆板顺序
  function dateSeed() {
    var d = new Date();
    var key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    var x = key >>> 0;
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    return x % SLOGANS.length;
  }
  function todaySlogan() {
    return SLOGANS[dateSeed()];
  }
  function weekdayName(d) {
    var arr = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return arr[(d || new Date()).getDay()];
  }
  function greeting(d) {
    d = d || new Date();
    var h = d.getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }
  function fmtTime(d) {
    d = d || new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  /* ---------- 默认 / 示例数据 ---------- */
  function defaultData() {
    return {
      settings: {
        largeExpenseThreshold: 500,
        budgetWarnRatio: 0.2,
        fundNameMap: {},   // code -> {name, sector}
        shIndex: { value: null, pct: null, date: null, manual: false },
        globalIndices: { items: [], date: null, time: null }
      },
      members: DEFAULT_MEMBERS,
      insurances: [],       // 保险记录（关联家庭成员）
      profile: { name: 'beibei的账本', avatar: '', motto: '慢慢变富' },
      fixedDeposits: [],
      currentFunds: [],     // 按 年+月 一条记录
      creditLiabilities: [],
      budgetCategories: defaultBudgetCategories(), // 预算所属分类（哥哥/弟弟/家庭…可自管）
      budgets: [],
      educationFunds: [],
      riskFunds: [],
      viewYear: new Date().getFullYear()
    };
  }
  function defaultBudgetCategories() {
    return [
      { id: 'cat_ge', name: '哥哥' },
      { id: 'cat_di', name: '弟弟' },
      { id: 'cat_fam', name: '家庭' }
    ];
  }

  function sampleData() {
    var y = new Date().getFullYear();
    var m = new Date().getMonth() + 1;
    var lm = m === 1 ? 12 : m - 1;
    var ly = m === 1 ? y - 1 : y;
    var depYuebao = uid('d'); // 余额宝账户（用于演示“存钱罐渠道垫付”扣减）
    var crHuabei = uid('cr'); // 花呗（用于演示“还款关联信用负债自动扣减剩余欠款”）
    var s = {
      settings: {
        largeExpenseThreshold: 500,
        budgetWarnRatio: 0.2,
        fundNameMap: {
          '110011': { name: '易方达中小盘混合', sector: '成长' },
          '000001': { name: '华夏成长混合', sector: '均衡' }
        },
        shIndex: { value: 3285.67, pct: 0.42, date: todayYmd(), manual: true },
        globalIndices: { items: [], date: null, time: null }
      },
      fixedDeposits: [
        { id: uid('d'), name: '工商银行定期', bank: '工商银行', amount: 80000, type: '定期', dueDate: y + '-12-31', rate: 1.5, note: '一年期' },
        { id: depYuebao, name: '余额宝随时取', bank: '支付宝', amount: 15000, type: '随时可取', dueDate: '', note: '应急金' }
      ],
      currentFunds: [
        {
          id: uid('c'), year: ly, month: lm,
          openingBalance: 6000, closingBalance: 4200, note: '上月',
          incomes: [{ id: uid('i'), amount: 8500, source: '工资', date: ly + '-' + pad2(lm) + '-10' }],
          largeExpenses: [
            { id: uid('e'), date: ly + '-' + pad2(lm) + '-12', amount: 1200, category: '购物', payment: '信用', note: '衣服', budgetLink: false, budgetId: null, depositId: null },
            { id: uid('e'), date: ly + '-' + pad2(lm) + '-20', amount: 600, category: '医疗', payment: '流动资金', note: '体检', budgetLink: false, budgetId: null, depositId: null }
          ],
          repayments: [{ id: uid('r'), date: ly + '-' + pad2(lm) + '-15', platform: '花呗', amount: 1500, channel: 'bank', creditId: crHuabei }],
          advances: [{ id: uid('a'), date: ly + '-' + pad2(lm) + '-18', amount: 800, purpose: '出差垫付', channel: '流动资金', reimbursed: true, reimburseDate: ly + '-' + pad2(lm) + '-28' }],
          investExps: []
        },
        {
          id: uid('c'), year: y, month: m,
          openingBalance: 4200, closingBalance: 5200, note: '本月',
          incomes: [
            { id: uid('i'), amount: 8500, source: '工资', date: y + '-' + pad2(m) + '-10' },
            { id: uid('i'), amount: 800, source: '报销', date: y + '-' + pad2(m) + '-12' }
          ],
          largeExpenses: [
            { id: uid('e'), date: y + '-' + pad2(m) + '-05', amount: 1200, category: '教育', payment: 'yuebao', note: '英语课', budgetLink: true, budgetId: null, depositId: null },
            { id: uid('e'), date: y + '-' + pad2(m) + '-14', amount: 350, category: '餐饮', payment: 'wechat', note: '聚餐', budgetLink: false, budgetId: null, depositId: null }
          ],
          repayments: [{ id: uid('r'), date: y + '-' + pad2(m) + '-08', platform: '花呗', amount: 1500, channel: 'bank', creditId: crHuabei }],
          advances: [{ id: uid('a'), date: y + '-' + pad2(m) + '-20', amount: 1000, purpose: '团建垫付', channel: '存钱罐', depositId: depYuebao, reimbursed: false, reimburseDate: null }],
          investExps: [],
          accounts: [
            { id: uid('ac'), kind: 'wechat', label: '微信零钱', amount: 1500, note: '' },
            { id: uid('ac'), kind: 'yuebao', label: '余额宝', amount: 2000, note: '' },
            { id: uid('ac'), kind: 'bank', label: '银行', amount: 700, note: '招商银行' },
            { id: uid('ac'), kind: 'other', label: '其他', amount: 0, note: '' }
          ]
        }
      ],
      creditLiabilities: [
        { id: crHuabei, name: '花呗', remaining: 2000 }
      ],
      budgets: [
        { id: uid('b'), name: '哥哥英语课', categoryId: 'cat_ge', total: 10000,
          amortStart: y + '-03-01', amortEnd: (y + 1) + '-03-01', note: '外教课（全年）',
          defaultMethod: '转账',
          payments: [
            { id: uid('p'), date: y + '-03-15', amount: 5000, method: '转账' },
            { id: uid('p'), date: y + '-09-15', amount: 5000, method: '转账' }
          ] },
        { id: uid('b'), name: '羽毛球班', categoryId: 'cat_di', total: 10000,
          amortStart: y + '-01-01', amortEnd: y + '-12-31', note: '全年分多期',
          defaultMethod: '现金',
          payments: [
            { id: uid('p'), date: y + '-02-10', amount: 2000, method: '现金' }
          ] },
        { id: uid('b'), name: '年度护肤', categoryId: 'cat_fam', total: 3600,
          amortStart: y + '-01-01', amortEnd: y + '-12-31', note: '',
          defaultMethod: '转账',
          payments: [
            { id: uid('p'), date: y + '-03-01', amount: 1800, method: '转账' }
          ] }
      ],
      educationFunds: [
        {
          id: uid('f'), code: '110011', name: '易方达中小盘混合', sector: '成长',
          tradeDate: y + '-01-15', isInvest: true, investAmount: 1000, investFreq: '每月', investDay: '15',
          initialPrincipal: 0, principal: 2800, currentAmount: 2850, lastAutoInvest: todayYmd(), note: '',
          transactions: [
            { id: uid('t'), date: y + '-01-15', type: '买入', amount: 1000 },
            { id: uid('t'), date: y + '-02-15', type: '买入', amount: 1000 },
            { id: uid('t'), date: y + '-03-15', type: '买入', amount: 800 }
          ],
          amountHistory: [
            { id: uid('h'), date: y + '-01-31', amount: 2600 },
            { id: uid('h'), date: y + '-02-28', amount: 2720 },
            { id: uid('h'), date: y + '-03-31', amount: 2680 },
            { id: uid('h'), date: y + '-04-30', amount: 2800 },
            { id: uid('h'), date: y + '-05-31', amount: 2850 }
          ]
        }
      ],
      riskFunds: [
        {
          id: uid('f'), code: '000001', name: '华夏成长混合', sector: '均衡',
          tradeDate: y + '-02-01', isInvest: true, investAmount: 800, investFreq: '每月', investDay: '1',
          initialPrincipal: 0, principal: 1500, currentAmount: 1550, lastAutoInvest: todayYmd(), note: '',
          transactions: [
            { id: uid('t'), date: y + '-02-01', type: '买入', amount: 800 },
            { id: uid('t'), date: y + '-03-01', type: '买入', amount: 700 }
          ],
          amountHistory: [
            { id: uid('h'), date: y + '-02-28', amount: 1450 },
            { id: uid('h'), date: y + '-03-31', amount: 1500 },
            { id: uid('h'), date: y + '-04-30', amount: 1480 },
            { id: uid('h'), date: y + '-05-31', amount: 1520 },
            { id: uid('h'), date: y + '-06-30', amount: 1550 }
          ]
        }
      ],
      insurances: [
        {
          id: uid('ins'), memberId: 'm_shen', type: '重疾险', name: '平安福重疾险', company: '中国平安',
          amount: 8000, payStart: y + '-01-01', payEnd: (y + 30) + '-01-01', payFreq: '年交', payDate: '每年1月1日',
          channel: '保险代理人', payAccount: 'bank', payPeriodStart: y, payPeriodEnd: y + 9, remindDate: y + '-01-01', remark: '主险，含轻症豁免',
          keyContent: '交30年保至70岁，重疾最高赔付80万，轻症额外20万',
          attachments: [],
          payments: [{ id: uid('p'), date: y + '-01-01', amount: 8000, note: '首期保费', budgetLink: false, budgetId: null }],
          claims: [{ id: uid('cl'), date: (y - 1) + '-08-12', amount: 50000, reason: '甲状腺乳头状癌手术', note: '轻症赔付，已到账' }]
        },
        {
          id: uid('ins'), memberId: 'm_bei', type: '医疗险', name: '尊享e生医疗险', company: '众安保险',
          amount: 1200, payStart: y + '-03-01', payEnd: (y + 1) + '-03-01', payFreq: '年交', payDate: '每年3月1日',
          channel: '支付宝', payAccount: 'wechat', payPeriodStart: y, payPeriodEnd: y, remindDate: y + '-03-01', remark: '百万医疗，一年一买',
          keyContent: '百万医疗，住院医疗最高600万，含质子重离子',
          attachments: [],
          payments: [{ id: uid('p'), date: y + '-03-01', amount: 1200, note: '续保', budgetLink: false, budgetId: null }],
          claims: [{ id: uid('cl'), date: (y - 1) + '-05-20', amount: 8600, reason: '肺炎住院', note: '社保报销后剩余部分' }]
        },
        {
          id: uid('ins'), memberId: 'm_ge', type: '意外险', name: '安心意外险', company: '中国人保',
          amount: 600, payStart: y + '-05-01', payEnd: (y + 1) + '-05-01', payFreq: '年交', payDate: '每年5月1日',
          channel: '保险公司官网', payAccount: 'bank', payPeriodStart: y, payPeriodEnd: y, remindDate: y + '-05-01', remark: '',
          keyContent: '意外身故/伤残最高100万，意外医疗5万',
          attachments: [],
          payments: []
        },
        {
          id: uid('ins'), memberId: 'm_di', type: '寿险', name: '大麦定期寿险', company: '华贵人寿',
          amount: 3000, payStart: y + '-02-01', payEnd: (y + 20) + '-02-01', payFreq: '年交', payDate: '每年2月1日',
          channel: '保险经纪人', payAccount: 'bank', payPeriodStart: y, payPeriodEnd: y + 19, remindDate: y + '-02-01', remark: '家庭支柱定寿',
          keyContent: '保额200万，交20年保20年',
          attachments: [],
          payments: []
        },
        {
          id: uid('ins'), memberId: 'm_qiu', type: '重疾险', name: '少儿重疾险', company: '太平洋保险',
          amount: 1500, payStart: y + '-06-01', payEnd: (y + 25) + '-06-01', payFreq: '年交', payDate: '每年6月1日',
          channel: '保险代理人', payAccount: 'wechat', payPeriodStart: y, payPeriodEnd: y + 24, remindDate: y + '-06-01', remark: '',
          keyContent: '少儿专属，重疾最高赔付100万，含白血病双倍',
          attachments: [],
          payments: []
        }
      ],
      budgetCategories: defaultBudgetCategories(),
      viewYear: y
    };
    applySampleAdvanceDeductions(s);
    return s;
  }
  // 流动资金页「账户余额构成」默认 4 项：微信零钱 / 余额宝 / 银行(备注银行名) / 其他(备注)
  function defaultAccounts() {
    return [
      { id: uid('ac'), kind: 'wechat', label: '微信零钱', amount: 0, note: '' },
      { id: uid('ac'), kind: 'yuebao', label: '余额宝', amount: 0, note: '' },
      { id: uid('ac'), kind: 'bank', label: '银行', amount: 0, note: '' },
      { id: uid('ac'), kind: 'other', label: '其他', amount: 0, note: '' }
    ];
  }
  // 示例数据中：存钱罐渠道且未报销的垫付，直接扣减对应账户（与运行中记录行为一致）
  function applySampleAdvanceDeductions(s) {
    (s.currentFunds || []).forEach(function (rec) {
      (rec.advances || []).forEach(function (a) {
        if (a.channel === '存钱罐' && a.depositId && !a.reimbursed) {
          var d = (s.fixedDeposits || []).filter(function (x) { return x.id === a.depositId; })[0];
          if (d) d.amount = Math.max(0, (Number(d.amount) || 0) - (Number(a.amount) || 0));
        }
      });
    });
  }

  /* ---------- 存储 ---------- */
  var DATA = null;
  function loadData() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        DATA = JSON.parse(raw);
        // 兼容性补全
        DATA.settings = DATA.settings || defaultData().settings;
        DATA.settings.fundNameMap = DATA.settings.fundNameMap || {};
        DATA.settings.shIndex = DATA.settings.shIndex || { value: null, pct: null, date: null, manual: false };
        DATA.settings.globalIndices = DATA.settings.globalIndices || { items: [], date: null, time: null };
        DATA.members = DATA.members || DEFAULT_MEMBERS;
        DATA.insurances = DATA.insurances || [];
        DATA.profile = DATA.profile || { name: 'beibei的账本', avatar: '', motto: '慢慢变富' };
        DATA.creditLiabilities = DATA.creditLiabilities || [];
        (DATA.creditLiabilities || []).forEach(function (c) { if (c.remaining === undefined) c.remaining = 0; });
        // 兼容性补全：预算分类（哥哥/弟弟/家庭…）
        DATA.budgetCategories = DATA.budgetCategories || defaultBudgetCategories();
        var famCat = (DATA.budgetCategories || [])[0];
        // 兼容性补全：垫付记录增加支付渠道；期末余额同步为次月期初
        var dirty = false;
        (DATA.currentFunds || []).forEach(function (rec) {
          (rec.advances || []).forEach(function (a) {
            if (!a.channel) {
              a.channel = '流动资金';
              if (a.channel === '存钱罐' && a.depositId && !a.reimbursed) {
                var dd = (DATA.fixedDeposits || []).filter(function (x) { return x.id === a.depositId; })[0];
                if (dd) dd.amount = Math.max(0, (Number(dd.amount) || 0) - (Number(a.amount) || 0));
              }
              dirty = true;
            }
            if (a.depositId === undefined) a.depositId = null;
          });
          if (rec.closingBalance === undefined) { rec.closingBalance = 0; dirty = true; }
          if (!rec.accounts) { rec.accounts = defaultAccounts(); dirty = true; }
          if (!rec.investExps) { rec.investExps = []; dirty = true; }
          // 兼容性补全：大额/其他支出的支付方式旧值 → 新渠道
          (rec.largeExpenses || []).forEach(function (e) {
            if (e.payment === '不动存款') { e.payment = '存钱罐'; dirty = true; }
            else if (e.payment === '流动资金') { e.payment = 'wechat'; dirty = true; }
            else if (e.payment === '信用') { e.payment = 'other'; dirty = true; }
          });
          // 兼容性补全：还款增加支付渠道 channel 与关联负债 creditId
          (rec.repayments || []).forEach(function (rp) {
            if (!rp.channel) { rp.channel = 'other'; dirty = true; }
            if (rp.creditId === undefined) { rp.creditId = null; dirty = true; }
          });
          // 兼容性补全：投资支出增加支付渠道 channel 与存钱罐账户 depositId
          (rec.investExps || []).forEach(function (ie) {
            if (!ie.channel) { ie.channel = 'wechat'; dirty = true; }
            if (ie.depositId === undefined) { ie.depositId = null; dirty = true; }
          });
          // 旧数据：账户全为 0 但期初有值 → 把期初填入微信零钱，避免合计与期初不符
          if (rec.accounts && rec.accounts.length) {
            var accSum = rec.accounts.reduce(function (s, a) { return s + (Number(a.amount) || 0); }, 0);
            if (accSum === 0 && (Number(rec.openingBalance) || 0) > 0) {
              var wx = rec.accounts.filter(function (a) { return a.kind === 'wechat'; })[0];
              if (wx) { wx.amount = Number(rec.openingBalance) || 0; dirty = true; }
              else { rec.accounts[0].amount = Number(rec.openingBalance) || 0; dirty = true; }
            }
          }
        });
        (DATA.currentFunds || []).forEach(function (rec) {
          var ny = rec.month === 12 ? rec.year + 1 : rec.year, nm = rec.month === 12 ? 1 : rec.month + 1;
          var nx = (DATA.currentFunds || []).filter(function (r) { return r.year === ny && r.month === nm; })[0];
          rec.closingBalance = nx ? (Number(nx.openingBalance) || 0) : (rec.closingBalance || 0);
        });
        // 兼容性补全：基金「初始本金 / 自动定投」字段
        (DATA.educationFunds || []).concat(DATA.riskFunds || []).forEach(function (f) {
          f.transactions = f.transactions || [];
          if (f.initialPrincipal === undefined) {
            var s = 0;
            f.transactions.forEach(function (t) { s += (t.type === '买入' ? 1 : -1) * (Number(t.amount) || 0); });
            f.initialPrincipal = Math.max(0, (Number(f.principal) || 0) - s);
            dirty = true;
          }
          if (f.lastAutoInvest === undefined) { f.lastAutoInvest = null; dirty = true; }
          if (f.investFreq === '每日') { f.investFreq = '每工作日'; dirty = true; }
          // 重新推导累计投入本金，保持一致
          var s = 0;
          f.transactions.forEach(function (t) { s += (t.type === '买入' ? 1 : -1) * (Number(t.amount) || 0); });
          f.principal = (Number(f.initialPrincipal) || 0) + s;
        });
        // 兼容性补全：保险新增字段（购买渠道 / 交费账户 / 交费年期 / 提醒 / 备注 / 附件）
        (DATA.insurances || []).forEach(function (ins) {
          if (ins.channel === undefined) { ins.channel = ''; dirty = true; }
          if (ins.payAccount === undefined) { ins.payAccount = ''; dirty = true; }
          if (ins.payPeriodStart === undefined) { ins.payPeriodStart = null; dirty = true; }
          if (ins.payPeriodEnd === undefined) { ins.payPeriodEnd = null; dirty = true; }
          if (ins.remindDate === undefined) { ins.remindDate = null; dirty = true; }
          if (ins.remindDone === undefined) { ins.remindDone = null; dirty = true; }
          if (ins.remark === undefined) { ins.remark = ''; dirty = true; }
          if (ins.attachments === undefined) { ins.attachments = []; dirty = true; }
          ins.payments = ins.payments || [];
        });
        // 保险：提醒改为“每年 MM-DD 循环”模型 + 交费起止精确到年月日
        (DATA.insurances || []).forEach(function (ins) {
          if (ins.remindMd === undefined) {
            ins.remindMd = (ins.remindDate && /^\d{4}-\d{2}-\d{2}$/.test(ins.remindDate)) ? ins.remindDate.substring(5) : null;
            dirty = true;
          }
          if (ins.remindDoneYear === undefined) {
            ins.remindDoneYear = (ins.remindDone && /^\d{4}-\d{2}-\d{2}$/.test(ins.remindDone)) ? Number(ins.remindDone.substring(0, 4)) : null;
            dirty = true;
          }
          if (ins.payPeriodStart != null && typeof ins.payPeriodStart === 'number') { ins.payPeriodStart = ins.payPeriodStart + '-01-01'; dirty = true; }
          if (ins.payPeriodEnd != null && typeof ins.payPeriodEnd === 'number') { ins.payPeriodEnd = ins.payPeriodEnd + '-12-31'; dirty = true; }
          // 提醒年范围：默认等于交费起止年（如交20年则提醒20年，之后不再提醒）
          var ppSYear = ins.payPeriodStart ? Number(String(ins.payPeriodStart).substring(0, 4)) : null;
          var ppEYear = ins.payPeriodEnd ? Number(String(ins.payPeriodEnd).substring(0, 4)) : null;
          if (ins.remindFromYear === undefined) { ins.remindFromYear = ppSYear != null ? ppSYear : new Date().getFullYear(); dirty = true; }
          if (ins.remindToYear === undefined) { ins.remindToYear = ppEYear != null ? ppEYear : new Date().getFullYear(); dirty = true; }
          if (ins.claims === undefined) { ins.claims = []; dirty = true; }
          ins.claims = ins.claims || [];
        });
        // 兼容性补全：预算新模型（摊销周期 + 付款子表），废弃旧“分期付款计划”
        (DATA.budgets || []).forEach(function (b) {
          if (b.categoryId === undefined || b.categoryId === null) {
            b.categoryId = famCat ? famCat.id : null; dirty = true;
          }
          // 摊销开始/结束：兼容旧字段 estStart/estEnd
          if (b.amortStart === undefined) { b.amortStart = b.estStart || (b.estEnd || ''); dirty = true; }
          if (b.amortEnd === undefined) { b.amortEnd = b.estEnd || ''; dirty = true; }
          b.payments = b.payments || [];
          b.payments.forEach(function (p) {
            if (p.method === undefined) { p.method = '现金'; dirty = true; }
            if (p.id === undefined) { p.id = uid('p'); dirty = true; }
            delete p._src; // 旧版关联标记不再使用
          });
          if (b.defaultMethod === undefined) { b.defaultMethod = '转账'; dirty = true; }
          b.phases = []; // 旧“分期付款计划”模型已废弃
          if (b.total === undefined) { b.total = 0; dirty = true; }
        });
        if (dirty) saveData();
        return DATA;
      }
    } catch (e) { /* ignore */ }
    DATA = defaultData();
    return DATA;
  }
  // 当 localStorage 配额超限时，临时剥离保险附件（体积最大来源），保住保险条目与核心字段
  function stripInsuranceAttachments() {
    var changed = false;
    (DATA.insurances || []).forEach(function (ins) {
      if (ins.attachments && ins.attachments.length) { ins.attachments = []; changed = true; }
    });
    return changed;
  }
  function saveData() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
    } catch (e) {
      // 第一次写入失败（多为配额超限）：尝试剥离保险附件后重试一次，保住核心数据
      if (stripInsuranceAttachments()) {
        try {
          global.localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
          var err = new Error('SAVE_STRIPPED_ATTACHMENTS');
          err.strippedAttachments = true;
          throw err;
        } catch (e2) {
          // 剥离后写入成功但需告知上层"附件被剥离"；若第二次写入本身仍失败，则抛原始配额错误
          if (e2 && e2.strippedAttachments) throw e2;
          throw e;
        }
      }
      throw e;
    }
  }
  function getData() { return DATA || loadData(); }
  function setData(d) { DATA = d; saveData(); }

  global.PFW = {
    STORAGE_KEY: STORAGE_KEY,
    uid: uid,
    ymd: ymd, ymKey: ymKey, parseYmd: parseYmd, monthStart: monthStart,
    addDays: addDays, daysBetween: daysBetween, todayYmd: todayYmd, dayOfYear: dayOfYear,
    pad2: pad2,
    fmtMoney: fmtMoney, fmtNum: fmtNum, fmtPct: fmtPct, pnlClass: pnlClass,
    SLOGANS: SLOGANS, todaySlogan: todaySlogan, weekdayName: weekdayName, greeting: greeting, fmtTime: fmtTime,
    DEFAULT_MEMBERS: DEFAULT_MEMBERS,
    defaultAccounts: defaultAccounts,
    defaultData: defaultData, sampleData: sampleData,
    loadData: loadData, saveData: saveData, getData: getData, setData: setData,
    stripInsuranceAttachments: stripInsuranceAttachments
  };
})(typeof window !== 'undefined' ? window : this);
