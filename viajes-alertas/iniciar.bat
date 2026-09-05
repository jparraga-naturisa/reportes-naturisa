@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Alertas de Viajes
echo.
echo  Iniciando Alertas de Viajes...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py viajes-alertas\viajes-alertas.html 3008
pause
