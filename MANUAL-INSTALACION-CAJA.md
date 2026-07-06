# Manual de instalación de una caja Ferremex (POS)

**Propósito:** dejar una caja nueva 100% funcional y conectada a la Matriz, con
todos sus componentes arrancando **solos** al iniciar sesión en Windows. Sirve
como respaldo y como guía para instalar cajas adicionales en el futuro.

> **Última actualización:** 2026-07-06
> **Servidor central (Matriz):** `192.168.1.50:9000` (IP fija por reserva DHCP en el router).
> Si la IP del servidor cambia, hay que actualizar el `Caddyfile` de cada caja (ver Componente 1).

---

## 1. Panorama — cómo funciona una caja

La caja **no tiene su propia copia del POS**. Corre un navegador (Chrome) que,
a través de un **proxy local (Caddy)**, se conecta al POS que sirve la **Matriz**.
La huella se procesa con un **servicio local** en la propia caja (la huella nunca
sale de la caja por la red).

```
   CAJA (Windows)                                     MATRIZ (servidor)
   ┌───────────────────────────────────┐              ┌────────────────────┐
   │  Chrome (acceso directo "Ferremex  │   red LAN    │  POS + API Medusa  │
   │  POS", modo app)                   │◄────────────►│  192.168.1.50:9000 │
   │        │ abre                      │  reverse     │  (PostgreSQL,      │
   │        ▼                           │  proxy       │   Redis, datos)    │
   │  http://localhost:8080/pos/        │              └────────────────────┘
   │        │                           │
   │        ▼                           │
   │  Proxy Caddy (localhost:8080) ─────┼──► reenvía TODO a 192.168.1.50:9000
   │                                    │
   │  Servicio de huella                │   (100% local, no sale de la caja)
   │  (localhost:52700) ── lector USB   │
   │        │                           │
   │        ▼                           │
   │  Lector DigitalPersona U.are.U 4500│
   └───────────────────────────────────┘
```

**Por qué el proxy `localhost:8080`:** Chrome solo habilita **Web Serial** (cajón de
dinero + impresora térmica ESC/POS) en un "contexto seguro". `localhost` cuenta como
seguro; una IP directa (`192.168.1.50`) NO. Por eso todo pasa por el proxy local.

---

## 2. Requisitos previos de la caja

- **Windows 10 u 11** (64-bit) con **.NET Framework 4.x** (viene con Windows).
- **Google Chrome** instalado (obligatorio — el cajón y la impresora usan Web Serial, solo Chrome/Chromium).
- **Red LAN** con acceso al servidor `192.168.1.50` (misma red que la Matriz).
- **Lector de huella DigitalPersona U.are.U 4500** (USB) — si la caja va a usar huella.
- **Impresora térmica ESC/POS** + **cajón de dinero** (conectados) — opcional según la caja.

---

## 3. Los tres componentes a instalar (resumen)

| # | Componente | Carpeta origen (Matriz) | Puerto | Tarea automática |
|---|---|---|---|---|
| 1 | **Proxy Caddy** | `caja-proxy\` | `localhost:8080` | `Ferremex-Proxy-POS` |
| 2 | **Servicio de huella** | `caja-biometria\` | `localhost:52700` | `Ferremex-Biometria-POS` |
| 3 | **Acceso directo del POS** | `Acceso-POS-para-cajas\` | — (ícono) | — (no es servicio) |

**Convención de carpeta destino:** todo se copia a `C:\ferremex-cajaN\` en la caja
(donde `N` = número de caja: `C:\ferremex-caja1\`, `C:\ferremex-caja2\`, …).

---

## ⚠️ IMPORTANTE — archivos pesados que NO están en GitHub

Estos binarios **no se versionan en git** (son demasiado pesados). Hay que copiarlos
por USB desde la Matriz. Si clonas el repo en una máquina nueva, **no vendrán** y hay
que conseguirlos:

| Archivo | Tamaño | De dónde sacarlo |
|---|---|---|
| `caja-proxy\caddy.exe` | ~53 MB | Descargar: https://caddyserver.com/api/download?os=windows&arch=amd64 (ver `caja-proxy\DESCARGAR-CADDY.md`) |
| `caja-biometria\FerremexBiometriaService.exe` | ~26 KB | Compilar con `caja-biometria\compilar.bat` en la Matriz, o copiar el ya compilado |
| `caja-biometria\runtime-digitalpersona\` | ~98 MB | Instalador del DigitalPersona Runtime 3.5 (copiar la carpeta completa desde la Matriz) |

> Lo demás (`.bat`, `.ps1`, `.vbs`, `Caddyfile`, `appsettings.json`, íconos) **sí** está en git.

---

## 4. Nota sobre los `.bat` copiados por USB (Marca de la Web)

Windows marca los archivos copiados de otra PC/USB con la **"Marca de la Web"**, y eso
puede hacer que un `.bat` **se cierre solo al instante** (ventana vacía, sin texto).

Todos los `.bat` de estos paquetes **ya se auto-desbloquean** al arrancar. Pero si aún
así alguno se cierra solo:

- Clic derecho en el `.bat` → **Propiedades** → marca **"Desbloquear"** → Aceptar. **O**
- Corre en PowerShell (admin), dentro de la carpeta: `Get-ChildItem -Recurse | Unblock-File`

Todos los `.bat` también **se auto-elevan** a administrador (piden el permiso solos).

---

# COMPONENTE 1 — Proxy Caddy (conexión a la Matriz)

Hace que el POS abra en `http://localhost:8080/pos/` reenviando a `192.168.1.50:9000`.

