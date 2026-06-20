@echo off
setlocal
cd /d "%~dp0.."

echo [TableLink] Store preflight check

if not exist ".env" (
  echo [FAIL] .env not found. Run: copy .env.example .env
  exit /b 1
)

echo [OK] .env found

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [FAIL] npm.cmd not found. Install Node.js first.
  exit /b 1
)
echo [OK] npm.cmd found

if not exist "node_modules" (
  echo [WARN] node_modules not found. Run: npm.cmd install
) else (
  echo [OK] node_modules found
)

echo Running Prisma generate...
npm.cmd run db:generate
if errorlevel 1 exit /b 1

echo Checking API health at http://localhost:3001/api/system/health
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod 'http://localhost:3001/api/system/health' -TimeoutSec 5; $r | ConvertTo-Json -Depth 5 } catch { Write-Host '[WARN] API health unavailable. Start API first, then rerun check-store.cmd.' }"

echo.
echo Local IPv4 addresses:
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object InterfaceAlias,IPAddress | Format-Table -AutoSize"

echo.
echo Common pages:
echo   Web home:       http://localhost:3000
echo   Login:          http://localhost:3000/login
echo   Staff:          http://localhost:3000/staff
echo   Kitchen:        http://localhost:3000/kitchen
echo   Service:        http://localhost:3000/service
echo   Admin:          http://localhost:3000/admin
echo   Daily closing:  http://localhost:3000/admin/daily-closing
echo   Print jobs:     http://localhost:3000/print
echo   Sample table:   http://localhost:3000/table/TABLE-01

echo.
echo Check complete.
