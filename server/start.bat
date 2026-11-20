@echo off
title Diskord server
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org (LTS) and run this again. & pause & exit /b)
if not exist node_modules\ws call npm install --omit=dev
node server.js
pause
