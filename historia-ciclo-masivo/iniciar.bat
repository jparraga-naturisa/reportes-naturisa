@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Dashboard Naturisa - Historia del ciclo (Masivo)
echo.
echo  Iniciando Historia del ciclo - Masivo...
echo  El navegador se abrira automaticamente.
echo.
python -X utf8 ..\comun\server.py historia-ciclo-masivo\historia-ciclo-masivo.html 3003
pause
