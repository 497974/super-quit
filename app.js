'use strict';

const KEY = 'superquit.v1';
const HINT_KEY = 'superquit.hideInstallHint';
const SOS_SECONDS = 240;
const BREATH_CYCLE = 14; // 吸气 4 秒、屏住 4 秒、呼气 6 秒
const DAY = 864e5;

const TRIGGERS = ['饭后', '压力大', '无聊', '喝酒', '别人在抽', '刚起床', '情绪低落', '工作学习', '其他'];
const DISTRACTIONS = [
  '喝一大杯冰水', '起来走一走，换个地方待着', '去刷个牙', '嚼块口香糖，或者吃点水果',
  '做 10 个深蹲', '给他发条消息', '去洗把脸', '找点东西让手忙起来',
];
const PRAISE = ['每忍住一次，下一次就更容易一点。', '你比你想象的更厉害。', '烟瘾就是只纸老虎，你又赢了。', '这几分钟你撑过来了，真的很棒。'];
const PLACEHOLDERS = ['身上、头发上不再有烟味', '为了健康，想陪他更久一点', '省下的钱拿去旅行'];
// 参考 WHO / NHS 公开资料
const HEALTH = [
  { min: 20, title: '20 分钟', text: '心率和血压开始回落' },
  { min: 12 * 60, title: '12 小时', text: '血液里的一氧化碳降到正常水平' },
  { min: 2 * 1440, title: '2 天', text: '嗅觉和味觉开始变灵敏' },
  { min: 14 * 1440, title: '2 周', text: '血液循环改善，肺功能开始提升' },
  { min: 30 * 1440, title: '1 个月', text: '咳嗽、气短慢慢减少' },
  { min: 365 * 1440, title: '1 年', text: '冠心病风险降到吸烟者的一半左右' },
  { min: 5 * 365 * 1440, title: '5 年', text: '中风风险逐渐降到接近不吸烟的人' },
  { min: 10 * 365 * 1440, title: '10 年', text: '肺癌死亡风险降到吸烟者的一半左右' },
  { min: 15 * 365 * 1440, title: '15 年', text: '冠心病风险和不吸烟的人一样' },
];

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// ---------- 数据 ----------
function emptyDb() { return { profile: null, cravings: [], slips: [] }; }
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d === 'object') return { profile: d.profile || null, cravings: d.cravings || [], slips: d.slips || [] };
  } catch {}
  return emptyDb();
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('保存失败：' + e.message); }
}

