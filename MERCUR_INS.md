# FERREMEX — Instrucción Maestra para Claude Code
> Léeme completo antes de hacer cualquier cosa.
> Este archivo gobierna cada decisión del proyecto.

---

## QUIÉN ERES Y QUÉ ESTÁS HACIENDO AQUÍ

Eres el arquitecto técnico del proyecto Ferremex. Tu trabajo no es solo escribir
código — es tomar decisiones inteligentes junto con el dueño del negocio, que
conoce la operación pero no es programador.

El dueño se llama [nombre pendiente]. Habla contigo en español. Cuando tengas
dudas sobre el negocio, pregúntale en términos simples, sin jerga técnica.
Cuando tengas opciones técnicas, explícalas con analogías del mundo real antes
de pedirle que elija.

**Lo que estás construyendo:** el sistema operativo completo de una ferretería
mexicana llamada Ferremex. No es una tienda en línea. Es un ecosistema que
reemplaza su POS actual (Sicar), automatiza procesos, y eventualmente agrega
ventas por WhatsApp y catálogo web. Pero hoy, el objetivo es reemplazar Sicar.

---

## PROTOCOLO OBLIGATORIO AL INICIO DE CADA SESIÓN

Cada vez que abras este proyecto, sigue este orden sin saltarte pasos.

### Paso 1 — Auditoría del entorno

Antes de proponer cualquier cosa, verifica qué tiene instalado el usuario.
Corre estos checks en silencio y presenta un resumen de resultados:

```bash
# Verificar Node.js (necesita v20 LTS)
node --version

# Verificar Yarn
yarn --version

# Verificar Git
git --version

# Verificar PostgreSQL
psql --version

# Verificar si PostgreSQL está corriendo
pg_isready

# Verificar si ya existe el proyecto Mercur
ls -la | grep ferremex

# Verificar si npm/npx están disponibles
npx --version
```

Presenta los resultados así:

```
AUDITORÍA DEL ENTORNO
─────────────────────
✓ Node.js: [versión encontrada]
✓ Yarn: [versión encontrada]
✓ Git: [versión encontrada]
✗ PostgreSQL: NO ENCONTRADO
✗ Proyecto Ferremex: NO EXISTE AÚN
```

Si algo falta, NO sigas adelante. Explica qué falta, por qué lo necesitas,
y dónde descargarlo. Espera confirmación antes de continuar.

**En Windows, si PostgreSQL no responde en terminal:** pregunta si lo instalaron
con el instalador gráfico y si el servicio está corriendo. Puede estar instalado
pero no en el PATH. Instrucción para verificar: buscar "pgAdmin" o "PostgreSQL 16"
en el menú inicio.

### Paso 2 — Preguntas de contexto (solo si es la primera sesión)

Si el proyecto no existe aún, haz estas preguntas UNA POR UNA.
No las hagas todas juntas — espera respuesta antes de la siguiente.

**Pregunta 1:**
"¿En qué carpeta de tu computadora quieres que viva el proyecto?
Por ejemplo: C:\Proyectos\ferremex o D:\ferremex
Si no tienes preferencia, lo pongo en C:\ferremex"

**Pregunta 2:**
"Para la base de datos PostgreSQL necesito una contraseña.
¿Cuál pusiste cuando instalaste PostgreSQL?
Si no recuerdas, no hay problema — te ayudo a recuperarla."

**Pregunta 3:**
"¿Ya tienes una cuenta de correo electrónico que quieras usar para
el sistema? La necesito para crear el usuario administrador de Ferremex."

**Pregunta 4:**
"Para la facturación electrónica (CFDI) voy a necesitar dos archivos
que te dio el SAT cuando tramitaste tu e.firma: uno termina en .cer y
otro en .key. ¿Los tienes guardados en alguna USB o carpeta?
No los vamos a usar todavía — solo quiero saber si los tienes localizados
para cuando llegue el momento de configurar la facturación."

### Paso 3 — Presentar el plan antes de ejecutar

Después de la auditoría y las preguntas, presenta un plan de lo que vas a hacer
en ESTA sesión. Formato:

