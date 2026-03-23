@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"

set "START_PORT=8000"
set "MAX_TRY=20"
set "PORT="

for /L %%P in (%START_PORT%,1,65535) do (
  set /a _idx=%%P-%START_PORT%
  if !_idx! geq %MAX_TRY% goto :noport

  netstat -ano | findstr /r /c:":%%P .*LISTENING" >nul
  if errorlevel 1 (
    set "PORT=%%P"
    goto :found_port
  )
)

:noport
echo [错误] 未找到可用端口（从 %START_PORT% 起尝试了 %MAX_TRY% 个端口）。
echo 请关闭占用端口的程序后重试。
pause
exit /b 1

:found_port
where py >nul 2>nul
if %errorlevel%==0 (
  set "PY_CMD=py -3"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PY_CMD=python"
  ) else (
    echo [错误] 未找到 Python（py 或 python）。
    echo 请先安装 Python 3，并确保加入 PATH。
    pause
    exit /b 1
  )
)

set "URL=http://localhost:%PORT%/src/index.html"

echo.
echo ======================================
echo  视觉搜索实验一键启动
echo ======================================
echo 项目目录: %CD%
echo 端口: %PORT%
echo 页面: %URL%
echo.
echo 已为你打开浏览器；关闭本窗口即可停止服务器。
echo.

start "" "%URL%"
%PY_CMD% -m http.server %PORT%

endlocal
