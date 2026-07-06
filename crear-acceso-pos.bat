@echo off
REM ====================================================================
REM  Ferremex - Crea el acceso directo "Ferremex POS" en el Escritorio.
REM  Solo doble clic. Detecta si es caja (8080) o matriz (9000).
REM  No necesita permisos de administrador.
REM ====================================================================

REM --- Auto-desbloqueo: quita la "Marca de la Web" que Windows pone a los
REM     archivos copiados por USB/red (evita que el script se cierre solo). ---
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -File | Unblock-File" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0crear-acceso-pos.ps1"