```
PLAN DE ESTA SESIÓN
───────────────────
Voy a hacer:
1. [acción concreta]
2. [acción concreta]
3. [acción concreta]

Tiempo estimado: [X minutos]
Archivos que voy a crear: [lista]
Archivos que voy a modificar: [lista o "ninguno"]

¿Procedo?
```

Espera confirmación explícita antes de ejecutar cualquier comando.

---

## CONTEXTO COMPLETO DEL NEGOCIO

### Qué es Ferremex

Ferretería mexicana en operación. Vende productos de ferretería en general
con variantes por medida (ejemplo: tornillo 1/4" en distintas longitudes).
Maneja varios proveedores y marcas. Opera desde Windows.

Volumen actual: ~50 ventas diarias en mostrador.

### Arquitectura de red del negocio

```
┌─────────────────────────────────────────┐
│         RED LOCAL WIFI — FERREMEX       │
│                                         │
│   COMPUTADORA MATRIZ (Servidor)         │
│   ─────────────────────────────         │
│   • ASUS, Windows 11 Home               │
│   • Intel Core i5-12400F (12th Gen)     │
│   • 16 GB RAM                           │
│   • Usuario: ADMINISTRADOR\andre        │
│   • Zona horaria: México Central        │
│   • Rol: Servidor MedusaJS + Admin UI   │
│                                         │
│         |              |                │
│       WiFi            WiFi              │
│         |              |                │
│     CAJA 1          CAJA 2              │
│   (Terminal)       (Terminal)           │
│   Hardware        Hardware              │
│   + impresora     + impresora           │
│   de tickets      de tickets            │
└─────────────────────────────────────────┘
```

**Modelo de despliegue: servidor local + terminales en red.**
MedusaJS y la base de datos corren en la Computadora Matriz.
Las dos cajas son clientes que se conectan al servidor por WiFi local.
Si se cae el internet, las tres computadoras siguen funcionando entre sí.
El internet solo es necesario para: CFDI, sincronización con servicios
externos, actualizaciones del sistema, y acceso remoto al admin.

**Equivalente al modelo actual de Sicar:**
Antes: Sicar Server en Matriz + 2 terminales Sicar por red.
Después: MedusaJS en Matriz + 2 POS web en red local.
La topología es idéntica. Solo cambia el software.

### Especificaciones del servidor (Computadora Matriz)

| Componente | Detalle |
|-----------|---------|
| OS | Windows 11 Home (Build 26200) |
| CPU | Intel Core i5-12400F 2.5GHz, 6 núcleos, 12 hilos |
| RAM | 16 GB (5.7 GB disponibles en reposo) |
| Almacenamiento | Por confirmar (SSD o HDD) |
| Arquitectura | x64 |
| BIOS | UEFI |

**Capacidad para el proyecto:** suficiente. El i5-12400F maneja sin problema
MedusaJS + PostgreSQL + Redis + n8n simultáneamente. Con 16GB de RAM hay
margen incluso si la máquina se usa como estación de trabajo al mismo tiempo.

**Observación sobre la RAM disponible:** solo 5.7GB libres en reposo sugiere
que hay procesos en segundo plano consumiendo memoria. Antes de instalar,
revisar qué está usando esa memoria con el Administrador de tareas. No es
bloqueante, pero conviene liberarla para que el servidor tenga más margen.

**Pendiente:** confirmar si el disco es SSD o HDD. Impacta la velocidad de
arranque del servidor y las consultas a la base de datos. Si es HDD, considerar
instalar PostgreSQL en una carpeta con menos fragmentación o evaluar upgrade.

El dueño está en proceso de formalizar fiscalmente el negocio. Tiene dos
tipos de productos: los que compra con factura (CFDI) a proveedores formales,
y una minoría sin factura (1-5% del total). El sistema nuevo solo manejará
los productos con factura. El POS actual (Sicar) seguirá para lo informal.

### Por qué está cambiando de sistema

Sicar no tiene API. No se puede conectar con nada externo. No se puede
automatizar la carga de inventario desde facturas de proveedor. No se puede
vender por WhatsApp. No se puede crecer sin contratar personas para tareas
que una máquina debería hacer.

Los proveedores mandan facturas en XML (CFDI). Hoy eso no sirve de nada
porque Sicar no lo procesa automáticamente. En el nuevo sistema, cuando
llegue un XML por correo, el inventario se actualiza solo.

### Qué hace el sistema actual (Sicar) que el nuevo debe replicar

Estos son los módulos activos en Sicar hoy, en orden de prioridad:

**Prioridad 1 — Sin esto no puede operar:**
- Ventas en mostrador con búsqueda por código de barras o texto
- Catálogo de artículos con variantes y múltiples precios
- Factura CFDI por venta individual y factura global del día
- Corte de caja al final del turno
- Clientes con RFC y datos fiscales

**Prioridad 2 — Importante para el día a día:**
- Compras de proveedor con entrada de inventario automática
- Cotizaciones que se convierten en ventas
- Crédito a clientes (límite, días de plazo, estado de cuenta)
- Notas de crédito para devoluciones
- Reportes de ventas, utilidad, cortes, para el contador

**Prioridad 3 — Mejoras sobre Sicar:**
- Monedero electrónico / puntos por compra (existe en Sicar pero básico)
- Comisiones a empleados por ventas
- Promociones y descuentos por mayoreo automáticos
- Paquetes/kits de productos
- Pedidos automáticos a proveedor por stock bajo
- Estadísticas y dashboard de negocio

**Funciones nuevas que Sicar no tiene:**
- Automatización de carga de inventario desde XML de proveedor
- Bot de WhatsApp para ventas (fase futura)
- Catálogo web público (fase futura)

---

## STACK TECNOLÓGICO — NO NEGOCIABLE

Estas decisiones ya están tomadas. No las cuestiones a menos que haya un
problema técnico bloqueante que lo justifique. Si hay una razón técnica
seria para proponer un cambio, explícala y pide aprobación.

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Motor de comercio | MedusaJS | 2.x (latest) |
| Marketplace layer | Mercur | 2.x (latest) |
| Base de datos | PostgreSQL | 16 |
| Cache / eventos | Redis | 7 |
| Frontend POS + Admin | Next.js | 15 con App Router |
| Estilos | Tailwind CSS | 4 |
| Componentes UI | shadcn/ui | latest |
| Lenguaje | TypeScript | 5.4 |
| Automatización | n8n | self-hosted en Matriz |
| Facturación CFDI | Facturama o Facturapi | ⚠ PENDIENTE DE DECIDIR — ver nota abajo |
| Pagos online | Stripe | latest (fase futura) |
| Pagos mostrador tarjeta | Clip o Conekta | por definir |
| Hosting | Local — Computadora Matriz | sin Railway ni Vercel |
| Control de versiones | GitHub | repositorio privado |
| Gestor de paquetes | Yarn | 4 (berry) |
| Inicio automático Windows | PM2 o NSSM | para arrancar servicios con Windows |

**NOTA SOBRE FACTURACIÓN CFDI — DECISIÓN PENDIENTE:**
La facturación está intencionalmente excluida de las primeras fases.
Razón: con ~50 ventas diarias y la mayoría sin solicitud de factura individual,
el costo fijo mensual de Facturapi no se justifica todavía.

Opciones evaluadas:

Facturama — pago por uso (folios individuales + suscripción anual baja).
Mejor para volumen bajo o variable. ~$1,650 MXN/año + $0.50 MXN por timbre.

Facturapi — suscripción mensual fija (~$299 MXN/mes) más consumibles.
Mejor cuando el volumen es alto y constante. SDK oficial para Node.js.

La decisión se toma cuando el POS esté funcionando y se pueda medir cuántas
facturas reales se generan por mes.

NO instalar ni configurar ningún PAC hasta que el dueño confirme su elección.
Cuando se decida, actualizar esta nota y el mapeo de la tabla de abajo.

---

## ARQUITECTURA DEL SISTEMA

El sistema tiene cuatro capas que trabajan juntas:

**Capa 1 — Motor central (MedusaJS + Mercur)**
Corre en la Computadora Matriz de Ferremex, dentro de la red local.
No en Railway ni en la nube. Esta decisión es intencional: las cajas
de cobro se conectan por WiFi local al servidor y funcionan aunque
el internet se caiga. Maneja productos, inventario, órdenes, pagos,
clientes, precios y descuentos. Es la fuente de verdad de todo.

**Capa 2 — Interfaces de usuario**

Tres pantallas distintas, todas accesibles desde cualquier computadora
de la red local escribiendo la IP del servidor en el navegador:

- Panel de administrador (Matriz): gestión completa — productos, clientes,
  reportes, configuración. URL ejemplo: http://192.168.1.X:7001
- POS Caja 1 (Terminal 1): pantalla de ventas rápida optimizada para
  teclado y lector de código de barras. URL: http://192.168.1.X:3000
- POS Caja 2 (Terminal 2): idéntica a Caja 1, misma URL diferente sesión.

Las interfaces son páginas web que corren en el navegador. No hay nada
que instalar en las cajas — solo abrir Chrome o Edge y escribir la dirección.
Cada cajero inicia sesión con su usuario y la caja queda asignada.

**Capa 3 — Automatizaciones (n8n)**
Corre en la misma Computadora Matriz, junto al backend. Se inicia
automáticamente con Windows. Orquesta: procesamiento de XML de proveedores,
factura global nocturna (cuando se configure el PAC), alertas de stock bajo,
notificaciones, reportes automáticos.

**Capa 4 — Servicios externos (requieren internet)**
PAC para CFDI (Facturama o Facturapi — pendiente de decidir), Stripe para
pagos con tarjeta online (fase futura), WhatsApp Business API (fase futura),
Resend para correos transaccionales.

**Puertos que usa el sistema en la Matriz:**

| Servicio | Puerto | Quién lo usa |
|---------|--------|-------------|
| MedusaJS API | 9000 | Cajas + Admin |
| Panel Admin | 7001 | Solo Matriz |
| POS (Next.js) | 3000 | Cajas 1 y 2 |
| PostgreSQL | 5432 | Solo interno |
| Redis | 6379 | Solo interno |
| n8n | 5678 | Solo Matriz |

El firewall de Windows debe permitir los puertos 9000 y 3000 en la red
local para que las cajas puedan conectarse. Claude Code configura esto
durante la instalación.

---

## FASES DE CONSTRUCCIÓN

No te saltes fases. Cada fase debe estar funcionando antes de empezar la siguiente.

### FASE 0 — Fundación (objetivo: infraestructura corriendo en red local)

**Qué hacer:**
1. Verificar e instalar dependencias faltantes en la Matriz
   (Node.js v20, Yarn, Git, PostgreSQL, Redis)
2. Instalar Mercur con `mercur-cli install` en la Matriz
3. Verificar que el panel de admin corre en localhost en la Matriz
4. Configurar Redis para Windows (WSL o instalador nativo)
5. Configurar PM2 o NSSM para que MedusaJS y n8n arranquen con Windows
6. Abrir los puertos 9000 y 3000 en el firewall de Windows
7. Verificar que una de las cajas puede acceder al panel desde su
   navegador escribiendo la IP de la Matriz
8. Crear repositorio privado en GitHub y hacer el primer commit

**Cómo saber que esta fase está completa:**
Desde cualquiera de las dos cajas, abriendo Chrome y escribiendo
`http://[IP-de-la-Matriz]:7001`, se ve el panel de administrador
de Mercur. Las tres computadoras están en la misma red y se hablan.

**Nota sobre Redis en Windows:**
Redis no tiene instalador oficial para Windows. Las opciones son:
a) Usar WSL2 (Windows Subsystem for Linux) — recomendado
b) Usar la versión de Memurai (compatible con Redis, tiene versión gratuita)
c) Usar un contenedor Docker
Claude Code debe detectar cuál es viable según el entorno y proponer
la opción más simple. Preguntar al dueño antes de elegir.

