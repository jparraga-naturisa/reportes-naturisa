@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Carga Masiva de Muestreos
echo.
echo  Iniciando Carga Masiva de Muestreos...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py ..\carga-masiva\carga-masiva.html 3003
pause
