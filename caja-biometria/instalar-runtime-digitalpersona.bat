@echo off
setlocal enableextensions
REM ====================================================================
REM  Ferremex - Instala el DigitalPersona Biometric SDK Runtime 3.5.
REM  Este runtime deja las DLLs dpfj.dll / dpfpdd.dll en el sistema, que
REM  el servicio de huella necesita para hablar con el lector U.are.U 4500.
REM  Ejecutar UNA vez por caja, ANTES de instalar-inicio-automatico.bat.
REM
REM  Doble clic normal: el script se AUTO-ELEVA a administrador y se
REM  AUTO-DESBLOQUEA (quita la "Marca de la Web" de archivos copiados).
REM
REM  NOTA: El instalador esta firmado por HID GLOBAL. Puede tardar 1-2 min.
REM  Pide NO reiniciar; si Windows igual lo pide, reinicia la caja.
REM ====================================================================

REM --- Auto-desbloqueo: quitar la Marca de la Web de TODO el paquete ---
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse -File | Unblock-File" >nul 2>&1

REM --- Auto-elevacion a administrador ---
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" goto ELEVAR

set "CARPETA=%~dp0runtime-digitalpersona"

echo ====================================================
echo   Ferremex - Instalar DigitalPersona Runtime 3.5
echo ====================================================
echo.

REM --- Verificar que el instalador existe ---
if not exist "%CARPETA%\setup.msi" goto NO_MSI

echo Ejecutando el instalador. Espera, puede tardar 1-2 minutos...
echo (La ventana puede parecer congelada; es normal, esta instalando.)
echo.

REM MSI directo (mas fiable que el launcher InstallShield):
REM /qn = sin UI, /norestart = no reiniciar la caja de sorpresa, log en TEMP.
msiexec /i "%CARPETA%\setup.msi" /qn /norestart /l*v "%TEMP%\ferremex_dp_runtime.log"
set "RC=%ERRORLEVEL%"

if "%RC%"=="0" echo [OK] Runtime instalado.
if "%RC%"=="3010" echo [OK] Runtime instalado. Windows pide REINICIAR la caja mas tarde.
if not "%RC%"=="0" if not "%RC%"=="3010" echo [AVISO] El instalador devolvio codigo %RC%. Revisa el log: %TEMP%\ferremex_dp_runtime.log

goto LIBERAR_LECTOR

:NO_MSI
echo [ERROR] No se encontro el instalador en:
echo   %CARPETA%\setup.msi
echo Asegurate de copiar la carpeta COMPLETA (incluye runtime-digitalpersona\).
echo.
pause
exit /b 1

:LIBERAR_LECTOR
REM --- Liberar el lector para el POS -----------------------------------
REM El runtime instala el servicio DpHost, que arranca solo y se apodera
REM del lector en acceso exclusivo. Como no usamos login por huella de
REM Windows, lo deshabilitamos para que el lector quede libre para el POS.
echo.
echo Liberando el lector para el POS (deshabilitando el servicio DpHost)...
sc query DpHost >nul 2>&1
if not "%ERRORLEVEL%"=="0" goto SIN_DPHOST
net stop DpHost >nul 2>&1
sc config DpHost start= disabled >nul 2>&1
taskkill /F /IM DPAgent.exe >nul 2>&1
taskkill /F /IM DpHostW.exe >nul 2>&1
echo   [OK] Servicio DpHost deshabilitado. El lector queda libre para el POS.
goto FIN

:SIN_DPHOST
echo   [AVISO] El servicio DpHost aun no aparece. Si tras REINICIAR el POS
echo   dice "no se detecta el lector", corre deshabilitar-dphost.bat como admin.

:FIN
echo.
echo Siguiente paso: instala tambien el DRIVER del lector 4500 (si aun no
echo aparece "U.are.U Fingerprint Reader" en el Administrador de dispositivos)
echo y luego corre instalar-inicio-automatico.bat.
echo.
pause
exit /b 0

:ELEVAR
echo Solicitando permisos de administrador...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b
