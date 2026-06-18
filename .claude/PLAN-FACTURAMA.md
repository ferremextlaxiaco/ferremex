# Plan de integración Facturama (CFDI 4.0) — POS Ferremex

> Estado: PLAN APROBADO PARA EJECUTAR. Diseñado 2026-06-13.
> Decisiones del usuario: factura global = **desglose por artículo**; alcance = **nominativa + global del día + cancelar/reenviar**; cuenta = **desde cero (sandbox)**.

---

## 0. Resumen ejecutivo

Conectar Facturama (PAC/timbrado CFDI 4.0) al POS para:
1. **Factura nominativa** de una venta a un cliente con RFC (botón ya existe como stub en Ticket + SalesHistory).
2. **Factura global del día** que agrupa las ventas sin factura al público en general, **desglosando cada artículo**.
3. **Cancelar** un CFDI (motivo 01–04) y **reenviar** por correo / re-descargar PDF/XML.

**Arquitectura:** Facturama es **REST plano + Basic Auth**. No hay SDK Node oficial usable → se consume con `fetch` desde el **backend Medusa** (NUNCA desde el navegador: las credenciales y el CSD jamás tocan el frontend). El POS llama a rutas nuevas `/caja/facturama/*`, que a su vez llaman a Facturama. Mismo patrón que el resto del POS (Contrato de Conexión).

- **Base sandbox:** `https://apisandbox.facturama.mx/` (con barra final)
- **Base producción:** `https://api.facturama.mx/`
- **Auth:** header `Authorization: Basic base64(usuario:contraseña)`
- **Producto:** "API Web" (un solo emisor) → ruta de creación `POST /3/cfdis` (emite CFDI 4.0)

---

## PARTE A — Lo que TÚ debes hacer (configuración de cuenta)

> Esto va ANTES de que yo construya nada. Hazlo en este orden.

### A.1 — Crear cuenta de SANDBOX (gratis, sin valor fiscal)
1. Entra a **https://apisandbox.facturama.mx/guias/crear-cuenta** y sigue el asistente de registro de sandbox (o `https://dev.facturama.mx/api/registro`).
2. Define un **usuario y contraseña** de sandbox. Anótalos — son tus credenciales de API de prueba (Basic Auth).
   > Recomendación oficial: usa un usuario de sandbox DISTINTO al de producción.
3. Con esas credenciales ya puedes timbrar facturas de prueba (apócrifas, sin valor fiscal). El RFC emisor de pruebas que documenta el SAT/Facturama es **`EKU9003173C9`**.

**Lo que necesito de ti al terminar A.1:** el **usuario y contraseña de sandbox** (me los pasas para ponerlos en el `.env` del backend — no se suben a git).

### A.2 — Reunir los datos fiscales del EMISOR (Ferremex)
Necesito estos datos para configurar el comprobante (van en `.env` / config del backend, no se piden por venta):
- [ ] **RFC del emisor** (el de Ferremex).
- [ ] **Razón social** exacta (como aparece en la Constancia de Situación Fiscal).
- [ ] **Régimen fiscal del emisor** (código SAT, ej. `601`, `612`, `626`…).
- [ ] **Código postal del lugar de expedición** (`ExpeditionPlace`, 5 dígitos — el CP de la tienda en Tlaxiaco).
- [ ] **Serie y folio** que quieres para las facturas (opcional; si no, Facturama numera).

### A.3 — Para PRODUCCIÓN (se hace después, cuando ya probamos en sandbox)
> NO lo necesitas para empezar. Lo dejo documentado para cuando pasemos a real.
1. Contratar el **módulo de API** de Facturama (~$1,650 MXN/año) + comprar **folios/timbres** (≈ $0.40–$0.50 MXN c/u). https://facturama.mx/api-facturacion-electronica
2. Tener a la mano el **CSD (Certificado de Sello Digital)** del SAT:
   - Archivo **`.cer`**
   - Archivo **`.key`**
   - **Contraseña** de la llave privada
