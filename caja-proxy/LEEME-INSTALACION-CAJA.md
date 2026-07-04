# Ferremex — Instalar el POS en una caja (proxy local)

Este paquete hace que el POS abra en **`http://localhost:8080/pos/`** en cada caja.
Como el navegador ve **localhost**, Chrome habilita **Web Serial**, y así funcionan
el **cajón de dinero** y la **impresora térmica** (que no funcionarían por IP directa).

**No se instalan certificados. No se ve la advertencia "sitio no seguro".**

---

## Qué contiene este paquete

| Archivo | Para qué |
|---|---|
| `caddy.exe` | El proxy (un solo programa, no se instala) |
| `Caddyfile` | La configuración (a qué servidor reenvía) |
| `iniciar-proxy-oculto.vbs` | Lanza el proxy sin ventana |
| `instalar-inicio-automatico.bat` | Instala el arranque automático (correr 1 vez) |
| `iniciar-proxy.bat` | Arranque manual con ventana (para probar/diagnosticar) |

---

## Instalación en una caja (5 minutos, una sola vez)

### Paso 1 — Copiar la carpeta a la caja
Copia **toda esta carpeta** a la caja, por ejemplo a:
```
C:\ferremex-caja\
```
(Puede ser por USB, red compartida, o descarga. Debe quedar completa con los 5 archivos.)

### Paso 2 — Instalar el arranque automático
1. Entra a la carpeta `C:\ferremex-caja\`.
2. Clic **derecho** sobre **`instalar-inicio-automatico.bat`** → **"Ejecutar como administrador"**.
3. Verás "[OK] Tarea creada" y el proxy arrancará solo. Cierra la ventana.

Desde ahora, el proxy arranca solo cada vez que se enciende la caja.

### Paso 3 — Abrir el POS en Chrome
En la caja, abre **Google Chrome** y ve a:
```
http://localhost:8080/pos/
```
Debe cargar el login del POS. **Guárdalo como marcador** o crea un acceso directo
(ver "Acceso directo en el escritorio" abajo).

### Paso 4 — Conectar los periféricos (cajón + impresora)
Con el POS abierto en `localhost:8080`:
1. Ve a la sección de **Periféricos** (o al botón "Conectar impresora" en la venta).
2. Chrome mostrará el **selector de puertos serie** → elige el puerto de la impresora
   (normalmente `COM3`, `COM4`… o "USB Serial").
3. Listo — el cajón abre y la impresora imprime. Chrome **recuerda** el permiso para
   `localhost:8080`, así que no lo vuelve a pedir en los siguientes reinicios.

---

## Acceso directo en el escritorio (opcional pero recomendado)

Para que la caja abra el POS con un clic, en modo pantalla completa tipo app:
1. Clic derecho en el escritorio → **Nuevo → Acceso directo**.
2. En la ubicación pega (ajusta la ruta de Chrome si es distinta):
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:8080/pos/
   ```
3. Nómbralo **"Ferremex POS"**. Al abrirlo, el POS se ve como una aplicación (sin barra
   de navegador).

---

## Verificar que funciona

- El proxy está corriendo si `http://localhost:8080/pos/` carga el POS.
- Para revisarlo manualmente: doble clic en **`iniciar-proxy.bat`** (abre una ventana con
  los logs; ciérrala cuando termines de revisar).

---

## Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| `localhost:8080` no carga / "No se puede acceder" | El proxy no está corriendo. Corre `iniciar-proxy.bat` a mano, o reinicia la caja (arranca solo). |
| "No se pudo conectar con el servidor" (dentro del POS) | El servidor central está caído o cambió de IP. Ver "Si el servidor cambia de IP". |
| El cajón/impresora no aparece al conectar | Asegúrate de estar en `http://localhost:8080/pos/` (NO en la IP). Usa **Chrome** (no Edge/Firefox). Revisa que el cable USB/serie esté conectado. |
| Chrome dice que Web Serial no está disponible | Estás en la URL por IP, no en localhost. Usa `http://localhost:8080/pos/`. |

### Si el servidor cambia de IP
El servidor está fijado en **`192.168.1.50`**. Si algún día cambia:
1. Abre `Caddyfile` con el Bloc de notas.
2. Cambia la IP en la línea `reverse_proxy 192.168.1.50:9000`.
3. Reinicia la caja (o el proxy).

---

## Datos de esta instalación
- **Servidor central:** `http://192.168.1.50:9000` (IP fija reservada en el router)
- **URL del POS en cada caja:** `http://localhost:8080/pos/`
- **Navegador:** Google Chrome (obligatorio para Web Serial)
