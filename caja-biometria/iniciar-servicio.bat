@echo off
REM Arranca el servicio de huella con ventana visible (para probar/diagnosticar).
REM Para produccion usa instalar-inicio-automatico.bat (arranque oculto al login).
cd /d "%~dp0"
echo Iniciando FerremexBiometriaService... (Ctrl+C para detener)
echo Prueba: http://127.0.0.1:52700/health
echo.
FerremexBiometriaService.exe
pause
