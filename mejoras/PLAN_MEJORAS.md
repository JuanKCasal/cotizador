# Plan de mejoras — Cotizador Hesperia

> **Estado al 03/09/2026: ejecutado.** Se aplicaron las cinco correcciones, la
> **Opción A** (el sistema, cumplido) y la **Opción C** (jerarquía material). La
> **Opción B** (el pulgar) queda sin hacer: parte de sus piezas —copiar como acción
> principal de la barra, el mínimo táctil en los contadores— entraron con A y C, pero
> contraer los hoteles a un chip no se hizo, porque esconde los otros cuatro y eso es
> una decisión de negocio, no de diseño.
>
> Este documento se queda como el registro de por qué se hizo cada cosa. Lo que dice en
> presente («hoy la barra se aplasta») describe el estado **antes** de la entrega; el
> apartado de cada corrección lleva la cura que se aplicó.

Auditoría de diseño del proyecto tal como está en `main`, hecha con los cuatro
agentes y las cuatro skills de diseño registrados en `CLAUDE.md`. Todo lo que
sigue está verificado contra el código y, donde se puede, medido: no hay ningún
hallazgo que venga solo de leer.

**Para ver las opciones:** abre `mejoras/index.html` en el navegador. Las
maquetas importan `assets/tokens.css`, así que están hechas con los tokens de
verdad del proyecto.

---

## Cómo está organizado

Lo encontrado se parte en dos cosas que no se deciden igual:

1. **Correcciones** — cosas rotas. No son opciones: van sí o sí, y entran en
   cualquiera de las tres direcciones.
2. **Direcciones** — tres respuestas distintas a «qué es lo que más le falta hoy
   a esta app». Se elige **una**.

---

## Parte 1 · Correcciones

Página con la demostración de cada una: `mejoras/00-correcciones.html`.

### 1. La barra del total se aplasta contra el borde del iPhone · **P0**

```css
.barra { height: 68px; padding-bottom: env(safe-area-inset-bottom); }
* { box-sizing: border-box; }
```

La barra reserva sitio para la franja del gesto de iOS, pero con
`box-sizing: border-box` ese relleno **no se suma** a la altura: se la come. En
un iPhone con franja de 34 px, los 68 px de barra dejan 34 px reales de
contenido, y ahí tienen que caber el total y el botón. Es la barra que se ve
siempre, en el teléfono desde el que se cotiza.

**Corrección**

```css
.barra { height: calc(var(--h-barra-total) + env(safe-area-inset-bottom, 0px)); }
```

Y el mismo respiro en `.lienzo { padding-bottom }` y en el `inset` de
`.columna-vista`, que hoy reservan `var(--h-barra-total)` a secas.

### 2. `btn-alerta` se usa y no existe · **P0**

`assets/logica.js` pone y quita la clase en las líneas 734, 738 y 742. `grep
"\.btn-alerta" assets/*.css` no devuelve nada. El botón cambia de clase y no
cambia de aspecto: **el aviso se emite y nadie lo ve**.

**Corrección** — declarar el estado con los tokens que ya existen
(`--alerta`, `--alerta-sut`), o quitar la clase del JS si el aviso ya no aplica.
Lo que no puede quedar es a medias.

### 3. `--acento` no tiene valor hasta que se elige hotel · **P1**

`--acento`, `--acento-sut` y `--acento-texto` solo se declaran en
`body[data-hotel="…"]` (tokens.css, líneas 56-60). La app abre **sin** hotel
elegido —es la primera pantalla de cada cotización— y en ese momento los 7 usos
de `var(--acento…)` en `estilos.css` no resuelven a nada; ninguno tiene valor de
respaldo.

**Corrección**

```css
:root {
  --acento: var(--arena);
  --acento-sut: var(--arena-sut);
  --acento-texto: var(--tinta-70);
}
```

Cada hotel lo pisa como ya lo hace.

### 4. Las pistas no llegan a 4.5:1 sobre el fondo de página · **P1**

