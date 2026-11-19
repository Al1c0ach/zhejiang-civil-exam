/* =========================================================================
   浙考刷题 · 答题引擎
   专项练习 / 即时判题 / 答题卡 / 限时模拟 / 练习报告
   ========================================================================= */
(function () {
  "use strict";

  const APP = window.APP;
  if (!APP) return;
  const { QMAP, MODMAP, LETTERS, state, esc, pad, clampPct, pct, icon, toast, openModal, closeModal, navigate } = APP;

  const SESSION_KEY = "zjks.v1.session";
  let session = null;
  let tick = null;

  /* ---------------- 会话 ---------------- */
  function isCorrect(q, picked) {
    if (!picked || !picked.length) return false;
    const a = q.answer.slice().sort().join(",");
    const b = picked.slice().sort().join(",");
    return a === b;
  }

  function saveSession() {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch (err) {
      /* 忽略：本地存储不可用时仅保留内存会话 */
    }
  }

  function restoreSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.ids && parsed.ids.length && !parsed.finished) {
        session = parsed;
      } else if (parsed && parsed.finished) {
        session = null;
        try { localStorage.removeItem(SESSION_KEY); } catch (err) { /* 忽略 */ }
      }
    } catch (err) {
      session = null;
    }
  }

  function go(hash) {
    if (location.hash === hash) APP.render();
    else location.hash = hash;
  }

  function createSession(opts) {
    const ids = (opts.ids || []).filter((id) => QMAP.has(id));
    if (!ids.length) {
      toast("没有可练习的题目", "bad");
      return null;
    }
    session = {
      mode: opts.mode || "instant",
      title: opts.title || "专项练习",
      ids,
      idx: Math.max(0, ids.indexOf(opts.startId || ids[0])),
      answers: {},
      revealed: {},
      recorded: {},
      startedAt: Date.now(),
      limitMs: opts.limitMs || 0,
      finished: false,
      submittedAt: 0,
    };
    saveSession();
    return session;
  }

  function startPractice(opts) {
    if (!createSession(opts)) return;
    go("#/practice");
  }

  /** 按模块均衡抽题，用于每日一练与模拟卷 */
  function pickBalanced(count, modules) {
    const pools = modules
      .map((m) => APP.shuffle(APP.BANK.questions.filter((q) => q.module === m)))
      .filter((p) => p.length);
    if (!pools.length) return [];
    const order = APP.shuffle(pools.map((_, i) => i));
    const out = [];
    let round = 0;
    while (out.length < count) {
      let added = false;
      for (const i of order) {
        const pool = pools[i];
        const q = pool[round];
        if (q) {
          out.push(q.id);
          added = true;
          if (out.length >= count) break;
        }
      }
      if (!added) break;
      round += 1;
    }
    return out;
  }

  function startDaily() {
    const goal = state.settings.dailyGoal || 20;
    const mods = APP.MODULES.filter((m) => m.group !== "申论" && APP.BANK.questions.some((q) => q.module === m.id)).map((m) => m.id);
    const ids = pickBalanced(goal, mods);
    startPractice({ ids, title: "每日一练", mode: "instant" });
  }

  function startExam() {
    const quota = { yanyu: 12, shuliang: 9, panduan: 12, ziliao: 12, changshi: 8, gongji: 7 };
    const ids = [];
    Object.keys(quota).forEach((m) => {
      const pool = APP.shuffle(APP.BANK.questions.filter((q) => q.module === m));
      ids.push(...pool.slice(0, quota[m]).map((q) => q.id));
    });
    let list = ids.slice(0, 60);
    if (list.length < 60) {
      const rest = APP.shuffle(APP.BANK.questions.filter((q) => !list.includes(q.id)).map((q) => q.id));
      list = list.concat(rest.slice(0, 60 - list.length));
    }
    openModal(
      `<div style="font-size:.88rem;line-height:1.85">
        <p><b>${list.length} 题 · 60 分钟 · 100 分制</b></p>
        <p style="color:var(--muted);margin-top:6px">按行测常见结构组卷：言语理解、数量关系、判断推理、资料分析、常识判断，另含公共基础知识题。作答过程中<b>不显示对错</b>，交卷后统一出分并给出各模块表现。</p>
        <p style="color:var(--muted);margin-top:6px">中途退出会保留答题进度，但计时继续；到时自动交卷。</p>
      </div>`,
      {
        title: "全真模拟",
        subtitle: "建议关闭消息通知，按考试节奏作答",
        footer: `<button class="btn" data-close="1">取消</button><button class="btn btn--primary" data-action="exam-go">开始考试</button>`,
      }
    );
  }

  APP.on("exam-go", () => {
    closeModal(true);
    const quota = { yanyu: 12, shuliang: 9, panduan: 12, ziliao: 12, changshi: 8, gongji: 7 };
    const ids = [];
    Object.keys(quota).forEach((m) => {
      const pool = APP.shuffle(APP.BANK.questions.filter((q) => q.module === m));
      ids.push(...pool.slice(0, quota[m]).map((q) => q.id));
    });
    let list = ids.slice(0, 60);
    if (list.length < 60) {
      const rest = APP.shuffle(APP.BANK.questions.filter((q) => !list.includes(q.id)).map((q) => q.id));
      list = list.concat(rest.slice(0, 60 - list.length));
    }
    createSession({ ids: list, title: "全真模拟", mode: "exam", limitMs: 60 * 60 * 1000 });
    go("#/practice");
  });

  APP.setStarters({ startPractice, startExam, startDaily });

  /* ---------------- 练习视图 ---------------- */
  const views = APP.views;

  views.practice = function (query) {
    if (!session) {
      if (query && query.m && MODMAP.has(query.m)) {
        const mod = MODMAP.get(query.m);
        createSession({
          ids: APP.shuffle(APP.BANK.questions.filter((q) => q.module === query.m).map((q) => q.id)),
          title: `${mod.name} · 专项`,
          mode: "instant",
        });
      } else {
        go("#/home");
        return;
      }
    }
    if (!session) {
      go("#/home");
      return;
    }
    renderPractice();
  };

  function isRevealed(q) {
    if (!session) return false;
    if (session.finished) return true;
    return session.mode === "instant" && !!session.revealed[q.id];
  }

  function answeredCount() {
    if (!session) return 0;
    return session.ids.filter((id) => (session.answers[id] || []).length).length;
  }

  function correctCount() {
    if (!session) return 0;
    return session.ids.filter((id) => {
      const q = QMAP.get(id);
      return q && isCorrect(q, session.answers[id]);
    }).length;
  }

  function currentQ() {
    return QMAP.get(session.ids[session.idx]);
  }

  function materialHTML(q) {
    if (!q.material) return "";
    const m = APP.BANK.materials[q.material];
    if (!m) return "";
    return `<div class="material">
      <div class="material__title">${icon("paper")}${esc(m.title || "给定材料")}
        ${m.note ? `<span class="material__note">${esc(m.note)}</span>` : ""}</div>
      ${m.html || `<p>${esc(m.text || "")}</p>`}
    </div>`;
  }

  function figuresHTML(list) {
    if (!list || !list.length) return "";
    return `<div class="figures">${list.map((svg) => `<span>${svg}</span>`).join("")}</div>`;
  }

  function optionHTML(q, i) {
    const picked = session.answers[q.id] || [];
    const revealed = isRevealed(q);
    const isPicked = picked.includes(i);
    const isAns = q.answer.includes(i);
    let cls = "opt";
    let mark = "";
    if (revealed) {
      cls += " is-locked";
      if (isAns) {
        cls += " is-right";
        mark = icon("check");
      } else if (isPicked) {
        cls += " is-wrong";
        mark = icon("x");
      } else {
        cls += " is-dim";
      }
    } else if (isPicked) {
      cls += " is-picked";
    }
    const fig = q.figures && q.figures.options && q.figures.options[i];
    const text = q.options[i];
    if (fig) {
      return `<button class="${cls} opt--fig" data-action="pick" data-i="${i}" ${revealed ? "disabled" : ""} aria-label="选项 ${LETTERS[i]}">
        <span class="opt__key">${LETTERS[i]}</span>
        <span class="opt__fig">${fig}</span>
        <span class="opt__mark">${mark}</span>
      </button>`;
    }
    return `<button class="${cls}" data-action="pick" data-i="${i}" ${revealed ? "disabled" : ""}>
      <span class="opt__key">${LETTERS[i]}</span>
      <span class="opt__text">${text ? esc(text) : ""}</span>
      <span class="opt__mark">${mark}</span>
    </button>`;
  }

  function explainHTML(q) {
    const picked = session.answers[q.id] || [];
    const ok = isCorrect(q, picked);
    const multi = q.type === "multi";
    const ansText = q.answer.map((i) => LETTERS[i]).join("");
    return `<div class="explain">
      <div class="explain__head">
        <span class="explain__verdict ${ok ? "is-right" : "is-wrong"}">
          ${icon(ok ? "check" : "x")}${ok ? "回答正确" : "回答错误"}
        </span>
        <span class="tag tag--brand">正确答案 ${ansText}</span>
        ${multi ? `<span class="tag">多选题</span>` : ""}
        ${q.sub ? `<span class="tag">${esc(q.sub)}</span>` : ""}
      </div>
      <div class="explain__body">${esc(q.explain || "")}</div>
      ${q.source ? `<div class="explain__foot"><span>依据</span><span>${esc(q.source)}</span></div>` : ""}
    </div>`;
  }

  function renderPractice() {
    const q = currentQ();
    if (!q) {
      go("#/home");
      return;
    }
    const view = document.getElementById("view");
    const total = session.ids.length;
    const isExam = session.mode === "exam";
    const revealed = isRevealed(q);
    const picked = session.answers[q.id] || [];
    const multi = q.type === "multi";
    const starRec = APP.recOf(q.id);
    const starred = !!(starRec && starRec.star);
    const mod = MODMAP.get(q.module) || { name: "", color: "var(--brand)" };
    const progress = ((session.idx + 1) / total) * 100;
    const right = correctCount();
    const answered = answeredCount();

    view.innerHTML = `
      <div class="practice">
        <div class="pbar">
          <button class="icon-btn pbar__back" data-action="practice-exit" aria-label="退出练习">${icon("arrowLeft")}</button>
          <div class="pbar__main">
            <div class="pbar__title">${esc(session.title)} · 第 ${session.idx + 1} / ${total} 题</div>
            <div class="pbar__track"><i style="width:${progress}%"></i></div>
          </div>
          <div class="pbar__stat" id="pTimer">
            <b>${isExam ? "60:00" : "00:00"}</b>
            <span>${isExam ? "剩余" : "用时"}</span>
          </div>
          <button class="icon-btn" data-action="open-sheet" aria-label="答题卡">${icon("grid")}</button>
        </div>

        <div class="qcard">
          <div class="qcard__head">
            <span class="qcard__idx">NO.${pad(session.idx + 1)}</span>
            <span class="tag" style="color:${mod.color};background:color-mix(in srgb, ${mod.color} 12%, transparent)">${esc(mod.name)}</span>
            ${q.sub ? `<span class="tag">${esc(q.sub)}</span>` : ""}
            <span class="tag" title="难度">${"●".repeat(q.diff)}${"○".repeat(3 - q.diff)}</span>
            ${multi ? `<span class="tag tag--gold">多选</span>` : ""}
            <button class="icon-btn" style="margin-left:auto" data-action="toggle-star" data-id="${q.id}" aria-label="收藏">
              ${starred ? `<span style="color:var(--warn)">${icon("star")}</span>` : icon("star")}
            </button>
          </div>

          ${materialHTML(q)}
          <div class="stem">${esc(q.stem)}</div>
          ${q.figures && q.figures.stem ? figuresHTML(q.figures.stem) : ""}

          <div class="options${q.figures && q.figures.options ? " options--figs" : ""}">
            ${q.options.map((_, i) => optionHTML(q, i)).join("")}
          </div>

          ${
            multi && !revealed
              ? `<div style="margin-top:16px;display:flex;gap:8px;align-items:center">
                   <button class="btn btn--primary btn--sm" data-action="submit-multi" ${picked.length ? "" : "disabled"}>提交本题</button>
                   <span style="font-size:.76rem;color:var(--muted)">多选题：选全 2—3 项后提交</span>
                 </div>`
              : ""
          }
          ${revealed ? explainHTML(q) : ""}
        </div>

        <div style="display:flex;justify-content:space-between;gap:10px;font-size:.74rem;color:var(--muted);padding:10px 4px 0">
          <span>已答 ${answered} / ${total}${isExam ? "" : ` · 正确 ${right} 题`}</span>
          <span>${isExam ? "交卷后统一判分" : "答错会自动收入错题本"}</span>
        </div>

        <div class="pfoot">
          <button class="btn" data-action="prev" ${session.idx === 0 ? "disabled" : ""}>${icon("arrowLeft")}上一题</button>
          <button class="btn btn--ghost pfoot__icon" data-action="toggle-star" data-id="${q.id}" aria-label="收藏" title="收藏（F）">
            ${starred ? `<span style="color:var(--warn)">${icon("star")}</span>` : icon("star")}
          </button>
          <button class="btn btn--ghost pfoot__icon" data-action="open-sheet" aria-label="答题卡" title="答题卡">${icon("grid")}</button>
          <span class="pfoot__spacer"></span>
          ${
            session.idx === total - 1
              ? `<button class="btn btn--primary" data-action="finish">${isExam ? "交卷" : "查看报告"}${icon("check")}</button>`
              : `<button class="btn btn--primary" data-action="next">下一题${icon("arrowRight")}</button>`
          }
        </div>
      </div>
    `;

    startTick(isExam);
  }

  /* ---------------- 计时 ---------------- */
  function startTick(isExam) {
    if (tick) clearInterval(tick);
    const el = () => document.getElementById("pTimer");
    let warned = false;
    const update = () => {
      if (!session) return;
      const box = el();
      if (!box) {
        clearInterval(tick);
        return;
      }
      if (session.finished) {
        clearInterval(tick);
        return;
      }
      if (isExam) {
        const left = Math.max(0, session.limitMs - (Date.now() - session.startedAt));
        box.innerHTML = `<b>${APP.fmtCountdown(left)}</b><span>剩余</span>`;
        box.classList.toggle("is-warn", left <= 5 * 60 * 1000);
        if (left <= 0) {
          clearInterval(tick);
          submitSession(true);
          return;
        }
        if (left <= 5 * 60 * 1000 && !warned) {
          warned = true;
          toast("还剩 5 分钟", "bad");
        }
      } else {
        const used = Date.now() - session.startedAt;
        box.innerHTML = `<b>${APP.fmtDuration(used)}</b><span>用时</span>`;
      }
    };
    update();
    tick = setInterval(update, 1000);
    session._tick = tick;
  }

  /* ---------------- 作答 ---------------- */
  APP.on("pick", (el) => {
    const q = currentQ();
    if (!q || isRevealed(q)) return;
    const i = Number(el.getAttribute("data-i"));
    const multi = q.type === "multi";
    const picked = (session.answers[q.id] || []).slice();

    if (multi) {
      const pos = picked.indexOf(i);
      if (pos >= 0) picked.splice(pos, 1);
      else picked.push(i);
      session.answers[q.id] = picked;
      saveSession();
      renderPractice();
      return;
    }

    session.answers[q.id] = [i];
    if (session.mode === "instant") {
      session.revealed[q.id] = true;
      recordOnce(q, [i]);
      saveSession();
      renderPractice();
      if (isCorrect(q, [i]) && state.settings.autoNext) {
        setTimeout(() => {
          if (session && !session.finished && session.ids[session.idx] === q.id) goNext();
        }, 620);
      }
    } else {
      saveSession();
      renderPractice();
    }
  });

  APP.on("submit-multi", () => {
    const q = currentQ();
    if (!q) return;
    const picked = session.answers[q.id] || [];
    if (!picked.length) return toast("请先选择选项", "bad");
    session.revealed[q.id] = true;
    recordOnce(q, picked);
    saveSession();
    renderPractice();
  });

  function recordOnce(q, picked) {
    if (session.recorded[q.id]) return;
    session.recorded[q.id] = true;
    APP.recordAnswer(q, picked, isCorrect(q, picked));
  }

  function goNext() {
    if (!session) return;
    if (session.idx < session.ids.length - 1) {
      session.idx += 1;
      saveSession();
      renderPractice();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      finishFlow();
    }
  }

  APP.on("next", () => {
    const q = currentQ();
    if (q && session.mode === "instant" && !isRevealed(q)) {
      toast("本题未作答，已跳过");
    }
    goNext();
  });

  APP.on("prev", () => {
    if (!session || session.idx === 0) return;
    session.idx -= 1;
    saveSession();
    renderPractice();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  APP.on("toggle-star", (el) => {
    const id = el.getAttribute("data-id");
    const starred = APP.toggleStar(id);
    renderPractice();
    toast(starred ? "已收藏" : "已取消收藏");
  });

  APP.on("practice-exit", () => {
    const done = answeredCount();
    const total = session ? session.ids.length : 0;
    openModal(
      `<p style="font-size:.9rem;line-height:1.8">${
        session && session.mode === "exam"
          ? "考试中途退出会保留答题进度，但<b>计时不会暂停</b>。"
          : "退出后本次练习进度会保留，可以下次继续。"
      }</p>
      <p style="font-size:.82rem;color:var(--muted);margin-top:8px">已答 ${done} / ${total} 题。</p>`,
      {
        title: "退出练习？",
        footer: `<button class="btn" data-close="1">继续做题</button>
          <button class="btn btn--danger" data-action="exit-confirm">退出</button>`,
      }
    );
  });

  APP.on("exit-confirm", () => {
    closeModal(true);
    if (tick) clearInterval(tick);
    saveSession();
    go("#/home");
  });

  APP.on("open-sheet", () => {
    const total = session.ids.length;
    const items = session.ids
      .map((id, i) => {
        const q = QMAP.get(id);
        const picked = session.answers[id] || [];
        const revealed = session.mode === "instant" && session.revealed[id];
        let cls = "";
        if (revealed) cls = isCorrect(q, picked) ? "is-right" : "is-wrong";
        else if (picked.length) cls = "is-done";
        if (i === session.idx) cls += " is-current";
        return `<button class="${cls}" data-action="jump" data-i="${i}">${i + 1}</button>`;
      })
      .join("");
    openModal(
      `<div class="sheet-legend">
        <span><i style="background:var(--surface-3)"></i>未作答</span>
        <span><i style="background:var(--brand-soft)"></i>已作答</span>
        ${session.mode === "instant" ? `<span><i style="background:var(--ok-soft)"></i>正确</span><span><i style="background:var(--bad-soft)"></i>错误</span>` : ""}
      </div>
      <div class="sheet">${items}</div>`,
      {
        title: "答题卡",
        subtitle: `共 ${total} 题 · 已答 ${answeredCount()} 题`,
        wide: true,
        footer: `${session.mode === "exam" ? `<button class="btn btn--primary" data-action="finish">交卷</button>` : `<button class="btn btn--primary" data-action="finish">结束练习</button>`}`,
      }
    );
  });

  APP.on("jump", (el) => {
    const i = Number(el.getAttribute("data-i"));
    if (!session || isNaN(i)) return;
    session.idx = i;
    saveSession();
    closeModal(true);
    renderPractice();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---------------- 交卷与报告 ---------------- */
  APP.on("finish", () => {
    if (!session) return;
    const unanswered = session.ids.length - answeredCount();
    if (session.mode === "exam" && unanswered > 0) {
      openModal(
        `<p style="font-size:.9rem;line-height:1.8">还有 <b>${unanswered}</b> 题没有作答，未作答按错误计算。确认交卷？</p>`,
        {
          title: "确认交卷",
          footer: `<button class="btn" data-close="1">继续作答</button><button class="btn btn--primary" data-action="finish-confirm">确认交卷</button>`,
        }
      );
      return;
    }
    if (session.mode !== "exam") {
      openModal(
        `<p style="font-size:.9rem;line-height:1.8">本次练习已答 ${answeredCount()} / ${session.ids.length} 题，结束后会生成练习报告。</p>`,
        {
          title: "结束本次练习",
          footer: `<button class="btn" data-close="1">继续做题</button><button class="btn btn--primary" data-action="finish-confirm">看报告</button>`,
        }
      );
      return;
    }
    submitSession(false);
  });

  APP.on("finish-confirm", () => {
    closeModal(true);
    submitSession(false);
  });

  function submitSession(auto) {
    if (!session || session.finished) return;
    session.finished = true;
    session.submittedAt = Date.now();
    if (tick) clearInterval(tick);

    // 模拟考：交卷时才写入作答记录，只记录真正作答过的题。
    if (session.mode === "exam") {
      session.ids.forEach((id) => {
        const q = QMAP.get(id);
        const picked = session.answers[id] || [];
        if (q && picked.length) APP.recordAnswer(q, picked, isCorrect(q, picked));
      });
    }

    const items = session.ids.map((id) => {
      const q = QMAP.get(id);
      const picked = session.answers[id] || [];
      return { id, q, picked, ok: isCorrect(q, picked), answered: picked.length > 0 };
    });
    const right = items.filter((it) => it.ok).length;
    const answered = items.filter((it) => it.answered).length;
    const total = items.length;
    const ms = Math.min(Date.now() - session.startedAt, session.limitMs || Infinity);
    const score = total ? Math.round((right / total) * 100) : 0;

    const byModule = {};
    items.forEach((it) => {
      if (!it.q) return;
      const key = it.q.module;
      const b = byModule[key] || (byModule[key] = { n: 0, right: 0, total: 0 });
      b.total += 1;
      if (it.answered) b.n += 1;
      if (it.ok) b.right += 1;
    });

    if (session.mode === "exam") {
      state.exams.push({
        date: APP.dstr(),
        score,
        right,
        total,
        answered,
        ms,
        title: "全真模拟",
      });
      if (state.exams.length > 60) state.exams = state.exams.slice(-60);
      APP.save(true);
    }

    const wrongIds = items.filter((it) => !it.ok && it.answered).map((it) => it.id);

    APP.lastResult = {
      mode: session.mode,
      title: session.title,
      total,
      right,
      answered,
      ms,
      score,
      items,
      byModule,
      wrongIds,
      auto: !!auto,
      date: APP.dstr(),
    };

    saveSession();
    go("#/result");
  }

  views.result = function () {
    const r = APP.lastResult;
    const view = document.getElementById("view");
    if (!r) {
      go("#/home");
      return;
    }
    const acc = r.total ? Math.round((r.right / r.total) * 100) : 0;
    const comment =
      acc >= 85 ? "这组题的状态很好，保持节奏，注意别在简单题上赶时间。"
        : acc >= 70 ? "已经接近稳定过线的水平，接下来重点补正确率偏低的模块。"
        : acc >= 55 ? "基础还在，短板也很清楚：把错题解析逐条看完，比再刷十套更有用。"
        : "先把解析吃透。错题不算白做，关键是弄明白每个干扰项错在哪。";

    const modRows = APP.MODULES.map((m) => m.id)
      .filter((key) => r.byModule[key])
      .map((key) => {
        const m = MODMAP.get(key) || { name: key, color: "var(--brand)" };
        const b = r.byModule[key];
        const a = b.total ? Math.round((b.right / b.total) * 100) : 0;
        return `<div class="barrow">
          <span class="barrow__label">${esc(m.name)}</span>
          <span class="barrow__track"><i class="barrow__fill" style="width:${a}%;background:${m.color}"></i></span>
          <span class="barrow__val"><b>${b.right}</b>/${b.total}</span>
        </div>`;
      })
      .join("");

    const review = r.items
      .map((it, i) => {
        if (!it.q) return "";
        const q = it.q;
        const yours = it.picked.length ? it.picked.map((x) => LETTERS[x]).join("") : "未答";
        const ans = q.answer.map((x) => LETTERS[x]).join("");
        return `<div class="qcard" style="margin-bottom:12px;padding:18px 20px">
          <div class="qcard__head">
            <span class="qcard__idx">${pad(i + 1)}</span>
            <span class="tag ${it.ok ? "tag--ok" : "tag--bad"}">${it.ok ? "正确" : "错误"}</span>
            <span class="tag">你的答案 ${yours}</span>
            <span class="tag tag--brand">正确答案 ${ans}</span>
          </div>
          <div class="stem" style="font-size:.94rem">${esc(q.stem)}</div>
          <div style="margin-top:10px;font-size:.84rem;line-height:1.8;color:var(--text-2)">
            <strong style="color:var(--text)">解析：</strong>${esc(q.explain || "")}
          </div>
        </div>`;
      })
      .join("");

    view.innerHTML = `
      <div class="result">
        <div class="result__score">
          <div class="result__num">${r.mode === "exam" ? r.score : acc}<small>${r.mode === "exam" ? "分" : "%"}</small></div>
          <div class="result__label">${r.mode === "exam" ? "模拟得分" : "本组正确率"}</div>
        </div>
        <div>
          <div class="result__meta">
            <div><b>${r.right}<small style="font-size:.8rem;color:rgba(255,255,255,.55)">/${r.total}</small></b><span>答对题数</span></div>
            <div><b>${APP.fmtDuration(r.ms)}</b><span>用时</span></div>
            <div><b>${r.answered}</b><span>已作答</span></div>
            <div><b>${r.total - r.right}</b><span>错题</span></div>
          </div>
          <p class="result__comment">${esc(comment)}${r.auto ? "（本次为到时自动交卷）" : ""}</p>
        </div>
      </div>

      <section class="section">
        <div class="section__head"><div class="section__title"><span class="section__kicker">01</span><h2>模块表现</h2></div></div>
        <div class="card card--pad"><div class="bars">${modRows}</div></div>
      </section>

      <section class="section">
        <div class="section__head">
          <div class="section__title"><span class="section__kicker">02</span><h2>逐题回顾</h2></div>
          <span class="section__desc">答错的题已自动收入错题本</span>
        </div>
        ${review || `<div class="empty"><div class="empty__ico">${icon("info")}</div><h3>没有可回顾的题目</h3></div>`}
      </section>

      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:26px">
        <button class="btn btn--primary" data-action="result-again">${icon("refresh")}再来一组</button>
        ${r.wrongIds.length ? `<button class="btn" data-action="result-wrong">${icon("rotate")}重做本组错题（${r.wrongIds.length}）</button>` : ""}
        <button class="btn" data-action="result-home">${icon("home")}回到首页</button>
      </div>
    `;
  };

  APP.on("result-again", () => {
    const r = APP.lastResult;
    if (!r) return go("#/home");
    if (r.mode === "exam") return startExam();
    const mods = [...new Set(r.items.map((it) => it.q && it.q.module).filter(Boolean))];
    const ids = pickBalanced(r.total, mods);
    startPractice({ ids, title: r.title + " · 再来一组", mode: "instant" });
  });

  APP.on("result-wrong", () => {
    const r = APP.lastResult;
    if (!r || !r.wrongIds.length) return;
    startPractice({ ids: r.wrongIds, title: "本组错题重做", mode: "instant" });
  });

  APP.on("result-home", () => go("#/home"));

  /* ---------------- 键盘 ---------------- */
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName ? e.target.tagName : "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!session || session.finished) return;
    if (!location.hash.startsWith("#/practice")) return;
    const q = currentQ();
    if (!q) return;
    const key = e.key.toLowerCase();
    if (["a", "b", "c", "d"].includes(key)) {
      const i = "abcd".indexOf(key);
      if (i < q.options.length) {
        e.preventDefault();
        if (!isRevealed(q)) {
          document.querySelector(`.opt[data-i="${i}"]`)?.click();
        }
      }
    } else if (["1", "2", "3", "4"].includes(key)) {
      const i = Number(key) - 1;
      if (i < q.options.length) {
        e.preventDefault();
        if (!isRevealed(q)) document.querySelector(`.opt[data-i="${i}"]`)?.click();
      }
    } else if (key === "enter") {
      e.preventDefault();
      const multi = q.type === "multi";
      if (multi && !isRevealed(q)) {
        if ((session.answers[q.id] || []).length) APP.actions["submit-multi"]();
      } else if (session.idx < session.ids.length - 1) {
        APP.actions["next"]();
      } else {
        APP.actions["finish"]();
      }
    } else if (key === "arrowleft") {
      e.preventDefault();
      APP.actions["prev"]();
    } else if (key === "arrowright") {
      e.preventDefault();
      APP.actions["next"]();
    } else if (key === "f") {
      e.preventDefault();
      APP.actions["toggle-star"]({ getAttribute: () => q.id });
    }
  });

  /* ---------------- 恢复会话 ---------------- */
  restoreSession();

  // 刷新后在练习页恢复计时
  if (session && location.hash.startsWith("#/practice")) {
    setTimeout(() => {
      if (session && !session.finished) renderPractice();
    }, 0);
  }
})();
