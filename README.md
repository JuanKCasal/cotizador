# Cotizador Hesperia

Cotizador de habitaciones para la cadena Hesperia en Venezuela. Una asesora abre el
enlace, arma la cotización y copia un mensaje ya formateado para pegar en WhatsApp.

Es un **sitio estático**: HTML, CSS y JavaScript servidos por GitHub Pages, sin servidor
ni base de datos. El catálogo —tarifas, temporadas, políticas— vive en archivos JSON
versionados en este repositorio. Cambiar un precio es un commit.

Hasta septiembre de 2026 corría sobre Google Apps Script con el catálogo en un Google
Sheet. El historial de Git conserva esa etapa.

---

## 1. Publicar

El sitio se sirve desde la raíz de la rama `main`. En GitHub: **Settings › Pages ›
Source: Deploy from a branch › main / (root)**. Cada `push` publica.

No hay compilación ni dependencias: lo que está en el repositorio es lo que corre.

```
index.html       La aplicación
assets/          tokens.css, estilos.css, motor.js, catalogo.js, validador.js, logica.js
datos/           El catálogo, en once archivos JSON
verificacion/    Arneses de prueba en Node. NO se publican
docs/            Guías de instalación y de estilo
```

**Las tarifas son públicas.** El repositorio es público y GitHub Pages sirve `datos/` a
quien tenga la URL. Fue una decisión consciente: no metas ahí nada que no pueda leer la
competencia, ningún dato de clientes y ninguna credencial.

---

## 2. Arquitectura

```
index.html
  └── carga assets/*.js
        catalogo.js  ── fetch ──▶  datos/*.json
        motor.js     ── calcula y arma el mensaje
        logica.js    ── estado de la interfaz
        validador.js ── revisa el catálogo
```

Al arrancar, `catalogo.js` descarga las once tablas y las convierte en un objeto que el
motor consume. Todo el cálculo ocurre en el navegador, con el catálogo completo en
memoria: la asesora ajusta fechas y edades docenas de veces por cotización, y cualquier
ida y vuelta por cambio haría la aplicación inusable.

`motor.js` no toca el DOM ni sabe de dónde salieron los datos. Por eso se puede probar en
Node sin navegador, y por eso es la **única** implementación del cálculo.

### Invariantes

Están en `CLAUDE.md` con su explicación. En resumen:

1. Cero lógica de negocio en el código. Agregar un hotel es agregar filas.
2. Una sola implementación del cálculo, en `motor.js`.
3. Fechas como texto ISO `YYYY-MM-DD`; un solo punto toca `Date`.
4. Nunca un `0` ni un `NaN` silencioso.
5. El cálculo corre en el navegador.
6. Ninguna tarifa lleva impuestos encima.

---

## 3. Modelo de datos

Doce archivos en `datos/`. `config.json` es un objeto clave→valor; el resto son arreglos
de objetos cuyas claves son las columnas.

| Archivo | Qué guarda |
|---|---|
| `config.json` | Versión de tarifas, moneda, separador decimal, mensaje de CASHEA, iniciales |
| `hoteles.json` | Nombre, emojis, horarios, modo de tarifa, formato de fecha y de ocupantes, depósito |
| `habitaciones.json` | Categoría, ocupación, atributo, mínimos y máximos, suplemento single |
| `temporadas.json` | Rango de fechas y prioridad, por hotel |
| `tarifas.json` | Precio por hotel, habitación, temporada y **ocupación** |
| `adicionales.json` | Lo que paga cada huésped por encima de lo que cubre la tarifa |
| `stop-sales.json` | Cierres de venta por rango de noches |
| `politica-ninos.json` | Rangos de edad, factor de pago y si ocupan plaza, por hotel |
| `promociones.json` | Vigencia, tipo, valor, mínimo de noches, días de la semana, y para `MENOR_GRATIS` el rango de edad y el mínimo de adultos |
| `cargos-fecha.json` | Cargos obligatorios en fechas concretas |
| `extras.json` | Servicios adicionales que se pueden cobrar |
| `plantillas.json` | El mensaje de WhatsApp, con marcadores: una fila por hotel y, opcionalmente, una por hotel y asesora |
| `asesoras.json` | Quién firma: iniciales, nombre y si está activa |

---

## 4. Reglas implementadas

### Modo de tarifa

La columna `modo_tarifa` de `hoteles.json` decide cómo se lee `tarifas.json`:

| Valor | Significado | Suplemento single |
|---|---|---|
| `POR_PERSONA` | La tarifa es por persona y noche (hoteles de playa) | Aplica |
| `POR_HABITACION` | La tarifa es por habitación y noche (hoteles de ciudad) | No aplica |

### Tarifa por ocupación

La columna `pax` de `tarifas.json`:

