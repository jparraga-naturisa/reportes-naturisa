@echo off
title Naturisa - Consultar Ciclo
cd /d "%~dp0"
echo.
echo  Consultar un ciclo en todos los modulos (Piscinas en Produccion,
echo  Siembras, Cosechas por Fechas, Precrias, Movimientos, Tablero Ciclo)
echo.
set /p SUCURSAL="  Sucursal (codigo, ej. A1, BR, CA): "
set /p PISCINA="  Piscina (ej. 0454, 113): "
set /p CICLO="  Numero de ciclo (ej. 18): "
echo.
python -m validacion.consultar_ciclo --sucursal %SUCURSAL% --piscina %PISCINA% --ciclo %CICLO%
echo.
pause
