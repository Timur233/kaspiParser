@echo off
setlocal

if /i "%~1"=="__hidden__" goto run

powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/c """"%~f0"""" __hidden__' -WindowStyle Hidden"
exit /b

:run
cd /d "%~dp0"
node scripts\run-parser.js for-you
exit /b
