@echo off
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not on PATH. Install Node 22.15 or newer, then try again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting the Vite dev server at http://localhost:5173/
echo Close this window, or press Ctrl+C, to stop it.
call npm run dev
if errorlevel 1 pause