| | color | sobre | contraste | AA |
|---|---|---|---|---|
| Hoy | `--tinta-45` `#64758C` | `--sal` `#EEF2F5` | **4.18:1** | no |
| Sistema | `--tinta-70` `#4A6079` | `--sal` `#EEF2F5` | 5.7:1 | sí |

`tokens.css` ya define `.t-pista` con `--tinta-70`. `estilos.css:276` pinta
`.pista` con `--tinta-45`. El comentario del token («4.7:1») mide sobre blanco,
pero las pistas viven sobre el fondo de página, no sobre las tarjetas. Es
literalmente la frase que explica el precio («La noche de salida no se cobra»).

**Corrección** — usar el token que el sistema ya eligió. Con la Opción A se
corrige sola.

### 5. Casi nada responde al toque · **P1**

Dos reglas `:active` en `estilos.css`, **cero** en `admin.css`. En un teléfono
no existe `:hover`: `:active` es la única confirmación de que el dedo dio en el
sitio. Sin ella, ante cualquier demora se toca dos veces — y en los contadores
de personas eso suma un adulto de más a la cotización.

**Corrección** — un `:active` uniforme en botones, chips y contadores. El
sistema ya fija el foco de teclado (`--foco`); esto es su equivalente táctil.

### Ya corregidas en esta entrega

- **`.solo-pc` no escondía nada.** Declaraba `display:none`, pero
  `.btn-cabecera` declara `display:inline-flex` más abajo con la misma
  especificidad y ganaba por orden. Los dos botones de escritorio salían en el
  teléfono y pisaban el título. Ahora esconde dentro de una media query con
  `!important` y al mostrar no reasigna `display`.
- **Nombres de hotel cortados** («Isla Marg…»). Con `minmax(104px, 1fr)`
  entraban tres por fila y no cabía el nombre. Con 160 px entran dos enteros.

---

## Parte 2 · Las tres direcciones

### Opción A — El sistema, cumplido

`mejoras/opcion-a-sistema.html`

**Tesis.** El sistema visual que aprobó Marla ya contesta casi todas las
preguntas de la app. La app no lo usa: lo re-escribe a mano.

**Medido:**

| | |
|---|---|
| Clases de tipografía del sistema usadas en la app | **0 de 10** |
| `font-size` escritos a mano en `estilos.css` | **68** |
| Espacios en px crudos frente a los que usan `--e1…e6` | **73 vs 17** |
| Usos de `--h-copiar` (56 px, el control más alto que el sistema pide en móvil) | **0** |

La consecuencia no es fea, es cara: cada regla vive en dos sitios y se separan
sin que nadie lo note —el punto 4 de arriba es exactamente eso—. Y si Marla
vuelve a Claude Design y ajusta el sistema, hoy ese ajuste no llega: hay que
traducirlo a mano.

**Qué cambia.** Los 68 tamaños pasan a las diez clases del sistema; los 73
espacios a la escala `--e*`; los colores al token en vez del hexadecimal;
aparece el botón de copiar de 56 px. `tokens.css` queda como fuente única: se
reemplaza el archivo y la app entera se mueve con él.

**Qué no cambia.** Ni la disposición, ni el recorrido, ni un cálculo.

Costo bajo · Riesgo bajo · **Es la única que abarata las otras dos.**

### Opción B — El pulgar

`mejoras/opcion-b-pulgar.html`

**Tesis.** La app se diseñó en un lienzo y se usa con una mano, de pie, con un
cliente esperando en WhatsApp. Hay que reordenar la pantalla según lo que se
toca y lo que solo se lee.

**De dónde sale.** En 390 × 844 sostenido con una mano, el pulgar alcanza
cómodamente el tercio inferior. Hoy los cinco botones de hotel —el primer toque
de cada cotización— caen en la zona que no se alcanza, y copiar el mensaje —el
último— vive detrás de «Ver mensaje»: dos toques y un cambio de pantalla.

**Qué cambia.**

