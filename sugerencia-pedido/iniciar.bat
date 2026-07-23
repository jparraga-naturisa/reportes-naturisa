@echo off
cd /d "%~dp0"
title Naturisa - Sugerencia de Pedido
echo.
echo  Iniciando Sugerencia de Pedido...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py ..\sugerencia-pedido\sugerencia-pedido.html 3001
pause
