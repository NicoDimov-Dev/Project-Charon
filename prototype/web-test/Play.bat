@echo off
rem Starts a local web server for the test and opens it in the browser. Close the window to stop.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