- **Vacía:** una sola tarifa, sin importar cuántos se alojen. Es el caso de los hoteles
  de playa, donde la tarifa ya es por persona y multiplicarla refleja la ocupación.
- **Con número:** una fila por ocupación. La Deluxe King de Valencia son $160 con un
  huésped y $180 con dos.

El motor elige la mayor ocupación cargada que no supere la real. Si la ocupación queda
por **debajo** de la menor tarifa cargada, devuelve un error: la Deluxe Twin de Valencia
solo tiene precio para dos, y venderla a uno es una decisión comercial que nadie tomó.

### Personas adicionales

`adicionales.json` define, por rango de edad, lo que paga cada huésped por encima de lo
que cubre la tarifa. En Maracay una Deluxe Twin son $144 por dos personas y admite dos
más, a $20 si pasan de 10 años y $10 entre 3 y 9.

Se cobran **de menor a mayor**: si sobra una plaza y en la habitación hay un niño y un
adulto, el adicional es el niño. La tarifa base cubre a los demás y el cliente paga lo
menos posible. El mensaje explica el recargo en vez de mostrar un monto inexplicable.

### Suplemento de habitación individual

Aplica cuando la habitación no alcanza a facturar dos personas completas:

```
pax_pagos = Σ factor(rango) de los huéspedes

SI modo = POR_PERSONA Y permite_single Y pax_pagos < 2:
    costo_noche = (tarifa_pp × pax_pagos) + suplemento_single
SINO SI modo = POR_PERSONA:
    costo_noche = tarifa_pp × pax_pagos
SINO:
    costo_noche = tarifa_de_esa_ocupación + adicionales
```

Verificación en Morrocoy, temporada alta (tarifa $85, suplemento $30):

| Ocupación | pax | Cálculo | Total/noche |
|---|---|---|---|
| 1 adulto | 1.0 | 85 + 30 | $115 |
| 1 adulto + 1 infante (3 años) | 1.0 | 85 + 30 | $115 |
| 1 adulto + 1 niño (7 años) | 1.5 | 127,50 + 30 = 157,50 | **$158** |
| 1 adulto + 1 niño (12 años) | 2.0 | 85 × 2 | $170 |
| 2 adultos | 2.0 | 85 × 2 | $170 |

El mensaje al cliente **solo muestra el monto**: no explica que ahí adentro va un
suplemento.

### Redondeo

Todos los montos que ve el cliente son **enteros redondeados hacia arriba**. El redondeo
ocurre en el **costo de una habitación en una noche**, no al final: así el desglose por
noche suma exactamente el total y el cliente puede rehacer la cuenta. Por eso la fila de
$157,50 da $158 por noche y **$316** en dos noches, no $315.

### Edades de los menores

La asesora indica la **edad real de cada menor**, no una cantidad por rango. El motor
mapea cada edad al rango del hotel —que cambia según el hotel— y el mensaje imprime las
edades:

```
2 adultos + 2 niños (6 y 8 años)
1 adulto + 1 infante (3 años) + 1 niño (12 años)
```

Un menor recién agregado arranca **sin edad** y bloquea la cotización con un error
explícito. Es a propósito: una edad por defecto termina impresa en el mensaje del
cliente. Una edad de 18 o más se rechaza pidiendo que se cuente como adulto.

Maracay usa cortes propios (0–2, 3–9, 10–17); los demás hoteles, los suyos.

### Servicios adicionales

`extras.json`. Se marcan durante la cotización y entran al total:

| Tipo | Cómo se cobra |
|---|---|
| `POR_PERSONA_ESTADIA` | El monto por cada persona, una sola vez. Early check-in, late check-out |
| `POR_PERSONA_DIA` | El monto por persona y por noche. Brazalete VIP |

Con `aplica_factor_ninos`, los menores pagan según el factor de la política de niños: un
niño al 50% paga la mitad del early check-in y un infante no paga.

Se cobran sobre **toda la cotización**, no por habitación: quien pide early check-in lo
pide para su grupo, no para una de las dos habitaciones que reservó.

En el mensaje, lo contratado sube arriba con su monto —ya está dentro del total y el
cliente tiene que poder reconstruirlo— y el resto se sigue ofreciendo como opcional.

### Cierres de venta (stop sales)

Una fila en `stop-sales.json` marca un rango de **noches** sin cupo, para el hotel
completo (`cod_hab` vacío) o para una categoría. Si alguna noche de la estadía cae en el
rango, la cotización se bloquea con la fecha y el motivo.

Como se comparan noches y no días calendario, quien **sale** la mañana del primer día
cerrado no se ve afectado.

En la interfaz no se muestra como un error de datos, sino como falta de disponibilidad,
con una salida concreta: ante un error hay algo que corregir, ante un cierre solo queda
ofrecer otra cosa.

### Otras reglas

