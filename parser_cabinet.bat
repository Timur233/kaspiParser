@echo off
setlocal

if /i "%~1"=="__hidden__" goto run

mshta "vbscript:CreateObject(""WScript.Shell"").Run """"%~f0"""" __hidden__"", 0, False:close"
exit /b

:run
cd /d "%~dp0"
node scripts\run-parser.js seller-cabinet
exit /b