// ---------- 时间和统计 ----------
function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d > 0 ? `${d}天 ${h}小时 ${m}分` : `${h}小时 ${pad(m)}分 ${pad(s % 60)}秒`;
}
function fmtLeft(ms) {
  const m = Math.max(1, Math.ceil(ms / 6e4));
  if (m >= 1440) return Math.ceil(m / 1440) + ' 天';
  if (m >= 60) return Math.ceil(m / 60) + ' 小时';
  return m + ' 分钟';
}
function fmtTime(iso) { const d = new Date(iso); return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtSec(sec) { return sec >= 60 ? `${Math.floor(sec / 60)}分${pad(sec % 60)}秒` : `${sec}秒`; }
function fmtMoney(n) { return n >= 1000 ? String(Math.round(n)) : String(Math.round(n * 10) / 10); }
function toLocalInput(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : h < 23 ? '晚上好' : '夜深了';
}

function stats(now = Date.now()) {
  const p = db.profile;
  const quit = new Date(p.quitAt).getTime();
  const started = now >= quit;
  const slipped = db.slips.reduce((a, s) => a + s.count, 0);
  const expected = started ? Math.floor((now - quit) / DAY * p.perDay) : 0;
  const notSmoked = Math.max(0, expected - slipped);
  // 从戒烟时刻起每满 24 小时算一天。无烟天数 = 已过完、且没抽过的天数；抽了不清零，只是那天不算。
  const total = started ? Math.floor((now - quit) / DAY) + 1 : 0;
  const slipDays = new Set(db.slips.map(s => Math.floor((new Date(s.at).getTime() - quit) / DAY)));
  let clean = 0;
  for (let k = 0; k < total - 1; k++) if (!slipDays.has(k)) clean++;
  const lastSlip = db.slips.reduce((m, s) => Math.max(m, new Date(s.at).getTime()), quit);
  const beat = db.cravings.filter(c => c.outcome === 'beat').length;
  return {
    quit, started, notSmoked, total, clean, beat,
    money: notSmoked * p.packPrice / p.perPack,
    since: started ? now - lastSlip : quit - now,
    cravings: db.cravings.length,
  };
}

function nextMilestone(quit) {
  const mins = (Date.now() - quit) / 6e4;
  const i = HEALTH.findIndex(h => mins < h.min);
  if (i < 0) return null;
  const prev = i ? HEALTH[i - 1].min : 0;
  return { ...HEALTH[i], pct: Math.max(0, Math.min(100, (mins - prev) / (HEALTH[i].min - prev) * 100)), left: (HEALTH[i].min - mins) * 6e4 };
}

// ---------- 页面 ----------
let view = 'home';
let sos = null;
let homeReason = null;

function render() {
  $('#tabbar').hidden = !db.profile;
  if (!db.profile) { $('#app').innerHTML = setupView(); return; }
  $('#app').innerHTML = { home: homeView, log: logView, body: bodyView, me: meView }[view]();
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
}

function hintHidden() { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } }
function installHint(onSetup) {
  if (!isIOS || isStandalone() || (!onSetup && hintHidden())) return '';
  return `<section class="card hint">
    <p><b>📲 先添加到主屏幕</b></p>
    <p class="small">点 Safari 底部的「分享」按钮，选「添加到主屏幕」，以后从桌面图标打开，用起来就像 App。</p>
    <p class="small muted">网页里和桌面图标里的数据是分开存的，${onSetup ? '建议加到桌面后再填写。' : '记得以后都从桌面图标打开。'}</p>
    ${onSetup ? '' : '<button class="link small" data-action="hide-hint">知道了，不再提示</button>'}
  </section>`;
}

function setupView() {
  return `
  <header class="greet"><p class="muted">你好呀</p><h1>开始无烟生活 🌱</h1></header>
  ${installHint(true)}
  <p class="intro muted">先填几样东西，用来算你少抽了多少、省了多少钱。以后随时可以在「设置」里改。</p>
  ${profileForm(null)}`;
}

function profileForm(p) {
  const r = p?.reasons || [];
  return `<form id="profile" class="card form">
    <label>怎么称呼你<input name="name" value="${esc(p?.name ?? 'Super')}" maxlength="20" required></label>
    <div class="row">
      <label>以前每天抽几根<input name="perDay" type="number" inputmode="numeric" min="1" max="100" value="${p?.perDay ?? ''}" placeholder="10" required></label>
      <label>一包几根<input name="perPack" type="number" inputmode="numeric" min="1" max="100" value="${p?.perPack ?? 20}" required></label>
    </div>
    <label>一包多少钱（元）<input name="packPrice" type="number" inputmode="decimal" min="0" step="0.1" value="${p?.packPrice ?? ''}" placeholder="25" required></label>
    <label>从什么时候开始戒<input name="quitAt" type="datetime-local" value="${toLocalInput(p ? new Date(p.quitAt) : new Date())}" required></label>
    <fieldset>
      <legend>为什么想戒烟？写给以后想抽烟的自己</legend>
      ${[0, 1, 2].map(i => `<input name="reason" maxlength="60" value="${esc(r[i] ?? '')}" placeholder="${PLACEHOLDERS[i]}">`).join('')}
    </fieldset>
    <button class="primary" type="submit">${p ? '保存' : '开始我的无烟生活'}</button>
  </form>`;
}

const tile = (label, value, unit) => `<div class="tile"><p class="muted">${label}</p><b>${value}</b>${unit ? `<small>${unit}</small>` : ''}</div>`;

