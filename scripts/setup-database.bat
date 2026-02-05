@echo off
echo ============================================
echo   SYB Backlinks Gen - Database Setup
echo ============================================
echo.

cd /d %~dp0app

echo Step 1: Running database migrations...
echo.
call npm run db:migrate
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Migrations failed!
    pause
    exit /b 1
)

echo.
echo ============================================
echo Step 2: Seeding data from SEO Command Center...
echo ============================================
echo.
call npm run db:seed
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Seeding failed!
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo You can now run start-app.bat to launch the application.
echo.
pause
