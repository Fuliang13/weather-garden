@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build-chatgpt-zip.ps1"

endlocal