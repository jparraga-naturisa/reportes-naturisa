@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Alimentacion
echo.
echo  Iniciando Dashboard Naturisa...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py ..\dashboard-alimentacion\dashboard-alimentacion.html 3000
pause
