# CLAUDE.md — Ferremex Automation Project

Este archivo le da contexto permanente a Claude Code sobre el negocio, la arquitectura
técnica y las reglas que debe respetar en cada sesión de trabajo. Léelo completo antes
de ejecutar cualquier acción o generar cualquier workflow.

---

## 1. Contexto del Negocio

**Ferremex** es una ferretería física ubicada en la **Heroica Ciudad de Tlaxiaco,
Estado de Oaxaca, México**, actualmente en proceso de expansión hacia el canal en línea
(e-commerce). El equipo es pequeño — entre 2 y 5 personas — por lo que cada
automatización debe maximizar el impacto con el mínimo de mantenimiento manual.

El sistema de punto de venta es **Sicar** (POS). La comunicación con clientes ocurre
principalmente por **WhatsApp, llamadas telefónicas y mostrador presencial**. No hay
canal de email con clientes por el momento.

El correo corporativo principal del negocio es `ferremextlaxiaco@gmail.com`.

---

## 2. Arquitectura Técnica

### Entornos

Ferremex opera con **dos entornos separados** que nunca deben mezclarse:

- **Desarrollo (este equipo):** n8n corriendo en Docker Desktop en `http://localhost:5678`.
  Aquí se construyen y prueban los workflows antes de pasarlos a producción.
- **Producción:** n8n corriendo en un VPS remoto con URL pública. Los workflows
  probados aquí se exportan e importan manualmente al VPS.

### Stack actual

n8n está en Docker Desktop (Windows) con volumen persistente `n8n_data`. La base de
datos es SQLite por defecto. El timezone configurado es `America/Mexico_City`.

Claude Code se conecta a n8n local mediante el servidor MCP `n8n-mcp` en modo `stdio`.
La API key de n8n local está almacenada en la configuración de Claude Code y **nunca
debe escribirse en archivos de workflow ni en código fuente**.

### Estructura de carpetas en el servidor

Todos los archivos generados por los workflows se guardan en `/facturas/` con esta
jerarquía estricta:

```
/facturas/
  ids_procesados_truper.json        ← control de duplicados Truper
  proveedores.csv                   ← lista de proveedores registrados
  registro_facturas.csv             ← log de todas las facturas recibidas
  2026/
    04_Abril/
      Truper/                       ← facturas descargadas desde API Truper
      NombreProveedor/
        Facturas/                   ← TipoDeComprobante = I
        Complementos/               ← TipoDeComprobante = P
        NotasCredito/               ← TipoDeComprobante = E
        Nomina/                     ← TipoDeComprobante = N
        Traslados/                  ← TipoDeComprobante = T
        Otros/                      ← sin XML o tipo desconocido
```

---

## 3. Workflows Existentes

### Automatización de Facturas (ID: DZ2HVxs6Lxl3OnP3) — ACTIVO
Monitorea Gmail cada minuto buscando correos con PDF adjunto. Verifica si el remitente
está en `proveedores.csv`. Si es un proveedor registrado, extrae datos del XML adjunto
(fecha, tipo de comprobante, folio, UUID), crea la carpeta del mes correspondiente,
guarda el PDF con nombre basado en Serie-Folio > UUID > timestamp, y registra en el CSV.
El día 1 de cada mes a las 8am genera y envía un reporte HTML al contador.

El nodo "Confirmar Recepción al Remitente" está **deshabilitado intencionalmente** —
no activarlo sin consultar primero.

### Descarga Facturas Truper (ID: MKUgZ9Oa5oiVyysZ) — INACTIVO
Monitorea correos de `truentrega@truper.com`. Cuando detecta el segundo correo (el que
contiene ruta+cliente+destinatario en la URL), llama a la API REST de Truper para
obtener la lista de pedidos, descarga cada PDF de factura directamente desde su API
pública, y los guarda en `/facturas/año/mes_Nombre/Truper/`.

Usa `ids_procesados_truper.json` para evitar descargar el mismo correo dos veces.
**No tiene login** — las URLs de descarga son públicas con los parámetros del correo.

---

## 4. Integraciones Activas

| Integración | Credencial en n8n | Notas |
|---|---|---|
| Gmail | `Gmail account` (ID: 0vMwigc5204W7AFD) | OAuth2, usada en ambos workflows |
| API Truper | Sin credencial — URL pública | Parámetros vienen del correo |
| Sistema POS | Sicar | Sin integración directa aún — objetivo futuro |
| WhatsApp | Sin configurar aún | Objetivo próximo |

