@echo off
setlocal
cd /d "%~dp0.."

if not exist ".env" (
  echo Missing .env. Copy .env.example to .env and edit it first.
  exit /b 1
)

echo Starting TableLink Web...
npm.cmd run dev:web
