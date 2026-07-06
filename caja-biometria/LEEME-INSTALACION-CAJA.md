# Ferremex — Instalar el lector de huella en una caja

Este paquete instala el **servicio de huella** en una caja para que el POS pueda
**registrar y verificar huellas** con el lector **DigitalPersona U.are.U 4500**.

El servicio corre en `http://127.0.0.1:52700` (solo local — la huella nunca sale
de la caja). Es la 3ª pieza local por caja, junto al **proxy Caddy** (`localhost:8080`).

---

## Qué contiene este paquete

| Archivo | Para qué |
|---|---|
| `FerremexBiometriaService.exe` | El servicio de huella (no se instala, se arranca) |
| `appsettings.json` | Configuración (puerto, umbrales, nº de capturas) |
| `runtime-digitalpersona/` | Instalador del DigitalPersona Runtime 3.5 (DLLs del lector) |
| `instalar-runtime-digitalpersona.bat` | Instala el runtime (paso 1) + libera el lector para el POS |
| `deshabilitar-dphost.bat` | Libera el lector para el POS (por si hace falta correrlo aparte) |
| `instalar-inicio-automatico.bat` | Instala el arranque automático del servicio (paso 3) |
| `iniciar-servicio.bat` | Arranque manual con ventana (para probar/diagnosticar) |
| `iniciar-servicio-oculto.vbs` | Arranque sin ventana (lo usa la tarea programada) |
| `AVISO-COPYRIGHT-DIGITALPERSONA.txt` | Aviso legal de las DLLs de DigitalPersona |

---

## Instalación en una caja (una sola vez)

### Paso 0 — Copiar la carpeta a la caja
Copia **toda esta carpeta** a la caja, por ejemplo a `C:\ferremex-biometria\`.
Debe quedar completa (incluida la subcarpeta `runtime-digitalpersona\`).

### Paso 1 — Instalar el Runtime de DigitalPersona
1. Clic **derecho** sobre **`instalar-runtime-digitalpersona.bat`** → **"Ejecutar como administrador"**.
2. Espera 1-2 minutos. Si al final pide **reiniciar**, reinicia la caja.

Esto deja en el sistema las DLLs (`dpfj.dll`, `dpfpdd.dll`) que el servicio necesita.

> **Importante — el lector queda libre para el POS.** El runtime instala el
> servicio de Windows **`DpHost`** ("HID Authentication Device Service"), que
> arranca solo y **se apodera del lector** en acceso exclusivo (el lector solo
> admite un programa a la vez). Como aquí **no** se usa el login por huella de
> Windows, este `.bat` **deshabilita `DpHost` automáticamente** para que el lector
> quede siempre disponible para el POS. Si por alguna razón hiciera falta hacerlo
> a mano después, corre **`deshabilitar-dphost.bat`** como administrador.
> *(Reversible: para reactivar el login por huella de Windows, en una consola de
> admin: `sc config DpHost start= auto` y `net start DpHost`.)*

### Paso 2 — Instalar el driver del lector 4500
1. **Conecta el lector** U.are.U 4500 por USB.
2. Abre el **Administrador de dispositivos** (clic derecho en Inicio → Administrador de dispositivos).
3. Busca el lector:
   - Si aparece como **"U.are.U® Fingerprint Reader"** con estado normal → **ya está**, salta al paso 3.
   - Si aparece con un **triángulo amarillo** (sin driver): clic derecho → **Actualizar controlador** → **Buscar automáticamente**. Si Windows no lo encuentra, el runtime del paso 1 normalmente ya lo trae; reinicia y vuelve a revisar.

### Paso 3 — Instalar el arranque automático del servicio
1. Clic **derecho** sobre **`instalar-inicio-automatico.bat`** → **"Ejecutar como administrador"**.
2. Verás "[OK] Tarea creada" y el servicio arrancará solo.

Desde ahora, el servicio arranca solo cada vez que se enciende la caja.

### Paso 4 — Verificar
En la caja, abre un navegador y ve a:
```
http://127.0.0.1:52700/health
```
Debe responder algo como:
```json
{"ok":true, ..., "lector":{"conectado":true,"nombre":"$00$05ba...","modelo":"U.are.U 4500"}}
```
Si `"conectado":true` → **todo listo**. El POS ya puede registrar/verificar huellas.

---

## Prerequisitos del sistema

- **Windows 10/11** con **.NET Framework 4.x** (viene con Windows).
- **DigitalPersona Runtime 3.5** (lo instala el paso 1).
- **Driver del lector 4500** (paso 2).
- **Lector U.are.U 4500** conectado por USB.
- El **proxy Caddy** ya instalado en la caja (para que el POS abra en `localhost:8080`).

---

## Verificar / diagnosticar

- El servicio está corriendo si `http://127.0.0.1:52700/health` responde.
- Para verlo con logs a mano: doble clic en **`iniciar-servicio.bat`** (abre una
  ventana; ciérrala cuando termines). Los logs quedan en `biometria.log`.

---

## Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| **Un `.bat` parpadea y se cierra solo** (ventana vacía, sin texto) | Windows le puso la **"Marca de la Web"** al copiarlo por USB/red y lo bloquea. Los `.bat` ya se **auto-desbloquean**, pero si aún pasa: clic derecho en el `.bat` → **Propiedades** → marca **"Desbloquear"** → Aceptar. O corre en PowerShell admin: `Get-ChildItem -Recurse \| Unblock-File` dentro de la carpeta. |
| El runtime no instala desde el `.bat` | Corre el MSI directo en PowerShell admin: `msiexec /i "...\runtime-digitalpersona\setup.msi" /qn /norestart /l*v "$env:TEMP\dp.log"`. Revisa el log si falla. |
| `/health` no responde | El servicio no está corriendo. Corre `iniciar-servicio.bat`, o reinicia la caja (arranca solo). |
| `lector.conectado: false` | Lector desconectado, driver faltante (paso 2), Runtime no instalado (paso 1), **o el servicio `DpHost` tomó el lector** → corre **`deshabilitar-dphost.bat`** como administrador y reinicia el servicio. |
| "No se detecta el lector" en el POS (pero USB y driver OK) | El servicio `DpHost` de DigitalPersona se apoderó del lector. Corre **`deshabilitar-dphost.bat`** como administrador. Causa raíz conocida — ver Paso 1. |
| "Lector ocupado" al capturar | Otro programa tiene el lector (Windows Hello / DpHost / otra app). Cierra esas apps o corre `deshabilitar-dphost.bat`. |
| El registro falla siempre | Revisa que el dedo esté bien puesto y el lector limpio. Reintenta. |
| "Access denied" al arrancar el servicio | Corre `iniciar-servicio.bat` una vez como administrador, o reserva la URL: `netsh http add urlacl url=http://127.0.0.1:52700/ user=Todos` |

---

## Datos de esta instalación
- **Servicio de huella:** `http://127.0.0.1:52700` (solo local en cada caja)
- **Lector:** DigitalPersona U.are.U 4500 (USB)
- La huella se captura y compara **localmente**; solo la plantilla (no la imagen)
  se guarda en la base de datos central.

Ver también `AVISO-COPYRIGHT-DIGITALPERSONA.txt` (licencia de las DLLs).