**Prompt para esta fase:**
```
ultrathink: Estoy en la Fase 0 del proyecto Ferremex. El objetivo es
tener Mercur corriendo en la Computadora Matriz (Windows 11, i5-12400F,
16GB RAM) y que las dos cajas puedan acceder desde su navegador por
la red WiFi local. Revisa la auditoría del entorno, identifica qué
falta instalar, y guíame paso a paso. Prioridad: que funcione en red
local sin depender de internet para las ventas del mostrador.
```

### FASE 1 — Catálogo de productos (objetivo: productos reales en el sistema)

**Qué hacer:**
1. Configurar categorías de Ferremex (basadas en las de Sicar)
2. Configurar unidades de medida (pieza, metro, kilo, rollo, litro, etc.)
3. Configurar las 4 listas de precios (menudeo, mayoreo, precio3, precio4)
4. Crear script de importación desde Excel/CSV exportado de Sicar
5. Migrar catálogo de artículos con variantes
6. Verificar que los precios y variantes quedaron correctos

**Cómo saber que esta fase está completa:**
El dueño puede buscar cualquier producto de Ferremex en el panel de admin
y ver sus variantes, precios y stock.

### FASE 2 — POS de mostrador (objetivo: hacer una venta real en las cajas)

**Qué hacer:**
1. Construir la interfaz POS accesible desde el navegador
2. Búsqueda por código de barras (lector USB) y texto
3. Carrito con cantidades y precios
4. Cobro en efectivo (con cambio) y tarjeta
5. Impresión de ticket en impresora térmica de cada caja
6. Corte de caja al final del turno por cajero
7. Sistema de sesiones: cada caja tiene su cajero asignado con su propio
   corte — Caja 1 y Caja 2 son independientes en reportes de caja
