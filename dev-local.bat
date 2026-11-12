@echo off
echo Iniciando entorno de desarrollo LOCAL (sin afectar produccion)...
echo.
echo [1] Worker local con BD local en: http://localhost:8787
echo [2] App en: http://localhost:3000/control-cambios/control-cambios.html
echo.

start "Worker Local" cmd /k "cd /d C:\Scripts\Naturisa\cloudflare-worker && npx wrangler dev worker.js --port 8787"

timeout /t 3 /nobreak >nul

start "Servidor HTML" cmd /k "cd /d C:\Scripts\Naturisa && npx http-server . -p 3000 --cors"

echo.
echo Abre tu navegador en:
echo http://localhost:3000/control-cambios/control-cambios.html
echo.
pause
