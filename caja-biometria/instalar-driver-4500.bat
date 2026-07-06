@echo off
setlocal enableextensions
REM ====================================================================
REM  Ferremex - Instala el driver CORRECTO del lector U.are.U 4500
REM  (HID Global, clase "Authentication Devices", v4.1.1.221) y fuerza
REM  al lector a usarlo en vez del driver WBF de Crossmatch.
REM
REM  CUANDO USARLO: si el POS dice "no se detecta el lector" y al revisar
REM  el lector aparece como clase "Biometric (WBF)" en vez de
REM  "Authentication Devices". Pasa en cajas que traian software viejo de
REM  DigitalPersona/Crossmatch preinstalado (el WBF le gana al nativo).
REM  El servicio necesita el driver nativo (usbdpfp), no el WBF.
REM
REM  Doble clic normal: se AUTO-ELEVA y AUTO-DESBLOQUEA.
REM ====================================================================

REM --- Auto-desbloqueo (quita la Marca de la Web de archivos copiados) ---
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse -File | Unblock-File" >nul 2>&1

REM --- Auto-elevacion a administrador ---
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" goto ELEVAR

set "INF=%~dp0driver-4500\dpersona_x64.inf"

echo ====================================================
echo   Ferremex - Instalar driver correcto del 4500
echo ====================================================
echo.

if not exist "%INF%" goto NO_INF

echo Instalando el driver HID Global (Authentication Devices)...
pnputil /add-driver "%INF%" /install
echo.

echo Forzando al lector a re-detectar con el driver correcto...
REM Quitar el dispositivo (suelta el driver WBF) y re-escanear.
powershell -NoProfile -Command "$d = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_05BA' }; if ($d) { pnputil /remove-device $d.InstanceId }" >nul 2>&1
timeout /t 2 /nobreak >nul
pnputil /scan-devices >nul 2>&1
timeout /t 3 /nobreak >nul

echo.
echo --- Estado del lector ahora ---
powershell -NoProfile -Command "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_05BA' } | Select-Object Status, Class, FriendlyName | Format-Table -AutoSize"

echo.
echo Si la clase dice 'Authentication Devices' -^> correcto.
echo Si sigue diciendo 'Biometric (WBF)' -^> reinicia la caja y vuelve a revisar.
echo.
echo Luego reinicia el servicio de huella (instalar-inicio-automatico.bat ya
echo lo hace) y verifica en:  http://127.0.0.1:52700/health
echo.
pause
exit /b 0

:NO_INF
echo [ERROR] No se encontro el driver en:
echo   %INF%
echo Asegurate de copiar la carpeta COMPLETA (incluye driver-4500\).
echo.
pause
exit /b 1

:ELEVAR
echo Solicitando permisos de administrador...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b
