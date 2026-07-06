# Ferremex — Servicio local de huella (FerremexBiometriaService)

Servicio que corre en cada caja y permite al POS **capturar, registrar y verificar
huellas** con el lector **DigitalPersona U.are.U 4500**. Expone el motor nativo
`dpfj`/`dpfpdd` por HTTP en `http://127.0.0.1:52700` (solo local — la huella nunca
sale de la caja).

Es la 3ª pieza local por caja, junto al **proxy Caddy** (`localhost:8080`) y al
**Agent DigitalPersona** (driver del lector).

---

## Qué hace

| El POS pide… | El servicio hace… |
|---|---|
| Registrar la huella de un cliente/empleado | Captura 4 muestras del dedo y las consolida en una plantilla (FMD ~440 bytes) |
| Autorizar canje de puntos de un cliente | Captura y compara **1:1** contra la plantilla guardada del cliente |
| Autorizar una acción de un empleado | Captura e **identifica 1:N** entre los empleados autorizados |

Las **plantillas se guardan en la BD central** (Medusa), no en la caja. El servicio
solo captura/extrae/compara; es "sin estado".

---

## Endpoints (para referencia / pruebas)

| Método | Ruta | Propósito |
|---|---|---|
| GET  | `/health` | Estado del servicio y del lector |
| POST | `/capturar` | Una captura → plantilla (primitiva) |
| POST | `/capturar-enroll` | N capturas → 1 plantilla (progreso por SSE) |
| POST | `/verificar-1a1` | Captura + compara contra 1 plantilla |
| POST | `/identificar-1aN` | Captura + identifica entre N candidatos |
| POST | `/cancelar` | Aborta una captura en curso (`captura_id`) |

`score` = **disimilitud** (0 = idéntico; menor = más parecido). `match = score <= umbral`.

---

## Requisitos por caja (instalar ANTES)

1. **DigitalPersona Biometric SDK Runtime 3.5** (New RTE x64) — instalador en
   `runtime-digitalpersona/` (correr `setup.exe` como administrador).
2. **Driver del lector U.are.U 4500** (HID DigitalPersona 4500 Drivers).
3. **.NET Framework 4.x** (viene con Windows 10/11).
4. **Lector U.are.U 4500** conectado por USB.

Verifica que el lector aparece en el Administrador de dispositivos como
**"U.are.U® Fingerprint Reader"** con estado correcto.

---

## Compilar (solo para desarrollo)

No requiere el .NET SDK — usa el compilador `csc` que ya trae Windows:

```
compilar.bat
```

Genera `FerremexBiometriaService.exe` en esta carpeta.

---

## Probar manualmente

1. Conecta el lector.
2. Doble clic en `FerremexBiometriaService.exe` (o `iniciar-servicio.bat` para ver logs).
3. En un navegador o terminal: `http://127.0.0.1:52700/health`
   → debe responder `"lector":{"conectado":true, ...}`.
4. Prueba de captura (PowerShell):
   ```powershell
   curl -Method POST http://127.0.0.1:52700/capturar
   ```
   Pon el dedo cuando lo pida; devuelve `plantilla_b64` y `calidad`.

Los logs quedan en `biometria.log` (junto al .exe).

---

## Configuración (`appsettings.json`)

```json
{
  "puerto": 52700,
  "timeout_ms": 15000,
  "muestras_enroll": 4,
  "umbral_empleado": 2147,     // más estricto (autoriza acciones sensibles)
  "umbral_cliente": 21474      // canje de puntos (menos crítico)
}
```

Los umbrales se ajustan con datos reales tras el despliegue (ver calibración en la
documentación del proyecto). Menor umbral = más estricto (menos falsos positivos).

---

## Arranque automático (producción)

Correr **una vez como administrador**: `instalar-inicio-automatico.bat`
(registra una tarea programada que lanza el servicio, oculto, al iniciar sesión).

---

## Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| `/health` no responde | El servicio no está corriendo. Corre `iniciar-servicio.bat`. |
| `lector.conectado: false` | Lector desconectado, driver faltante, o Runtime 3.5 no instalado. |
| Error "Lector ocupado" | Otro proceso (Windows Hello / DPAgent) tiene el lector. Ver documentación. |
| "Access denied" al arrancar | Correr una vez como admin, o reservar la URL: `netsh http add urlacl url=http://127.0.0.1:52700/ user=Todos` |

---

## Aviso legal

Ver `AVISO-COPYRIGHT-DIGITALPERSONA.txt`. Los componentes `dpfj.dll`/`dpfpdd.dll` son
de DigitalPersona/HID Global, redistribuidos bajo licencia para uso con hardware
DigitalPersona genuino.