function homeView() {
  const p = db.profile, s = stats();
  if (homeReason === null) homeReason = pick(p.reasons) || '';
  const m = s.started && nextMilestone(s.quit);
  return `
  ${installHint(false)}
  <header class="greet"><p class="muted">${greeting()}</p><h1>${esc(p.name)}</h1></header>
  <section class="card hero">
    ${s.started ? `
      <div class="big"><span class="num">${s.clean}</span><span class="unit">天无烟</span></div>
      <p class="muted">戒烟第 ${s.total} 天 · 距离上一根 <b id="since">${fmtDur(s.since)}</b></p>`
    : `
      <div class="big"><span class="unit">距离开始戒烟还有</span></div>
      <p class="countdown" id="since">${fmtDur(s.since)}</p>`}
  </section>
  <button class="sos" data-action="sos"><span class="sos-title">想抽烟了</span><span class="sos-sub">按我，陪你撑过这 4 分钟</span></button>
  <section class="grid">
    ${tile('少抽了', s.notSmoked, '根')}
    ${tile('省下了', '¥' + fmtMoney(s.money), '')}
    ${tile('打败烟瘾', s.beat, '次')}
    ${tile('忍住率', s.cravings ? Math.round(s.beat / s.cravings * 100) + '%' : '—', '')}
  </section>
  ${m ? `<section class="card" data-action="tab" data-v="body">
    <p class="muted small">下一个身体变化 · 还有 ${fmtLeft(m.left)}</p>
    <p class="ms-title"><b>${m.title}</b>　${m.text}</p>
    <div class="bar"><i style="width:${m.pct}%"></i></div>
  </section>` : ''}
  ${homeReason ? `<section class="card"><p class="muted small">你说过</p><p class="quote">“${esc(homeReason)}”</p></section>` : ''}`;
}

function logView() {
  const list = [...db.cravings].sort((a, b) => b.at.localeCompare(a.at));
  const counts = {};
  for (const c of db.cravings) {
    if (!c.trigger) continue;
    const t = counts[c.trigger] ||= { n: 0, beat: 0 };
    t.n++;
    if (c.outcome === 'beat') t.beat++;
  }
  const top = Object.entries(counts).sort((a, b) => b[1].n - a[1].n);
  const max = top.length ? top[0][1].n : 1;
  return `
  <header class="greet"><h1>记录</h1></header>
  <div class="row2">
    <button class="ghost" data-action="manual" data-v="beat">＋ 补记忍住了</button>
    <button class="ghost" data-action="manual" data-v="smoked">＋ 补记抽了</button>
  </div>
  ${top.length ? `<section class="card"><h3>什么时候最容易想抽</h3>${top.map(([t, v]) => `
    <div class="trig">
      <div class="trig-head"><span>${esc(t)}</span><span class="muted">${v.n} 次 · 忍住 ${v.beat} 次</span></div>
      <div class="bar"><i style="width:${v.n / max * 100}%"></i></div>
    </div>`).join('')}</section>` : ''}
  <section class="card"><h3>全部记录</h3>
    ${list.length ? `<ul class="entries">${list.map(entryRow).join('')}</ul>`
      : '<p class="muted empty">还没有记录。想抽烟的时候，按首页那个大按钮就好。</p>'}
  </section>`;
}

function entryRow(c) {
  const n = db.slips.filter(s => s.cravingId === c.id).reduce((a, s) => a + s.count, 0);
  const bits = [c.outcome === 'beat' ? '忍住了' : `抽了 ${n} 根`];
  if (c.trigger) bits.push(esc(c.trigger));
  if (c.sec) bits.push(`撑了 ${fmtSec(c.sec)}`);
  return `<li>
    <span class="ico">${c.outcome === 'beat' ? '💪' : '🚬'}</span>
    <div><p>${bits.join(' · ')}</p><p class="muted small">${fmtTime(c.at)}${c.manual ? ' · 补记' : ''}</p></div>
    <button class="del" data-action="del" data-v="${esc(c.id)}" aria-label="删除">×</button>
  </li>`;
}

