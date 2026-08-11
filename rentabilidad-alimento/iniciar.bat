@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Rentabilidad Alimento
echo.
echo  Iniciando Rentabilidad Alimento...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py rentabilidad-alimento\rentabilidad-alimento.html 3005
pause
