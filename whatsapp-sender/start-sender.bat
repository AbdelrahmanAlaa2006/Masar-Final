@echo off
title Masaar WhatsApp Sender
cd /d "%~dp0"

if not exist node_modules (
  echo Installing (first run only, needs internet)...
  call npm install
)

:loop
node sender.js
echo.
echo Sender stopped. Restarting in 10 seconds... (close this window to stop)
timeout /t 10 >nul
goto loop