- Las noches son `[checkin, checkout)`. El día de salida no se cobra.
- **Prioridad** en temporadas: número mayor gana. Convención: `10` temporadas base, `50`
  feriados, `90` bloqueos puntuales. Solaparse con la misma prioridad es un **error** de
  carga, no un empate a resolver.
- **Promociones opt-in**, evaluadas noche por noche: pueden cubrir parte de la estadía.
  Cada una puede llevar un `mensaje` que se imprime debajo cuando aplica.
- `DESCUENTO_MONTO` se resta de la **tarifa por persona**, así que un niño que paga el
  50% recibe la mitad del descuento. Ver §8.

### El mensaje y sus marcadores

`plantillas.json` guarda el texto; el motor sustituye los marcadores `{{...}}`. La lista
completa la muestra la pestaña **Mensajes** de la administración, que la lee de
`Motor.MARCADORES`: no hay una segunda copia que se pueda quedar vieja.

Cada asesora puede tener su propio juego de mensajes; quien no lo tenga usa el del hotel
(la fila con `asesor` vacío). Hoy tienen juego propio Lenin (`LR`) y Luisana (`LV`).

**`{{FECHA_COTIZACION}}` lo pone quien llama al motor, no el motor.** Es el único
marcador cuyo valor no sale del catálogo ni del cálculo: el cotizador le pasa la fecha
de hoy en la zona del equipo, porque un `new Date()` dentro del motor volvería a meter
la zona horaria en el único archivo que se cuidó de no tocarla. Si llega vacío el
marcador sale vacío; si llega con un formato que no es ISO, el render **falla** en vez
de imprimir una fecha inventada.

### Tipos de promoción

Tres operan sobre la **tarifa por persona**. El cuarto no, y esa es la distinción que
importa al cargar una campaña nueva.

| Tipo | Qué hace | `valor` |
|---|---|---|
| `SUSTITUYE` | Reemplaza la tarifa por persona de la noche | La tarifa nueva |
| `DESCUENTO_PCT` | Le quita un porcentaje | El porcentaje |
| `DESCUENTO_MONTO` | Le quita un monto fijo | El monto |
| `MENOR_GRATIS` | **No toca la tarifa: quita pax facturables** | Cuántos menores van gratis |

`MENOR_GRATIS` existe porque "un niño gratis" no se puede expresar con los otros tres.
En una Junior de Morrocoy con dos adultos y un niño de 6, la noche son 2,5 pax a $70 =
$175, y el niño aporta $35 de esos. La promoción tiene que borrar ese aporte, no rebajar
los $70. Cargada como `SUSTITUYE 35` —el único intento que parece funcionar— la noche
cotiza `35 × 2,5 = $87,50`.

Dos columnas propias, que no usa ningún otro tipo:

- **`rango_menor`** nombra un `cod_rango` de `politica-ninos.json`, no unas edades. `NIN`
  es 5-9 en Morrocoy y 5-10 en Isla Margarita y Playa el Agua: quien manda sobre las
  edades es el hotel, así que la misma campaña sirve en los tres sin repetir nada.
- **`min_adultos`** es el mínimo de adultos para que aplique. Vacío = sin mínimo.

Y tres reglas que conviene tener presentes:

- **El menor sigue contando en la ocupación.** Deja de pagar, no de existir: cuenta para
  los máximos de la habitación y aparece en el mensaje al cliente. Un mensaje que dice
  "2 adultos" cuando van tres es una reserva que falla en recepción.
- **Uno por habitación**, no por cotización: se evalúa habitación por habitación.
- **Si no puede aplicarse, no compite.** Sin menores del rango, o sin los adultos que
  exige, la promoción no es candidata: no se anuncia como aplicada y deja pasar a otra
  promoción de tarifa que sí sirva. Se puede marcar sin romper nada.

En los hoteles de ciudad (`POR_HABITACION`) no tiene sentido —la tarifa no depende de la
ocupación— y el validador lo reporta como error de carga.
- **Cargos de fecha fija** aplican si la fecha pertenece a `[checkin, checkout)`. Si el
  cliente sale el 24 al mediodía, no paga la cena de Navidad.
- Ante una noche sin tarifa: **error explícito con la fecha**, nunca un `0` ni un `NaN`.

---

## 5. Trampas resueltas

Todas aparecieron en producción, no en las pruebas. Están detalladas en `CLAUDE.md`.

**Portapapeles, tres niveles.** La API moderna, `execCommand` como respaldo, y un modal
con el texto seleccionado como último recurso. `esMovil()` nunca lanza, porque
`matchMedia` no existe en algunos WebViews de Android y se llama dentro del tercer nivel:
un fallo ahí dejaba a la asesora sin ninguna forma de copiar.

