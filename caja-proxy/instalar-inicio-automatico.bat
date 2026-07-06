@echo off
setlocal enableextensions
REM ====================================================================
REM  Ferremex - Instala el arranque AUTOMATICO del proxy en esta caja.
REM  Crea una tarea programada de Windows que lanza el proxy al iniciar
REM  sesion, en segundo plano (sin ventana). Ejecutar UNA vez por caja.
REM  Doble clic normal: se AUTO-ELEVA y AUTO-DESBLOQUEA.
REM ====================================================================

REM --- Auto-desbloqueo (quita la Marca de la Web de archivos copiados) ---
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse -File | Unblock-File" >nul 2>&1

REM --- Auto-elevacion a administrador ---
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" goto ELEVAR

set "CARPETA=%~dp0"
if "%CARPETA:~-1%"=="\" set "CARPETA=%CARPETA:~0,-1%"

echo Instalando arranque automatico del proxy Ferremex...
echo Carpeta: %CARPETA%
echo.

REM Verificar que caddy.exe existe.
if not exist "%CARPETA%\caddy.exe" goto NO_CADDY

REM Lanza caddy sin ventana visible via el VBScript auxiliar.
schtasks /Create /F /TN "Ferremex-Proxy-POS" /TR "wscript.exe \"%CARPETA%\iniciar-proxy-oculto.vbs\"" /SC ONLOGON /RL HIGHEST
if not "%ERRORLEVEL%"=="0" goto TAREA_ERROR

echo.
echo [OK] Tarea creada. El proxy arrancara solo al iniciar sesion.
echo Iniciando el proxy ahora tambien...
wscript.exe "%CARPETA%\iniciar-proxy-oculto.vbs"
echo.
echo Listo. Abre Chrome en:  http://localhost:8080/pos/
echo.
pause
exit /b 0

:NO_CADDY
echo [ERROR] No se encontro caddy.exe en esta carpeta.
echo Asegurate de copiar la carpeta COMPLETA (incluye caddy.exe y Caddyfile).
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
