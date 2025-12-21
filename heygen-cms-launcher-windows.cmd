@echo off
setlocal

rem Run from the project directory, regardless of where the script is invoked.
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if not exist package.json (
  echo Error: package.json not found in %SCRIPT_DIR%
  exit /b 1
)

rem Install dependencies if needed, then start the dev server.
if not exist node_modules (
  echo Installing dependencies...
  npm install
  if errorlevel 1 exit /b 1
)

echo Starting the app + render server...
npm run dev:all