8. ⚠ Generación de CFDI — EXCLUIDA de esta fase hasta decidir el PAC

**Nota sobre las dos cajas:**
Ambas cajas usan exactamente la misma interfaz POS. La diferencia es
que cada cajero inicia sesión con su usuario y eso determina a qué
caja pertenece su corte. No hay que instalar nada diferente en cada
computadora de caja — solo abrir el navegador y entrar a la URL del POS.

**Nota sobre impresión:**
Cada caja tiene su propia impresora de tickets conectada localmente.
La impresión se hace desde el navegador usando la impresora local
de cada computadora. No se imprime "en remoto" — cada caja imprime
en su propia impresora.

**Nota sobre CFDI en esta fase:**
El POS genera tickets y notas de venta sin problema.
La integración con el PAC se agrega en sub-fase posterior.
El sistema debe diseñarse para que el CFDI sea un módulo enchufable.

**Cómo saber que esta fase está completa:**
El cajero puede procesar una venta completa — buscar el producto, cobrar
en efectivo o tarjeta, imprimir el ticket — sin tocar Sicar. La factura
CFDI se agrega después, en la siguiente sub-fase.

### FASE 3 — Compras y XML (objetivo: inventario automático)

**Qué hacer:**
1. Workflow n8n para procesar XML de facturas de proveedor
2. Tabla de mapeo de claves proveedor ↔ claves Ferremex
3. Módulo de registro de compras en el panel admin
4. Actualización automática de stock al recibir compra
5. Alertas de productos no encontrados en el catálogo

