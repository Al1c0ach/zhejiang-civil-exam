/* =========================================================================
   浙考刷题 · 应用核心
   数据由 data/*.js 提供（window.BANK），练习引擎见 assets/practice.js
   ========================================================================= */
window.APP = (function () {
  "use strict";

  /* ---------------- 数据准备 ---------------- */
  const BANK = window.BANK || { meta: {}, modules: [], materials: {}, questions: [], essays: [] };
  const MODULES = BANK.modules || [];
  const QMAP = new Map();
  (BANK.questions || []).forEach((q) => {
    QMAP.set(q.id, q);
    if (!q.answer || !q.answer.length) q.answer = [0];
    if (typeof q.answer === "number") q.answer = [q.answer];
  });
  const MODMAP = new Map(MODULES.map((m) => [m.id, m]));

  const LETTERS = ["A", "B", "C", "D", "E"];

  /* ---------------- 存储 ---------------- */
  const LS_KEY = "zjks.v1.state";
  let memory = null;
  let canStore = true;

  const DEFAULT_SETTINGS = {
    theme: "auto",
    fontSize: "md",
    autoNext: false,
    dailyGoal: 20,
    examDate: "",
    explainFirst: false,
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    records: {},
    days: {},
    history: [],
    exams: [],
    essays: {},
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(state, {
          records: parsed.records || {},
          days: parsed.days || {},
          history: parsed.history || [],
          exams: parsed.exams || [],
          essays: parsed.essays || {},
        });
        state.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
      }
    } catch (err) {
      // file:// 或隐私模式下 localStorage 不可用，退回内存存储。
      canStore = false;
    }
    try {
      localStorage.setItem(LS_KEY + ".probe", "1");
      localStorage.removeItem(LS_KEY + ".probe");
    } catch (err) {
      canStore = false;
    }
  }

  let saveTimer = null;
  function save(immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    const write = () => {
      const payload = JSON.stringify({
        settings: state.settings,
        records: state.records,
        days: state.days,
        history: state.history,
        exams: state.exams,
        essays: state.essays,
        updated: Date.now(),
      });
      if (canStore) {
        try { localStorage.setItem(LS_KEY, payload); } catch (err) { canStore = false; memory = payload; }
      } else {
        memory = payload;
      }
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 220);
  }

  /* ---------------- 工具 ---------------- */
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const pad = (n) => String(n).padStart(2, "0");
  const dstr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const clampPct = (v) => Math.max(0, Math.min(100, Math.round(v)));
  const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);

  function fmtDuration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
    return `${pad(m)}:${pad(sec)}`;
  }

  function fmtMinutes(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return "不到 1 分钟";
    if (m < 60) return `${m} 分钟`;
    return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
  }

  /** 倒计时：一小时内显示 mm:ss，超过一小时显示 h:mm:ss */
  function fmtCountdown(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    if (s <= 3600) return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }

  /* ---------------- 图标 ---------------- */
  const ICONS = {
    home: '<path d="M3 10.4 12 3l9 7.4"/><path d="M5.6 9.4V21h12.8V9.4"/><path d="M9.8 21v-6h4.4v6"/>',
    book: '<path d="M4 5.2A2.2 2.2 0 0 1 6.2 3H20v15.5H6.2A2.2 2.2 0 0 0 4 20.7z"/><path d="M4 18.5A2.2 2.2 0 0 1 6.2 16.3H20"/><path d="M8.4 7.5h7.2M8.4 11h4.6"/>',
    rotate: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.3"/><path d="M3.5 3.6v4.7h4.7"/>',
    paper: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h6M9 16h3.5"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16.5v-5M12.5 16.5V7.5M17 16.5v-3"/>',
    settings: '<path d="M4 7h6M15 7h5"/><circle cx="12.5" cy="7" r="2.4"/><path d="M4 17h4M13 17h7"/><circle cx="10.5" cy="17" r="2.4"/>',
    moon: '<path d="M20.4 14.1A8.4 8.4 0 0 1 9.9 3.6 8.5 8.5 0 1 0 20.4 14.1Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    search: '<circle cx="11" cy="11" r="6.6"/><path d="m20 20-4.4-4.4"/>',
    chevronRight: '<path d="m9 5 7 7-7 7"/>',
    chevronDown: '<path d="m5 9 7 7 7-7"/>',
    arrowLeft: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    clock: '<circle cx="12" cy="12.5" r="8.2"/><path d="M12 8v4.8l3 1.9"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r=".9" fill="currentColor"/>',
    flame: '<path d="M12 22c4.3 0 6.9-2.9 6.9-6.6 0-3.1-1.8-5.1-3.6-7.2-.9-1.1-1.8-2.2-2.4-3.6-2.3 2.2-3 4.4-3 6.1 0 1.1.3 2.1.8 3.1-.9-.3-1.6-1-2.2-1.9-.3 1.4-.6 2.8-.6 4.2C8 19.1 9.7 22 12 22Z"/>',
    play: '<path d="M7 4.8v14.4l12-7.2z"/>',
    check: '<path d="m5 12.8 4.4 4.4L19 6.8"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    star: '<path d="m12 3.6 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.9-5.4 2.9 1-6L3.3 10l6-.9Z"/>',
    trash: '<path d="M4 7h16"/><path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6.5 7l.9 12.1a1.9 1.9 0 0 0 1.9 1.9h5.4a1.9 1.9 0 0 0 1.9-1.9L17.5 7"/><path d="M10.5 11v6M13.5 11v6"/>',
    download: '<path d="M12 4v10"/><path d="m8 10.5 4 4 4-4"/><path d="M4.5 18.5h15"/>',
    upload: '<path d="M12 15V5"/><path d="m8 8.5 4-4 4 4"/><path d="M4.5 18.5h15"/>',
    info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4"/><circle cx="12" cy="8" r=".9" fill="currentColor"/>',
    alert: '<path d="M12 3.6 22 20.4H2Z"/><path d="M12 9.6v4.6"/><circle cx="12" cy="17.4" r=".9" fill="currentColor"/>',
    spark: '<path d="M12 3.5 13.9 9l5.6.4-4.4 3.6 1.5 5.5-4.6-3.2-4.6 3.2 1.5-5.5L4.5 9.4 10.1 9Z"/>',
    layers: '<path d="m12 3.5 8.5 4.4L12 12.3 3.5 7.9Z"/><path d="m3.5 12.4 8.5 4.4 8.5-4.4"/><path d="m3.5 16.6 8.5 4.4 8.5-4.4"/>',
    flag: '<path d="M5.5 21V4"/><path d="M5.5 4.8h12.2l-2.4 4 2.4 4H5.5"/>',
    list: '<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><circle cx="4.6" cy="6.5" r="1.1" fill="currentColor"/><circle cx="4.6" cy="12" r="1.1" fill="currentColor"/><circle cx="4.6" cy="17.5" r="1.1" fill="currentColor"/>',
    refresh: '<path d="M3.8 12a8.2 8.2 0 0 1 14-5.8L20 8.4"/><path d="M20 3.8v4.6h-4.6"/><path d="M20.2 12a8.2 8.2 0 0 1-14 5.8L4 15.6"/><path d="M4 20.2v-4.6h4.6"/>',
    edit: '<path d="M12 20h8"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.6 18.4 3.5 19.5l1.1-4.1Z"/>',
    calendar: '<rect x="3.5" y="5.2" width="17" height="15.3" rx="2.2"/><path d="M3.5 10h17M8 3.5v3.4M16 3.5v3.4"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0Z"/><path d="M8 5.5H5.2v1.8A3.3 3.3 0 0 0 8.5 10.6M16 5.5h2.8v1.8a3.3 3.3 0 0 1-3.3 3.3"/><path d="M12 13.5V17M9 20.5h6"/>',
    zap: '<path d="M13.4 2.8 4.9 13.6h5.3l-1.1 7.6 8.4-10.8h-5.2Z"/>',
    eye: '<path d="M2.6 12S6 5.9 12 5.9 21.4 12 21.4 12 18 18.1 12 18.1 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.9"/>',
  };

  function icon(name, cls) {
    const body = ICONS[name] || ICONS.info;
    return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  /* ---------------- 记录与统计 ---------------- */
  function blankRecord() {
    return { n: 0, r: 0, w: 0, last: null, ts: 0, star: false, inWrong: false, streakRight: 0, pick: null };
  }

  function recOf(id) {
    return state.records[id] || null;
  }

  function recordAnswer(q, picked, ok) {
    const rec = state.records[q.id] || (state.records[q.id] = blankRecord());
    rec.n += 1;
    rec.ts = Date.now();
    rec.pick = picked;
    if (ok) {
      rec.r += 1;
      rec.streakRight = (rec.streakRight || 0) + 1;
      if (rec.streakRight >= 2) rec.inWrong = false;
    } else {
      rec.w += 1;
      rec.streakRight = 0;
      rec.inWrong = true;
    }
    rec.last = ok ? "right" : "wrong";

    const key = dstr();
    const day = state.days[key] || (state.days[key] = { n: 0, r: 0 });
    day.n += 1;
    if (ok) day.r += 1;

    state.history.unshift({ t: Date.now(), id: q.id, ok: !!ok });
    if (state.history.length > 400) state.history.length = 400;
    save();
    updateBadges();
  }

  function toggleStar(id) {
    const rec = state.records[id] || (state.records[id] = blankRecord());
    rec.star = !rec.star;
    save(true);
    updateBadges();
    return rec.star;
  }

  function inWrong(id) {
    const rec = recOf(id);
    return !!(rec && rec.inWrong);
  }

  function wrongList() {
    return BANK.questions.filter((q) => inWrong(q.id));
  }

  function favList() {
    return BANK.questions.filter((q) => {
      const rec = recOf(q.id);
      return !!(rec && rec.star);
    });
  }

  function totals() {
    let done = 0, right = 0, attempts = 0;
    Object.values(state.records).forEach((rec) => {
      if (rec.n > 0) done += 1;
      attempts += rec.n;
      right += rec.r;
    });
    return { done, right, attempts, total: BANK.questions.length, acc: pct(right, attempts) };
  }

  function moduleStat(modId) {
    const qs = BANK.questions.filter((q) => q.module === modId);
    let done = 0, right = 0, attempts = 0;
    qs.forEach((q) => {
      const rec = recOf(q.id);
      if (!rec) return;
      if (rec.n > 0) done += 1;
      attempts += rec.n;
      right += rec.r;
    });
    return { total: qs.length, done, attempts, right, acc: pct(right, attempts), progress: pct(done, qs.length) };
  }

  function todayStat() {
    const d = state.days[dstr()] || { n: 0, r: 0 };
    return { n: d.n, r: d.r };
  }

  function streakDays() {
    let count = 0;
    const cursor = new Date();
    // 今天还没练，从昨天开始算，避免刚起床就显示断签。
    if (!(state.days[dstr(cursor)] || {}).n) cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 400; i += 1) {
      const key = dstr(cursor);
      if ((state.days[key] || {}).n > 0) {
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
    return count;
  }

  function lastDays(n) {
    const out = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - (n - 1));
    for (let i = 0; i < n; i += 1) {
      const key = dstr(cursor);
      const day = state.days[key] || { n: 0, r: 0 };
      out.push({ key, n: day.n, r: day.r, label: `${cursor.getMonth() + 1}/${cursor.getDate()}`, today: key === dstr() });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  function examCountdown() {
    if (!state.settings.examDate) return null;
    const target = new Date(state.settings.examDate + "T09:00:00");
    if (isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const days = Math.round((target - today) / 86400000);
    return { days, date: state.settings.examDate };
  }

  /* ---------------- 题库筛选 ---------------- */
  function filterQuestions(opts) {
    const o = opts || {};
    return BANK.questions.filter((q) => {
      if (o.module && o.module !== "all" && q.module !== o.module) return false;
      if (o.status && o.status !== "all") {
        const rec = recOf(q.id);
        if (o.status === "undone" && rec && rec.n > 0) return false;
        if (o.status === "wrong" && !inWrong(q.id)) return false;
        if (o.status === "fav" && !(rec && rec.star)) return false;
        if (o.status === "done" && !(rec && rec.n > 0)) return false;
      }
      if (o.difficulty && o.difficulty !== "all" && String(q.diff) !== String(o.difficulty)) return false;
      if (o.keyword) {
        const k = o.keyword.trim().toLowerCase();
        if (k) {
          const hay = [q.stem, q.explain, (q.tags || []).join(" "), q.sub || ""].join(" ").toLowerCase();
          if (!hay.includes(k)) return false;
        }
      }
      return true;
    });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------------- 主题 / 字号 ---------------- */
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function applyTheme() {
    const mode = state.settings.theme;
    const dark = mode === "dark" || (mode === "auto" && media && media.matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#101319" : "#12233d");
    document.querySelectorAll('[data-action="toggle-theme"]').forEach((btn) => {
      btn.innerHTML = icon(dark ? "sun" : "moon");
      btn.setAttribute("aria-label", dark ? "切换到浅色" : "切换到深色");
    });
  }

  function applyFontSize() {
    document.documentElement.setAttribute("data-fontsize", state.settings.fontSize || "md");
  }

  if (media && media.addEventListener) {
    media.addEventListener("change", () => {
      if (state.settings.theme === "auto") applyTheme();
    });
  }

  /* ---------------- 路由 ---------------- */
  const view = document.getElementById("view");
  const modalRoot = document.getElementById("modalRoot");
  const toastRoot = document.getElementById("toastRoot");
  const routes = {
    home: () => viewHome(),
    bank: () => viewBank(),
    wrong: () => viewWrong(),
    fav: () => viewFav(),
    stats: () => viewStats(),
    essay: () => viewEssay(),
    settings: () => viewSettings(),
    practice: () => (APP.views.practice ? APP.views.practice() : viewHome()),
    result: () => (APP.views.result ? APP.views.result() : viewHome()),
    exam: () => (APP.views.exam ? APP.views.exam() : viewHome()),
  };
  const TITLES = {
    home: ["学习台", "浙江省公务员 · 事业单位"],
    bank: ["分类题库", "按模块、难度、状态筛选"],
    wrong: ["错题本", "连续答对 2 次自动移出"],
    fav: ["收藏夹", "标记的重点题"],
    stats: ["学习数据", "进度、正确率与练习记录"],
    essay: ["申论专区", "材料、题目与作答要点"],
    settings: ["设置与说明", "偏好、数据与免责声明"],
    practice: ["练习中", ""],
    result: ["练习报告", ""],
    exam: ["全真模拟", ""],
  };

  function currentRoute() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [name, query] = hash.split("?");
    return { name: name || "home", query: query || "" };
  }

  function parseQuery(q) {
    const out = {};
    q.split("&").filter(Boolean).forEach((pair) => {
      const [k, v] = pair.split("=");
      out[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
    return out;
  }

  function render() {
    const { name, query } = currentRoute();
    const fn = routes[name] || routes.home;
    const meta = TITLES[name] || TITLES.home;
    document.title = `${meta[0]} · 浙考刷题`;
    closeModal(true);
    view.innerHTML = "";
    fn(parseQuery(query));
    view.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    markNav(name);
    updateBadges();
  }

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function markNav(name) {
    document.querySelectorAll("[data-route]").forEach((el) => {
      const r = el.getAttribute("data-route");
      el.classList.toggle("is-active", r === name);
    });
  }

  window.addEventListener("hashchange", render);

  /* ---------------- 提示与弹层 ---------------- */
  let toastTimer = null;
  function toast(message, type) {
    if (!toastRoot) return;
    const el = document.createElement("div");
    el.className = "toast" + (type ? ` toast--${type}` : "");
    el.textContent = message;
    toastRoot.appendChild(el);
    clearTimeout(toastTimer);
    setTimeout(() => {
      el.style.transition = "opacity .25s, transform .25s";
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      setTimeout(() => el.remove(), 260);
    }, 1900);
  }

  let modalEl = null;
  function openModal(html, opts) {
    closeModal(true);
    const o = opts || {};
    modalRoot.innerHTML = `<div class="modal-root"><div class="modal-backdrop" data-close="1"></div>
      <div class="modal ${o.wide ? "modal--wide" : ""}" role="dialog" aria-modal="true">
        ${o.head === false ? "" : `<div class="modal__head">${o.title ? `<div style="flex:1"><h2>${o.title}</h2>${o.subtitle ? `<p>${o.subtitle}</p>` : ""}</div>` : ""}
        <button class="icon-btn" data-close="1" aria-label="关闭">${icon("x")}</button></div>`}
        <div class="modal__body">${html}</div>
        ${o.footer ? `<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">${o.footer}</div>` : ""}
      </div></div>`;
    document.body.classList.add("is-locked");
    modalEl = modalRoot.firstElementChild;
    const focusable = modalEl.querySelector("button, a, input, select, textarea");
    if (focusable) focusable.focus({ preventScroll: true });
  }

  function closeModal(silent) {
    if (!modalRoot) return;
    if (!modalRoot.firstElementChild) return;
    modalRoot.innerHTML = "";
    document.body.classList.remove("is-locked");
    modalEl = null;
    if (!silent) markNav(currentRoute().name);
  }

  document.addEventListener("click", (e) => {
    const closer = e.target.closest("[data-close]");
    if (closer) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl) closeModal();
  });

  /* ---------------- 动作注册 ---------------- */
  const actions = {};
  function on(name, fn) {
    actions[name] = fn;
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const name = el.getAttribute("data-action");
    const fn = actions[name];
    if (!fn) return;
    if (el.tagName === "A" && el.getAttribute("href") === "#") e.preventDefault();
    fn(el, e);
  });

  /* ---------------- 首页 ---------------- */
  function moduleRing(stat, color) {
    return `<div class="ring" style="--p:${clampPct(stat.progress)};--ring-color:${color}" aria-label="完成度 ${clampPct(stat.progress)}%">
      <b>${clampPct(stat.progress)}%</b></div>`;
  }

  function moduleCard(m) {
    const s = moduleStat(m.id);
    return `<a class="mod" href="#/practice?m=${m.id}" data-mod="${m.id}" style="--accent:${m.color}">
      <div class="mod__body">
        <div class="mod__top">
          <span class="mod__dot"></span>
          <span class="mod__name">${esc(m.name)}</span>
          <span class="mod__group">${esc(m.group)}</span>
        </div>
        <p class="mod__desc">${esc(m.desc)}</p>
        <div class="mod__bar"><i style="width:${clampPct(s.progress)}%"></i></div>
        <div class="mod__foot">
          <span>已做 ${s.done} / ${s.total} 题</span>
          <span class="mod__acc">${s.attempts ? `正确率 ${clampPct(s.acc)}%` : "待开始"}</span>
        </div>
      </div>
      ${moduleRing(s, m.color)}
    </a>`;
  }

  function quickCard(opts) {
    return `<button class="quick" data-action="${opts.action}" style="--accent:${opts.color}">
      <span class="quick__ico">${icon(opts.icon)}</span>
      <strong>${opts.title}</strong>
      <span>${opts.desc}</span>
      <span class="quick__meta">${opts.meta}</span>
    </button>`;
  }

  function daysChart(data, opts) {
    const o = opts || {};
    const max = Math.max(1, ...data.map((d) => d.n));
    return `<div class="days" role="img" aria-label="每日练习量">
      ${data
        .map(
          (d) => `<div class="day" title="${d.key}：${d.n} 题">
            <span class="day__count">${d.n || ""}</span>
            <span class="day__bar ${d.n ? "is-on" : ""} ${d.today ? "is-today" : ""}" style="height:${Math.max(3, (d.n / max) * (o.height || 78))}px"></span>
            <span class="day__label">${d.label}</span>
          </div>`
        )
        .join("")}
    </div>`;
  }

  function viewHome() {
    const t = totals();
    const today = todayStat();
    const goal = state.settings.dailyGoal || 20;
    const goalPct = clampPct(pct(today.n, goal));
    const streak = streakDays();
    const cd = examCountdown();
    const wrong = wrongList().length;
    const favs = favList().length;
    const week = lastDays(7);

    const mods = MODULES.filter((m) => m.group !== "申论");

    view.innerHTML = `
      <section class="hero">
        <div class="hero__kicker">浙江省考 · 事业单位 · 原创模拟题库</div>
        <h1>把每一次练习，都练成<em>上岸的底气</em></h1>
        <p class="hero__sub">行测五大模块、公共基础知识、申论材料逐题拆解。即时判题与详细解析，错题自动归档，练习数据本地留存——打开就能刷，不需要注册。</p>
        <div class="hero__actions">
          <button class="btn btn--gold" data-action="quick-daily">${icon("play")}开始今日练习</button>
          <button class="btn btn--light" data-action="quick-exam">${icon("timer")}全真模拟</button>
        </div>
        ${cd ? `<div class="hero__countdown">距考试<b>${cd.days >= 0 ? cd.days : 0} 天</b><span>${esc(cd.date)}</span></div>` : ""}
        <div class="hero__stats">
          <div class="hero__stat"><b>${t.done}<small>/ ${t.total}</small></b><span>已练题目</span></div>
          <div class="hero__stat"><b>${t.attempts ? clampPct(t.acc) : "—"}<small>%</small></b><span>累计正确率</span></div>
          <div class="hero__stat"><b>${streak}<small>天</small></b><span>连续学习</span></div>
          <div class="hero__stat"><b>${wrong}<small>题</small></b><span>待复习错题</span></div>
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <div class="section__title"><span class="section__kicker">01</span><h2>今天练什么</h2></div>
          <span class="section__desc">今日已完成 ${today.n} 题${today.n >= goal ? "，目标达成 ✓" : `，还差 ${goal - today.n} 题`}</span>
        </div>
        <div class="grid grid--quick">
          ${quickCard({ action: "quick-daily", icon: "zap", color: "#b98a2f", title: "每日一练", desc: `各模块混合 20 题，约 25 分钟`, meta: "按考点均匀抽题" })}
          ${quickCard({ action: "quick-wrong", icon: "rotate", color: "#bb3a31", title: "错题重练", desc: wrong ? `${wrong} 道错题待复习` : "暂无错题，保持住", meta: wrong ? "答对 2 次自动移出" : "先去练一组" })}
          ${quickCard({ action: "quick-random", icon: "grid", color: "#2c5c92", title: "随机刷题", desc: "全题库随机 20 题", meta: "打乱顺序，模拟实战" })}
          ${quickCard({ action: "quick-exam", icon: "trophy", color: "#12795f", title: "全真模拟", desc: "60 题 / 60 分钟，交卷出分", meta: "按模块配额组卷" })}
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <div class="section__title"><span class="section__kicker">02</span><h2>模块专项</h2></div>
          <a class="section__link" href="#/bank">全部题目${icon("chevronRight")}</a>
        </div>
        <div class="grid grid--mods">
          ${mods.map(moduleCard).join("")}
        </div>
      </section>

      <section class="section">
        <div class="grid grid--2">
          <div class="card card--pad">
            <div class="section__head" style="margin-bottom:14px">
              <div class="section__title"><h2 style="font-size:.98rem">近 7 天练习</h2></div>
              <span class="section__desc">今日 ${today.n} / ${goal} 题</span>
            </div>
            <div class="ring" style="--p:${goalPct};--size:100%;--thick:0;display:none"></div>
            <div class="mod__bar" style="height:7px;margin-bottom:16px">
              <i style="width:${goalPct}%;background:linear-gradient(90deg,#b98a2f,#d8b262)"></i>
            </div>
            ${daysChart(week)}
            <div style="margin-top:14px;display:flex;gap:14px;flex-wrap:wrap;font-size:.76rem;color:var(--muted)">
              <span>今日正确率 ${today.n ? clampPct(pct(today.r, today.n)) + "%" : "—"}</span>
              <span>连续 ${streak} 天</span>
            </div>
          </div>
          <div class="card card--pad">
            <div class="section__head" style="margin-bottom:14px">
              <div class="section__title"><h2 style="font-size:.98rem">申论与主观题</h2></div>
              <a class="section__link" href="#/essay">进入${icon("chevronRight")}</a>
            </div>
            <p style="font-size:.84rem;line-height:1.85;color:var(--muted)">
              申论不靠刷量，靠把材料读透、把要点写全。这里准备了材料、题目与作答要点，可以先在纸上写提纲，再对照参考答案要点逐条核对。
            </p>
            <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:6px">
              <span class="tag tag--brand">归纳概括</span>
              <span class="tag tag--brand">综合分析</span>
              <span class="tag tag--brand">对策建议</span>
              <span class="tag tag--brand">应用文写作</span>
              <span class="tag tag--brand">大作文</span>
            </div>
            <button class="btn btn--sm" style="margin-top:16px" data-action="goto-essay">${icon("paper")}看今日材料题</button>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="card card--pad" style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
          <div class="empty__ico" style="margin:0;flex:none">${icon("info")}</div>
          <div style="flex:1;min-width:240px">
            <strong style="font-size:.92rem">题库说明</strong>
            <p style="font-size:.79rem;color:var(--muted);line-height:1.7;margin-top:4px">
              共 ${BANK.questions.length} 道原创模拟题，覆盖行测五大模块与公共基础知识，非官方真题，不承诺原题命中。题目与解析仅供练习，发现疑义请以官方教材和当期公告为准。
            </p>
          </div>
          <a class="btn btn--sm" href="#/settings">查看全部说明${icon("chevronRight")}</a>
        </div>
      </section>
    `;
  }

  /* ---------------- 题库 ---------------- */
  const bankFilter = { m: "all", status: "all", diff: "all", keyword: "", limit: 60 };

  function statusTag(q) {
    const rec = recOf(q.id);
    if (inWrong(q.id)) return `<span class="tag tag--bad">错题</span>`;
    if (rec && rec.star) return `<span class="tag tag--gold">收藏</span>`;
    if (rec && rec.n > 0) return `<span class="tag tag--ok">已练 ${rec.n}</span>`;
    return "";
  }

  function qItem(q, index) {
    const mod = MODMAP.get(q.module);
    return `<button class="qitem" data-action="open-question" data-id="${q.id}">
      <span class="qitem__no">${String(index + 1).padStart(2, "0")}</span>
      <span class="qitem__body">
        <span class="qitem__stem">${esc(q.stem.replace(/[（(]\s*[）)]/g, "（ ）"))}</span>
        <span class="qitem__meta">
          <span class="tag" style="color:${mod.color};background:color-mix(in srgb, ${mod.color} 12%, transparent)">${esc(mod.name)}</span>
          <span>${esc(q.sub || "")}</span>
          <span>难度 ${"●".repeat(q.diff)}${"○".repeat(3 - q.diff)}</span>
          ${statusTag(q)}
        </span>
      </span>
      ${icon("chevronRight", "qitem__chev")}
    </button>`;
  }

  function onOpenQuestion(el) {
    const id = el.getAttribute("data-id");
    const q = QMAP.get(id);
    if (!q) return;
    const ids = BANK.questions.filter((x) => x.module === q.module).map((x) => x.id);
    startPractice({
      ids,
      startId: id,
      title: `${MODMAP.get(q.module).name} · 单题`,
      mode: "instant",
    });
  }

  function viewBank() {
    const list = filterQuestions({ module: bankFilter.m, status: bankFilter.status, difficulty: bankFilter.diff, keyword: bankFilter.keyword });
    const shown = list.slice(0, bankFilter.limit);
    const t = totals();

    view.innerHTML = `
      <div class="toolbar">
        <div class="toolbar__group">
          <div class="chips">
            <button class="chip ${bankFilter.m === "all" ? "is-on" : ""}" data-bank="m" data-value="all">全部<em>${BANK.questions.length}</em></button>
            ${MODULES.filter((m) => m.group !== "申论")
              .map((m) => {
                const s = moduleStat(m.id);
                return `<button class="chip ${bankFilter.m === m.id ? "is-on" : ""}" data-bank="m" data-value="${m.id}">${esc(m.short || m.name)}<em>${s.total}</em></button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="search">
          ${icon("search")}
          <input type="search" id="bankSearch" placeholder="搜索题干、考点、解析…" value="${esc(bankFilter.keyword)}" aria-label="搜索题库">
        </div>
      </div>

      <div class="toolbar">
        <div class="toolbar__group">
          <div class="chips">
            ${[
              ["all", "全部状态"],
              ["undone", "未做"],
              ["wrong", "错题"],
              ["fav", "收藏"],
              ["done", "已做"],
            ]
              .map(([v, label]) => `<button class="chip ${bankFilter.status === v ? "is-on" : ""}" data-bank="status" data-value="${v}">${label}</button>`)
              .join("")}
          </div>
          <select class="control" id="bankDiff" aria-label="难度筛选">
            <option value="all">全部难度</option>
            <option value="1"${bankFilter.diff === "1" ? " selected" : ""}>基础</option>
            <option value="2"${bankFilter.diff === "2" ? " selected" : ""}>进阶</option>
            <option value="3"${bankFilter.diff === "3" ? " selected" : ""}>较难</option>
          </select>
        </div>
        <div class="toolbar__group">
          <span class="section__desc">共 ${list.length} 题 · 已练 ${t.done}/${t.total}</span>
          <button class="btn btn--sm" data-action="practice-filtered" data-ids="current">${icon("play")}练习这组</button>
        </div>
      </div>

      ${
        list.length
          ? `<div class="qlist" id="bankList">${shown.map((q, i) => qItem(q, i)).join("")}</div>
             ${list.length > shown.length ? `<div style="text-align:center;margin-top:18px"><button class="btn" data-action="bank-more">加载更多（还有 ${list.length - shown.length} 题）</button></div>` : ""}`
          : `<div class="empty">
               <div class="empty__ico">${icon("search")}</div>
               <h3>没有匹配的题目</h3>
               <p>换个关键词或去掉筛选条件试试。题库会持续补充，也欢迎把自己整理的题目加进 data 目录。</p>
               <button class="btn btn--sm" data-action="bank-reset">清除筛选</button>
             </div>`
      }
    `;

    const search = document.getElementById("bankSearch");
    if (search) {
      let timer = null;
      search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          bankFilter.keyword = search.value;
          bankFilter.limit = 60;
          const pos = search.selectionStart;
          viewBank();
          const next = document.getElementById("bankSearch");
          if (next) {
            next.focus();
            next.setSelectionRange(pos, pos);
          }
        }, 240);
      });
    }
    const diff = document.getElementById("bankDiff");
    if (diff) {
      diff.addEventListener("change", () => {
        bankFilter.diff = diff.value;
        bankFilter.limit = 60;
        viewBank();
      });
    }
    view.querySelectorAll("[data-bank]").forEach((btn) => {
      btn.addEventListener("click", () => {
        bankFilter[btn.getAttribute("data-bank")] = btn.getAttribute("data-value");
        bankFilter.limit = 60;
        viewBank();
      });
    });
  }

  function viewWrong() {
    const list = wrongList();
    const filter = viewWrong.filter || "all";
    const filtered = filter === "all" ? list : list.filter((q) => q.module === filter);
    view.innerHTML = `
      <div class="toolbar">
        <div class="toolbar__group">
          <div class="chips">
            <button class="chip ${filter === "all" ? "is-on" : ""}" data-wrong-filter="all">全部<em>${list.length}</em></button>
            ${MODULES.filter((m) => m.group !== "申论" && list.some((q) => q.module === m.id))
              .map((m) => `<button class="chip ${filter === m.id ? "is-on" : ""}" data-wrong-filter="${m.id}">${esc(m.short || m.name)}<em>${list.filter((q) => q.module === m.id).length}</em></button>`)
              .join("")}
          </div>
        </div>
        <div class="toolbar__group">
          <button class="btn btn--sm" data-action="practice-wrong">${icon("rotate")}重练全部</button>
        </div>
      </div>
      ${
        filtered.length
          ? `<div class="qlist">${filtered
              .map((q) => {
                const rec = recOf(q.id);
                const mod = MODMAP.get(q.module);
                return `<div class="qitem" style="cursor:default">
                  <span class="qitem__no">${String(rec.w).padStart(2, "0")}</span>
                  <span class="qitem__body">
                    <span class="qitem__stem">${esc(q.stem)}</span>
                    <span class="qitem__meta">
                      <span class="tag" style="color:${mod.color};background:color-mix(in srgb, ${mod.color} 12%, transparent)">${esc(mod.name)}</span>
                      <span>错 ${rec.w} 次</span>
                      <span>连续答对 ${rec.streakRight || 0}/2</span>
                    </span>
                  </span>
                  <span style="display:flex;gap:6px;flex:none">
                    <button class="icon-btn" data-action="open-question" data-id="${q.id}" title="重做">${icon("play")}</button>
                    <button class="icon-btn" data-action="wrong-remove" data-id="${q.id}" title="移出错题本">${icon("trash")}</button>
                  </span>
                </div>`;
              })
              .join("")}</div>
             <p class="section__desc" style="margin-top:14px;text-align:center">错题在重做时连续答对 2 次，会自动移出错题本。</p>`
          : `<div class="empty">
              <div class="empty__ico">${icon("check")}</div>
              <h3>${list.length ? "该模块没有错题" : "错题本是空的"}</h3>
              <p>${list.length ? "切换其他模块看看。" : "做题时答错的题目会自动收进来，按遗忘规律重做两遍即可移出。"}</p>
              <button class="btn btn--sm" data-action="quick-random">${icon("grid")}随机刷 20 题</button>
            </div>`
      }
    `;
    view.querySelectorAll("[data-wrong-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        viewWrong.filter = btn.getAttribute("data-wrong-filter");
        viewWrong();
      });
    });
  }

  function viewFav() {
    const list = favList();
    view.innerHTML = `
      <div class="toolbar">
        <div class="toolbar__group"><span class="section__desc">已收藏 ${list.length} 题</span></div>
        <div class="toolbar__group">${list.length ? `<button class="btn btn--sm" data-action="practice-fav">${icon("play")}练习收藏题</button>` : ""}</div>
      </div>
      ${
        list.length
          ? `<div class="qlist">${list
              .map(
                (q, i) => `<div class="qitem" style="cursor:default">
                  <span class="qitem__no">${String(i + 1).padStart(2, "0")}</span>
                  <span class="qitem__body" role="button" tabindex="0" data-action="open-question" data-id="${q.id}">
                    <span class="qitem__stem">${esc(q.stem)}</span>
                    <span class="qitem__meta"><span class="tag tag--gold">${esc(q.sub || "")}</span>${statusTag(q)}</span>
                  </span>
                  <button class="icon-btn" data-action="fav-remove" data-id="${q.id}" title="取消收藏">${icon("star")}</button>
                </div>`
              )
              .join("")}</div>`
          : `<div class="empty"><div class="empty__ico">${icon("star")}</div>
              <h3>还没有收藏题目</h3><p>做题时点击星标，把易错点、典型题收进这里，考前集中回看。</p>
              <a class="btn btn--sm" href="#/bank">去题库看看</a></div>`
      }
    `;
  }

  /* ---------------- 学习数据 ---------------- */
  function viewStats() {
    const t = totals();
    const streak = streakDays();
    const today = todayStat();
    const days30 = lastDays(14);
    const maxDay = Math.max(1, ...days30.map((d) => d.n));
    const exams = (state.exams || []).slice(-5).reverse();

    const diffCount = { 1: { n: 0, r: 0 }, 2: { n: 0, r: 0 }, 3: { n: 0, r: 0 } };
    BANK.questions.forEach((q) => {
      const rec = recOf(q.id);
      if (!rec) return;
      const bucket = diffCount[q.diff] || diffCount[2];
      bucket.n += rec.n;
      bucket.r += rec.r;
    });

    view.innerHTML = `
      <div class="grid grid--stats">
        <div class="stat stat--accent"><b>${t.done}<small>/ ${t.total}</small></b><span>已练题目</span></div>
        <div class="stat"><b>${t.attempts ? clampPct(t.acc) : "—"}<small>%</small></b><span>累计正确率（${t.attempts} 次作答）</span></div>
        <div class="stat"><b>${streak}<small>天</small></b><span>连续学习</span></div>
        <div class="stat"><b>${today.n}<small>题</small></b><span>今日练习</span></div>
      </div>

      <section class="section">
        <div class="section__head"><div class="section__title"><span class="section__kicker">01</span><h2>近 14 天练习量</h2></div>
          <span class="section__desc">单日最高 ${maxDay} 题</span></div>
        <div class="card card--pad">
          <div class="days" style="height:130px">
            ${days30
              .map(
                (d) => `<div class="day" title="${d.key}：${d.n} 题">
                  <span class="day__count">${d.n || ""}</span>
                  <span class="day__bar ${d.n ? "is-on" : ""} ${d.today ? "is-today" : ""}" style="height:${Math.max(3, (d.n / maxDay) * 92)}px"></span>
                  <span class="day__label">${d.today ? "今天" : d.label}</span>
                </div>`
              )
              .join("")}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section__head"><div class="section__title"><span class="section__kicker">02</span><h2>模块正确率</h2></div>
          <span class="section__desc">按累计作答计算</span></div>
        <div class="card card--pad">
          <div class="bars">
            ${MODULES.filter((m) => m.group !== "申论")
              .map((m) => {
                const s = moduleStat(m.id);
                return `<div class="barrow">
                  <span class="barrow__label">${esc(m.name)}</span>
                  <span class="barrow__track"><i class="barrow__fill" style="width:${s.attempts ? clampPct(s.acc) : 0}%;background:${m.color}"></i></span>
                  <span class="barrow__val">${s.attempts ? `<b>${clampPct(s.acc)}%</b> · ${s.done}/${s.total}` : "未练习"}</span>
                </div>`;
              })
              .join("")}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="grid grid--2">
          <div class="card card--pad">
            <div class="section__head" style="margin-bottom:12px"><div class="section__title"><h2 style="font-size:.98rem">难度分布</h2></div></div>
            <div class="bars">
              ${[
                [1, "基础"],
                [2, "进阶"],
                [3, "较难"],
              ]
                .map(([lv, name]) => {
                  const b = diffCount[lv];
                  const acc = b.n ? clampPct(pct(b.r, b.n)) : 0;
                  return `<div class="barrow">
                    <span class="barrow__label">${name}</span>
                    <span class="barrow__track"><i class="barrow__fill" style="width:${acc}%"></i></span>
                    <span class="barrow__val">${b.n ? `<b>${acc}%</b> · ${b.n}` : "—"}</span>
                  </div>`;
                })
                .join("")}
            </div>
          </div>
          <div class="card card--pad">
            <div class="section__head" style="margin-bottom:12px"><div class="section__title"><h2 style="font-size:.98rem">模拟考试记录</h2></div></div>
            ${
              exams.length
                ? `<div style="display:flex;flex-direction:column;gap:9px">${exams
                    .map(
                      (e) => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:.82rem;padding-bottom:8px;border-bottom:1px dashed var(--line)">
                        <span style="color:var(--muted)">${e.date}</span>
                        <span><b style="font-variant-numeric:tabular-nums">${e.score}</b> 分 · 对 ${e.right}/${e.total}</span>
                        <span style="color:var(--muted)">${fmtDuration(e.ms)}</span>
                      </div>`
                    )
                    .join("")}</div>`
                : `<p style="font-size:.82rem;color:var(--muted);line-height:1.8">还没有模拟记录。全真模拟按模块配额组卷、限时计时，交卷后出分并给出各模块表现。</p>
                   <button class="btn btn--sm" style="margin-top:12px" data-action="quick-exam">${icon("timer")}开始一场</button>`
            }
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section__head"><div class="section__title"><span class="section__kicker">03</span><h2>最近作答</h2></div></div>
        <div class="card card--pad">
          ${
            state.history.length
              ? `<div class="qlist" style="gap:6px">${state.history
                  .slice(0, 12)
                  .map((h) => {
                    const q = QMAP.get(h.id);
                    if (!q) return "";
                    const d = new Date(h.t);
                    return `<div style="display:flex;gap:10px;align-items:center;font-size:.8rem;padding:6px 0;border-bottom:1px dashed var(--line)">
                      <span class="tag ${h.ok ? "tag--ok" : "tag--bad"}">${h.ok ? "对" : "错"}</span>
                      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-2)">${esc(q.stem)}</span>
                      <span style="color:var(--muted);font-variant-numeric:tabular-nums;flex:none">${pad(d.getHours())}:${pad(d.getMinutes())}</span>
                    </div>`;
                  })
                  .join("")}</div>`
              : `<p style="font-size:.82rem;color:var(--muted)">还没有作答记录，去做几道题吧。</p>`
          }
        </div>
      </section>
    `;
  }

  /* ---------------- 设置 ---------------- */
  function viewSettings() {
    const s = state.settings;
    view.innerHTML = `
      <div class="card card--pad">
        <div class="setting">
          <div class="setting__label"><strong>主题</strong><span>默认跟随系统，也可以固定浅色或深色</span></div>
          <div class="setting__ctrl">
            <div class="segmented" data-seg="theme">
              <button data-value="light" class="${s.theme === "light" ? "is-on" : ""}">浅色</button>
              <button data-value="dark" class="${s.theme === "dark" ? "is-on" : ""}">深色</button>
              <button data-value="auto" class="${s.theme === "auto" ? "is-on" : ""}">跟随系统</button>
            </div>
          </div>
        </div>
        <div class="setting">
          <div class="setting__label"><strong>正文字号</strong><span>题目与解析的显示大小</span></div>
          <div class="setting__ctrl">
            <div class="segmented" data-seg="fontSize">
              <button data-value="sm" class="${s.fontSize === "sm" ? "is-on" : ""}">小</button>
              <button data-value="md" class="${s.fontSize === "md" ? "is-on" : ""}">标准</button>
              <button data-value="lg" class="${s.fontSize === "lg" ? "is-on" : ""}">大</button>
            </div>
          </div>
        </div>
        <div class="setting">
          <div class="setting__label"><strong>答对后自动下一题</strong><span>只对答对的题目生效；答错时停留看解析</span></div>
          <div class="setting__ctrl"><button class="switch ${s.autoNext ? "is-on" : ""}" data-toggle="autoNext" aria-label="自动下一题"></button></div>
        </div>
        <div class="setting">
          <div class="setting__label"><strong>每日目标题量</strong><span>首页进度与「每日一练」会参考这个数值</span></div>
          <div class="setting__ctrl">
            <div class="segmented" data-seg="dailyGoal">
              ${[10, 20, 30, 50]
                .map((n) => `<button data-value="${n}" class="${s.dailyGoal === n ? "is-on" : ""}">${n} 题</button>`)
                .join("")}
            </div>
          </div>
        </div>
        <div class="setting">
          <div class="setting__label"><strong>考试日期</strong><span>设置后在首页显示倒计时</span></div>
          <div class="setting__ctrl" style="display:flex;gap:8px;align-items:center">
            <input class="control" type="date" id="examDate" value="${esc(s.examDate || "")}">
            <button class="btn btn--sm" data-action="clear-exam-date">清除</button>
          </div>
        </div>
      </div>

      <section class="section">
        <div class="section__head"><div class="section__title"><span class="section__kicker">02</span><h2>学习数据</h2></div>
          <span class="section__desc">${canStore ? "保存在本机浏览器" : "当前浏览器限制本地存储，仅本次会话有效"}</span></div>
        <div class="card card--pad">
          <div class="setting">
            <div class="setting__label"><strong>导出记录</strong><span>把做题记录、错题本、收藏、申论提纲保存为 JSON 文件</span></div>
            <div class="setting__ctrl"><button class="btn btn--sm" data-action="export-data">${icon("download")}导出</button></div>
          </div>
          <div class="setting">
            <div class="setting__label"><strong>导入记录</strong><span>从之前导出的 JSON 文件恢复</span></div>
            <div class="setting__ctrl">
              <label class="btn btn--sm" style="cursor:pointer">${icon("upload")}选择文件
                <input type="file" accept="application/json,.json" id="importFile" hidden>
              </label>
            </div>
          </div>
          <div class="setting">
            <div class="setting__label"><strong>清空全部记录</strong><span>只清除做题数据，题目本身不受影响</span></div>
            <div class="setting__ctrl"><button class="btn btn--sm btn--danger" data-action="reset-data">${icon("trash")}清空</button></div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="card card--pad about">
          <h3>关于这个题库</h3>
          <p>本题库围绕浙江省公务员考试（行测）与事业单位公开招聘（公共基础知识、职业能力倾向测验）的常见考点编写，共 ${BANK.questions.length} 道选择题、${(BANK.essays || []).length} 道申论材料题。</p>
          <p style="margin-top:8px;color:var(--warn)">所有题目均为<strong>原创模拟题</strong>，不是官方真题，不承诺押中。题目难度、题型尽量贴近真实考试，但考试范围、题型、分值请以浙江省公务员局、各市县人社局当期公告和准考证为准。</p>

          <h3>怎么用</h3>
          <ul>
            <li>先按模块专项练，把每个模块的正确率练到 70% 以上，再做整卷模拟。</li>
            <li>资料分析先看材料再做题；一道材料对应多道题，别重复读材料。</li>
            <li>数量关系不必恋战，考场上按分钟计投入产出，练熟 3—4 类常考题型即可。</li>
            <li>错题本按「连续答对 2 次」移出，重做时重点看解析里的干扰项分析。</li>
            <li>申论别只看范文，先自己在纸上列要点，再对照作答要点补漏。</li>
          </ul>

          <h3>键盘快捷键</h3>
          <ul>
            <li><kbd>A</kbd> <kbd>B</kbd> <kbd>C</kbd> <kbd>D</kbd> 或 <kbd>1</kbd>—<kbd>4</kbd>：选择选项</li>
            <li><kbd>Enter</kbd>：提交 / 下一题　<kbd>←</kbd> <kbd>→</kbd>：上一题 / 下一题</li>
            <li><kbd>F</kbd>：收藏本题　<kbd>Esc</kbd>：关闭弹层</li>
          </ul>

          <h3>数据与隐私</h3>
          <p>所有记录只保存在本机浏览器（localStorage），不会上传到任何服务器。换设备或清理浏览器数据前，建议先导出备份。用手机浏览器打开本地文件时，部分浏览器会限制本地存储，此时建议用电脑打开，或放到本地服务器上访问。</p>

          <h3>反馈</h3>
          <p>题目都在 <code>data/</code> 目录下按模块存放，是普通的 JS 数据文件。发现答案或解析有问题，直接改对应文件即可，页面刷新就会生效。</p>
        </div>
      </section>
    `;

    view.querySelectorAll("[data-seg]").forEach((seg) => {
      seg.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-value]");
        if (!btn) return;
        const key = seg.getAttribute("data-seg");
        let value = btn.getAttribute("data-value");
        if (key === "dailyGoal") value = Number(value);
        state.settings[key] = value;
        save(true);
        if (key === "theme") applyTheme();
        if (key === "fontSize") applyFontSize();
        viewSettings();
        toast("已更新设置");
      });
    });

    view.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-toggle");
        state.settings[key] = !state.settings[key];
        save(true);
        btn.classList.toggle("is-on", state.settings[key]);
      });
    });

    const dateInput = document.getElementById("examDate");
    if (dateInput) {
      dateInput.addEventListener("change", () => {
        state.settings.examDate = dateInput.value;
        save(true);
        toast(dateInput.value ? "已设置考试日期" : "已清除考试日期");
      });
    }

    const importFile = document.getElementById("importFile");
    if (importFile) {
      importFile.addEventListener("change", () => {
        const file = importFile.files && importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result));
            if (parsed && parsed.records) {
              state.records = parsed.records || {};
              state.days = parsed.days || {};
              state.history = parsed.history || [];
              state.exams = parsed.exams || [];
              state.essays = parsed.essays || {};
              state.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
              save(true);
              applyTheme();
              applyFontSize();
              updateBadges();
              toast("记录已导入", "ok");
              viewSettings();
            } else {
              toast("文件格式不对，缺少 records 字段", "bad");
            }
          } catch (err) {
            toast("读取失败，请确认是本页面导出的 JSON", "bad");
          }
        };
        reader.readAsText(file);
      });
    }
  }

  /* ---------------- 申论 ---------------- */
  function viewEssay() {
    const essays = BANK.essays || [];
    view.innerHTML = `
      <div class="card card--pad" style="margin-bottom:18px;display:flex;gap:14px;align-items:flex-start">
        <div class="empty__ico" style="margin:0;flex:none;background:var(--gold-soft);color:var(--warn)">${icon("paper")}</div>
        <div>
          <strong style="font-size:.95rem">先写，再看要点</strong>
          <p style="font-size:.82rem;color:var(--muted);line-height:1.8;margin-top:4px">
            每道题给了材料和作答要点。建议先在纸上（或下方草稿框）写出自己的提纲，再展开对照，重点看「有没有漏掉材料的直接要点」和「表述有没有踩到关键动作」。
          </p>
        </div>
      </div>
      <div class="qlist" style="gap:12px">
        ${essays
          .map(
            (e, i) => `<article class="card essay" data-essay="${e.id}">
              <div class="essay__head" data-action="essay-toggle">
                <span class="essay__no">${pad(i + 1)}</span>
                <div class="essay__title">
                  <h3>${esc(e.title)}</h3>
                  <p>${esc(e.type)} · 建议 ${esc(e.time || "20 分钟")} · ${esc(e.words || "300 字左右")}</p>
                </div>
                <span class="essay__chev">${icon("chevronDown")}</span>
              </div>
              <div class="essay__body">
                <div class="essay__block">
                  <h4>${icon("book")}给定材料</h4>
                  <div class="essay__text essay__text--material">${esc(e.material)}</div>
                </div>
                <div class="essay__block">
                  <h4>${icon("edit")}作答要求</h4>
                  <div class="essay__text">${esc(e.prompt)}</div>
                </div>
                <div class="essay__block">
                  <h4>${icon("check")}作答要点</h4>
                  <ol class="points">${(e.points || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
                </div>
                <div class="essay__block">
                  <h4>${icon("spark")}我的提纲</h4>
                  <textarea class="draft" data-draft="${e.id}" placeholder="在这里写你的分点提纲（自动保存在本机）…">${esc((state.essays || {})[e.id] || "")}</textarea>
                </div>
              </div>
            </article>`
          )
          .join("")}
      </div>
    `;

    view.querySelectorAll("[data-draft]").forEach((ta) => {
      ta.addEventListener("input", () => {
        state.essays[ta.getAttribute("data-draft")] = ta.value;
        save();
      });
    });
  }

  on("essay-toggle", (el) => {
    const card = el.closest(".essay");
    if (!card) return;
    card.classList.toggle("is-open");
    const ta = card.querySelector("[data-draft]");
    if (card.classList.contains("is-open") && ta) setTimeout(() => ta.focus({ preventScroll: true }), 60);
  });

  /* ---------------- 通用动作 ---------------- */
  on("toggle-theme", () => {
    const order = ["light", "dark", "auto"];
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    state.settings.theme = dark ? "light" : "dark";
    save(true);
    applyTheme();
    toast(state.settings.theme === "dark" ? "已切换到深色" : "已切换到浅色");
    void order;
  });

  on("goto-essay", () => navigate("#/essay"));

  on("open-question", (el) => onOpenQuestion(el));

  on("bank-more", () => {
    bankFilter.limit += 60;
    viewBank();
  });

  on("bank-reset", () => {
    Object.assign(bankFilter, { m: "all", status: "all", diff: "all", keyword: "", limit: 60 });
    viewBank();
  });

  on("practice-filtered", () => {
    const ids = filterQuestions({ module: bankFilter.m, status: bankFilter.status, difficulty: bankFilter.diff, keyword: bankFilter.keyword }).map((q) => q.id);
    if (!ids.length) return toast("当前筛选下没有题目", "bad");
    startPractice({ ids, title: "筛选练习", mode: "instant" });
  });

  on("practice-wrong", () => {
    const list = wrongList();
    if (!list.length) return toast("错题本是空的", "bad");
    startPractice({ ids: list.map((q) => q.id), title: "错题重练", mode: "instant" });
  });

  on("practice-fav", () => {
    const list = favList();
    if (!list.length) return toast("还没有收藏题目", "bad");
    startPractice({ ids: list.map((q) => q.id), title: "收藏题练习", mode: "instant" });
  });

  on("wrong-remove", (el) => {
    const id = el.getAttribute("data-id");
    const rec = state.records[id];
    if (rec) {
      rec.inWrong = false;
      rec.streakRight = 2;
      save(true);
      updateBadges();
      viewWrong();
      toast("已移出错题本");
    }
  });

  on("fav-remove", (el) => {
    const id = el.getAttribute("data-id");
    toggleStar(id);
    viewFav();
  });

  on("quick-daily", () => startDaily());
  on("quick-random", () => startPractice({ ids: shuffle(BANK.questions.map((q) => q.id)).slice(0, 20), title: "随机 20 题", mode: "instant" }));
  on("quick-wrong", () => {
    const list = wrongList();
    if (!list.length) {
      toast("还没有错题，先做一组随机题吧");
      return startPractice({ ids: shuffle(BANK.questions.map((q) => q.id)).slice(0, 20), title: "随机 20 题", mode: "instant" });
    }
    startPractice({ ids: shuffle(list.map((q) => q.id)), title: "错题重练", mode: "instant" });
  });
  on("quick-exam", () => startExam());

  on("export-data", () => {
    const payload = {
      app: "zjks",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      records: state.records,
      days: state.days,
      history: state.history,
      exams: state.exams,
      essays: state.essays,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `浙考刷题-记录-${dstr()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
    toast("已导出记录文件", "ok");
  });

  on("reset-data", () => {
    openModal(
      `<p style="font-size:.9rem;line-height:1.8">将清空<b>做题记录、错题本、收藏、申论提纲、模拟成绩</b>，题目和设置不受影响。建议先导出备份。</p>`,
      {
        title: "确认清空全部记录？",
        footer: `<button class="btn" data-close="1">取消</button><button class="btn btn--danger" data-action="reset-confirm">确认清空</button>`,
      }
    );
  });

  on("reset-confirm", () => {
    state.records = {};
    state.days = {};
    state.history = [];
    state.exams = [];
    state.essays = {};
    save(true);
    updateBadges();
    closeModal(true);
    toast("记录已清空");
    navigate("#/home");
  });

  on("clear-exam-date", () => {
    state.settings.examDate = "";
    save(true);
    viewSettings();
    toast("已清除考试日期");
  });

  /* ---------------- 导航徽标 ---------------- */
  function updateBadges() {
    const wrong = wrongList().length;
    const badge = document.getElementById("badgeWrong");
    if (badge) {
      badge.textContent = wrong;
      badge.hidden = wrong === 0;
    }
  }

  /* ---------------- 练习入口（由 practice.js 覆盖实现） ---------------- */
  let startPractice = function () { toast("练习模块未加载"); };
  let startExam = function () { toast("模拟考试模块未加载"); };
  let startDaily = function () {
    const ids = shuffle(BANK.questions.map((q) => q.id)).slice(0, state.settings.dailyGoal || 20);
    startPractice({ ids, title: "每日一练", mode: "instant" });
  };

  function setStarters(fns) {
    if (fns.startPractice) startPractice = fns.startPractice;
    if (fns.startExam) startExam = fns.startExam;
    if (fns.startDaily) startDaily = fns.startDaily;
  }

  /* ---------------- 滚动进度 ---------------- */
  const topbar = document.querySelector(".topbar");
  const progressEl = document.getElementById("scrollProgress");
  window.addEventListener(
    "scroll",
    () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? (window.scrollY / h) * 100 : 0;
      if (progressEl) progressEl.style.width = `${p}%`;
      if (topbar) topbar.classList.toggle("is-stuck", window.scrollY > 8);
    },
    { passive: true }
  );

  /* ---------------- 启动 ---------------- */
  function boot() {
    loadState();
    applyTheme();
    applyFontSize();
    hydrateIcons();
    if (!location.hash) location.hash = "#/home";
    render();
    updateBadges();
    if (!canStore) {
      setTimeout(() => toast("此浏览器限制本地存储，记录仅本次有效"), 1200);
    }
  }

  function hydrateIcons() {
    document.querySelectorAll("[data-icon]").forEach((el) => {
      el.innerHTML = icon(el.getAttribute("data-icon"));
    });
  }

  const APP = {
    BANK,
    MODULES,
    QMAP,
    MODMAP,
    LETTERS,
    state,
    save,
    esc,
    dstr,
    pad,
    pct,
    clampPct,
    fmtDuration,
    fmtMinutes,
    fmtCountdown,
    icon,
    toast,
    openModal,
    closeModal,
    navigate,
    render,
    on,
    actions,
    views: {},
    setStarters,
    recordAnswer,
    recOf,
    toggleStar,
    inWrong,
    wrongList,
    favList,
    totals,
    moduleStat,
    todayStat,
    streakDays,
    lastDays,
    filterQuestions,
    shuffle,
    applyTheme,
    applyFontSize,
    updateBadges,
    getStarters: () => ({ startPractice, startExam, startDaily }),
  };

  window.APP = APP;

  window.addEventListener("DOMContentLoaded", () => {
    // 兜底：如果脚本在 DOMContentLoaded 之后注入，也执行一次。
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  return APP;
})();
