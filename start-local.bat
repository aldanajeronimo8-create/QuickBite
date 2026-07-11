@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  copy ".env.example" ".env" >nul
)

if not exist "node_modules" (
  call npm.cmd install --registry=https://registry.npmjs.org --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo No se pudieron instalar las dependencias.
    echo Revisa tu conexion a internet y vuelve a ejecutar este archivo.
    pause
    exit /b 1
  )
)

echo.
echo QuickBite local:
echo http://localhost:5173
echo.
echo Deja esta ventana abierta. Vite es un servidor y el comando no vuelve al prompt mientras la app esta corriendo.
echo.
call npm.cmd run dev:local
pause
