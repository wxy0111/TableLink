@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0tools\nodejs;%PATH%"
set "npm_config_cache=%~dp0.npm-cache"
call scripts\start-store.cmd