3. **Subir el CSD UNA SOLA VEZ**: desde el **panel web de Facturama** (perfil fiscal) — es lo más simple — o vía endpoint `PUT /TaxEntity/UploadCsd`. El CSD se queda guardado en Facturama; **no se manda en cada factura**.
4. Crear el usuario/contraseña de **API de producción** y activar la suscripción.

**Importante:** Facturama **timbra por ti** — NO tienes que contratar un PAC aparte. Ellos son tu único punto de contacto.

### A.4 — Prerequisito de datos del CATÁLOGO (para la factura global con desglose)
Como elegiste **desglosar cada artículo** en la factura global, **cada artículo vendido debe tener:**
- [ ] **Clave SAT de producto/servicio** (`ClaveProdServ`) — el campo `claveSat` ya existe en el artículo del POS.
- [ ] **Clave de unidad SAT** (`ClaveUnidad`) — hay que mapear la unidad de venta a su clave SAT (ya existe `unidades-sat.ts`).
- [ ] Saber si el artículo **lleva IVA 16%** o no.

Ya tienes los scripts `bun run importar:claves-sat` y `bun run generar:catalogo-sat`. **Tarea previa:** verificar que el catálogo no tenga artículos sin clave SAT (yo te haré un reporte de "artículos sin clave SAT" antes de activar la factura global, porque un solo artículo sin clave hace fallar el timbrado de toda la factura global).

---

## PARTE B — Lo que YO construiré (implementación)

### Fase 1 — Cimientos backend (cliente Facturama + emisor)
1. **`packages/api/src/lib/facturama.ts`** — cliente REST: Basic Auth, base URL por env, helpers `crearCfdi()`, `descargarCfdi(id, formato)`, `cancelarCfdi(id, motivo)`, `enviarCorreo(id, email)`, `listarCfdis()`. Manejo de errores de Facturama (códigos `CFDI40xxx`) traducidos a mensajes claros.
2. **Env nuevas** (`.env`, sin defaults peligrosos):
   - `FACTURAMA_BASE_URL` (sandbox vs prod)
   - `FACTURAMA_USER` / `FACTURAMA_PASS`
   - `FACTURAMA_EMISOR_RFC`, `FACTURAMA_EMISOR_NOMBRE`, `FACTURAMA_EMISOR_REGIMEN`, `FACTURAMA_EXPEDITION_CP`
3. **Mapeo venta → CFDI** (`packages/api/src/lib/cfdi-mapper.ts`): convierte una venta del POS al body de `POST /3/cfdis`. Incluye cálculo de IVA por línea (`Base`, `Rate 0.16`, `Total`), `TaxObject`, redondeos a 2/6 decimales como exige el SAT.

### Fase 2 — Propagar claves SAT a la venta (deuda de datos)
> Hoy los items de la venta NO guardan clave SAT/unidad/IVA. Para desglosar hay que propagarlas.
1. Ampliar el item de venta persistido con `clave_sat`, `clave_unidad`, `aplica_iva` (igual que se hizo con `departamento`/`categoria` para el monedero).
2. `POST /caja/ventas` guarda esas claves al registrar (tomadas del artículo).
3. Para ventas **históricas** sin claves: el mapper resuelve la clave consultando el artículo por SKU al momento de facturar (fallback), o usa clave genérica `01010101` "Venta" + unidad `ACT` si no hay forma.

### Fase 3 — Factura NOMINATIVA por venta
1. **Ruta `POST /caja/facturama/factura`** — body `{ folio }`. Carga la venta + el cliente (con sus datos fiscales `rfc`/`razon_social`/`regimen_fiscal`/`cfdi`/`cp`), arma el CFDI nominativo, timbra, **guarda el resultado** (`uuid`, `cfdi_id`, fecha, estado) en la venta.
2. **Ruta `GET /caja/facturama/factura/[folio]`** — estado de factura de una venta (timbrada / no / cancelada) + links PDF/XML.
3. **Frontend:** reemplazar el cuerpo del botón "Timbrar CFDI" del **stub `FacturarBoton.tsx`** (¡ya está colocado y con la validación fiscal lista!) por la llamada real. Mostrar PDF/XML al timbrar.
4. Añadir `uso_cfdi` al formulario de cliente si falta (el shape ya tiene `cfdi`).

