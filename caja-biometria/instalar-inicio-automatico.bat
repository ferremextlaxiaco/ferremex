@echo off
setlocal enableextensions
REM ====================================================================
REM  Ferremex - Instala el arranque AUTOMATICO del servicio de huella.
REM  Crea una tarea programada de Windows que lanza el servicio al
REM  iniciar sesion, en segundo plano (sin ventana). Ejecutar UNA vez
REM  por caja. Doble clic normal: se AUTO-ELEVA y AUTO-DESBLOQUEA.
REM
REM  REQUISITOS PREVIOS (ver LEEME-INSTALACION-CAJA.md):
REM    1. DigitalPersona Runtime 3.5 instalado (instalar-runtime-digitalpersona.bat)
REM    2. Driver del lector U.are.U 4500 instalado
REM    3. Lector conectado por USB
REM ====================================================================

REM --- Auto-desbloqueo (quita la Marca de la Web de archivos copiados) ---
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse -File | Unblock-File" >nul 2>&1

REM --- Auto-elevacion a administrador ---
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" goto ELEVAR

set "CARPETA=%~dp0"
if "%CARPETA:~-1%"=="\" set "CARPETA=%CARPETA:~0,-1%"

echo Instalando arranque automatico del servicio de huella Ferremex...
echo Carpeta: %CARPETA%
echo.

REM Verificar que el .exe existe.
if not exist "%CARPETA%\FerremexBiometriaService.exe" goto NO_EXE

REM Lanza el servicio sin ventana visible via el VBScript auxiliar.
schtasks /Create /F /TN "Ferremex-Biometria-POS" /TR "wscript.exe \"%CARPETA%\iniciar-servicio-oculto.vbs\"" /SC ONLOGON /RL HIGHEST
if not "%ERRORLEVEL%"=="0" goto TAREA_ERROR

echo.
echo [OK] Tarea creada. El servicio arrancara solo al iniciar sesion.
echo Iniciando el servicio ahora tambien...
wscript.exe "%CARPETA%\iniciar-servicio-oculto.vbs"
echo.
echo Listo. Verifica en el navegador:  http://127.0.0.1:52700/health
echo Debe responder con  "lector":{"conectado":true, ...}
echo.
pause
exit /b 0

:NO_EXE
echo [ERROR] No se encontro FerremexBiometriaService.exe en esta carpeta.
echo Asegurate de copiar la carpeta COMPLETA a la caja.
echo.
pause
exit /b 1

:TAREA_ERROR
echo.
echo [ERROR] No se pudo crear la tarea. Ejecuta este .bat como Administrador.
echo.
pause
exit /b 1

:ELEVAR
echo Solicitando permisos de administrador...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b
