# 📖 LÉEME PRIMERO — Cómo entender y trabajar el proyecto Ferremex

> **¿Eres nuevo en este proyecto?** Empieza aquí. Este archivo te explica, en lenguaje sencillo,
> qué es Ferremex, qué hace cada documento importante, y —lo más útil— **cómo pedirle a Claude Code
> que te explique cualquier cosa** sin necesidad de saber programar.
>
> No necesitas leer todo el proyecto. Necesitas saber **a quién preguntar y qué preguntar**. Eso es esto.

---

## 1. ¿Qué es Ferremex?

Ferremex es el sistema de cómputo de una ferretería en Tlaxiaco, Oaxaca. Tiene dos grandes partes:

1. **La tienda en línea / administración** (basada en una plataforma llamada *Medusa + Mercur*).
2. **El Punto de Venta (POS)** — la pantalla de caja que usan los empleados para vender, cobrar,
   imprimir tickets, manejar clientes a crédito, inventario, etc. **Esta es la parte en construcción activa.**

Todo corre en una computadora con Windows y se conecta a las cajas de la tienda por la red local.

---

## 2. ¿Qué es "Claude Code" y cómo me ayuda?

**Claude Code** es un asistente de inteligencia artificial (como un chat) que **vive dentro del proyecto**
y puede leer todos los archivos, entender el código y modificarlo por ti. Tú le hablas en español normal,
y él hace el trabajo técnico.

Lo importante: **Claude ya tiene un "manual interno" del proyecto** (los archivos que se explican abajo).
Cuando le pides algo, él los lee solo. Tú no tienes que abrirlos. Solo tienes que saber **qué pedirle**.

> 💡 Piensa en Claude como un empleado nuevo muy capaz que ya estudió toda la documentación.
> Tu trabajo no es estudiarla tú — es decirle qué quieres lograr.

---

## 3. Los documentos del proyecto, explicados en simple

El proyecto tiene varios archivos `.md` (documentos de texto). **No tienes que leerlos** — Claude lo hace.
Pero aquí está qué contiene cada uno, por si quieres curiosear o saber dónde está cada cosa:

### 📌 Los que Claude lee al empezar cada sesión

| Archivo | ¿Qué contiene? | ¿Para qué sirve? |
|---|---|---|
| **`CLAUDE.md`** | Las reglas técnicas obligatorias del proyecto. | Es el "reglamento" de Claude. Define cómo debe escribir el código para no romper nada. |
| **`.claude/FERREMEX-STATE.md`** | El estado actual: en qué se está trabajando, qué falta, qué problemas hay pendientes. | Es la "bitácora viva". Si quieres saber *en qué punto va el proyecto*, esto lo dice. |
| **`.claude/FERREMEX-MODULES.md`** | La lista de todas las pantallas/funciones del POS y cómo se conectan entre sí. | Es el "mapa del sistema". Dice qué módulos existen (ventas, clientes, inventario…) y cuáles aún no están conectados. |
| **`.claude/FERREMEX-PREFERENCES.md`** | Cómo está hecho el código (los "patrones" que se repiten). | Sirve para que las cosas nuevas se parezcan a las que ya existen y todo sea consistente. |
| **`.claude/FERREMEX-SCHEMA.md`** | Dónde y cómo se guardan los datos (productos, ventas, clientes…). | El "mapa de la información": qué se guarda en la base de datos, qué en archivos, qué en el navegador. |

### 📌 Documentos de contexto y negocio

| Archivo | ¿Qué contiene? |
|---|---|
| **`MEMORIA_INSTALACIÓN.md`** | El estado de instalación por fases, contraseñas, direcciones de acceso, servicios corriendo. Se actualiza solo. |
| **`CLAUDE CONTEXTO FERREMEX.md`** | El contexto del negocio y las reglas de automatización (correos, facturas). |
| **`ACCESO_REMOTO.md`** | Cómo entrar al sistema desde fuera de la tienda. |
| **`README.md` / `MERCUR_INS.md` / `AGENTS.md`** | Documentación técnica de la plataforma base (Medusa/Mercur). |

### 📌 Documentos del "harness" (la caja de herramientas de Claude)

| Archivo | ¿Qué contiene? |
|---|---|
| **`.claude/HARNESS-SUMMARY.md`** | Resumen de cómo está organizado todo el sistema de ayuda de Claude. |
| **`.claude/ECC-SELECTION.md`** | Notas técnicas de por qué se eligió esta organización. (Opcional, muy técnico.) |
| **`.claude/agents/`** | "Especialistas" de Claude: uno planifica, otro revisa código, otro arregla errores. Claude los usa solo. |
| **`.claude/contexts/`** | Tres "modos de trabajo" de Claude: desarrollar, investigar, revisar. |
| **`.claude/hooks/`** | Programitas que hacen que Claude **recuerde lo que se hizo en la sesión anterior**. |
| **`.claude/sessions/`** | Donde se guardan esos recuerdos de sesión (se genera solo). |