### Archivos (carpeta `caja-proxy\`)
- `caddy.exe` — el proxy (⚠️ no está en git, ver arriba)
- `Caddyfile` — configuración (a qué servidor reenvía)
- `iniciar-proxy-oculto.vbs` — lanza el proxy sin ventana
- `iniciar-proxy.bat` — arranque manual con ventana (para diagnóstico)
- `instalar-inicio-automatico.bat` — crea la tarea de arranque automático

### Instalación
1. Copia la carpeta `caja-proxy\` a `C:\ferremex-cajaN\` (que su contenido quede en la raíz de esa carpeta, junto a los demás componentes).
2. **Verifica el `Caddyfile`:** debe apuntar a `192.168.1.50:9000`. Si el servidor tiene otra IP, edítala ahí.
3. **Doble clic** en `instalar-inicio-automatico.bat` (se auto-eleva). Crea la tarea `Ferremex-Proxy-POS` y arranca el proxy.
4. **Verifica** en Chrome: `http://localhost:8080/pos/` debe cargar el POS.

### Si `instalar-inicio-automatico.bat` falla, hazlo por comando (PowerShell admin):
```powershell
schtasks /Create /F /TN "Ferremex-Proxy-POS" /TR 'wscript.exe \"C:\ferremex-cajaN\iniciar-proxy-oculto.vbs\"' /SC ONLOGON /RL HIGHEST
wscript.exe "C:\ferremex-cajaN\iniciar-proxy-oculto.vbs"
```
(Ajusta `cajaN` al número de la caja.)

---

# COMPONENTE 2 — Servicio de huella (lector U.are.U 4500)

Corre en `http://127.0.0.1:52700` (solo local). El POS lo usa para registrar y
verificar huellas. Es OPCIONAL: si la caja no usa huella, sáltate este componente.

### Archivos (carpeta `caja-biometria\`)
- `FerremexBiometriaService.exe` — el servicio (⚠️ no está en git — compilar/copiar)
- `appsettings.json` — configuración (puerto, umbrales, nº de capturas)
- `runtime-digitalpersona\` — instalador del Runtime 3.5 (⚠️ no está en git, ~98 MB)
- `instalar-runtime-digitalpersona.bat` — instala el runtime + libera el lector (paso 1)
- `deshabilitar-dphost.bat` — libera el lector del servicio DpHost (por si hace falta aparte)
- `instalar-inicio-automatico.bat` — crea la tarea de arranque automático (paso 3)
- `iniciar-servicio.bat` — arranque manual con ventana (diagnóstico)
- `iniciar-servicio-oculto.vbs` — arranque sin ventana (lo usa la tarea)
- `AVISO-COPYRIGHT-DIGITALPERSONA.txt` — aviso legal de las DLLs

### Instalación (en este orden)

**Paso 1 — Runtime de DigitalPersona (las DLLs).**
Doble clic (admin) en `instalar-runtime-digitalpersona.bat`. Espera 1-2 min.
Esto instala `dpfj.dll`/`dpfpdd.dll` y **deshabilita automáticamente el servicio
`DpHost`** (ver nota abajo). Si al final pide reiniciar, reinicia.

> Si el `.bat` no corre, instala el runtime a mano (PowerShell admin):
> ```powershell
> msiexec /i "C:\ferremex-cajaN\runtime-digitalpersona\setup.msi" /qn /norestart /l*v "$env:TEMP\dp.log"
> ```

**Paso 2 — Driver del lector 4500 (manual).**
1. Conecta el lector por USB.
2. Abre el **Administrador de dispositivos**.
3. Busca el lector:
   - Si aparece como **"U.are.U® Fingerprint Reader"** (Status OK) → ya está, salta al Paso 3.
   - Si tiene **triángulo amarillo** → clic derecho → **Actualizar controlador** → **Buscar automáticamente**. El runtime del Paso 1 normalmente ya trae el driver; si no, reinicia y revisa de nuevo.

**Paso 3 — Arranque automático del servicio.**
Doble clic (admin) en `instalar-inicio-automatico.bat`. Crea la tarea
`Ferremex-Biometria-POS` y arranca el servicio.

> Si el `.bat` falla, por comando (PowerShell admin):
> ```powershell
> schtasks /Create /F /TN "Ferremex-Biometria-POS" /TR 'wscript.exe \"C:\ferremex-cajaN\iniciar-servicio-oculto.vbs\"' /SC ONLOGON /RL HIGHEST
> wscript.exe "C:\ferremex-cajaN\iniciar-servicio-oculto.vbs"
> ```

**Paso 4 — Verificar.**
En el navegador de la caja: `http://127.0.0.1:52700/health`
Debe responder `"lector":{"conectado":true, ... "modelo":"U.are.U 4500"}`.

