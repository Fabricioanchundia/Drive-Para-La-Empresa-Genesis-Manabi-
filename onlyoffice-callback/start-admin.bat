@echo off
echo Abriendo puerto 3001 para OnlyOffice callback...
netsh advfirewall firewall delete rule name="OnlyOffice Callback 3001" >nul 2>&1
netsh advfirewall firewall add rule name="OnlyOffice Callback 3001" dir=in action=allow protocol=TCP localport=3001
echo.
echo Puerto 3001 abierto correctamente.
echo Iniciando callback server...
cd /d "%~dp0"
node server.js
