# CLAUDE.md

Instrucciones para trabajar en este repositorio. Léelo completo antes de tocar código.

## Qué es esto

Cotizador de habitaciones para la cadena de hoteles Hesperia (Venezuela). Es un **sitio
estático**: HTML, CSS y JavaScript servidos por GitHub Pages, sin servidor ni base de
datos. Una asesora abre el enlace, arma la cotización y copia un mensaje ya formateado
para pegar en WhatsApp.

El catálogo —tarifas, temporadas, políticas— vive en archivos JSON versionados en Git.
Cambiar un precio es un commit, no una llamada al programador. Eso condiciona casi todas
las decisiones técnicas que verás.

Hasta septiembre de 2026 corría sobre Google Apps Script con el catálogo en un Google
Sheet. Si algo te parece raro, revisa el historial: la razón suele estar ahí.

## Estructura

```
index.html       El cotizador. Una sola página.
admin.html       La administración del catálogo. Solo escritorio.
assets/          tokens.css (sistema visual), estilos.css, admin.css,
                 motor.js, catalogo.js, validador.js, logica.js, admin.js
datos/           El catálogo, en doce archivos JSON. Es la base de datos.
verificacion/    Arneses de prueba en Node. NO se publican.
mejoras/         Auditoría de diseño y las tres direcciones que salieron de ella.
                 Es registro, no pendientes: ya está ejecutado lo que se eligió.
docs/            Guías de instalación y de estilo.
.agents/skills/  Skills de diseño instalados. Ver "Agentes y skills".
.claude/agents/  Agentes de Impeccable.
README.md        Documentación funcional completa.
HANDOFF.md       Estado del proyecto y plan de trabajo.
```

### Los archivos de `assets/`

| Archivo | Rol |
|---|---|
| `motor.js` | **Motor de cálculo y render.** Ninguna otra pieza calcula precios |
| `catalogo.js` | Descarga los JSON de `datos/` → objeto `catalogo`. Normalizadores defensivos |
| `validador.js` | Chequeos de integridad del catálogo. Devuelve hallazgos, no los muestra |
| `logica.js` | Estado de la interfaz, cascada de habitación, cálculo en vivo, copiado |
| `admin.js` | Pantalla de administración: edición del catálogo y publicación |
| `tokens.css` | **El sistema visual.** Entregable del diseño, tal cual. Se consume, no se edita a la ligera |
| `estilos.css` | CSS del cotizador. Consume `tokens.css` |
| `admin.css` | Lo propio de la administración |

### Los archivos de `datos/`

`config.json` (objeto clave→valor) y once arreglos de objetos: `hoteles`,
`habitaciones`, `temporadas`, `tarifas`, `adicionales`, `stop-sales`, `politica-ninos`,
`promociones`, `cargos-fecha`, `extras`, `plantillas`, `asesoras`.

Dos claves de `config.json` no son datos de negocio sino de publicación:
`REPO_GITHUB` y `RAMA_GITHUB`, que la administración usa para saber dónde escribir.

`plantillas.json` lleva `{hotel, asesor, plantilla}`: cada asesor puede tener su propio
juego de mensajes y quien no tenga uno cae al del hotel (`asesor` vacío). El mensaje sale
firmado con iniciales, así que que lo firme uno y suene a otro es raro para el cliente
que ya habló con él.

`nombre_corto` de `hoteles.json` es **solo para la interfaz** —los botones, el chip de la
cabecera, los selectores de administración—. El mensaje al cliente usa `nombre`. Por eso
`nombre_corto` puede acortarse sin consultar a nadie: es lo que permite que los cinco
hoteles quepan en una fila.

Las claves de cada objeto son las columnas del Sheet original. `catalogo.js` los lee por
nombre, así que el orden no importa, pero **el nombre sí es parte del contrato**.

## Comandos

```bash
cd verificacion
npm install                 # solo la primera vez (jsdom)
npm test                    # las cuatro suites
npm run versionar           # sella los assets antes de comitear
```

Deben terminar en `FALLAN: 0` y `Sin errores de ejecucion`. Son cuatro: el motor
(`_verificar.js`), el cotizador (`_verificar_spa.js`), la administración
(`_verificar_admin.js`) y la publicación a GitHub (`_verificar_publicar.js`, contra un
GitHub de mentira).