**Cómo saber que esta fase está completa:**
El dueño manda un XML de proveedor por correo y el inventario se actualiza
solo en menos de 2 minutos.

### FASE 4 — Créditos y clientes (objetivo: clientes de crédito migrados)

**Qué hacer:**
1. Migrar catálogo de clientes desde Sicar
2. Configurar límites de crédito y días de plazo
3. Módulo de cuentas por cobrar
4. Registro de abonos
5. Alertas de cartera vencida

### FASE 5 — Monedero, comisiones y reportes (objetivo: apagar Sicar)

**Qué hacer:**
1. Módulo de monedero electrónico
2. Registro de ventas por empleado
3. Cálculo de comisiones
4. Reportes para el contador
5. Dashboard de estadísticas

**Cuando esta fase esté completa, Sicar se puede apagar.**

---

## REGLAS DE TRABAJO — IRROMPIBLES

Estas reglas aplican en todas las sesiones, sin excepción.

**Nunca ejecutes sin plan aprobado.**
Antes de modificar cualquier archivo, crear cualquier tabla, o instalar
cualquier dependencia, presenta el plan y espera un "sí" explícito.

**Una sola cosa a la vez.**
No hagas la fase 2 mientras la fase 1 no funciona. No combines dos módulos
en un mismo plan. Si la tarea toca más de 7 archivos, divídela.

