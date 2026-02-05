@echo off
echo Starting SYB Backlinks Gen...
echo.

:: Start Backend (port 3000)
echo Starting Backend API on port 3000...
start "Backend API" cmd /k "cd /d %~dp0app && npm run dev"

:: Wait a moment for backend to initialize
timeout /t 3 /nobreak > nul

:: Start Frontend (port 3001)
echo Starting Frontend Dashboard on port 3001...
start "Frontend Dashboard" cmd /k "cd /d %~dp0dashboard && npm run dev"

echo.
echo Both servers starting in separate windows.
echo.
echo Backend API:  http://localhost:3000/api/v1
echo Dashboard:    http://localhost:3001/prospects
echo.
pause
