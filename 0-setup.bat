@echo off
setlocal EnableExtensions
call "%~dp0__japan-auto-root.bat" || exit /b 1

if not exist "%JAPAN_AUTO_ROOT%bid-bot\package.json" (
  echo  [ERROR] bid-bot not found at "%JAPAN_AUTO_ROOT%bid-bot".
  echo  Set JAPAN_AUTO_REPO to your workspace root ^(folder that contains bid-bot^), then retry.
  pause
  exit /b 1
)
if not exist "%JAPAN_AUTO_ROOT%notification-bot\package.json" (
  echo  [WARN] notification-bot missing — skipping that project.
)

echo.
echo  Japan Auto — setup (Node.js 20+ required)
echo  Workspace: %JAPAN_AUTO_ROOT%
echo  ----------------------------------------
echo.

where node >nul 2>&1 || (
  echo  [ERROR] node not found. Install Node.js 20+ from https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>&1 || (
  echo  [ERROR] npm not found.
  pause
  exit /b 1
)

echo  [1/3] bid-bot: npm install...
pushd "%JAPAN_AUTO_ROOT%bid-bot"
call npm install
if errorlevel 1 (
  echo  [ERROR] bid-bot npm install failed.
  popd
  pause
  exit /b 1
)
popd

if exist "%JAPAN_AUTO_ROOT%notification-bot\package.json" (
  echo.
  echo  [2/3] notification-bot: npm install...
  pushd "%JAPAN_AUTO_ROOT%notification-bot"
  call npm install
  if errorlevel 1 (
    echo  [ERROR] notification-bot npm install failed.
    popd
    pause
    exit /b 1
  )
  popd
) else (
  echo.
  echo  [2/3] notification-bot skipped.
)

echo.
echo  [3/3] Playwright Chromium (for session:save in bid-bot / notification-bot)...
pushd "%JAPAN_AUTO_ROOT%bid-bot"
call npx playwright install chromium
if errorlevel 1 (
  echo  [WARN] playwright install reported an error. Try: cd bid-bot ^&^& npx playwright install chromium
)
popd

echo.
echo  Done. Optional: add this folder to PATH to run these scripts from anywhere:
echo    %JAPAN_AUTO_ROOT%
echo  If you copy .bat files elsewhere, set: setx JAPAN_AUTO_REPO "%JAPAN_AUTO_ROOT%"
echo.
echo  Next: bid-bot-save-session.bat  then  bid-bot\__launchers\^<profile^>.bat  or  bid-bot-start-all.bat
echo        notification-start.bat  — dashboard / notify service
echo        notification-session.bat — Lancers login save (default) or: notification-session.bat restore [path]
echo.
pause
