@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  copy ".env.example" ".env" >nul
)

echo.
echo Se abrira el archivo correcto para configurar QuickBite.
echo.
echo En la ventana que se abre, completa solo estas dos lineas:
echo VITE_SUPABASE_URL=
echo VITE_SUPABASE_ANON_KEY=
echo.
echo Los valores estan en Supabase: Project Settings - API.
echo No uses la service_role key.
echo.
start "" notepad.exe ".env"
pause
