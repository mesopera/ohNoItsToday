@echo off
cd /d "%~dp0"

REM Use the venv's pythonw.exe directly — no activation needed, no console window
if exist "venv\Scripts\pythonw.exe" (
    start "" "venv\Scripts\pythonw.exe" run.py
    exit /b 0
)

REM Fallback: try global pythonw.exe (if Python installed system-wide)
where pythonw.exe >nul 2>&1
if %errorlevel% == 0 (
    start "" pythonw.exe run.py
    exit /b 0
)

REM Nothing found — show an error so the user knows what happened
echo ERROR: Could not find pythonw.exe
echo Make sure you created a venv with: python -m venv venv
echo And installed dependencies with: venv\Scripts\pip install -r requirements.txt
pause