**Corre las suites antes y después de cualquier cambio al motor.** No es opcional:
es lo único que separa un refactor seguro de un error de precio en producción.

### Antes de comitear: sellar los assets

```
cd verificacion && npm run versionar
```

GitHub Pages sirve el CSS y el JS con caché, así que sin esto una asesora puede seguir
con la versión vieja después de publicar. El script pone `?v=<fecha>` en los assets de
las dos pantallas. Los JSON de `datos/` no van ahí: los pide `fetch()` y `catalogo.js`
ya les pone su propio anticaché.

Los arneses leen `assets/` y `datos/` reales, los mismos archivos que descarga el
navegador. Lo que pasa en las pruebas es lo que va a pasar en producción — salvo lo que
depende del dispositivo, que sigue necesitando un celular de verdad.

## Publicar el catálogo

La pantalla de administración publica a GitHub por su cuenta: se corrige la tarifa, se
pulsa **Publicar**, se elige quién publica y se pega la clave. En un par de minutos
Pages sirve el cambio. La asesora no ve un `.json` en ningún momento.

Cuatro cosas de ese camino no son negociables:

- **Un solo commit.** Se usa la API de datos de Git (blob → árbol → commit →
  referencia), no la de contenidos. La de contenidos solo sabe hacer un archivo por
  commit, y si `tarifas.json` entra y `plantillas.json` falla el catálogo queda a
  medias. O entra todo o no entra nada.
- **Sin `force`.** Si alguien movió la rama mientras tanto, GitHub rechaza y se avisa,
  antes que pisar el cambio de otro.
- **La clave se pide cada vez y no se guarda.** Ni en `localStorage` ni en ningún sitio:
  la pantalla vive en una URL pública y una credencial guardada en el navegador
  sobrevive a la persona que la escribió. Es una decisión, no un pendiente.
- **La descarga se queda.** Si GitHub no responde o la clave caducó, se descargan los
  archivos y se suben a mano. Nunca se puede quedar sin poder cambiar una tarifa con un
  cliente esperando.

La clave es un *fine-grained token* con `Contents: read and write` sobre un solo
repositorio y nada más. El repositorio y la rama son dato, no código:
`REPO_GITHUB` y `RAMA_GITHUB` en `datos/config.json`.

## El sistema visual manda

`assets/tokens.css` es el entregable del sistema visual y **es la única fuente** de la
tipografía, los espacios y el color. En la práctica eso significa:

- Los papeles que el sistema nombra usan su clase (`.t-seccion`, `.t-campo`, `.t-pista`,
  `.t-precio`, `.t-total`, `.t-titulo-tarjeta`). No se repiten sus medidas en
  `estilos.css`.
- Los controles de formulario llevan `font: inherit`, así que la clase va en la etiqueta
  que los envuelve y manda sobre el control. No se declara la fuente control por
  control.
- Los espacios salen de `--e1`…`--e6`. Lo que no cae en la escala se lleva al escalón
  más cercano; no se le agrega un escalón a la escala. Se salvan dos cosas que no son
  ritmo: los despejes de ancho conocido (el hueco de la flecha del desplegable) y los
  márgenes negativos que centran un dibujo respecto a su caja.
- Nunca menos de 16px en un campo de móvil: por debajo, iOS hace zoom al enfocar.

Lo único que `estilos.css` le añade al sistema es la pila de respaldo de cada fuente:
`tokens.css` las nombra a secas y si no cargan el navegador caería a su serif.

## Dos trampas de CSS que ya costaron caro

Las dos son el mismo error y va a volver a pasar:

1. `.solo-pc` declaraba `display: none`, pero `.btn-cabecera` declara
   `display: inline-flex` más abajo con la misma especificidad y ganaba por orden. Los
   botones de escritorio salían en el teléfono.
2. El botón de colapsar el mini se escondía con el atributo `hidden`, pero eso es una
   regla del navegador y `.calc-btn-ventana { display: grid }` le ganaba. El botón
   aparecía dentro de la ventana flotante, donde no hace nada.

