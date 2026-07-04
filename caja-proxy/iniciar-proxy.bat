@echo off
REM ====================================================================
REM  Ferremex - Proxy local del POS (una caja)
REM  Arranca Caddy escuchando en http://localhost:8080 y reenviando al
REM  servidor central. Coloca este .bat + caddy.exe + Caddyfile en la
REM  misma carpeta (ej. C:\ferremex-caja\).
REM ====================================================================

REM Ir a la carpeta de este script (donde estan caddy.exe y Caddyfile)
cd /d "%~dp0"

REM Arrancar Caddy con la config del Caddyfile de esta carpeta.
REM Caddy se queda corriendo; esta ventana puede minimizarse.
caddy.exe run --config Caddyfile --adapter caddyfile