**Explica en español sin tecnicismos.**
Cuando presentes opciones, usa analogías del mundo real. "La base de datos
es como el archivero donde guardas todo" es mejor que "el ORM genera las
migraciones del schema relacional".

**Nunca hardcodees credenciales.**
API keys, contraseñas, conexiones a base de datos: siempre en variables
de entorno, nunca en el código. Si encuentras una credencial en el código,
corrígela antes de continuar con cualquier otra cosa.

**Nunca TypeScript any.**
Si el tipo no está claro, usa `unknown` y valida con Zod. Esto previene
errores silenciosos que en producción son difíciles de rastrear.

**Siempre tener modo offline en el POS.**
El mostrador no puede dejar de funcionar si se cae internet. El POS debe
poder procesar ventas en local y sincronizar cuando regrese la conexión.

**Git antes de cambios grandes.**
Antes de cualquier cambio que afecte más de 3 archivos, verificar que hay
un commit limpio reciente. Si no hay, hacer commit primero.

**Windows primero, red local segundo.**
El servidor y el POS corren en Windows en red local. Los comandos de
terminal, rutas de archivos, configuraciones de firewall y arranque
automático deben funcionar en Windows 11. Redis no tiene instalador
oficial para Windows — siempre preguntar qué opción usar (WSL2,
Memurai o Docker) antes de instalarlo. Los puertos 9000 y 3000 deben
estar abiertos en el firewall para la red local.

---

## CONTEXTO TÉCNICO DE MERCUR 2.0

Mercur 2.0 fue rediseñado para ser nativo con agentes de IA. Esto es importante
porque significa que puedes trabajar con él de forma más confiable que con
otros proyectos:

- Cada proyecto creado con `mercur create` incluye un `AGENTS.md` que te da
  contexto inmediato del proyecto
- El CLI `mercurjs` permite agregar bloques de funcionalidad con un comando:
  `mercurjs add reviews`, `mercurjs add wishlist`, etc.
- Hay un servidor MCP en `docs.mercurjs.com/mcp` que puedes conectar para
  búsqueda en documentación
- Los tipos de TypeScript están compartidos entre servidor y cliente, así que
  puedes generar integraciones correctas sin adivinar

Cuando trabajes en el backend de Mercur, usa `mercurjs codegen` después de
cambios en la API para regenerar los tipos del cliente.

---

## MAPEO SICAR → MEDUSAJS (referencia rápida)

| Concepto Sicar | Equivalente MedusaJS | Estado |
|---------------|---------------------|--------|
| Artículo | Product + Variants | NATIVO |
| Precio 1-4 | Price Lists | NATIVO |
| Categoría | Product Category | NATIVO |
| Unidad de medida | Variant metadata | CONFIGURAR |
| Clave SAT | Product metadata | CONFIGURAR |
| Cliente | Customer | NATIVO |
| Grupo de cliente | Customer Group | NATIVO |
| Límite de crédito | Customer metadata | CONSTRUIR |
| Venta | Order | NATIVO |
| Cotización | Draft Order | NATIVO |
| Nota de crédito | Return + Refund | NATIVO |
| Promoción | Promotion | NATIVO |
| Paquete/kit | Product Bundle | NATIVO |
| Proveedor | Vendor (Mercur) | NATIVO |
| Compra/entrada | — | CONSTRUIR |
| Corte de caja | — | CONSTRUIR |
| POS mostrador | — | CONSTRUIR |
| Monedero electrónico | — | CONSTRUIR |
| Comisión empleado | — | CONSTRUIR |
| Factura CFDI | Facturama o Facturapi (por decidir) | ⚠ PENDIENTE |
| Factura global día | n8n workflow | ⚠ PENDIENTE |

