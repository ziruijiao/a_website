
var ZK_ENABLED = 1;

/* —— 横幅上显示的名称 —— */
var ZK_NAME = "2029年宁波中考";

/* —— 中考科目时间表 ——
 * 时间格式："YYYY-MM-DD HH:mm"*/
var ZK_SCHEDULE = [
  { subject: "语文", start: "2029-06-16 09:00", end: "2029-06-16 11:00" },
  { subject: "科学", start: "2029-06-16 13:30", end: "2029-06-16 15:30" },
  { subject: "数学", start: "2029-06-17 09:00", end: "2029-06-17 11:00" },
  { subject: "社会", start: "2029-06-17 13:30", end: "2029-06-17 15:10" },
  { subject: "英语", start: "2029-06-17 16:10", end: "2029-06-17 17:50" }
];


/* ============ 核心计算（纯函数，便于测试） ============ */
function zkCompute(now, config) {
  var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  var DAYS_2Y = 730, DAYS_1Y = 365, DAYS_1M = 30;

  var schedule = (config.schedule || []).map(function (s) {
    return {
      subject: s.subject,
      start: new Date(s.start.replace(' ', 'T')).getTime(),
      end: new Date(s.end.replace(' ', 'T')).getTime()
    };
  });
  if (schedule.length === 0) return { visible: false, cls: '', icon: '', text: '' };

  var examStart = schedule[0].start;
  var examEnd = schedule[schedule.length - 1].end;
  var diff = examStart - now;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hm(t) { return pad(new Date(t).getHours()) + ':' + pad(new Date(t).getMinutes()); }
  function md(t) { var d = new Date(t); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

  // 考试已全部结束 → 自动隐藏
  if (now >= examEnd) return { visible: false, cls: '', icon: '', text: '' };

  // 考试期间 → 白色背景，显示正在考的科目
  if (now >= examStart) {
    var current = null, next = null;
    for (var i = 0; i < schedule.length; i++) {
      if (now >= schedule[i].start && now < schedule[i].end) { current = schedule[i]; break; }
      if (now < schedule[i].start && !next) next = schedule[i];
    }
    if (current) {
      return {
        visible: true, cls: 'zk-exam', icon: 'cap',
        text: '中考进行中 · 正在考试：' + current.subject + '（' + hm(current.start) + '—' + hm(current.end) + '）'
      };
    }
    if (next) {
      var sameDay = new Date(next.start).getDate() === new Date(now).getDate();
      var t = sameDay
        ? '（' + hm(next.start) + '—' + hm(next.end) + '）'
        : '（' + md(next.start) + ' ' + hm(next.start) + '—' + hm(next.end) + '）';
      return { visible: true, cls: 'zk-exam', icon: 'cap', text: '中考进行中 · 下一场：' + next.subject + t };
    }
    return { visible: true, cls: 'zk-exam', icon: 'cap', text: '中考进行中' };
  }

  // 倒计时阶段
  if (diff > DAYS_2Y * DAY) {
    return { visible: true, cls: 'zk-green', icon: 'calendar', text: '距离' + config.name + '还有' + Math.ceil(diff / DAY) + '天' };
  }
  if (diff > DAYS_1Y * DAY) {
    return { visible: true, cls: 'zk-yellow', icon: 'calendar', text: '距离' + config.name + '还有' + Math.ceil(diff / DAY) + '天' };
  }
  var days = Math.floor(diff / DAY);
  var hours = Math.floor((diff % DAY) / HOUR);
  var mins = Math.floor((diff % HOUR) / MIN);
  var secs = Math.floor((diff % MIN) / 1000);
  if (diff > DAYS_1M * DAY) {
    return { visible: true, cls: 'zk-orange', icon: 'clock', text: '距离' + config.name + '还有' + days + '天' + hours + '小时' + mins + '分钟' };
  }
  return { visible: true, cls: 'zk-red', icon: 'clock', text: '距离' + config.name + '还有' + days + '天' + hours + '小时' + mins + '分' + secs + '秒' };
}

/* ============ DOM 渲染 ============ */
(function () {
  if (typeof document === 'undefined') return;
  var banner = document.getElementById('zkBanner');
  var textEl = document.getElementById('zkText');
  var iconL = document.getElementById('zkIconL');
  var iconR = document.getElementById('zkIconR');
  if (!banner || !textEl) return;

  var ICONS = {
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>'
  };

  function render() {
    // 总开关：关闭则不显示
    if (ZK_ENABLED !== 1) { banner.style.display = 'none'; return; }
    var r = zkCompute(Date.now(), { name: ZK_NAME, schedule: ZK_SCHEDULE });
    if (!r.visible) { banner.style.display = 'none'; return; }
    banner.style.display = 'block';
    banner.className = 'zk-banner ' + r.cls;
    textEl.textContent = r.text;
    var ic = ICONS[r.icon] || '';
    if (iconL) iconL.innerHTML = ic;
    if (iconR) iconR.innerHTML = ic;
  }

  render();
  setInterval(render, 1000);
})();
