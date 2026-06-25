@echo off
cd /d "%~dp0"
REM pythonw.exe runs Python without a console window — essential for a clean desktop app startup.
REM If using a virtual environment, change the line below to:
REM   call venv\Scripts\activate.bat && start "" pythonw.exe run.py
start "" pythonw.exe run.py
