@echo off
setlocal EnableDelayedExpansion
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
  echo  [ERROR] No __launchers\ folder. Run bid-bot-save-session.bat once to create a profile.
  pause
  exit /b 1
)

set FOUND=0
for %%f in (__launchers\*.bat) do (
  echo %%~nxf | findstr /i "example" >nul
  if errorlevel 1 (
    set FOUND=1
    echo  Starting: %%~nf
    start "Lancers Bid Bot — %%~nf" /D "%CD%" cmd /k call "%%f"
  )
)

if "!FOUND!"=="0" (
  echo  [ERROR] No __launchers\*.bat found ^(skips *example*^).
  echo  Run bid-bot-save-session.bat to create a profile.
  pause
  exit /b 1
)

echo.
echo  Started one window per profile. Close each window to stop that bot.
endlocal
