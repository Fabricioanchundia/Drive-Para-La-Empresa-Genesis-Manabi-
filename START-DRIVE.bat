@echo off
title Drive-App - Iniciando...
cd /d "%~dp0"

REM ─────────────────────────────────────────────────────────────
REM  DRIVE-APP  |  Lanzador maestro
REM
REM  Uso:
REM    START-DRIVE.bat            -> IP auto-detectada
REM    START-DRIVE.bat 192.168.1.50 -> fuerza esa IP
REM
REM  Inicia automaticamente:
REM    - OnlyOffice (Docker)
REM    - Callback Server (Node.js :3001)
REM    - Angular Frontend (ng serve :4200)
REM ─────────────────────────────────────────────────────────────

if "%~1"=="" (
  powershell -ExecutionPolicy Bypass -File "%~dp0drive-app\start.ps1"
) else (
  powershell -ExecutionPolicy Bypass -File "%~dp0drive-app\start.ps1" -Ip "%~1"
)

pause
