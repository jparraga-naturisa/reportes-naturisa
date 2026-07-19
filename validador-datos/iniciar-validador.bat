@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Validador de Datos
echo.
echo  Iniciando Validador de Datos...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py ..\validador-datos\validador-datos.html 3002
pause
