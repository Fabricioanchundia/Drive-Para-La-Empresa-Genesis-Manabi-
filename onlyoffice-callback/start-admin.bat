@echo off
title OnlyOffice Callback Server :3001
cd /d "%~dp0"

echo.
echo  OnlyOffice Callback Server
echo  ══════════════════════════
echo.

REM Instalar dependencias si no existen
if not exist "node_modules" (
  echo  [+] Instalando dependencias (primera vez)...
  npm install --prefer-offline --no-audit --no-fund
  echo  [OK] node_modules instalado.
  echo.
)

REM Abrir puerto en firewall (silencioso si ya existe)
netsh advfirewall firewall delete rule name="OnlyOffice Callback 3001" >nul 2>&1
netsh advfirewall firewall add rule name="OnlyOffice Callback 3001" dir=in action=allow protocol=TCP localport=3001 >nul 2>&1

echo  [OK] Puerto 3001 habilitado en firewall.
echo  Iniciando servidor...
echo.

node server.js
