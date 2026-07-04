# Descargar caddy.exe

El binario `caddy.exe` (~53 MB) **no se versiona en git** (es un artefacto pesado).
Descárgalo y colócalo en esta misma carpeta (`caja-proxy/`) antes de usar el proxy.

## Cómo obtenerlo

**Opción 1 — Descarga directa (Windows 64-bit):**
```
https://caddyserver.com/api/download?os=windows&arch=amd64
```
Guarda el archivo resultante como `caddy.exe` en esta carpeta.

Desde PowerShell:
```powershell
curl.exe -L -o caddy.exe "https://caddyserver.com/api/download?os=windows&arch=amd64"
```

**Opción 2 — Página oficial:**
https://caddyserver.com/download → selecciona Windows / amd64 → Download.

## Verificar
```powershell
.\caddy.exe version
```
Debe imprimir algo como `v2.x.x`. Versión probada: **v2.11.4**.

Una vez descargado, sigue `LEEME-INSTALACION-CAJA.md`.
