@echo off
title Vet Monitor - Startup Utility

:: Always run from the script's own folder, regardless of where it was launched from
cd /d "%~dp0"

echo ===================================================
echo 🐾 Starting Vet Monitor System...
echo ===================================================

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ✖ [ERROR] Node.js is not installed or not in your system PATH!
    echo.
    echo Please download and install Node.js version 22.5.0 or newer from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check Node.js version (Requires 22.5.0+)
for /f "tokens=1,2 delims=v." %%a in ('node -v') do (
    set NODE_MAJOR=%%a
)
if %NODE_MAJOR% lss 22 (
    echo ⚠ [WARNING] Node.js version is older than 22.
    echo The system requires Node.js 22.5.0+ for native SQLite support.
    echo Current version: %NODE_MAJOR%
    echo.
    echo Please upgrade Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 3. Install dependencies if they are missing
if not exist "node_modules\" (
    echo 📦 [INFO] Installing required dependencies - first-time setup...
    call npm install
    if %errorlevel% neq 0 (
        echo ✖ [ERROR] Failed to install dependencies. Please run 'npm install' manually.
        pause
        exit /b 1
    )
)

:: 4. Automatically open browser and start server
echo 🚀 [INFO] Starting the Vet Monitor server...
echo 🌍 [INFO] The dashboard will open in your default browser at http://localhost:3000
echo.

:: The Express server will automatically open the browser once it is ready.

:: Start the Express server
npm start
pause