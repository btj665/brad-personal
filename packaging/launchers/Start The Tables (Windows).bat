@echo off
setlocal
title The Tables
cd /d "%~dp0"

rem  Double-click to play. This checks for Node.js, offers to install it if it is
rem  missing, and then starts the game in your browser.

where node >nul 2>nul
if %errorlevel%==0 goto run

echo.
echo   The Tables needs Node.js, and it is not installed yet.
echo.

where winget >nul 2>nul
if %errorlevel%==0 (
  echo   Installing Node.js with winget. Approve the prompt if one appears...
  echo.
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  rem  A fresh install is not on this window's PATH yet, so look where it lands.
  where node >nul 2>nul
  if %errorlevel%==0 goto run
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto run
  )
  echo   Node.js was installed. Please double-click this file once more to start.
  echo.
  pause
  exit /b
)

echo   Automatic install is not available on this PC.
echo   Opening the Node.js download page — install it, then run this again.
echo.
start "" "https://nodejs.org/en/download/prebuilt-installer"
pause
exit /b

:run
node serve.mjs
echo.
echo   The Tables has stopped. You can close this window.
pause
