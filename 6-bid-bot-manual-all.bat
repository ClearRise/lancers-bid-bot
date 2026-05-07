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

if not exist __launchers\ (
  echo  [ERROR] No __launchers\ folder. Run 1-bid-bot-save-profile.bat once to create profiles.
  pause
  exit /b 1
)

set FOUND=0
for %%f in (__launchers\*.bat) do (
  echo %%~nxf | findstr /i "example" >nul
  if errorlevel 1 (
    set FOUND=1
    set "INSTANCE_ID=%%~nf"
    echo  Starting manual bid: !INSTANCE_ID!
    start "Manual Bid — !INSTANCE_ID!" /D "%CD%" cmd /k "set BID_BOT_INSTANCE=!INSTANCE_ID! && npm run bid:manual"
  )
)

if "!FOUND!"=="0" (
  echo  [ERROR] No __launchers\*.bat found ^(skips *example*^).
  echo  Run 1-bid-bot-save-profile.bat to create a profile.
  pause
  exit /b 1
)

echo.
echo  Started manual bid window per profile.
echo  Each profile reads its own __<id>\data\manual-bid-task-ids.txt.
echo  Close each window when done.
endlocal