**Una utilidad que esconde tiene que ganar siempre.** Por eso hoy
`[hidden] { display: none !important }` y `.solo-pc` esconde con `!important` dentro de
su media query, y al mostrar no reasigna `display`: cada pieza conserva el suyo.

Y una de JS del mismo tipo: había dos `esMovil()`, uno de ancho y uno de táctil, y el
izado de funciones dejaba ganar al de abajo. El del ancho ahora se llama
`anchoDeMovil()` y pregunta por la media query, para que el JS y el CSS no puedan
discrepar.

## Agentes y skills de diseño

El proyecto tiene cuatro skills de diseño instalados en `.agents/skills/` y cuatro
agentes de Impeccable en `.claude/agents/`. **No se usan solos: hay que invocarlos.**

Los cuatro skills se solapan a propósito y no dicen lo mismo. Elegir el que toca importa
más que usarlos todos.

| Skill | Para qué sirve de verdad | Cuándo NO |
|---|---|---|
| `impeccable` | El más completo. Auditar, criticar, pulir, endurecer, animar, extraer sistema. 37 referencias en `reference/` y scripts en `scripts/`. Empieza por `SKILL.md` y `reference/routing.md` | Tareas que no son de interfaz |
| `emil-design-eng` | La filosofía de Emil Kowalski: pulido, animación, los detalles invisibles. Es el que da valores concretos de timing y easing | Decisiones de estructura o de contenido |
| `design-taste-frontend` | Anti-plantilla. Infiere la dirección de diseño y evita que algo parezca hecho por defecto | **Está pensado para landings y portafolios**, no para herramientas de trabajo. Aquí sirve su criterio, no sus recetas |
| `redesign-existing-projects` | Auditar lo que ya existe y subirlo de nivel sin reescribirlo. Audita primero, arregla después | Empezar de cero |

Los agentes de Impeccable (`.claude/agents/`) son subagentes con su propio contrato:

| Agente | Qué hace |
|---|---|
| `impeccable-finish-reviewer` | Revisa un trabajo terminado con ojos frescos y devuelve arreglos ordenados. **No edita** |
| `impeccable-documenter` | Escribe el sistema de diseño a partir de lo construido, no de lo planeado |
| `impeccable-asset-producer` | Produce recursos gráficos desde una maqueta aprobada. No redirige el diseño |
| `impeccable-manual-edit-applier` | Aplica lotes de ediciones manuales al código fuente |

### Cómo usarlos aquí

- **Antes de tocar la interfaz:** audita con `impeccable` (`reference/audit.md`) o con
  `redesign-existing-projects`. Los dos piden diagnóstico antes que cambio, que es la
  regla de esta casa.
- **Para microinteracciones** —el bucle de fecha → precio → ajuste → copiar, que es lo
  que más se usa— `emil-design-eng` es el que da números en vez de adjetivos.
- **Al terminar un cambio grande de interfaz**, pásalo por `impeccable-finish-reviewer`.
- Los cuatro son de **diseño**. El motor, el catálogo y el validador no son su terreno:
  ahí manda `verificacion/`.

### Lo que ningún skill puede decidir por ti

`tokens.css` es el entregable del sistema visual que definió **la propia asesora** con
Claude Design. Los acentos por hotel, el botón principal en tinta y la separación
`--acento` / `--acento-texto` son decisiones suyas con motivo escrito, no accidentes que
un skill deba "corregir". Si una auditoría propone cambiarlas, se pregunta antes.

## Invariantes de arquitectura

No los cambies sin una razón explícita y sin decirlo. Cada uno existe por un bug real.

1. **Cero lógica de negocio en el código.** Ni un precio, ni un nombre de hotel, ni una
   política. Todo vive en `datos/`. Agregar un hotel, categoría o temporada debe ser
   **solo filas en un JSON**. Si tu cambio necesita un `if (hotel === 'HBK')`, el modelo
   de datos falló: arréglalo ahí, no en el código.

2. **Una sola implementación del cálculo.** Está en `motor.js` y en ningún otro lado. No
   dupliques reglas de precio en `logica.js` ni en la pantalla de administración.
   `motor.js` no toca el DOM ni sabe de dónde salieron los datos: por eso se puede probar
   en Node sin navegador.

