@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   浙考刷题 · 正在启动本地服务...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   未检测到 Node.js，直接用浏览器打开本地页面。
  echo   提示：部分浏览器会限制本地文件的记录保存，建议安装 Node.js 后重新运行。
  echo.
  start "" "index.html"
  pause
  exit /b
)

start "" "http://127.0.0.1:4173/"
node scripts\serve.js 4173
pause
