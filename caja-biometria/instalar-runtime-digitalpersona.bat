@echo off
REM ====================================================================
REM  Ferremex - Instala el DigitalPersona Biometric SDK Runtime 3.5.
REM  Este runtime deja las DLLs dpfj.dll / dpfpdd.dll en el sistema, que
REM  el servicio de huella necesita para hablar con el lector U.are.U 4500.
REM  Ejecutar UNA vez por caja, ANTES de instalar-inicio-automatico.bat.
REM  Clic derecho -> "Ejecutar como administrador".
REM
REM  NOTA: El instalador (setup.exe) esta firmado por HID GLOBAL. Puede
REM  tardar 1-2 minutos y quiza pida REINICIAR al final: hazlo si lo pide.
REM ====================================================================

setlocal
set "CARPETA=%~dp0runtime-digitalpersona"

echo Instalando DigitalPersona Runtime 3.5...
echo.

if not exist "%CARPETA%\setup.exe" (
  echo [ERROR] No se encontro el instalador en:
  echo   %CARPETA%\setup.exe
  echo Asegurate de copiar la carpeta COMPLETA (incluye runtime-digitalpersona\).
  pause
  exit /b 1
)

echo Ejecutando el instalador (silencioso). Espera, puede tardar 1-2 min...
REM /s = silent, /v"/qn ..." = pasa flags al MSI: instalacion sin UI + log.
"%CARPETA%\setup.exe" /s /v"/qn /l*v %TEMP%\ferremex_dp_runtime.log"

if %ERRORLEVEL%==0 (
  echo.
  echo [OK] Runtime instalado.
) else (
  echo.
  echo [AVISO] El instalador devolvio codigo %ERRORLEVEL%.
  echo Si pidio reiniciar, reinicia la caja. Revisa el log en:
  echo   %TEMP%\ferremex_dp_runtime.log
)

echo.
echo Siguiente paso: instala tambien el DRIVER del lector 4500 (si aun no
echo aparece "U.are.U Fingerprint Reader" en el Administrador de dispositivos)
echo y luego corre instalar-inicio-automatico.bat.
echo.
pause
