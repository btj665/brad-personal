@echo off
setlocal enabledelayedexpansion
title The Tables - play on your phone
cd /d "%~dp0"

rem  Double-click this to play The Tables on your phone over your home Wi-Fi.
rem  It grabs the latest code, then starts the game so any device on the same
rem  network can open it. Leave this window open while you play.

rem  ---- 1. Make sure Node.js is installed (offer to install it if not) ----
where node >nul 2>nul
if %errorlevel%==0 goto haveNode

echo.
echo   The Tables needs Node.js, and it is not installed yet.
echo.
where winget >nul 2>nul
if %errorlevel%==0 (
  echo   Installing Node.js with winget. Approve the prompt if one appears...
  echo.
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  where node >nul 2>nul
  if !errorlevel!==0 goto haveNode
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto haveNode
  )
  echo   Node.js was installed. Please double-click this file once more to start.
  echo.
  pause
  exit /b
)
echo   Automatic install is not available on this PC.
echo   Opening the Node.js download page - install it, then run this again.
start "" "https://nodejs.org/en/download/prebuilt-installer"
pause
exit /b

:haveNode

rem  ---- 2. Get the latest code (only if this is a git checkout) ----
where git >nul 2>nul
if %errorlevel%==0 (
  if exist ".git" (
    echo   Fetching the latest version...
    git fetch origin >nul 2>nul
    git checkout claude/casino-video-power-auto-hold-vmt6bw >nul 2>nul
    git pull >nul 2>nul
    if !errorlevel! neq 0 (
      echo   Could not pull the latest automatically ^(maybe you have local edits^).
      echo   That is fine - continuing with the code you have.
    )
  )
) else (
  echo   Git is not installed, so this will run the code already on disk.
)

rem  ---- 3. Install dependencies if needed ----
if not exist "node_modules" (
  echo.
  echo   First-time setup: installing dependencies. This can take a minute...
  call npm install
)

rem  ---- 4. Start the server for the whole network ----
echo.
echo   ============================================================
echo    Starting The Tables.
echo.
echo    On your phone ^(same Wi-Fi as this PC^), open the address
echo    printed below next to "Network:" - for example
echo    http://192.168.1.42:5173/
echo.
echo    Windows may ask to allow Node.js through the firewall the
echo    first time - tick "Private networks" and allow it.
echo.
echo    Leave this window open while you play. Press Ctrl+C to stop.
echo   ============================================================
echo.

call npm run dev -- --host

echo.
echo   The Tables has stopped. You can close this window.
pause
