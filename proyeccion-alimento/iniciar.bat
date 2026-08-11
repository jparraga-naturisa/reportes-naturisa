@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Proyeccion de Alimento
echo.
echo  Iniciando Proyeccion de Alimento...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py proyeccion-alimento\proyeccion-alimento.html 3004
pause
