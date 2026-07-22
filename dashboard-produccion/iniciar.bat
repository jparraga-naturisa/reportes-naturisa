@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Produccion
echo.
echo  Iniciando Dashboard Naturisa...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py ..\dashboard-produccion\dashboard-produccion.html 3001
pause
