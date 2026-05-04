@echo off
rem Shared by workspace .bat files. Sets JAPAN_AUTO_ROOT to the folder that contains bid-bot and notification-bot.
rem If you copy these scripts elsewhere, set:  setx JAPAN_AUTO_REPO "d:\Japan\Auto"
if defined JAPAN_AUTO_REPO (
  set "JAPAN_AUTO_ROOT=%JAPAN_AUTO_REPO%"
) else (
  set "JAPAN_AUTO_ROOT=%~dp0"
)
if "%JAPAN_AUTO_ROOT:~-1%" NEQ "\" set "JAPAN_AUTO_ROOT=%JAPAN_AUTO_ROOT%\"
exit /b 0
