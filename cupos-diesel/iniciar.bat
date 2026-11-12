@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Cupos de diesel
echo.
echo  Iniciando Cupos de diesel por sucursal y tanque...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py cupos-diesel.html 3013
pause
