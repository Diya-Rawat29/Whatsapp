@echo off
echo ========================================
echo   WhatsApp Auto Reply Bot - Starting...
echo ========================================
echo.

echo [1/2] Starting Backend Server...
start "WhatsApp Backend" cmd /k "cd /d %~dp0backend && node server.js"

timeout /t 4 /nobreak > nul

echo [2/2] Starting Frontend Dashboard (Port 3000)...
start "WhatsApp Dashboard" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 5 /nobreak > nul

echo.
echo ========================================
echo   DONE! Open: http://localhost:3000
echo ========================================
echo.
echo  Steps:
echo  1. Wait for QR code to appear in the backend window
echo  2. Open WhatsApp on your phone
echo  3. Go to Settings > Linked Devices > Link a Device
echo  4. Scan the QR code shown
echo  5. Visit http://localhost:3000 for dashboard
echo.
start http://localhost:3000
pause
