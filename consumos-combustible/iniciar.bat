@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Consumos Combustible
echo.
echo  Iniciando Consumos Combustible...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py consumos-combustible\consumos-combustible.html 3007
pause
