@echo off
title Drive-App - Iniciando...
cd /d "%~dp0"

REM  Uso: start.bat              -> IP auto-detectada
REM  Uso: start.bat 192.168.1.50 -> fuerza esa IP
REM
REM  TIP: Tambien puedes usar el lanzador maestro en la raiz:
REM       ..\START-DRIVE.bat

if "%~1"=="" (
  powershell -ExecutionPolicy Bypass -File "start.ps1"
) else (
  powershell -ExecutionPolicy Bypass -File "start.ps1" -Ip "%~1"
)
pause
