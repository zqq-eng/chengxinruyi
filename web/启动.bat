@echo off
echo ==========================================
echo   Web后台管理系统启动器
echo ==========================================
echo.
echo 请选择启动方式：
echo 1. 仅提供静态文件服务（需要单独启动代理服务）
echo 2. 使用Python启动代理服务（需要Python环境）
echo 3. 使用Node.js启动代理服务（需要Node.js环境）
echo.
echo 如果你还没有配置微信云开发参数，
echo 请先编辑 proxy.py 或 server.js 文件中的配置。
echo.
echo ==========================================
echo.

set /p choice=请输入选项 (1/2/3):

if "%choice%"=="1" (
    echo 启动静态文件服务...
    python -m http.server 8080
) else if "%choice%"=="2" (
    echo 启动Python代理服务...
    python proxy.py
) else if "%choice%"=="3" (
    echo 启动Node.js代理服务...
    npm install
    node server.js
) else (
    echo 无效选项，将启动静态文件服务...
    python -m http.server 8080
)

pause