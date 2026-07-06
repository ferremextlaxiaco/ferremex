@echo off
REM ============================================================================
REM Ferremex - Compila FerremexBiometriaService.exe con el csc del .NET Framework
REM (no requiere instalar el .NET SDK). Target x64 porque dpfj.dll/dpfpdd.dll son x64.
REM ============================================================================
setlocal

set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo [ERROR] No se encontro csc.exe en %CSC%
  echo Verifica que el .NET Framework 4.x este instalado.
  exit /b 1
)

set OUT=%~dp0FerremexBiometriaService.exe

echo Compilando FerremexBiometriaService.exe (x64)...
"%CSC%" /nologo /platform:x64 /target:exe /out:"%OUT%" ^
  "%~dp0src\Program.cs" ^
  "%~dp0src\Server.cs" ^
  "%~dp0src\Dpfj.cs" ^
  "%~dp0src\Json.cs" ^
  "%~dp0src\Config.cs" ^
  "%~dp0src\Log.cs"

if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] La compilacion fallo.
  exit /b 1
)

echo.
echo [OK] Compilado: %OUT%
endlocal