3. **Fechas como texto ISO `YYYY-MM-DD`.** Se comparan como strings (en ISO,
   lexicográfico = cronológico). **Un solo punto del código toca `Date`:
   `Fechas.sumarDias()`.** Si escribes `new Date()` en el motor, casi seguro estás
   introduciendo un bug de zona horaria.

   Corolario: `catalogo.js` **rechaza** cualquier fecha que no sea ISO. Es deliberado —
   ver el bug de los cierres de venta más abajo.

4. **Nunca un `0` ni un `NaN` silencioso.** Una noche sin tarifa devuelve un error
   explícito con la fecha (`"Sin tarifa cargada para 15/06/27"`) y bloquea la cotización.
   Un dato corrupto rompe la carga con un mensaje claro en vez de cotizar mal.

5. **El cálculo corre en el navegador, con el catálogo completo en memoria.** La asesora
   ajusta fechas y edades docenas de veces por cotización; cualquier ida y vuelta por
   cambio haría la app inusable. Los diez JSON pesan poco: se cargan una vez al arrancar.

6. **Ninguna tarifa lleva impuestos encima.** El precio cargado es el precio final, en
   todos los hoteles, y el mensaje no menciona impuestos. El modo `POR_HABITACION` de los
   hoteles de ciudad cambia *cómo* se multiplica la tarifa, no qué se le suma.

## Convenciones de código

- **`motor.js` y `catalogo.js` son ES5.** `var`, `function`, sin arrow functions, sin
  `const`/`let`, sin template literals. Son los archivos que menos deben cambiar y los que
  más lejos llegan: corren en los arneses de Node, en el navegador y en celulares viejos.
- **`verificacion/` es Node moderno.** Ahí sí `const`, arrow functions, `async/await`.
- En `logica.js` y en lo nuevo puedes usar JS moderno, pero **prueba en un celular real**
  antes de dar por buena cualquier sintaxis reciente.
- **Comentarios en español sin acentos dentro del código.** Los strings de cara al usuario
  sí llevan acentos y emojis (con escapes `\uXXXX` para los emojis).
- **Comenta el *por qué*, no el *qué*.** Los comentarios valiosos de este repo explican
  qué bug motivó una línea rara. Consérvalos.
- El código y la interfaz están en español. Mantenlo.

## Bugs ya resueltos — no los reintroduzcas

Aparecieron en producción, no en las pruebas. Si "simplificas" alguno, vuelven.

1. **Una coma convertida en punto decimal.** Google Sheets interpretaba `"5,6"` como el
   número `5.6` y el filtro de días de la semana quedaba roto **en silencio**: la
   promoción no se aplicaba y el total salía mal sin ningún error.
   → Ya no hay Sheets, pero `parseDias()` sigue siendo tolerante porque ahora quien puede
   escribir `5.6` a mano es la persona que edita el catálogo.

2. **Fechas fuera de formato en los cierres de venta.** El único stop sale cargado tenía
   `18/09/26` en vez de `2026-09-18`. Como las fechas se comparan como texto,
   `'20/09/26' >= '2026-09-19'` da `false`: el cierre **no bloqueaba nada y no avisaba**.
   → `catalogo.js` rechaza toda fecha que no sea ISO. **No lo hagas tolerante otra vez:**
   la tolerancia es justo lo que escondió el error durante meses.

3. **`matchMedia` no existe en algunos WebViews** (WhatsApp en Android antiguo). Rompía
   `esMovil()`, que se llama **dentro del último recurso de copiado** — la asesora quedaba
   sin ninguna forma de copiar.
   → `esMovil()` prueba tres alternativas con `try/catch` y nunca lanza. `copiarNivel3()`
   abre el modal y carga el texto *antes* de cualquier paso decorativo.

4. **Los selectores nativos de Android tratan `min` como exclusivo.** Con `min = entrada+1`
   era imposible cotizar una sola noche desde el celular.
   → El `min` del campo de salida es la **fecha de entrada**, no entrada+1. El orden lo
   valida el motor, que ya devuelve un mensaje claro.

