@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Mapa de Alimentacion
echo.
echo  Iniciando Mapa de Alimentacion...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py mapa-alimentacion\mapa-alimentacion.html 3006
pause