function bodyView() {
  const mins = (Date.now() - new Date(db.profile.quitAt).getTime()) / 6e4;
  return `
  <header class="greet"><h1>身体在变好</h1><p class="muted">从开始戒烟算起，身体会一步一步恢复</p></header>
  <section class="card"><ol class="timeline">${HEALTH.map((h, i) => {
    const prev = i ? HEALTH[i - 1].min : 0;
    const done = mins >= h.min, cur = !done && mins >= prev;
    const pct = cur ? (mins - prev) / (h.min - prev) * 100 : 0;
    return `<li class="${done ? 'done' : cur ? 'cur' : ''}">
      <span class="dot">${done ? '✓' : ''}</span>
      <div>
        <p><b>${h.title}</b></p><p>${h.text}</p>
        ${cur ? `<div class="bar"><i style="width:${pct}%"></i></div><p class="muted small">还有 ${fmtLeft((h.min - mins) * 6e4)}</p>` : ''}
      </div>
    </li>`;
  }).join('')}</ol></section>
  <p class="muted small note">参考世界卫生组织（WHO）和英国 NHS 的公开资料，每个人情况不同，仅供参考。</p>`;
}

function meView() {
  return `
  <header class="greet"><h1>设置</h1></header>
  ${profileForm(db.profile)}
  <section class="card">
    <h3>备份数据</h3>
    <p class="muted small">数据只存在这台手机上。换手机之前，先复制一份备份发给自己（备忘录、微信都行）。</p>
    <div class="row2">
      <button class="ghost" data-action="export">复制备份</button>
      <button class="ghost" data-action="import-open">从备份恢复</button>
    </div>
    <div id="import" hidden>
      <textarea id="import-text" rows="4" placeholder="把备份内容粘贴到这里"></textarea>
      <button class="primary" data-action="import">恢复</button>
    </div>
  </section>
  <button class="danger" data-action="reset">清空所有数据</button>`;
}

// ---------- 烟瘾急救 ----------
function tipAt(i) {
  const reasons = db.profile.reasons.map(t => ({ k: '你说过', t }));
  const all = [];
  for (let j = 0; j < Math.max(reasons.length, DISTRACTIONS.length); j++) {
    if (reasons[j]) all.push(reasons[j]);
    if (DISTRACTIONS[j]) all.push({ k: '试试这个', t: DISTRACTIONS[j] });
  }
  return all[i % all.length];
}

function startSOS(manual, outcome) {
  const now = Date.now();
  sos = {
    t0: now, start: now, carry: 0, endedAt: now, manual,
    phase: manual ? 'detail' : 'breathe', outcome: outcome || null,
    trigger: null, count: 1, tip: Math.floor(Math.random() * 100), shownTip: null, timeUp: false,
  };
  if (!manual) keepAwake(true);
  renderSOS();
}

function closeSOS() {
  sos = null;
  keepAwake(false);
  renderSOS();
  render();
}

function toAsk(timeUp) {
  sos.endedAt = Date.now();
  sos.timeUp = timeUp;
  sos.phase = 'ask';
  keepAwake(false);
  renderSOS();
}

function renderSOS() {
  const o = $('#overlay');
  document.body.classList.toggle('lock', !!sos);
  if (!sos) { o.hidden = true; o.innerHTML = ''; return; }
  o.hidden = false;
  o.innerHTML = sosView();
  o.scrollTop = 0;
  if (sos.phase === 'breathe') tickSOS();
}

