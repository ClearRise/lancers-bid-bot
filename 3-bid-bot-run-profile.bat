@echo off
setlocal EnableExtensions EnableDelayedExpansion
call "%~dp0__japan-auto-root.bat" || exit /b 1
if not exist "%JAPAN_AUTO_ROOT%bid-bot\package.json" (
  echo  [ERROR] bid-bot not found under "%JAPAN_AUTO_ROOT%". Set JAPAN_AUTO_REPO to the workspace root.
  pause
  exit /b 1
)

where npm >nul 2>&1 || (
  echo  [ERROR] npm not found. Run setup.bat first.
  pause
  exit /b 1
)

cd /d "%JAPAN_AUTO_ROOT%bid-bot"

if not "%~1"=="" (
  set "BID_BOT_INSTANCE=%~1"
  goto :run
)

set /p "BID_BOT_INSTANCE=Profile id (e.g. buno): "
if not defined BID_BOT_INSTANCE (
  echo  Cancelled.
  pause
  exit /b 1
)
set "BID_BOT_INSTANCE=!BID_BOT_INSTANCE: =!"

:run
echo  bid-bot — profile: !BID_BOT_INSTANCE!
echo  ----------------------------------------
call npm start
echo.
pause
