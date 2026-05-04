@echo off
setlocal EnableExtensions
call "%~dp0__japan-auto-root.bat" || exit /b 1
if not exist "%JAPAN_AUTO_ROOT%notification-bot\package.json" (
  echo  [ERROR] notification-bot not found under "%JAPAN_AUTO_ROOT%". Set JAPAN_AUTO_REPO to the workspace root.
  pause
  exit /b 1
)

where npm >nul 2>&1 || (
  echo  [ERROR] npm not found. Run setup.bat first.
  pause
  exit /b 1
)

cd /d "%JAPAN_AUTO_ROOT%notification-bot"
echo  notification-bot — session
echo  Workspace: %JAPAN_AUTO_ROOT%
echo  Double-click: save login ^| Or: %~nx0 restore [backup path]
echo  ----------------------------------------
call npm run session -- %*
echo.
pause
