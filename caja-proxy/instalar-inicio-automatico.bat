@echo off
REM ====================================================================
REM  Ferremex - Instala el arranque AUTOMATICO del proxy en esta caja.
REM  Crea una tarea programada de Windows que lanza el proxy al iniciar
REM  sesion, en segundo plano (sin ventana). Ejecutar UNA vez por caja.
REM  Clic derecho -> "Ejecutar como administrador".
REM ====================================================================

setlocal
set "CARPETA=%~dp0"
REM Quitar la barra final de la ruta
if "%CARPETA:~-1%"=="\" set "CARPETA=%CARPETA:~0,-1%"

echo Instalando arranque automatico del proxy Ferremex...
echo Carpeta: %CARPETA%
echo.

REM Lanza caddy sin ventana visible via un VBScript auxiliar (ver
REM iniciar-proxy-oculto.vbs en esta misma carpeta).
schtasks /Create /F /TN "Ferremex-Proxy-POS" ^
  /TR "wscript.exe \"%CARPETA%\iniciar-proxy-oculto.vbs\"" ^
  /SC ONLOGON /RL HIGHEST

if %ERRORLEVEL%==0 (
  echo.
  echo [OK] Tarea creada. El proxy arrancara solo al iniciar sesion.
  echo Iniciando el proxy ahora tambien...
  wscript.exe "%CARPETA%\iniciar-proxy-oculto.vbs"
  echo.
  echo Listo. Abre Chrome en:  http://localhost:8080/pos/
) else (
  echo.
  echo [ERROR] No se pudo crear la tarea. Ejecuta este .bat como Administrador.
)

echo.
pause
