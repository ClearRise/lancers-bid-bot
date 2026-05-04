@echo off
cd /d "%~dp0\.."
set BID_BOT_INSTANCE=buno
title Lancers Bid Bot — buno
echo  Instance: buno — __buno\config + __buno\data
echo  Refresh login: npm run session:save -- --instance buno
echo.
npm start
pause
