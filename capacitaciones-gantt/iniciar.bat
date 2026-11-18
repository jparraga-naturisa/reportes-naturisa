@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Plan de capacitaciones
echo.
echo  Iniciando el Gantt del plan de capacitaciones...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py capacitaciones-gantt.html 3014
pause
