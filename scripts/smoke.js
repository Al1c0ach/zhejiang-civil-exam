/* CDP 冒烟测试：真实浏览器加载页面、交互、截图、捕获报错
   node scripts/smoke.js
*/
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const ROOT = path.join(__dirname, "..");
const arg = process.argv[2];
const isRemote = !!(arg && /^https?:/i.test(arg));
const OUT = path.join(ROOT, arg ? "preview-standalone" : "preview");
const URL = "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");
const TARGET = arg ? (isRemote ? arg : pathToFileURL(path.resolve(arg)).href) : URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = path.join(os.tmpdir(), "zj-smoke-" + Date.now());
  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--disable-extensions",
      "--remote-debugging-port=" + PORT,
      "--user-data-dir=" + profile,
      "--window-size=1366,940",
      TARGET,
    ],
    { stdio: "ignore" }
  );

  let targets = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      if (targets.some((t) => t.type === "page" && !t.url.startsWith("about:"))) break;
    } catch (e) {
      /* 等待浏览器启动 */
    }
  }
  const page = (targets || []).find((t) => t.type === "page" && !t.url.startsWith("about:"));
  if (!page) throw new Error("未找到页面目标");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let seq = 0;
  const pending = new Map();
  const problems = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      problems.push("EXCEPTION: " + (d.exception?.description || d.text));
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      problems.push("CONSOLE: " + msg.params.args.map((a) => a.value || a.description).join(" "));
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      const t = msg.params.entry.text;
      if (!t.includes("favicon")) problems.push("LOG: " + t);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      seq += 1;
      pending.set(seq, { resolve, reject });
      ws.send(JSON.stringify({ id: seq, method, params }));
    });

  const evalJs = async (expression, awaitPromise = false) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error("eval 失败: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };

  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
    console.log("  截图 " + name + ".png");
  };

  // 等待应用真正启动（远程页面首次加载可能需要数秒）
  const waitFor = async (expression, timeout = 25000, step = 250) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await evalJs(expression)) return true;
      } catch (e) {
        /* 页面尚未就绪 */
      }
      await sleep(step);
    }
    return false;
  };

  const ready = () => waitFor("!!(window.APP && window.APP.BANK && window.APP.BANK.questions && window.APP.BANK.questions.length)");

  const resetTo = async (hash) => {
    await evalJs(`localStorage.removeItem('zjks.v1.session'); location.hash = '#/home'`);
    await send("Page.reload");
    await sleep(600);
    await ready();
    await evalJs(`location.hash = '${hash}'`);
    await sleep(800);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await sleep(500);
  const ok = await ready();
  console.log("  应用就绪：" + (ok ? "是" : "否（超时）"));

  console.log("\n[1] 首页渲染");
  const home = await evalJs(`(() => {
    const h1 = document.querySelector('.hero h1');
    return {
      title: document.title,
      h1: h1 ? h1.textContent.trim() : null,
      modules: document.querySelectorAll('.mod').length,
      quick: document.querySelectorAll('.quick').length,
      heroStats: [...document.querySelectorAll('.hero__stat b')].map(b => b.textContent.trim()),
      questionCount: window.APP.BANK.questions.length,
      storage: (() => { try { localStorage.setItem('t','1'); localStorage.removeItem('t'); return 'ok'; } catch(e) { return 'blocked'; } })()
    };
  })()`);
  console.log("  ", JSON.stringify(home));
  await shot("01-home");

  console.log("\n[2] 题库页");
  await evalJs(`location.hash = '#/bank'`);
  await sleep(600);
  const bank = await evalJs(`({ items: document.querySelectorAll('.qitem').length, chevron: getComputedStyle(document.querySelector('.qitem__chev')).width })`);
  console.log("  ", JSON.stringify(bank));
  await shot("02-bank");

  console.log("\n[3] 随机练习 + 作答");
  await evalJs(`location.hash = '#/home'`);
  await sleep(400);
  await evalJs(`document.querySelector('[data-action="quick-random"]').click()`);
  await sleep(700);
  const practice = await evalJs(`({
    opts: document.querySelectorAll('.opt').length,
    stem: document.querySelector('.stem')?.textContent.slice(0, 28),
    timer: document.querySelector('#pTimer b')?.textContent
  })`);
  console.log("  ", JSON.stringify(practice));
  await shot("03-practice-before");

  await evalJs(`document.querySelector('.opt[data-i="0"]').click()`);
  await sleep(500);
  const answered = await evalJs(`({
    explained: !!document.querySelector('.explain'),
    verdict: document.querySelector('.explain__verdict')?.textContent.trim(),
    right: document.querySelectorAll('.opt.is-right').length,
    wrong: document.querySelectorAll('.opt.is-wrong').length
  })`);
  console.log("  ", JSON.stringify(answered));
  await shot("04-practice-answered");

  console.log("\n[4] 连答 20 题并出报告");
  await evalJs(
    `(async () => {
      for (let i = 0; i < 24; i++) {
        const opt = document.querySelector('.opt:not(.is-locked)');
        if (opt) opt.click();
        await new Promise(r => setTimeout(r, 60));
        const next = document.querySelector('[data-action="next"]');
        if (next) { next.click(); await new Promise(r => setTimeout(r, 80)); continue; }
        const fin = document.querySelector('[data-action="finish"]');
        if (fin) { fin.click(); await new Promise(r => setTimeout(r, 200));
          const ok = document.querySelector('[data-action="finish-confirm"]');
          if (ok) ok.click();
          break;
        }
      }
    })()`,
    true
  );
  await sleep(900);
  const result = await evalJs(`({
    hash: location.hash,
    score: document.querySelector('.result__num')?.textContent.trim(),
    meta: [...document.querySelectorAll('.result__meta b')].map(b => b.textContent.trim()),
    rows: [...document.querySelectorAll('.barrow__label')].map(n => n.textContent.trim()),
    fillWidth: getComputedStyle(document.querySelector('.barrow__fill')).width,
    review: document.querySelectorAll('.qcard').length
  })`);
  console.log("  ", JSON.stringify(result));
  await shot("05-result");

  console.log("\n[5] 全真模拟");
  await evalJs(`location.hash = '#/home'`);
  await sleep(400);
  await evalJs(`document.querySelector('[data-action="quick-exam"]').click()`);
  await sleep(400);
  const examModal = await evalJs(`({ title: document.querySelector('.modal h2')?.textContent, go: !!document.querySelector('[data-action="exam-go"]') })`);
  console.log("  modal", JSON.stringify(examModal));
  await evalJs(`document.querySelector('[data-action="exam-go"]').click()`);
  await sleep(800);
  const examStart = await evalJs(`({
    timer: document.querySelector('#pTimer b')?.textContent,
    title: document.querySelector('.pbar__title')?.textContent.trim(),
    explainBefore: !!document.querySelector('.explain')
  })`);
  console.log("  开始", JSON.stringify(examStart));
  await evalJs(`document.querySelector('.opt[data-i="1"]').click()`);
  await sleep(300);
  const examPick = await evalJs(`({ explain: !!document.querySelector('.explain'), picked: document.querySelectorAll('.opt.is-picked').length })`);
  console.log("  选答后", JSON.stringify(examPick));
  await evalJs(`document.querySelector('[data-action="open-sheet"]').click()`);
  await sleep(400);
  const sheet = await evalJs(`({ cells: document.querySelectorAll('.sheet button').length, done: document.querySelectorAll('.sheet button.is-done').length })`);
  console.log("  答题卡", JSON.stringify(sheet));
  await shot("13-exam-sheet");
  await evalJs(`document.querySelector('.modal [data-action="finish"]').click()`);
  await sleep(400);
  const confirmBox = await evalJs(`({ body: document.querySelector('.modal .modal__body')?.textContent.trim().slice(0, 30), ok: !!document.querySelector('[data-action="finish-confirm"]') })`);
  console.log("  交卷确认", JSON.stringify(confirmBox));
  await evalJs(`document.querySelector('[data-action="finish-confirm"]').click()`);
  await sleep(700);
  const examResult = await evalJs(`({ hash: location.hash, score: document.querySelector('.result__num')?.textContent.trim(), meta: [...document.querySelectorAll('.result__meta b')].map(b => b.textContent.trim()) })`);
  console.log("  结果", JSON.stringify(examResult));
  await shot("14-exam-result");

  console.log("\n[6] 图形推理与资料分析渲染");
  await resetTo("#/home");
  await evalJs(`APP.actions['open-question']({ getAttribute: () => 'pd-25' })`);
  await sleep(800);
  const fig = await evalJs(`({ figures: document.querySelectorAll('.figures svg').length, options: document.querySelectorAll('.opt--fig svg').length, firstSvgW: getComputedStyle(document.querySelector('.figures svg')).width, stem: document.querySelector('.stem')?.textContent.slice(0, 16) })`);
  console.log("  图形", JSON.stringify(fig));
  await shot("11-panduan");

  await resetTo("#/home");
  await evalJs(`APP.actions['open-question']({ getAttribute: () => 'zl-13' })`);
  await sleep(800);
  const mat = await evalJs(`({ material: !!document.querySelector('.material'), table: !!document.querySelector('.material table'), rows: document.querySelectorAll('.material tbody tr').length, opts: document.querySelectorAll('.opt').length })`);
  console.log("  资料", JSON.stringify(mat));
  await shot("12-ziliao");

  console.log("\n[7] 数据 / 申论 / 错题");
  await evalJs(`location.hash = '#/stats'`);
  await sleep(600);
  const stats = await evalJs(`({ bars: document.querySelectorAll('.barrow').length, days: document.querySelectorAll('.day').length, fill: getComputedStyle(document.querySelector('.barrow__fill')).width })`);
  console.log("  stats", JSON.stringify(stats));
  await shot("06-stats");

  await evalJs(`location.hash = '#/essay'`);
  await sleep(600);
  await evalJs(`document.querySelector('[data-action="essay-toggle"]').click()`);
  await sleep(500);
  const essay = await evalJs(`({ cards: document.querySelectorAll('.essay').length, open: document.querySelectorAll('.essay.is-open').length, points: document.querySelectorAll('.points li').length, iconW: getComputedStyle(document.querySelector('.essay.is-open h4 .ic')).width })`);
  console.log("  essay", JSON.stringify(essay));
  await shot("07-essay");

  await evalJs(`location.hash = '#/wrong'`);
  await sleep(500);
  const wrong = await evalJs(`({ wrongItems: document.querySelectorAll('.qitem').length, badge: document.querySelector('#badgeWrong')?.textContent })`);
  console.log("  wrong", JSON.stringify(wrong));
  await shot("08-wrong");

  console.log("\n[8] 设置页");
  await evalJs(`location.hash = '#/settings'`);
  await sleep(500);
  const settings = await evalJs(`({ rows: document.querySelectorAll('.setting').length, seg: document.querySelectorAll('.segmented').length })`);
  console.log("  ", JSON.stringify(settings));
  await shot("15-settings");

  console.log("\n[9] 手机端");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await evalJs(`location.hash = '#/home'`);
  await sleep(700);
  const mobile = await evalJs(`({
    tabbar: getComputedStyle(document.querySelector('.tabbar')).display,
    topnav: getComputedStyle(document.querySelector('.topnav')).display,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth
  })`);
  console.log("  ", JSON.stringify(mobile));
  await shot("09-mobile-home");

  await evalJs(`document.querySelector('[data-action="quick-random"]').click()`);
  await sleep(700);
  await evalJs(`document.querySelector('.opt[data-i="2"]').click()`);
  await sleep(500);
  const mobilePractice = await evalJs(`({
    hash: location.hash,
    explained: !!document.querySelector('.explain'),
    footerBtns: [...document.querySelectorAll('.pfoot .btn')].map(b => Math.round(b.getBoundingClientRect().width)),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  })`);
  console.log("  手机答题", JSON.stringify(mobilePractice));
  await shot("16-mobile-practice");

  console.log("\n[10] 深色模式");
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 940, deviceScaleFactor: 1, mobile: false });
  await evalJs(`location.hash = '#/home'`);
  await sleep(600);
  await evalJs(`document.querySelector('[data-action="toggle-theme"]').click()`);
  await sleep(500);
  await shot("10-home-dark");

  console.log("\n[11] 刷新后数据持久化");
  const before = await evalJs(`(() => { const s = JSON.parse(localStorage.getItem('zjks.v1.state')||'{}'); return { records: Object.keys(s.records||{}).length, exams: (s.exams||[]).length, days: Object.keys(s.days||{}).length }; })()`);
  await send("Page.reload");
  await sleep(1400);
  const after = await evalJs(`(() => { const s = JSON.parse(localStorage.getItem('zjks.v1.state')||'{}'); return { records: Object.keys(s.records||{}).length, exams: (s.exams||[]).length, days: Object.keys(s.days||{}).length, hero: !!document.querySelector('.hero h1') }; })()`);
  console.log("  before", JSON.stringify(before), "after", JSON.stringify(after));

  console.log("\n[12] 报错汇总");
  if (problems.length) {
    console.log("  ✗ " + problems.length + " 个问题：");
    problems.slice(0, 12).forEach((p) => console.log("    - " + p.slice(0, 300)));
  } else {
    console.log("  ✓ 无 JS 报错");
  }

  ws.close();
  proc.kill();
  await sleep(300);
  process.exit(problems.length ? 1 : 0);
}

main().catch((err) => {
  console.error("测试失败：", err.message);
  process.exit(1);
});
