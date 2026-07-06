@echo off
REM ====================================================================
REM  Ferremex - Crea el acceso directo "Ferremex POS" en el Escritorio.
REM  Solo doble clic. Detecta si es caja (8080) o matriz (9000).
REM  No necesita permisos de administrador.
REM ====================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0crear-acceso-pos.ps1"
