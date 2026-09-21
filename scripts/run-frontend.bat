@echo off
title AI批改-前端
cd /d "%~dp0..\frontend"

echo 前端服务启动中... http://localhost:5173
echo 关闭此窗口即可停止前端服务。
echo.

call npm run dev

echo.
echo 前端服务已退出。
pause