### 🔑 Nota clave — runtime VIEJO que impide instalar el correcto (error 1603)
Algunas cajas traen preinstalado un runtime ANTIGUO de DigitalPersona:
**"DigitalPersona One Touch for Windows RTE 1.6.1"** (de 2010). Ese runtime **NO
trae `dpfpdd.dll`/`dpfj.dll`** (las DLLs que el servicio necesita) y además
**bloquea** la instalación del Runtime 3.5 correcto → `msiexec` falla con
**error 1603**. Síntoma: el driver está OK (Windows ve el lector) pero el servicio
loguea `No se puede cargar el archivo DLL 'dpfpdd.dll'` y `/health` da
`conectado:false`.
**Solución:** desinstalar primero el One Touch RTE 1.6.1 y luego instalar el 3.5.
```powershell
# 1) Desinstalar el runtime viejo
$viejo = Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*, HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "One Touch.*Windows RTE" }
if ($viejo) { Start-Process msiexec.exe -ArgumentList "/x",$viejo.PSChildName,"/qn","/norestart" -Wait }
# 2) Instalar el 3.5 correcto (ajusta la ruta de la caja)
msiexec /i "C:\ferremex-cajaN\caja-biometria\runtime-digitalpersona\setup.msi" /qn /norestart /l*v "$env:TEMP\dp.log"
# 3) Verificar que las DLLs quedaron
Get-ChildItem C:\Windows\System32\dpfpdd*.dll, C:\Windows\System32\dpfj*.dll
```
Comprobar antes con: `Get-ItemProperty HKLM:\SOFTWARE\...\Uninstall\* | ? DisplayName -match "DigitalPersona"`
— debe figurar **"DigitalPersona Biometric SDK Runtime 3.5"**, NO el "One Touch RTE 1.6.1".

