@echo off
setlocal
cd /d "%~dp0.."

echo [TableLink] Store startup

if not exist ".env" (
  echo Missing .env.
  echo Run: copy .env.example .env
  echo Then edit DATABASE_URL, AUTH_SECRET, PUBLIC_WEB_BASE_URL if needed.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd not found. Install Node.js first.
  pause
  exit /b 1
)

echo Running Prisma generate...
npm.cmd run db:generate
if errorlevel 1 (
  echo Prisma generate failed.
  pause
  exit /b 1
)

set /p RUN_MIGRATE=Run database migrations now? [y/N] 
if /i "%RUN_MIGRATE%"=="y" (
  npm.cmd run db:migrate
  if errorlevel 1 (
    echo Migration failed.
    pause
    exit /b 1
  )
)

echo Starting API and Web in separate windows...
start "TableLink API" cmd /k "%~dp0start-api.cmd"
timeout /t 3 /nobreak >nul
start "TableLink Web" cmd /k "%~dp0start-web.cmd"

echo.
echo Local pages:
echo   http://localhost:3000
echo   http://localhost:3000/login
echo   http://localhost:3000/staff
echo   http://localhost:3000/kitchen
echo   http://localhost:3000/service
echo   http://localhost:3000/admin
echo   http://localhost:3000/admin/daily-closing
echo   http://localhost:3000/print
echo   http://localhost:3000/table/TABLE-01

echo.
echo LAN IPv4 addresses:
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object InterfaceAlias,IPAddress | Format-Table -AutoSize"

echo.
echo If phones cannot open the site, allow Node.js or ports 3000/3001 in Windows Firewall.
echo Run scripts\check-store.cmd after both windows finish starting.
pause
