@echo off
title AI批改-后端
cd /d "%~dp0..\backend"

echo 后端服务启动中... http://127.0.0.1:8000
echo 接口文档： http://127.0.0.1:8000/docs
echo 关闭此窗口即可停止后端服务。
echo.

.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

echo.
echo 后端服务已退出。
pause
