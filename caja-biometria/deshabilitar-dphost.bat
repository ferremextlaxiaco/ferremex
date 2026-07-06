@echo off
setlocal enableextensions
REM ====================================================================
REM  Ferremex - Libera el lector de huella para el POS.
REM
REM  El Runtime de DigitalPersona instala el servicio "DpHost"
REM  (HID Authentication Device Service), que arranca solo al iniciar
REM  Windows y SE APODERA del lector U.are.U 4500 en acceso EXCLUSIVO.
REM  Como el lector solo admite UN programa a la vez, el POS se queda
REM  sin lector ("no se detecta el lector, revise la conexion").
REM
REM  Como en las cajas NO se usa el login por huella de Windows
REM  (Windows Hello), ese servicio solo estorba: lo deshabilitamos para
REM  que el lector quede SIEMPRE libre para el POS, incluso tras reiniciar.
REM
REM  Es REVERSIBLE. Para volver a activarlo (si algun dia se quisiera
REM  login por huella de Windows), correr como admin:
REM      sc config DpHost start= auto  &&  net start DpHost
REM
REM  Doble clic normal: se AUTO-ELEVA a administrador.
REM ====================================================================

REM --- Auto-desbloqueo (quita la Marca de la Web de archivos copiados) ---
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse -File | Unblock-File" >nul 2>&1

REM --- Auto-elevacion a administrador ---
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" goto ELEVAR

echo Liberando el lector de huella para el POS...
echo.

REM --- Existe el servicio DpHost? (solo esta si el runtime ya se instalo) ---
sc query DpHost >nul 2>&1
if not "%ERRORLEVEL%"=="0" goto SIN_DPHOST

echo Deteniendo el servicio DpHost...
net stop DpHost >nul 2>&1

echo Deshabilitando el arranque automatico de DpHost...
sc config DpHost start= disabled >nul 2>&1
if "%ERRORLEVEL%"=="0" echo   [OK] DpHost deshabilitado.
if not "%ERRORLEVEL%"=="0" echo   [ERROR] No se pudo deshabilitar DpHost. Corre esto como administrador.

REM --- Cerrar procesos residuales que pudieran tener el lector tomado ---
echo Cerrando procesos residuales de DigitalPersona (si los hay)...
taskkill /F /IM DPAgent.exe  >nul 2>&1
taskkill /F /IM DpHostW.exe  >nul 2>&1

echo.
echo [LISTO] El lector queda libre para el POS.
echo Verifica en el navegador:  http://127.0.0.1:52700/health
echo Debe responder con  "lector":{"conectado":true, ...}
echo.
pause
exit /b 0

:SIN_DPHOST
echo [AVISO] El servicio DpHost no existe todavia.
echo Instala primero el Runtime de DigitalPersona
echo (instalar-runtime-digitalpersona.bat) y vuelve a correr este archivo.
echo.
pause
exit /b 0

:ELEVAR
echo Solicitando permisos de administrador...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b
