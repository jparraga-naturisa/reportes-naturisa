@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Control de Cambios
echo.
echo  Iniciando Control de Cambios...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py ..\control-cambios\control-cambios.html 3002
pause