### 🔑 Nota clave — lector "casado" con el driver WBF (Class Biometric)
Segundo problema en cajas con software viejo: el lector queda enganchado al
driver **WBF de Crossmatch** (`uruwbf.inf`, Class **`Biometric`**, "U.are.U
Fingerprint Reader **(WBF)**") en vez del driver nativo **HID Global** (Class
**`Authentication Devices`**, v4.1.1.221) que `dpfpdd.dll` necesita. Windows
Biometric Framework (Windows Hello) reclama el lector y no lo suelta.
Síntoma: DLLs OK, runtime 3.5 OK, pero el lector aparece como **`Biometric (WBF)`**
y `/health` da `conectado:false`. Ni reiniciar ni re-enumerar lo cambian.
**Cómo detectarlo:**
```powershell
Get-PnpDevice -PresentOnly | ? { $_.InstanceId -match "VID_05BA" } | Select Status, Class, FriendlyName
# Si Class = "Biometric" y dice "(WBF)" -> hay que forzar el driver nativo.
```
**Solución:** correr **`instalar-driver-4500.bat`** (admin) del paquete. Instala el
driver correcto (carpeta `driver-4500\`, HID Global / Authentication Devices) y
fuerza al lector a re-detectarlo. Si tras correrlo sigue en WBF, reinicia la caja.
Luego reinicia el servicio y verifica `conectado:true`.
> El driver `driver-4500\` NO viene de git (binarios). Se copia por USB desde una
> caja/Matriz que ya lo tenga, o se regenera con
> `pnputil /export-driver oem16.inf <carpeta>` (oem16 = el de "HID Global").

### 🔑 Nota clave — el servicio `DpHost` bloquea el lector
El Runtime instala un servicio de Windows llamado **`DpHost`** que arranca solo y
**se apodera del lector** (el 4500 solo admite un programa a la vez) → el POS diría
"no se detecta el lector". Como no usamos login por huella de Windows, ese servicio
se **deshabilita** (lo hace el `instalar-runtime-digitalpersona.bat` automáticamente).
Si en alguna caja el POS dice "no se detecta el lector" aunque el USB y el driver
estén bien, corre `deshabilitar-dphost.bat` (admin).
Reversible: `sc config DpHost start= auto` + `net start DpHost`.

---

# COMPONENTE 3 — Acceso directo del POS (ícono en el escritorio)

Crea el ícono **"Ferremex POS"** que abre el POS en Chrome modo app (pantalla
completa, sin barra de navegador).

### Archivos (carpeta `Acceso-POS-para-cajas\`)
- `crear-acceso-pos.bat` — el que ejecutas (doble clic, no necesita admin)
- `crear-acceso-pos.ps1` — la lógica
- `ferremex-pos.ico` — el ícono (monitor)
- `Icono.png` — respaldo del ícono

### Instalación
1. Copia los 4 archivos a `C:\ferremex-cajaN\` (juntos; el `.bat` busca el `.ps1` y el `.ico` a su lado).
2. **Doble clic** en `crear-acceso-pos.bat`. Detecta el POS en `:8080` y crea el ícono en el escritorio.
3. **Doble clic** en el ícono "Ferremex POS" → abre el POS.

> El acceso directo detecta la URL sola: en una caja usa `localhost:8080`, en la Matriz `localhost:9000`.

---

# 5. Verificación final (prueba de fuego)

Después de instalar los 3 componentes, **reinicia la caja** y, sin tocar nada,
confirma que todo levantó solo. En PowerShell (no requiere admin para leer):

```powershell
# Tareas de arranque automatico (deben aparecer las dos, State = Ready)
Get-ScheduledTask | Where-Object { $_.TaskName -like "Ferremex-*" } | Select-Object TaskName, State

# Proxy responde
try { (Invoke-WebRequest "http://localhost:8080/pos/" -UseBasicParsing -TimeoutSec 5).StatusCode } catch { "Proxy NO responde" }

# Servicio de huella responde + lector conectado
try { (Invoke-WebRequest "http://127.0.0.1:52700/health" -UseBasicParsing -TimeoutSec 5).Content } catch { "Huella NO responde" }
```

Resultado esperado:
- `Ferremex-Proxy-POS` y `Ferremex-Biometria-POS` → **Ready**
- Proxy → **200**
- Huella → `"conectado":true`
- El ícono del escritorio abre el POS; el cajón, la impresora y el lector funcionan.

---

# 6. Checklist rápido para una caja nueva

```
[ ] Windows 10/11 64-bit + .NET 4.x
[ ] Google Chrome instalado
[ ] Red LAN con acceso a 192.168.1.50
[ ] Crear carpeta C:\ferremex-cajaN\
[ ] Copiar caja-proxy\ + caja-biometria\ + Acceso-POS-para-cajas\ a esa carpeta
[ ] Verificar caddy.exe, FerremexBiometriaService.exe y runtime-digitalpersona\ presentes
    (los pesados que NO vienen de git)
[ ] Componente 1: instalar proxy (Caddyfile apunta a 192.168.1.50) → tarea + arranca
[ ] Componente 2: runtime → driver 4500 → tarea servicio → /health conectado:true
[ ] Componente 3: crear acceso directo del POS
[ ] Reiniciar la caja y correr la verificación final
[ ] Probar una venta: buscar producto, abrir cajón, imprimir ticket, verificar huella
```

---

# 7. ¿Qué se actualiza solo y qué no? (operación diaria)

- **Cambios en el POS o en datos** (pantallas, precios, productos, clientes, puntos,
  módulos): se sirven desde la Matriz. Corre `node actualizar-pos.js` en la Matriz y
  **todas las cajas ven la versión nueva al recargar**. NO hay que tocar las cajas.
- **Cambios en las piezas locales de la caja** (servicio de huella `.exe`, `caddy.exe`,
  los `.bat` de instalación, el ícono): hay que **copiar el archivo nuevo a cada caja**.
  Estos casi nunca cambian.
- **GitHub / `git push`**: es respaldo del código, NO un canal hacia las cajas. Las
  cajas no hacen `git pull`. El push sirve para no perder el código.

---

# 8. Referencias

- `caja-proxy\LEEME-INSTALACION-CAJA.md` — detalle del proxy.
- `caja-proxy\DESCARGAR-CADDY.md` — cómo obtener `caddy.exe`.
- `caja-biometria\LEEME-INSTALACION-CAJA.md` — detalle del servicio de huella.
- `caja-biometria\AVISO-COPYRIGHT-DIGITALPERSONA.txt` — licencia de las DLLs.
- `MEMORIA_INSTALACIÓN.md` / `ACCESO_REMOTO.md` — infraestructura general y acceso remoto.
