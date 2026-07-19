@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Consumos Insumos
echo.
echo  Iniciando Consumos Insumos...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py ..\consumos-insumos\consumos-insumos.html 3001
pause