---

## 5. Áreas de Automatización Priorizadas

Las áreas de trabajo están ordenadas por prioridad de implementación:

**En marcha:** Facturas y contabilidad (workflows ya funcionales).

**Siguiente prioridad:** Pedidos a proveedores — automatizar el proceso de generación
y seguimiento de órdenes de compra, idealmente con integración al POS Sicar.

**Prioridad media:** Reportes de ventas — extracción de datos de Sicar y generación
de reportes periódicos automáticos para toma de decisiones.

**Prioridad futura:** Atención a clientes por WhatsApp — respuestas automáticas,
cotizaciones, seguimiento de pedidos. Inventario y almacén — alertas de stock mínimo,
conciliación con POS.

**Objetivo estratégico:** Expansión al canal en línea (e-commerce) con sincronización
automática de inventario, precios y pedidos.

---

## 6. Convenciones Obligatorias para Workflows

Cuando construyas o modifiques workflows de n8n, sigue estas reglas sin excepción:

**Nombres de nodos:** Usar español descriptivo. Ejemplo: "Descargar PDF" en lugar de
"HTTP Request". El nombre debe decir qué hace el nodo, no qué tipo de nodo es.

**Notas en nodos:** Todo nodo que tenga lógica no obvia debe incluir una nota explicando
su propósito. Esto es crítico porque el equipo es pequeño y no siempre quien construyó
el workflow será quien lo mantenga.

**Manejo de duplicados:** Cualquier workflow que procese correos o eventos recurrentes
debe implementar control de duplicados mediante un archivo JSON en `/facturas/`.

**Manejo de errores:** Todo workflow de producción debe tener al menos un nodo de
"Log de Error" conectado a las salidas de error, similar al que ya existe en
"Automatización de Facturas".

**Nodos nativos primero:** Usar siempre nodos nativos de n8n (Gmail, HTTP Request, IF,
Code, etc.) antes de considerar nodos de comunidad. Solo usar nodos de comunidad cuando
no haya alternativa nativa razonable.

**Credenciales:** Nunca hardcodear API keys, passwords o tokens dentro del código de
un nodo. Siempre usar el sistema de credenciales de n8n o variables de entorno.

---

## 7. Reglas de Seguridad — No Negociables

La seguridad es la prioridad número uno porque se manejan datos fiscales y financieros
sensibles de la empresa.

**Nunca hacer esto:**
- Escribir API keys, passwords o tokens en el chat, en archivos de workflow, o en
  cualquier archivo que pueda subirse a Git.
- Exponer el puerto 5678 de n8n localhost a internet sin autenticación.
- Activar un workflow en producción (VPS) sin haberlo probado primero en localhost.
- Compartir el archivo `.claude.json` — contiene las credenciales del MCP.
- Dar acceso MCP a n8n de producción desde este equipo — el MCP local solo apunta
  a `http://localhost:5678`.

**Siempre hacer esto:**
- Agregar cualquier archivo con credenciales (`.env`, `.claude.json`, archivos con
  API keys) al `.gitignore` antes de inicializar un repositorio Git.
- Probar en localhost antes de exportar a producción.
- Mantener `ids_procesados_*.json` como mecanismo de idempotencia en workflows
  que procesan eventos recurrentes.

---

## 8. Cómo Trabajamos en Este Proyecto

El operador de este sistema (Andrés) tiene nivel principiante en terminal y archivos
de configuración. Por eso:

- Cuando propongas cambios técnicos, explica el "por qué" antes del "cómo".
- Da instrucciones paso a paso, una acción a la vez.
- Si un comando puede causar daño irreversible (eliminar datos, desactivar workflows
  en producción), adviértelo explícitamente antes de ejecutarlo.
- Prefiere soluciones simples y mantenibles sobre soluciones elegantes pero complejas.
- Cuando generes un workflow nuevo, explica brevemente qué hace cada nodo antes de
  desplegarlo.

---

## 9. Comandos Útiles de Referencia Rápida

```bash
# Verificar que n8n está corriendo
curl http://localhost:5678/healthz

# Ver logs del contenedor n8n en Docker
docker logs -f nombre_contenedor_n8n

# Listar workflows desde Claude Code
# (dentro de una sesión `claude`, usar lenguaje natural)
# "Lista todos los workflows en n8n"
# "Muéstrame el estado de los workflows activos"
# "Crea un nuevo workflow que..."
```

---

*Última actualización: Abril 2026 — Ferremex Automation Project*
