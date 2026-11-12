@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Activos Fijos
echo.
echo  Iniciando Activos Fijos...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py activos-fijos.html 3009
pause