function sosView() {
  if (sos.phase === 'breathe') {
    const delay = ((Date.now() - sos.start) / 1000) % BREATH_CYCLE;
    return `
    <p class="sos-head muted">烟瘾一般几分钟就会过去，我陪你</p>
    <div class="sos-time" id="sos-time">4:00</div>
    <div class="breath"><div class="ring" style="animation-delay:-${delay.toFixed(2)}s"></div><span id="breath-label">吸气</span></div>
    <div class="card tip" data-action="sos-tip">
      <p class="muted small" id="tip-k"></p><p id="tip-t"></p><p class="muted small">点一下换一个</p>
    </div>
    <button class="primary" data-action="sos-end">好多了，结束</button>`;
  }
  if (sos.phase === 'ask') {
    return `<div class="center">
      <div class="emoji">${sos.timeUp ? '⏰' : '🌿'}</div>
      <h2>${sos.timeUp ? '4 分钟到了！' : '辛苦了'}</h2>
      <p class="muted">这次撑过去了吗？</p>
      <button class="choice beat" data-action="sos-outcome" data-v="beat">撑过去了 💪</button>
      <button class="choice smoked" data-action="sos-outcome" data-v="smoked">还是抽了</button>
      <button class="link" data-action="sos-back">还没过去，再陪我一会</button>
    </div>`;
  }
  if (sos.phase === 'detail') {
    const beat = sos.outcome === 'beat';
    const title = sos.manual ? (beat ? '补记：忍住了一次' : '补记：抽了') : (beat ? '太棒了！🎉' : '没关系，记下来就好');
    return `<div class="center">
      <h2>${title}</h2>
      ${beat ? '' : `<p class="muted">抽了几根？</p>
        <div class="stepper">
          <button data-action="sos-count" data-v="-1" aria-label="减一">−</button>
          <b id="sos-count">${sos.count}</b>
          <button data-action="sos-count" data-v="1" aria-label="加一">＋</button>
        </div>`}
      <p class="muted">是什么让你想抽？（可以不选）</p>
      <div class="chips">${TRIGGERS.map(t => `<button class="chip${sos.trigger === t ? ' on' : ''}" data-action="sos-trigger" data-v="${t}">${t}</button>`).join('')}</div>
      <button class="primary" data-action="sos-save">完成</button>
      ${sos.manual ? '<button class="link" data-action="sos-close">取消</button>' : ''}
    </div>`;
  }
  // done
  const s = stats();
  const ok = sos.manual ? '好的' : '回到首页';
  if (sos.outcome === 'beat') {
    return `<div class="center">
      <div class="emoji">🎉</div>
      <h2>这是你第 ${s.beat} 次打败烟瘾</h2>
      <p class="muted">${pick(PRAISE)}</p>
      <button class="primary" data-action="sos-close">${ok}</button>
    </div>`;
  }
  return `<div class="center">
    <div class="emoji">🤍</div>
    <h2>没关系，${esc(db.profile.name)}</h2>
    <p class="muted">戒烟路上偶尔破戒很常见，大多数人都要试好几次才成功。<br>无烟天数不会清零，你已经有 ${s.clean} 天无烟了。<br>下次想抽的时候，先按那个按钮。</p>
    <button class="primary" data-action="sos-close">${ok}</button>
  </div>`;
}

function tickSOS() {
  const el = (Date.now() - sos.start) / 1000;
  const left = Math.ceil(SOS_SECONDS - el);
  if (left <= 0) return toAsk(true);
  $('#sos-time').textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
  const c = el % BREATH_CYCLE;
  $('#breath-label').textContent = c < 4 ? '吸气' : c < 8 ? '屏住' : '呼气';
  const i = sos.tip + Math.floor(el / 20);
  if (i !== sos.shownTip) {
    sos.shownTip = i;
    const t = tipAt(i);
    $('#tip-k').textContent = t.k;
    $('#tip-t').textContent = t.t;
  }
}

function saveSOS() {
  const ran = Math.min(SOS_SECONDS, (sos.endedAt - sos.start) / 1000);
  const c = {
    id: uid(), at: new Date(sos.t0).toISOString(),
    sec: sos.manual ? 0 : Math.round(sos.carry + ran),
    outcome: sos.outcome, trigger: sos.trigger, manual: sos.manual,
  };
  db.cravings.push(c);
  if (sos.outcome === 'smoked') db.slips.push({ id: uid(), at: new Date().toISOString(), count: sos.count, cravingId: c.id });
  save();
  sos.phase = 'done';
  renderSOS();
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}

