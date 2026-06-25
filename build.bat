@echo off
cd /d "%~dp0"
echo ============================================
echo  Daily Brief — Building standalone .exe
echo ============================================
echo.

REM --onedir is preferred over --onefile for pywebview (avoids WebView2 extraction issues)
pyinstaller ^
    --onedir ^
    --windowed ^
    --name "DailyBrief" ^
    --add-data "app\templates;app\templates" ^
    --add-data "app\static;app\static" ^
    --hidden-import "engineio.async_drivers.threading" ^
    --hidden-import "clr_loader" ^
    run.py

echo.
echo Build complete.
echo Executable: dist\DailyBrief\DailyBrief.exe
echo.
echo To distribute: zip the entire dist\DailyBrief\ folder.
echo The recipient needs no Python installed — WebView2 is pre-installed on Windows 10/11.
echo.
pause