**Selectores de fecha nativos en Android.** El `min` del campo de salida es la fecha de
entrada, no entrada+1: los selectores lo tratan como exclusivo y era imposible cotizar
una sola noche. El orden lo valida el motor.

**Fechas fuera de formato.** El único cierre de venta cargado tenía `18/09/26` en vez de
`2026-09-18`. Como las fechas se comparan como texto, `'20/09/26' >= '2026-09-19'` da
`false`: el cierre no bloqueaba nada y no avisaba. Ahora `catalogo.js` rechaza toda fecha
que no sea ISO.

**Una coma convertida en punto decimal.** Google Sheets interpretaba `"5,6"` como `5.6` y
el filtro de días de la semana quedaba roto en silencio. Ya no hay Sheets, pero
`parseDias()` sigue siendo tolerante porque ahora quien puede escribir `5.6` a mano es la
persona que edita el catálogo.

**Un panel que cambia de ventana.** El mini cotizador se mueve a su propia ventana, y
allí sus campos dejan de pertenecer al documento principal: `getElementById` devuelve
`null`. Los campos se buscan dentro del propio panel, que viaja entero con sus hijos.

---

## 6. Pruebas

```bash
cd verificacion
npm install     # solo la primera vez (jsdom)
npm test        # las cuatro suites
```

- `_verificar.js` — **335 aserciones**. Corre `pruebas.js` contra el catálogo construido
  desde `datos/`, y después un bloque propio para la lógica de cliente.
- `_verificar_spa.js` — **131 chequeos**. Carga `index.html` en un DOM simulado con los
  assets embebidos y `datos/` servido por `fetch`.
- `_verificar_admin.js` — **63 chequeos** sobre la pantalla de administración.
- `_verificar_publicar.js` — **29 chequeos** de la publicación a GitHub, contra un
  GitHub de mentira.

Todas leen los mismos archivos que descarga el navegador: lo que pasa en las pruebas es
lo que va a pasar en producción.

**El script encadena las cuatro con `&&`.** Si la primera falla, las de abajo no corren
y su silencio parece aprobación. Ya pasó: un cierre de venta publicado desde la
administración puso en rojo la suite de la interfaz y las de administración y publicación
—92 chequeos— dejaron de ejecutarse sin que nadie lo notara. Al leer el resultado, cuenta
que aparezcan las cuatro.

Por eso los chequeos de interfaz **no dependen de la disponibilidad ni de una promoción
vigente**: el arnés inyecta su propio cierre de venta y su propia promoción sobre los
datos reales. Un dato que una asesora puede cambiar desde la administración no puede ser
la premisa de una prueba.

Lo que **no** cubren es la plataforma. Los cinco fallos históricos de este proyecto
aparecieron en dispositivos y navegadores reales, no en jsdom. Un cambio en la interfaz
no está validado hasta probarlo en un teléfono.

El validador (`assets/validador.js`) revisa el catálogo: solapes de temporada, huecos de
cobertura, ocupaciones sin tarifa, cierres vencidos, servicios mal cargados, plantillas
con marcadores que nadie resuelve, y el horizonte de tarifas.

---

## 7. Datos cargados

| | |
|---|---|
| Hoteles activos | Morrocoy (HBK), Isla Margarita (HIM), Playa el Agua (HPA), Valencia (WTC), Maracay (HMC) |
| Tipos de habitación | 21 |
| Temporadas | 14 |
| Horizonte de tarifas | **12/01/2027** en playa, **20/12/2026** en ciudad |

**El horizonte se acaba.** Una cotización posterior a la última temporada cargada
devuelve un error explícito: correcto, pero inútil para la asesora. El validador avisa
cuando quedan menos de 120 días. Los hoteles de ciudad ya están dentro de esa ventana.

Al cargar tarifas nuevas: agregar las temporadas primero, después las tarifas de cada
habitación, correr el validador y subir `VERSION_TARIFAS` en `config.json`.

---

## 8. Pendientes de definición

Ninguno bloquea el uso.

1. **`DESCUENTO_MONTO` y los niños.** El descuento se resta de la tarifa por persona, así
   que con la Promoción para Residentes (−$5) un niño al 50% recibe $2,50. Si son $5 por
   cabeza sin importar el factor, hay que cambiarlo en el motor.
2. **Promoción para Residentes:** no existe en Morrocoy y vence el **15/09/2026**.
3. **1 adulto + 1 niño de 10–17 años** queda sin suplemento. Son $20–30 por noche si
   comercialmente deciden lo contrario.
4. **La King de Maracay admite hasta 4 huéspedes** por criterio copiado de la Twin. Si
   son 3 o 2, es cambiar un número en `habitaciones.json`.
5. **La quinta persona de la Family Suite paga $20 a cualquier edad.** En Maracay los
   adicionales sí distinguen edad; en Valencia se cargó monto único.