- Elegido el hotel, los cinco botones se contraen a un chip con «Cambiar»: se
  recuperan ~120 px de alto.
- Los contadores de adultos y niños pasan de 26 a 44 px de zona tocable, el
  mínimo que fija el propio sistema.
- La barra inferior pasa a ser el cierre de la tarea: total, **Copiar mensaje**
  a 56 px, y «Ver cómo queda» debajo, en secundario.

**El costo honesto.** Es la única de las tres que le cambia la memoria muscular
a Marla; unos días va a buscar cosas donde ya no están. Y contraer los hoteles a
un chip esconde los otros cuatro: si es común cotizar el mismo caso en dos
hoteles para comparar, esto estorba y conviene dejarlos visibles.

Costo medio · Riesgo medio · **Gana segundos en cada cotización.**

### Opción C — Jerarquía material

`mejoras/opcion-c-material.html`

**Tesis.** La app hace dos cosas: se edita una cotización y se produce un
mensaje. Hoy viven en el mismo plano, y el mensaje además está detrás de otra
pantalla justo en el aparato donde se cotiza.

**De dónde sale.** En escritorio ya está resuelto —formulario a la izquierda,
vista del cliente a la derecha, quieta—. En el teléfono esa columna no cabe y se
metió detrás de un botón. Un mensaje mal armado no se nota en el total: se nota
en una llave sin resolver o en un plan que no era. Verlo cuesta más que
corregirlo.

**Qué cambia.**

- El formulario se agrupa en hojas por asunto en vez de una lista continua.
- La barra del total se convierte en el asomo del mensaje: primeras líneas
  reales, total y botón de copiar.
- El asomo se arrastra hacia arriba para leerlo entero, sin cambiar de pantalla.
- La profundidad —no el color— dice qué es editable y qué es resultado.

**El costo honesto.** La más ambiciosa: el asomo arrastrable es un control de
verdad, con estados y comportamiento en teclado, y hay que probarlo en el
teléfono real. Carga más la pantalla y en un teléfono chico eso se paga
desplazando más. A favor: la burbuja arrastrable del mini cotizador ya usa esta
misma mecánica de puntero, así que no se parte de cero.

Costo alto · Riesgo medio-alto · **Deja de mandar a ciegas.**

---

## Recomendación

1. **Las cinco correcciones**, sin discusión. Dos se ven hoy en el teléfono de
   Marla.
2. **Opción A.** Es barata y abarata las otras dos: hacer B o C sobre 68 tamaños
   escritos a mano cuesta el doble.
3. **Opción B** antes que C, porque ataca el tiempo que se paga en *cada*
   cotización, mientras que C resuelve un problema real pero menos frecuente.

La elección entre B y C depende de algo que sabe Marla y yo no: si el problema
de todos los días es que la cotización se tarda, o que hay que revisar el
mensaje antes de mandarlo. **Si es lo segundo, C va antes que B.**

---

## Lo que la auditoría miró y no encontró nada que reprochar

Para que quede claro el alcance:

- **Foco de teclado.** `--foco` se respeta en toda la app y nunca se quita; el
  recuadro doble que molestaba se resolvió moviendo el indicador al contenedor
  con `:has(:focus-visible)`, no borrándolo.
- **Paleta de acentos.** Los cinco hoteles tienen anotado su contraste en
  `tokens.css`, y los dos que no llegan a 4.5:1 (HIM mostaza, HMC naranja)
  ya están marcados «solo relleno» y se usan solo como relleno.
- **Cifras.** Todo lo numérico usa `IBM Plex Mono` con `tabular-nums`: los
  totales no bailan al recalcular.
- **La vista de WhatsApp** es cita literal y así está marcada en el sistema. No
  se toca en ninguna de las tres direcciones.

## Una nota sobre `tokens.css`

`tokens.css` es el entregable del sistema visual que definió la propia asesora.
Ninguna de las tres direcciones lo modifica: la A lo *cumple*, la B y la C
construyen encima. Si algo aquí pareciera pedir cambiarlo, se pregunta antes.
