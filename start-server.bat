@echo off
title Poti Waterski - http://localhost:5500
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