5. **Un segundo atributo `class` en la misma etiqueta.** Al aplicar las clases del
   sistema quedó `<h3 class="t-titulo-tarjeta" id="calcTitulo" class="calc-titulo">`. Eso
   no da error en ningún sitio: el navegador se queda con el primero y tira el segundo en
   silencio, así que `.calc-titulo` dejó de existir y el título del mini quedó en azul
   oscuro sobre azul oscuro.
   → Hay un chequeo que lo busca **en el archivo**, no en el DOM: en el DOM no queda
   rastro de lo que se perdió. Nunca hagas un reemplazo de marcado que pueda añadir un
   `class` a una etiqueta que ya tiene uno.

6. **Un control escondido que empuja a otro fuera de la ventana.** Plegado, el mini pedía
   encogerse a 240 de ancho pero Chrome no baja de unos 350. A esa medida el título se
   partía en dos líneas y expulsaba el botón de volver a abrir: quedaba plegado y sin
   salida salvo cerrarlo del todo.
   → En una cabecera que puede encogerse, **los controles no se encogen nunca y los
   rótulos sí**. Un estado del que no se puede salir es peor que no tener el estado.

El patrón común: todos viven en la frontera entre el código y algo real —una plataforma,
un dispositivo, una persona escribiendo datos. Las pruebas validan la lógica; **solo un
dispositivo real valida la plataforma.**

## Trampas de este repositorio

**Las tarifas son públicas.** El repo es público y GitHub Pages sirve `datos/` a quien
tenga la URL. Fue una decisión consciente, pero tenla presente: no metas ahí nada que no
pueda leer la competencia. Ningún dato de clientes, ninguna credencial.

**`datos/` no tiene copia de respaldo fuera de Git.** El historial es la copia. No
sobrescribas los archivos con datos generados sin comparar antes contra lo que hay.

**El horizonte de tarifas se acaba.** Una cotización posterior a la última temporada
cargada devuelve un error explícito: correcto, pero inútil para la asesora. El validador
avisa cuando quedan menos de 120 días. Ver `HANDOFF.md` §3.

**La caché de GitHub Pages.** Sirve el CSS y el JS con caché, así que sin sellar los
assets una asesora puede seguir con la versión vieja después de publicar. `npm run
versionar` antes de comitear, siempre.

**Hay dos anchos que no significan lo mismo.** El mini cotizador vive en una ventana de
unos 380 px, así que *dentro de ella* se cumple la media query de móvil aunque el monitor
sea de 27 pulgadas. Cualquier regla de móvil que pueda afectarle lleva
`:not(.hoteles-mini)` o `body:not(.calc-suelta)`, y las reglas del mini doblan su clase
(`.hoteles.hoteles-mini`) para ganar por especificidad y no por orden.

**Un control cuyo contenido no tiene tope se lleva su fila entera.** Los nombres de
habitación los pone el negocio: darle al selector una medida sacada del nombre más largo
que conocemos hoy solo mueve el problema al siguiente nombre. Por eso la categoría ocupa
el ancho completo y los otros cuatro controles —contenido acotado— comparten la fila
siguiente.

## Definición de "listo"

Un cambio está terminado cuando:

- [ ] Las cuatro suites pasan con 0 fallos (`npm test`)
- [ ] Si tocaste CSS o JS, `npm run versionar` antes de comitear
- [ ] El validador no reporta errores nuevos
- [ ] Si tocaste el motor, hay un caso de prueba nuevo que cubre el cambio
- [ ] Si tocaste la interfaz, se probó en un celular real (no solo en jsdom)
- [ ] El `README.md` refleja el cambio si alteró comportamiento o modelo de datos

## Al proponer cambios

- **Pregunta antes de asumir reglas de negocio.** Varias decisiones de precio quedaron
  abiertas a propósito; están en §9 del `README.md` y en §4 de `HANDOFF.md`. No las
  resuelvas por tu cuenta.
- **Prefiere una fila en un JSON antes que una línea de código.**
- Si un cambio obliga a tocar el motor para soportar un hotel nuevo, dilo explícitamente:
  es señal de que el modelo de datos necesita un concepto nuevo, como pasó con
  `modo_tarifa` y `formato_ocupantes` al agregar los hoteles de ciudad.
