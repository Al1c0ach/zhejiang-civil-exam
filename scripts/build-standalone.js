/* 把页面、样式、脚本、题库打包成单个 HTML，方便发到手机离线使用
   node scripts/build-standalone.js
*/
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const indexPath = path.join(root, "index.html");
const outPath = path.join(root, "浙考刷题-手机版.html");

let html = fs.readFileSync(indexPath, "utf8");

const inlineStyle = (match, href) => {
  const css = fs.readFileSync(path.join(root, href), "utf8");
  return `<style>\n${css}\n</style>`;
};

const inlineScript = (match, src) => {
  const js = fs.readFileSync(path.join(root, src), "utf8");
  if (/<\/script/i.test(js)) throw new Error(src + " 含有 </script，无法安全内联");
  return `<script>\n${js}\n</script>`;
};

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, inlineStyle);
const before = html;
html = html.replace(/<script src="([^"]+)" defer><\/script>/g, inlineScript);
if (html === before) throw new Error("没有找到需要内联的脚本标签");

html = html.replace(
  "<title>浙考刷题 · 浙江省公务员 / 事业单位</title>",
  "<title>浙考刷题 · 浙江省公务员 / 事业单位（离线版）</title>"
);

fs.writeFileSync(outPath, html, "utf8");
const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
console.log(`✓ 已生成 ${path.basename(outPath)}（${kb} KB，单文件，可离线打开）`);
