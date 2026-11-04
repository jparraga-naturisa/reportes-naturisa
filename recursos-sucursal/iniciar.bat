@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Recursos por sucursal
echo.
echo  Iniciando Recursos por sucursal...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py recursos-sucursal.html 3012
pause
