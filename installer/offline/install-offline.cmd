@echo off
setlocal EnableExtensions

set "EXTRACT_DIR=%~dp0"
set "INSTALL_DIR=%TABLELINK_INSTALL_DIR%"
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=%LOCALAPPDATA%\TableLink"

echo Installing TableLink to "%INSTALL_DIR%"

if not exist "%EXTRACT_DIR%offline-payload.zip" (
  echo Missing offline-payload.zip next to installer bootstrap.
  exit /b 1
)

set "WORK_DIR=%TEMP%\tablelink-offline-install-%RANDOM%%RANDOM%"
mkdir "%WORK_DIR%" >nul 2>nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%EXTRACT_DIR%offline-payload.zip' -DestinationPath '%WORK_DIR%' -Force"
if errorlevel 1 exit /b 1

if exist "%INSTALL_DIR%" (
  echo Updating existing TableLink installation...
) else (
  mkdir "%INSTALL_DIR%" >nul 2>nul
)

robocopy "%WORK_DIR%\app\TableLink-store-trial-2026-06-20" "%INSTALL_DIR%" /E /XD node_modules .next dist /XF .env *.log >nul
if %ERRORLEVEL% GTR 7 exit /b %ERRORLEVEL%

robocopy "%WORK_DIR%\nodejs" "%INSTALL_DIR%\tools\nodejs" /E >nul
if %ERRORLEVEL% GTR 7 exit /b %ERRORLEVEL%

robocopy "%WORK_DIR%\npm-cache" "%INSTALL_DIR%\.npm-cache" /E >nul
if %ERRORLEVEL% GTR 7 exit /b %ERRORLEVEL%

copy /Y "%WORK_DIR%\start-tablelink.cmd" "%INSTALL_DIR%\start-tablelink.cmd" >nul
copy /Y "%WORK_DIR%\check-tablelink.cmd" "%INSTALL_DIR%\check-tablelink.cmd" >nul

set "PATH=%INSTALL_DIR%\tools\nodejs;%PATH%"
set "npm_config_cache=%INSTALL_DIR%\.npm-cache"

cd /d "%INSTALL_DIR%"

if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo Created .env from .env.example. Review it before store use.
  )
)

where docker.exe >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is not installed or docker.exe is not on PATH.
  if exist "%WORK_DIR%\third-party\Docker Desktop Installer.exe" (
    echo Starting bundled Docker Desktop installer...
    start /wait "" "%WORK_DIR%\third-party\Docker Desktop Installer.exe"
  ) else (
    echo Install Docker Desktop manually, then run "%INSTALL_DIR%\check-tablelink.cmd".
  )
) else (
  docker image inspect postgres:17-alpine >nul 2>nul
  if errorlevel 1 (
    if exist "%WORK_DIR%\docker-images\postgres-17-alpine.tar" (
      echo Loading offline postgres:17-alpine Docker image...
      docker load -i "%WORK_DIR%\docker-images\postgres-17-alpine.tar"
    )
  )
)

echo Installing npm dependencies from offline cache...
npm.cmd install --offline --cache "%INSTALL_DIR%\.npm-cache"
if errorlevel 1 (
  echo Offline npm install failed. If this PC has internet, retry with npm.cmd install --cache "%INSTALL_DIR%\.npm-cache".
  exit /b 1
)

npm.cmd run db:generate
if errorlevel 1 exit /b 1

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop'); $shell=New-Object -ComObject WScript.Shell; $s=$shell.CreateShortcut((Join-Path $desktop 'Start TableLink.lnk')); $s.TargetPath=(Join-Path '%INSTALL_DIR%' 'start-tablelink.cmd'); $s.WorkingDirectory='%INSTALL_DIR%'; $s.Save(); $c=$shell.CreateShortcut((Join-Path $desktop 'Check TableLink.lnk')); $c.TargetPath=(Join-Path '%INSTALL_DIR%' 'check-tablelink.cmd'); $c.WorkingDirectory='%INSTALL_DIR%'; $c.Save()"

echo.
echo TableLink offline installation completed.
echo Install path: "%INSTALL_DIR%"
echo Use the desktop shortcuts to start or check TableLink.
echo.
pause

