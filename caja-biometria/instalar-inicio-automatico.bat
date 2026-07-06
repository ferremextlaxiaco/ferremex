@echo off
REM ====================================================================
REM  Ferremex - Instala el arranque AUTOMATICO del servicio de huella.
REM  Crea una tarea programada de Windows que lanza el servicio al
REM  iniciar sesion, en segundo plano (sin ventana). Ejecutar UNA vez
REM  por caja. Clic derecho -> "Ejecutar como administrador".
REM
REM  REQUISITOS PREVIOS (ver LEEME-INSTALACION-CAJA.md):
REM    1. DigitalPersona Runtime 3.5 instalado (instalar-runtime-digitalpersona.bat)
REM    2. Driver del lector U.are.U 4500 instalado
REM    3. Lector conectado por USB
REM ====================================================================

setlocal
set "CARPETA=%~dp0"
if "%CARPETA:~-1%"=="\" set "CARPETA=%CARPETA:~0,-1%"

echo Instalando arranque automatico del servicio de huella Ferremex...
echo Carpeta: %CARPETA%
echo.

REM Verificar que el .exe existe.
if not exist "%CARPETA%\FerremexBiometriaService.exe" (
  echo [ERROR] No se encontro FerremexBiometriaService.exe en esta carpeta.
  echo Asegurate de copiar la carpeta COMPLETA a la caja.
  pause
  exit /b 1
)

REM Lanza el servicio sin ventana visible via el VBScript auxiliar.
schtasks /Create /F /TN "Ferremex-Biometria-POS" ^
  /TR "wscript.exe \"%CARPETA%\iniciar-servicio-oculto.vbs\"" ^
  /SC ONLOGON /RL HIGHEST

if %ERRORLEVEL%==0 (
  echo.
  echo [OK] Tarea creada. El servicio arrancara solo al iniciar sesion.
  echo Iniciando el servicio ahora tambien...
  wscript.exe "%CARPETA%\iniciar-servicio-oculto.vbs"
  echo.
  echo Listo. Verifica en el navegador:  http://127.0.0.1:52700/health
  echo Debe responder con  "lector":{"conectado":true, ...}
) else (
  echo.
  echo [ERROR] No se pudo crear la tarea. Ejecuta este .bat como Administrador.
)

echo.
pause
