@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Mareas Gabarras
echo.
echo  Iniciando Mareas Gabarras...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py mareas-gabarras\mareas-gabarras.html 3006
pause
