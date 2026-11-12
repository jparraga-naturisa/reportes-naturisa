@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Bodega
echo.
echo  Iniciando Bodega (balanceado y fertilizante)...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py bodega.html 3011
pause
