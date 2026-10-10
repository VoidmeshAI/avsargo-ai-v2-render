@echo off
cd /d "%~dp0"
py -3 scripts\build_apk.py
if errorlevel 1 pause