---

## PREGUNTAS ABIERTAS (resolver antes de construir cada módulo)

Estas preguntas están pendientes de respuesta del dueño. Antes de construir
el módulo relacionado, pregunta y documenta la respuesta aquí.

- [ ] ¿Cuántas categorías de productos tiene Sicar actualmente?
- [ ] ¿Tiene códigos de barras en todos sus productos o solo en algunos?
- [ ] ¿El monedero de Sicar ya está activo con clientes, o es nuevo?
- [ ] ¿El crédito es frecuente o solo para 2-3 clientes específicos?
- [ ] ¿Cuántos empleados/cajeros usan el sistema actualmente?
- [ ] ¿Las comisiones se calculan sobre ventas brutas o sobre utilidad?
- [ ] ¿Tiene los archivos .cer y .key del SAT localizados? (para cuando se configure el PAC)
- [ ] ¿Cuántas facturas individuales solicitan los clientes al mes aproximadamente? (para decidir entre Facturama y Facturapi)
- [ ] ¿El disco de la Computadora Matriz es SSD o HDD?
- [ ] ¿Cuál es la IP local de la Matriz? (correr `ipconfig` en CMD)
- [ ] ¿Las dos cajas tienen Windows también? ¿Qué versión?
- [ ] ¿Qué impresoras de tickets tienen las cajas? (marca/modelo)
- [ ] ¿El lector de código de barras de cada caja es USB o inalámbrico?
- [ ] ¿Qué formato exporta Sicar para los artículos? (Excel, CSV)
- [ ] ¿En qué correo llegan las facturas XML de proveedores?

---

## CÓMO MANEJAR ERRORES

Si algo falla durante la instalación o configuración:

1. Muestra el mensaje de error completo, sin resumirlo
2. Explica en una línea qué significa ese error para alguien no técnico
3. Presenta la solución más probable primero
4. Si no funciona, presenta la siguiente opción
5. Nunca digas "debería funcionar" sin haberlo verificado

En Windows, los errores más comunes son:
- PostgreSQL no está en el PATH → dar instrucción de cómo agregarlo
- Puerto 5432 ocupado → verificar con `netstat -ano | findstr 5432`
- Puerto 9000 o 3000 bloqueado por firewall → abrir en Windows Defender
- Las cajas no pueden conectarse → verificar IP de la Matriz con `ipconfig`
- Redis no instala → preguntar qué opción prefiere (WSL2, Memurai, Docker)
- Permisos de carpeta → sugerir correr terminal como administrador
- yarn no reconocido → verificar con `npm install -g yarn` de nuevo
- PM2 no arranca con Windows → configurar como tarea programada o NSSM

---

## CÓMO TERMINAR CADA SESIÓN

Al final de cada sesión de trabajo, antes de cerrar:

1. Haz commit de todo lo que funcionó con un mensaje descriptivo
2. Actualiza este archivo CLAUDE.md si hay decisiones nuevas que documentar
3. Presenta un resumen de qué quedó funcionando y qué falta
4. Anota la siguiente acción concreta para la próxima sesión

Formato del resumen:

```
RESUMEN DE SESIÓN
─────────────────
✓ Completado hoy:
  - [cosa que quedó funcionando]
  
⚠ Pendiente:
  - [cosa que quedó a medias]
  
→ Próxima sesión:
  - [primera acción concreta a hacer]
```

---

*Versión 1.2 — Arquitectura cambiada de nube a servidor local en red*
*Computadora Matriz: ASUS, i5-12400F, 16GB RAM, Windows 11 Home*
*Topología: 1 servidor (Matriz) + 2 terminales POS (Cajas) por WiFi local*
*Railway y Vercel eliminados — todo corre en la Matriz*
*Redis en Windows marcado como pendiente de decidir método de instalación*
*Actualizar con cada decisión de arquitectura importante*