> **En resumen:** los que más te importan son **FERREMEX-STATE** (qué va), **FERREMEX-MODULES** (qué hay)
> y **CLAUDE.md** (las reglas). El resto es maquinaria que trabaja sola.

---

## 4. 🗣️ Cómo pedirle cosas a Claude (lo más importante)

No necesitas términos técnicos. Habla normal. Aquí tienes frases listas para copiar y pegar:

### Para entender el proyecto (empieza por aquí)
```
Explícame en lenguaje sencillo qué es este proyecto y en qué punto va.
Lee .claude/FERREMEX-STATE.md y .claude/FERREMEX-MODULES.md primero.
```
```
¿Qué módulos del punto de venta ya están hechos y cuáles faltan? Resúmelo en una lista simple.
```
```
Hazme un recorrido por el proyecto como si yo nunca lo hubiera visto. Sin tecnicismos.
```

### Para entender una parte específica
```
Explícame cómo funciona la pantalla de ventas (cómo se busca un producto, se cobra y se imprime el ticket).
```
```
¿Dónde se guardan los datos de los clientes y de la cartera de crédito? ¿Es seguro?
```
```
¿Qué pasa cuando un cliente compra a crédito? Explícame el flujo paso a paso.
```

### Para construir o cambiar algo
```
Quiero agregar [lo que sea, ej: un reporte de ventas por día]. Antes de programar nada,
hazme un plan sencillo y explícame qué vas a tocar.
```
```
Antes de empezar, usa el agente "planner" para planear esto.
```
```
Revisa el código que acabas de escribir con el agente "code-reviewer" para asegurarte de que está bien.
```

### Para arreglar problemas
```
Algo dejó de funcionar en [la pantalla X]. Investiga qué pasó y explícamelo antes de arreglarlo.
```
```
El sistema no arranca / da error. Ayúdame a diagnosticar qué pasó.
```

### Reglas de oro al pedir
- **Pide siempre que te explique antes de hacer cambios grandes** ("hazme un plan primero").
- **Pide explicaciones "en lenguaje sencillo" o "sin tecnicismos"** si algo no se entiende.
- Si Claude va a tocar algo importante (clientes, ventas, precios), **te avisará y preguntará** antes de seguir. Eso es a propósito.
- Si no sabes cómo se llama algo, **descríbelo** ("la pantalla donde se cobra", "la lista de productos").

---

## 5. ¿Por dónde empiezo si soy nuevo?

1. Lee este archivo (ya lo estás haciendo ✅).
2. Abre Claude Code en el proyecto.
3. Copia y pega esta frase:
   > *"Soy nuevo en este proyecto. Léete `.claude/FERREMEX-STATE.md` y `.claude/FERREMEX-MODULES.md` y explícame en lenguaje sencillo qué es Ferremex, qué partes ya funcionan y qué falta por hacer."*
4. A partir de ahí, pídele lo que necesites con tus propias palabras.

---

## 6. Preguntas frecuentes

**¿Tengo que saber programar?**
No para entender el proyecto ni para pedir cambios. Claude hace la parte técnica. Tú diriges.

**¿Puedo romper algo preguntando?**
No. Preguntar y pedir explicaciones nunca cambia nada. Solo se modifican archivos cuando Claude
edita código, y para cambios importantes te pedirá confirmación.

**¿Cómo sé en qué quedó la última sesión?**
Claude lo recuerda automáticamente al empezar (gracias a los "hooks"). También puedes preguntar:
*"¿En qué quedamos la última vez?"* o leer `.claude/FERREMEX-STATE.md`.

**¿Dónde está la contraseña / la dirección para entrar al sistema?**
En `MEMORIA_INSTALACIÓN.md` (sección de credenciales y accesos).

**¿Quién mantiene actualizada la documentación?**
Claude. Al terminar una sesión actualiza `FERREMEX-STATE.md`, y un proceso automático mantiene
`MEMORIA_INSTALACIÓN.md`. Puedes pedirle: *"actualiza el estado del proyecto antes de cerrar"*.

---

> **Una última idea:** este proyecto está hecho para que **cualquier persona con acceso pueda entenderlo
> preguntándole a Claude**. No hay conocimiento "escondido" en la cabeza de una sola persona. Si tienes una
> duda, la respuesta correcta casi siempre es: *pregúntale a Claude, y pídele que te lo explique simple.*
