@echo off
REM ====================================================================
REM  Ferremex - Instala el DigitalPersona Biometric SDK Runtime 3.5.
REM  Este runtime deja las DLLs dpfj.dll / dpfpdd.dll en el sistema, que
REM  el servicio de huella necesita para hablar con el lector U.are.U 4500.
REM  Ejecutar UNA vez por caja, ANTES de instalar-inicio-automatico.bat.
REM
REM  Doble clic normal: el script se AUTO-ELEVA a administrador y se
REM  AUTO-DESBLOQUEA (quita la "Marca de la Web" que Windows pone a los
REM  archivos copiados por USB/red y que hace que el .bat se cierre solo).
REM
REM  NOTA: El instalador (setup.exe) esta firmado por HID GLOBAL. Puede
REM  tardar 1-2 minutos. Este script pide NO reiniciar; si al final Windows
REM  igual lo pide, reinicia la caja.
REM ====================================================================

REM --- Auto-desbloqueo: quitar la Marca de la Web de TODO el paquete ---
REM (Sin esto, un .bat copiado por USB/red puede cerrarse al instante.)
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse -File | Unblock-File" >nul 2>&1

REM --- Auto-elevacion a administrador ---
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Solicitando permisos de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

setlocal
set "CARPETA=%~dp0runtime-digitalpersona"

echo ====================================================
echo   Ferremex - Instalar DigitalPersona Runtime 3.5
echo ====================================================
echo.

REM --- Verificar que el instalador existe ---
if not exist "%CARPETA%\setup.exe" (
  echo [ERROR] No se encontro el instalador en:
  echo   %CARPETA%\setup.exe
  echo Asegurate de copiar la carpeta COMPLETA (incluye runtime-digitalpersona\).
  echo.
  pause
  exit /b 1
)

echo Ejecutando el instalador. Espera, puede tardar 1-2 minutos...
echo (La ventana puede parecer congelada; es normal, esta instalando.)
echo.

REM Preferimos el MSI directo (mas fiable que el InstallShield launcher):
REM /qn = sin UI, /norestart = no reiniciar la caja de sorpresa, log en %TEMP%.
if exist "%CARPETA%\setup.msi" (
  msiexec /i "%CARPETA%\setup.msi" /qn /norestart /l*v "%TEMP%\ferremex_dp_runtime.log"
) else (
  "%CARPETA%\setup.exe" /s /v"/qn REBOOT=ReallySuppress /l*v %TEMP%\ferremex_dp_runtime.log"
)
set "RC=%ERRORLEVEL%"

REM MSI: 0 = OK, 3010 = OK pero requiere reinicio.
if "%RC%"=="0" (
  echo.
  echo [OK] Runtime instalado.
) else if "%RC%"=="3010" (
  echo.
  echo [OK] Runtime instalado. Windows pide REINICIAR la caja mas tarde.
) else (
  echo.
  echo [AVISO] El instalador devolvio codigo %RC%.
  echo Revisa el log en:  %TEMP%\ferremex_dp_runtime.log
)

REM --- Liberar el lector para el POS -----------------------------------
REM El runtime instala el servicio DpHost, que arranca solo y se apodera
REM del lector en acceso exclusivo (el POS se quedaria sin lector). Como
REM no usamos login por huella de Windows, lo deshabilitamos aqui mismo.
echo.
echo Liberando el lector para el POS (deshabilitando el servicio DpHost)...
sc query DpHost >nul 2>&1
if "%ERRORLEVEL%"=="0" (
  net stop DpHost >nul 2>&1
  sc config DpHost start= disabled >nul 2>&1
  taskkill /F /IM DPAgent.exe >nul 2>&1
  taskkill /F /IM DpHostW.exe >nul 2>&1
  echo   [OK] Servicio DpHost deshabilitado. El lector queda libre para el POS.
) else (
  echo   [AVISO] El servicio DpHost aun no aparece. Si tras REINICIAR el POS
  echo   dice "no se detecta el lector", corre deshabilitar-dphost.bat como admin.
)

echo.
echo Siguiente paso: instala tambien el DRIVER del lector 4500 (si aun no
echo aparece "U.are.U Fingerprint Reader" en el Administrador de dispositivos)
echo y luego corre instalar-inicio-automatico.bat.
echo.
pause