### Fase 4 — Factura GLOBAL del día (desglose por artículo)
1. **Ruta `GET /caja/facturama/global/preview?fecha=YYYY-MM-DD&caja_id=`** — lista las ventas del día **sin factura nominativa**, agrega todos los artículos, y devuelve un preview + un **reporte de artículos sin clave SAT** (bloqueante).
2. **Ruta `POST /caja/facturama/global`** — arma UN CFDI con:
   - Receptor: `Rfc=XAXX010101000`, `Name=PUBLICO EN GENERAL`, `CfdiUse=S01`, `FiscalRegime=616`, `TaxZipCode=`CP del emisor.
   - `GlobalInformation`: `Periodicity=01` (Diario), `Months`=mes, `Year`=año.
   - `Items`: una línea por artículo vendido (desglose), con su clave SAT real.
   - Marca esas ventas como "incluidas en factura global X" para no re-facturarlas.
3. **Frontend:** panel nuevo en admin (decisión: ¿en el Corte de caja o módulo aparte? — lo definimos al implementar). Sigue patrón de composición POS.

### Fase 5 — Cancelar + reenviar
1. **`DELETE /caja/facturama/factura/[folio]?motivo=02`** — cancela (motivo 01–04; 01 requiere UUID sustituto). Actualiza estado en la venta.
2. **`POST /caja/facturama/factura/[folio]/email`** — reenvía por correo.
3. Re-descarga PDF/XML on-demand.
4. **Frontend:** integrar en el drawer de detalle de venta de **SalesHistory** (cancelación de 2 pasos como ya existe para cancelar ventas).

### Fase 6 — Pruebas e2e en sandbox + docs
- Timbrar nominativa de prueba, global de prueba, cancelar. Verificar PDF/XML.
- Actualizar `.claude/FERREMEX-*` + memoria + `CLAUDE.md` (sección facturación, tabla de impacto cruzado).

---

## Contrato de Conexión (qué consume qué)

| Sistema nuevo | Consumidores |
|---|---|
| `lib/facturama.ts` (cliente REST backend) | rutas `/caja/facturama/*` |
| `lib/cfdi-mapper.ts` (venta→CFDI) | rutas factura + global |
| `/caja/facturama/factura` (nominativa) | `FacturarBoton` (Ticket + SalesHistory) |
| `/caja/facturama/global` (global) | panel admin de factura global |
| `/caja/facturama/factura/[folio]` (estado/cancelar/email) | SalesHistory (drawer detalle) |
| item de venta + `clave_sat`/`clave_unidad`/`aplica_iva` | `POST /caja/ventas`, cfdi-mapper |
| `client.ts`: `emitirFacturaAPI`, `cancelarFacturaAPI`, `reenviarFacturaAPI`, `previewGlobalAPI`, `emitirGlobalAPI` | FacturarBoton, panel global, SalesHistory |
| env del emisor | `lib/facturama.ts`, `cfdi-mapper.ts` |

---

## Riesgos / notas

- **Credenciales y CSD jamás en el frontend.** Todo el contacto con Facturama es backend-only.
- **Una clave SAT faltante** rompe el timbrado de la factura global completa → por eso el preview bloquea con reporte.
- **`Name` del receptor** debe coincidir EXACTO con la Constancia (sin "S.A. de C.V.", validado por el SAT) → mensaje de error claro si Facturama rechaza (`CFDI40145`).
- **CP del receptor** se valida contra el padrón SAT en tiempo real (`CFDI40157` si no coincide con el régimen).
- **Sandbox ≠ Producción**: cuentas y credenciales independientes; el cambio es solo de env (URL + user/pass), sin tocar código.
- **Persistencia del estado de factura**: hoy las ventas viven en `ventas-pos.json`. El `uuid`/estado se guarda ahí. (Deuda conocida: ventas no están en BD Medusa todavía.)
