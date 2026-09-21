@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

echo ============================================
echo   语文试卷AI批改系统 - 一键启动
echo ============================================
echo.

if not exist "%BACKEND%\.venv\Scripts\python.exe" (
    echo [后端] 未找到虚拟环境，正在创建...
    python -m venv "%BACKEND%\.venv"
    if not exist "%BACKEND%\.venv\Scripts\python.exe" (
        echo [错误] 创建虚拟环境失败，请确认已安装 Python 并加入 PATH。
        pause
        exit /b 1
    )
    echo [后端] 安装依赖，首次运行可能需要几分钟...
    "%BACKEND%\.venv\Scripts\python.exe" -m pip install -q -r "%BACKEND%\requirements.txt"
)

if not exist "%BACKEND%\.env" (
    echo [后端] 生成配置文件 .env
    copy "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
)

if not exist "%FRONTEND%\node_modules" (
    echo [前端] 首次运行，正在安装前端依赖，可能需要几分钟...
    pushd "%FRONTEND%"
    call npm install
    popd
)

echo [后端] 启动中... http://127.0.0.1:8000
start "AI批改-后端" "%ROOT%scripts\run-backend.bat"

echo [前端] 启动中... http://localhost:5173
start "AI批改-前端" "%ROOT%scripts\run-frontend.bat"

rem 等前端编译完成再打开浏览器（ping 比 timeout 更通用，重定向环境下也能用）
ping -n 8 127.0.0.1 >nul
start "" "http://localhost:5173"

echo.
echo 已在两个新窗口分别启动后端和前端，关闭对应窗口即可停止服务。
echo 首次使用请先在网页的"模型配置"页面填写你的 API Key。
echo.
pause
endlocal
