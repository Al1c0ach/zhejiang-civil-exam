/* 题库结构校验：node scripts/validate.js [--verbose] */
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const files = fs
  .readdirSync(dataDir)
  .filter((f) => f.endsWith(".js"))
  .sort();

const win = {};
for (const f of files) {
  const src = fs.readFileSync(path.join(dataDir, f), "utf8");
  try {
    new Function("window", src)(win);
  } catch (err) {
    console.error(`✗ 语法错误 ${f}: ${err.message}`);
    process.exitCode = 1;
  }
}

const B = win.BANK;
const errors = [];
const warn = [];

if (!B) {
  console.error("✗ window.BANK 未定义");
  process.exit(1);
}

const modIds = new Set(B.modules.map((m) => m.id));
const ids = new Set();
const stems = new Map();
const answerDist = [0, 0, 0, 0];
const perModule = {};

for (const q of B.questions) {
  const tag = q.id || "(无 id)";
  if (!q.id) errors.push(`${tag}: 缺少 id`);
  if (ids.has(q.id)) errors.push(`${tag}: id 重复`);
  ids.add(q.id);

  if (!modIds.has(q.module)) errors.push(`${tag}: module 未定义 (${q.module})`);
  if (!q.stem || q.stem.trim().length < 4) errors.push(`${tag}: 题干过短`);
  if (!q.options || q.options.length !== 4) errors.push(`${tag}: 选项数量不是 4 (${(q.options || []).length})`);

  const figOpts = q.figures && q.figures.options;
  const allBlank = (q.options || []).every((o) => !String(o).trim());
  if (allBlank && (!figOpts || figOpts.length !== 4)) errors.push(`${tag}: 选项文字为空且缺少 4 个图形选项`);

  if (!Array.isArray(q.answer) || !q.answer.length) errors.push(`${tag}: answer 必须是数组`);
  else {
    if (new Set(q.answer).size !== q.answer.length) errors.push(`${tag}: answer 有重复索引`);
    for (const a of q.answer) {
      if (!Number.isInteger(a) || a < 0 || a > 3) errors.push(`${tag}: answer 索引越界 (${a})`);
    }
    if (q.type === "single" && q.answer.length !== 1) errors.push(`${tag}: 单选题 answer 应只有 1 项`);
    if (q.type === "multi" && (q.answer.length < 2 || q.answer.length > 3)) errors.push(`${tag}: 多选题 answer 应为 2—3 项`);
    if (q.answer.length === 1) answerDist[q.answer[0]] += 1;
  }

  if (!q.explain || q.explain.trim().length < 12) errors.push(`${tag}: 解析过短`);
  if (![1, 2, 3].includes(q.diff)) errors.push(`${tag}: 难度取值应为 1/2/3`);
  if (q.material && !B.materials[q.material]) errors.push(`${tag}: 材料不存在 (${q.material})`);

  if (q.options) {
    const optTexts = q.options.filter((o) => String(o).trim());
    if (new Set(optTexts).size !== optTexts.length) errors.push(`${tag}: 选项文字重复`);
  }

  const key = String(q.stem).replace(/\s/g, "").slice(0, 40);
  // 图形推理、病句题使用统一题干，属正常重复
  const genericStem = q.sub === "图形推理" || String(q.stem).includes("下列句子中");
  if (!genericStem) {
    if (stems.has(key)) warn.push(`${tag}: 题干与 ${stems.get(key)} 高度相似`);
    else stems.set(key, q.id);
  }

  perModule[q.module] = (perModule[q.module] || 0) + 1;
}

let essayIds = new Set();
for (const e of B.essays || []) {
  if (!e.id) errors.push("申论缺少 id");
  if (essayIds.has(e.id)) errors.push(`${e.id}: 申论 id 重复`);
  essayIds.add(e.id);
  for (const f of ["title", "type", "material", "prompt"]) {
    if (!e[f]) errors.push(`${e.id}: 申论缺少 ${f}`);
  }
  if (!Array.isArray(e.points) || e.points.length < 3) errors.push(`${e.id}: 申论要点过少`);
}

const verbose = process.argv.includes("--verbose");
console.log(`\n数据文件：${files.join("、")}`);
console.log(`模块 ${B.modules.length} 个｜选择题 ${B.questions.length} 道｜申论 ${(B.essays || []).length} 道`);
console.log(
  "模块分布：" +
    B.modules
      .map((m) => `${m.name} ${perModule[m.id] || 0}`)
      .join("｜")
);
const totalAns = answerDist.reduce((a, b) => a + b, 0);
console.log(
  `答案分布：A ${answerDist[0]}｜B ${answerDist[1]}｜C ${answerDist[2]}｜D ${answerDist[3]}` +
    (totalAns ? `（单选 ${totalAns} 题）` : "")
);

if (verbose) {
  console.log("\n—— 逐题核对 ——");
  for (const q of B.questions) {
    const ans = q.answer.map((i) => "ABCD"[i]).join("");
    const texts = q.answer.map((i) => (q.options[i] || "[图形]").slice(0, 26)).join(" / ");
    console.log(`${q.id}  ${ans}  ${texts}`);
  }
  console.log("\n—— 申论 ——");
  for (const e of B.essays || []) console.log(`${e.id}  ${e.type}  ${e.title}`);
}

if (warn.length) {
  console.log("\n提醒：");
  warn.forEach((w) => console.log("  · " + w));
}

if (errors.length) {
  console.log(`\n✗ 发现 ${errors.length} 个问题：`);
  errors.forEach((e) => console.log("  - " + e));
  process.exitCode = 1;
} else {
  console.log("\n✓ 结构校验全部通过");
}
