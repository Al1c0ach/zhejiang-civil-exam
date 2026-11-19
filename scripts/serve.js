/* 零依赖静态服务器：node scripts/serve.js [端口] [--host=127.0.0.1] */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const port = Number(process.argv[2]) || 4173;
const hostArg = process.argv.find((a) => a.startsWith("--host="));
const host = hostArg ? hostArg.split("=")[1] : "0.0.0.0";
const root = path.join(__dirname, "..");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((net) => {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    });
  });
  return out;
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(root, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log("");
  console.log("  浙考刷题 · 本地服务已启动");
  console.log("  本机访问：http://127.0.0.1:" + port + "/");
  if (host === "0.0.0.0") {
    const list = lanAddresses();
    if (list.length) {
      console.log("  手机访问（同一 Wi-Fi）：");
      list.forEach((ip) => console.log("    http://" + ip + ":" + port + "/"));
    }
  }
  console.log("");
  console.log("  按 Ctrl + C 停止服务");
});
