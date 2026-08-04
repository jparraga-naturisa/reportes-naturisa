@echo off
cd /d "%~dp0"
title Dashboard Naturisa - Historia del ciclo (Masivo)
echo.
echo  Iniciando Historia del ciclo - Masivo...
echo  El navegador se abrira automaticamente.
echo.
python ..\comun\server.py ..\historia-ciclo-masivo\historia-ciclo-masivo.html 3003
pause
