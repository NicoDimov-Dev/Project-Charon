@echo off
rem Perfect Assassin (1997) on Windows 11 - runs the original game in the bundled DOSBox Staging.
rem Opens on the 42" monitor (DISPLAY3); change --screen to put it elsewhere (tools\winpos.ps1 lists screens).
rem The local cheat API (tools\pa.py) is enabled on 127.0.0.1:8086 only.
cd /d "%~dp0"
py -I tools\pa.py launch --screen DISPLAY3 --play
if errorlevel 1 start "" "dosbox\dosbox.exe" --noprimaryconf --conf pass.conf --conf play.conf --set webserver_enabled=on