// ---------- 交互 ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

const actions = {
  tab(v) { view = v; if (v === 'home') homeReason = null; render(); scrollTo(0, 0); },
  sos() { startSOS(false); },
  manual(v) { startSOS(true, v); },
  'sos-end'() { toAsk(false); },
  'sos-back'() {
    if (sos.timeUp) { sos.carry += SOS_SECONDS; sos.start = Date.now(); }
    sos.phase = 'breathe';
    keepAwake(true);
    renderSOS();
  },
  'sos-outcome'(v) { sos.outcome = v; sos.phase = 'detail'; renderSOS(); },
  'sos-tip'() { sos.tip++; tickSOS(); },
  'sos-count'(v) { sos.count = Math.max(1, Math.min(40, sos.count + Number(v))); $('#sos-count').textContent = sos.count; },
  'sos-trigger'(v) { sos.trigger = sos.trigger === v ? null : v; renderSOS(); },
  'sos-save'() { saveSOS(); },
  'sos-close'() { closeSOS(); },
  del(id) {
    if (!confirm('删除这条记录？')) return;
    db.cravings = db.cravings.filter(c => c.id !== id);
    db.slips = db.slips.filter(s => s.cravingId !== id);
    save();
    render();
  },
  export() {
    const text = JSON.stringify(db);
    const fallback = () => prompt('复制下面这段文字，保存好：', text);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('已复制，粘贴到备忘录或微信里存好'), fallback);
    else fallback();
  },
  'import-open'() { $('#import').hidden = false; $('#import-text').focus(); },
  import() {
    let d;
    try { d = JSON.parse($('#import-text').value); } catch {}
    if (!d || !d.profile || !d.profile.quitAt) return toast('内容不对，没法恢复');
    if (!confirm('用备份覆盖现在的数据？')) return;
    db = { profile: d.profile, cravings: d.cravings || [], slips: d.slips || [] };
    save();
    view = 'home';
    homeReason = null;
    render();
    toast('恢复好了');
  },
  reset() {
    if (!confirm('真的要清空所有数据吗？清空后没法找回。')) return;
    db = emptyDb();
    save();
    view = 'home';
    homeReason = null;
    render();
  },
  'hide-hint'() { try { localStorage.setItem(HINT_KEY, '1'); } catch {} render(); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el.dataset.v, el);
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'profile') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const quit = new Date(f.get('quitAt'));
  if (isNaN(quit)) return toast('开始时间不对');
  const firstTime = !db.profile;
  db.profile = {
    name: String(f.get('name')).trim() || 'Super',
    perDay: Number(f.get('perDay')),
    perPack: Number(f.get('perPack')),
    packPrice: Number(f.get('packPrice')),
    quitAt: quit.toISOString(),
    reasons: f.getAll('reason').map(r => String(r).trim()).filter(Boolean),
  };
  save();
  view = 'home';
  homeReason = null;
  render();
  scrollTo(0, 0);
  toast(firstTime ? `加油，${db.profile.name}，我们开始啦 🌱` : '已保存');
});

// 首页计时每秒走，跨分钟时整页刷新（天数、里程碑会变）
let lastSec = 0, lastMin = Math.floor(Date.now() / 6e4);
setInterval(() => {
  if (sos?.phase === 'breathe') return tickSOS();
  if (sos || !db.profile || view !== 'home') return;
  const now = Date.now();
  const min = Math.floor(now / 6e4);
  if (min !== lastMin) { lastMin = min; render(); return; }
  const sec = Math.floor(now / 1000);
  if (sec === lastSec) return;
  lastSec = sec;
  const el = $('#since');
  if (el) el.textContent = fmtDur(stats(now).since);
}, 250);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (sos?.phase === 'breathe') { keepAwake(true); renderSOS(); }
  else if (!sos && view === 'home') render();
});

navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
