# HANDOFF.md

Estado del proyecto. Lee esto y `CLAUDE.md` antes de tocar nada.

**Repo:** https://github.com/JuanKCasal/cotizador (público)
**Sitio:** https://juankcasal.github.io/cotizador/
**Local:** `C:\dev\cotizador`
**Última actualización:** 11/09/2026

---

## 1. Qué es y dónde está

Sitio estático en GitHub Pages. Sin servidor, sin base de datos, sin login. El catálogo
son doce archivos JSON en `datos/`, versionados en Git. Cada push publica.

**En producción y en uso diario.** La usa Marla Zuluaga desde el teléfono, casi siempre
con un cliente esperando en WhatsApp. Ese es el escenario que manda en cualquier duda de
diseño: una mano, de pie, con prisa.

| | |
|---|---|
| Hoteles activos | Los cinco: HBK, HIM, HPA, WTC, HMC |
| Asesores | MZ (Marla Zuluaga), LR (Lenin Rodrigues), LV (Luisana Villalobos) |
| Suites de prueba | 4 · `npm test` |
| Aserciones del motor | 384 |
| Chequeos del cotizador | 131 |
| Chequeos de administración | 63 |
| Chequeos de publicación | 29 |
| Validador sobre el catálogo real | 0 errores, 2 advertencias |
| Horizonte de tarifas | hasta **20/12/2026** en WTC y HMC ⚠ |

Las dos advertencias son ese horizonte. No son un fallo del código.

### Las cuatro cosas que un recién llegado suele romper

1. **Publicar sin sellar los assets.** `cd verificacion && npm run versionar` antes de
   comitear, o la asesora sigue viendo la versión vieja.
2. **Tocar `tokens.css`.** Es el entregable del sistema visual que definió la propia
   asesora. Se consume; si una auditoría propone cambiarlo, se pregunta antes.
3. **Asumir que el mini cotizador es "la app en pequeño".** Vive en una ventana de 380 px,
   así que las media queries de móvil se le aplican dentro aunque el monitor sea enorme.
   Ver `CLAUDE.md` §Trampas.
4. **Leer el resultado de `npm test` por la última línea.** Las cuatro suites van
   encadenadas con `&&`: si la primera falla, las otras no corren y no dicen nada. Cuenta
   que aparezcan las cuatro.

---

## 2. Cómo se publica un cambio de tarifa

Esto ya no pasa por un programador, y es el flujo que más importa entender.

1. La asesora entra a `admin.html` desde el botón **Administración**.
2. Corrige la tarifa en la tabla. El validador corre en cada tecla; con errores el botón
   de publicar está apagado.
3. Pulsa **Publicar**, elige quién publica y pega la clave.
4. Un solo commit con los archivos que cambiaron. En un par de minutos Pages lo sirve.

La clave es un *fine-grained token* de GitHub con `Contents: read and write` sobre este
repositorio y nada más. **Se pide cada vez y no se guarda en ningún sitio** — ni en
`localStorage`. Es una decisión, no un pendiente: la pantalla vive en una URL pública y
una credencial guardada en el navegador sobrevive a la persona que la escribió.

Si GitHub no responde o la clave caducó, abajo del diálogo está **Descargar los
archivos** para subirlos a mano. Nunca se puede quedar sin poder cambiar una tarifa.

Los detalles de por qué es un solo commit y por qué sin `force` están en `CLAUDE.md`
§Publicar el catálogo.

---

## 3. Lo que falta

En orden de urgencia real, no de tamaño.

### ⚠ Cargar las temporadas de fin de año de WTC y HMC

**Es lo único con fecha límite.** Valencia y Maracay tienen una sola temporada que
termina el **20/12/2026**. Cotizar el 31/12 en esos hoteles **falla hoy**, no en 2027.
También faltan las temporadas de 2027 de los hoteles de playa.

### ~~Cargar los cierres de venta reales~~ — hecho, y con una lección

`stop-sales.json` ya tiene cierres reales: las dos habitaciones de Isla Margarita, del
18 al 20/09/2026, publicados desde la administración. El camino completo funcionó sin que
pasara por un programador, que era el objetivo.

**Y puso `npm test` en rojo.** El arnés de la interfaz cotizaba Margarita del 20 al 23/09
con fechas escritas a mano, así que la primera noche pasó a estar sin cupo. Como el script
encadena las suites con `&&`, las de administración y publicación —92 chequeos— dejaron de
correr. Ya está arreglado: los chequeos de interfaz inyectan su propio cierre y su propia
promoción, y no dependen de lo que haya en el catálogo esa semana.

La lección, que no estaba escrita: **una asesora puede poner las pruebas en rojo desde la
administración, sin tocar código.** Cualquier chequeo nuevo que fije una fecha y un hotel
está firmando lo mismo para más adelante.

### Probar en el teléfono de Marla

Cinco de los seis bugs históricos de este proyecto aparecieron en dispositivos reales y
ninguna suite los habría visto. Lo que hace falta comprobar ahí:

- El asomo del mensaje: que se arrastre con el dedo sin pelearse con el desplazamiento
  de la página.
- La barra del total contra la franja del gesto del iPhone.
- Si los tres niveles de copiado siguen siendo necesarios fuera del iframe de Apps
  Script. **No quites ninguno sin probarlo en un teléfono.**

### Revisar el README

Ya no describe Apps Script y las cuentas de habitaciones y temporadas coinciden con
`datos/` (21 y 14). Lo que queda es leerlo entero de una vez: es el documento que más ha
acumulado parches.

### Lo que se decidió NO hacer

- **Opción B de la auditoría ("el pulgar").** Sus piezas táctiles entraron con A y C,
  pero contraer los hoteles a un chip esconde los otros cuatro, y si es común cotizar el
  mismo caso en dos hoteles para comparar, eso estorba. Lo decide quien cotiza.
- **Brazalete VIP.** Está modelado como `POR_PERSONA_DIA` y nadie lo ha activado.
  Activarlo es marcar una fila, no tocar el motor.

---

## 4. Pendientes de decisión del negocio

Ninguno bloquea el uso. **No los resuelvas por tu cuenta.**

1. **`DESCUENTO_MONTO` y los niños.** El descuento se resta de la tarifa por persona, así
   que con la Promoción para Residentes (−$5) un niño al 50% recibe $2,50. Si son $5 por
   cabeza sin importar el factor, hay que cambiarlo en el motor.
2. **Promoción para Residentes:** no existe en Morrocoy y venció el **15/09/2026**.
   Confirmar si se renueva o se borra.

2b. **Prioridad entre "niño gratis" y Residentes.** Hoy no se solapan —Residentes acaba
   el 15/09 y niño gratis arranca el 16/09—, así que la prioridad no decide nada. Se
   cargó `110` en niño gratis contra el `100` de Residentes, es decir: si algún día se
   solapan gana niño gratis, que es la que más descuenta. Si el negocio prefiere lo
   contrario, es cambiar un número. **No se acumulan**, por decisión del negocio: se
   aplica una sola, la de mayor prioridad.
3. **1 adulto + 1 niño de 10–17 años** queda sin suplemento. Son $20–30 por noche si
   comercialmente deciden lo contrario.
4. **La King de Maracay admite hasta 4 huéspedes por decisión del programador, no del
   negocio.** Se copió el criterio de la Twin. Si son 3, o 2, es cambiar un número en
   `datos/habitaciones.json`.
5. **La quinta persona de la Family Suite de Valencia paga $20 a cualquier edad.** En
   Maracay los adicionales sí distinguen edad; en Valencia no se indicó.

`pax_min_cobrados` vacío en las cuádruples de Morrocoy **ya está confirmado** como
correcto por el negocio. No lo cambies de vuelta.

---

## 5. Riesgos y mantenimiento

**Las tarifas son públicas.** El repo es público y Pages sirve `datos/` a quien tenga la
URL. Decisión asumida. No metas ahí nada de clientes ni ninguna credencial.

**`datos/` no tiene respaldo fuera de Git.** El historial es el respaldo. Y ahora el repo
se mueve desde dos sitios —la PC y la administración—, así que **`git pull` antes de
trabajar en local**, o el próximo push choca.

**El token caduca.** Cuando pase, la administración dirá "La clave no vale o caducó" y
hay que generar otro. No es un fallo.

**Cadencia sugerida:** correr el validador una vez al mes y antes de cada temporada alta.

---

## 6. Para retomar el trabajo

1. Lee `CLAUDE.md`: invariantes, convenciones, los seis bugs que no hay que reintroducir
   y las trampas de este repositorio.
2. `cd verificacion && npm install && npm test` — cuatro suites, todas en `FALLAN: 0`.
3. `git pull`, por si la administración publicó algo.
4. Recién entonces, plantea el cambio.

El error más caro es tocar el motor sin correr las pruebas antes. Son 309 aserciones que
existen porque cada una atrapó algo.

Y el segundo más caro es dar por bueno un cambio visual sin verlo en un navegador de
verdad. jsdom valida la lógica; la maquetación solo la valida el navegador, y a 390 px,
que es el ancho desde el que se cotiza.

---

## 7. Sesión del 03/09/2026

Cuatro bloques, todos en `main`.

### Cambios de la app

- **Hoteles como botones**, no desplegable: son cinco, no cambian nunca, y elegir hotel
  es lo primero de cada cotización. Las cinco en una fila en escritorio, dos en teléfono.
- **Mini cotizador:** vaciar y plegar. Plegado en su propia ventana, la ventana entera
  pasa a ser una barra oscura con el total; dentro de la página, una burbuja arrastrable.
- **Mensajes por asesor** con juego propio y caída al del hotel, con pestaña propia en la
  administración y vista previa armada con el motor de verdad.
- **La marca Hesperia** en la cabecera, en la burbuja del mini y como favicon. Un solo
  archivo con `currentColor`: tinta sobre claro, blanca sobre oscuro, como la usa la
  cadena.

### Las cinco correcciones de la auditoría

Todas verificadas. La barra del total ya no se aplasta contra el borde del iPhone
(`box-sizing` hacía que el respiro de la franja del gesto le comiera la altura),
`btn-alerta` existe, `--acento` tiene valor sin hotel elegido, las pistas pasan AA y todo
lo que se pulsa responde al toque.

### Opción A — el sistema, cumplido

De diecisiete tamaños de letra a seis, todos de la escala del sistema. Los papeles que
`tokens.css` nombra usan su clase; los controles de formulario llevan `font: inherit`
para que la clase vaya en la etiqueta que los envuelve. Los 73 espacios en px crudos
pasan a `--e1`…`--e6`. Ver `CLAUDE.md` §El sistema visual manda.

### Opción C — jerarquía material

El mensaje deja de estar detrás de otra pantalla. En el teléfono se asoma siempre por
debajo del formulario con las primeras líneas de verdad y se arrastra para leerlo entero.
La barra del total **se muda dentro** del panel —se mueve, no se duplica: con dos barras
habría dos totales y algún día dirían cosas distintas—. Y con el mensaje a la vista, el
botón de la barra pasa a ser copiar.

El formulario se agrupa en hojas por asunto. Una habitación dentro de una hoja pierde su
tarjeta propia: una caja dentro de una caja no es jerarquía.

### Publicar a GitHub

Ver §2. Suite nueva de 29 chequeos contra un GitHub de mentira, que comprueba lo que
importa: que el commit sea uno, que lo subido sea exactamente lo editado, que un fallo a
mitad no mueva la rama, y que después no quede rastro de la clave.

### Lo que se aprendió, y está en CLAUDE.md

Tres roturas del mismo tipo en un solo día: **una regla que debía mandar, perdiendo por
orden de cascada en vez de ganar por especificidad.** `.solo-pc` contra `.btn-cabecera`,
el atributo `hidden` contra `display: grid`, y las reglas del mini contra las de móvil.
Están documentadas juntas a propósito, porque va a volver a pasar.

---

## 8. Sesión del 07/09/2026

### Tipo de promoción nuevo: `MENOR_GRATIS`

La campaña "un niño gratis" no se podía expresar con los tres tipos que había: los tres
operan sobre la tarifa por persona y esta promoción quita un pax facturable. Estaba
cargada como `SUSTITUYE 35`, que en la Junior de Morrocoy con dos adultos y un niño de 6
cotizaba **$87,50 la noche en lugar de $140** —$52,50 por debajo del precio correcto—, y
entraba en vigencia el 16/09. Se corrigió antes de que aplicara.

El detalle del tipo está en `README.md` §4. Lo que importa de la decisión:

- **El rango de edad lo nombra la fila, no el código.** `rango_menor: NIN` y las edades
  las pone `politica-ninos.json` de cada hotel: 5-9 en Morrocoy, 5-10 en Margarita y
  Playa el Agua. La misma campaña sirve en los tres sin una línea de código por hotel.
- **El menor sigue contando en la ocupación** y sigue apareciendo en el mensaje. Deja de
  pagar, no de existir.
- **Si no puede aplicarse, no compite.** No se anuncia y deja pasar a otra promoción de
  tarifa. La asesora puede marcarla sin romper nada.
- Uno por habitación. Mínimo 2 adultos (`min_adultos`). No se acumula con otra promoción.

Cargada en los tres hoteles de playa como `PRO_NINO_GRATIS`, del 16/09 al 15/10/2026.
**Antes se llamaba `HBK_NIÑO` y solo existía en Morrocoy**: se unificó el código, como
`PRO_RESIDENTES`, para que una campaña sea una fila por hotel y no un código por hotel.

### Los cinco hoteles en una fila en el teléfono

Solo la sigla y su color, como en el mini y por la misma razón de ancho: el nombre corto
obligaba a dos filas y la segunda empuja las fechas fuera de la primera pantalla. Medido
en Chromium a 390 px: cinco botones de 65×48, una fila, sin desborde horizontal. El nombre
completo sigue a la vista en el chip de la cabecera en cuanto se elige el hotel.

### Dos cosas que estaban rotas en `main` y no se sabía

- **`npm test` estaba en rojo**, por un cierre de venta publicado desde la
  administración. Ver §3. Se arregló haciendo que los chequeos de interfaz inyecten su
  propio cierre y su propia promoción en vez de depender del catálogo de esa semana.
- **El detalle de un chip elegido era ilegible: 1,9:1.** Usa `.t-pista`, que trae su
  color del sistema, y sobre el chip invertido —tinta llena— ese color desaparece. No se
  notaba porque los detalles eran de tres caracteres (`−$5 p/p`); con una etiqueta larga
  quedó a la vista. Ahora hereda el papel del chip: 9,5:1.

Los dos son del mismo tipo que las tres roturas del 03/09: **una regla que debía mandar,
perdiendo por orden de cascada o por una premisa que se movió debajo.**

### Lo que queda pendiente de esta sesión

- **Probarlo en el teléfono de Marla.** Chromium a 390 px no es un teléfono: la fila de
  siglas y el chip de la promoción son lo que hay que mirar.
- **Nada que hacer con los finales de línea, y la razón vale la pena.** Durante la
  sesión pareció que ocho archivos estaban modificados sin un solo cambio real, por CRLF
  contra LF. Era un falso positivo: se leyó el repositorio con el git del puente
  —Linux, donde `core.autocrlf` no está puesta— y no con el de Windows, donde el
  instalador deja `core.autocrlf=true` en la configuración del sistema. Con esa
  configuración un árbol de trabajo en CRLF **está limpio**: git normaliza a LF al hacer
  `add`, y el repositorio guarda LF, que es exactamente lo que se quiere.
  **No hace falta `.gitattributes`**, y añadir `eol=lf` renormalizaría los 48 archivos
  del repo para nada.
  La lección: **el git del puente no es el git de esta máquina.** Comparten los archivos
  pero no la configuración, así que el estado del repositorio se diagnostica desde
  PowerShell. Es el mismo patrón de siempre en este proyecto —una premisa que se mira
  con la herramienta equivocada—, solo que esta vez el equivocado fue el diagnóstico y no
  el código.

---

## 9. Sesión del 11/09/2026

### Luisana Villalobos (`LV`), con juego propio en los cinco hoteles

Fila en `asesoras.json` y cinco en `plantillas.json`. `asesoras.json` **no se edita
desde la administración** —es estructural, como hoteles y habitaciones—, así que un alta
sigue siendo un commit; sus mensajes, en cambio, ya los puede corregir ella misma desde
la pestaña Mensajes.

Su formato venía en un Word y se reprodujo, con tres cosas que **no** se copiaron tal
cual, y conviene saber por qué:

- **Los precios no se escribieron en el texto donde ya existen como dato.** El
  brazalete, el early y el late de los hoteles de playa salen por `{{BLOQUE_EXTRAS}}`
  desde `extras.json`, así que el día que cambie un monto no hay que tocar cinco
  plantillas. En Valencia y Maracay sí quedaron escritos a mano, porque esos dos hoteles
  no tienen filas en `extras.json`. Ver "lo que queda".
- **"Promoción Mes Septiembre" y "Super Hot Sale" no entraron.** Un mes escrito a mano
  queda viejo el día 1 y nadie se enteraría. Las campañas salen por `{{BLOQUE_PROMO}}`,
  que imprime la que de verdad se aplicó y las noches que cubre.
- **"IVA incluido" tampoco.** Invariante 6: ninguna tarifa lleva impuestos encima y el
  mensaje no los menciona en ningún hotel. Hay un chequeo que lo vigila en las cinco
  plantillas, no solo en las de ciudad.

La política de niños quedó como texto literal en sus plantillas, por decisión explícita.
**Tiene una consecuencia:** si el negocio cambia un rango en `politica-ninos.json`, su
mensaje sigue diciendo el viejo y ninguna prueba lo nota. Si algún día molesta, el
arreglo es un bloque más generado desde los datos, como `{{BLOQUE_EXTRAS}}`.

### Marcador nuevo: `{{FECHA_COTIZACION}}`

Su formato lleva la fecha del día y no había marcador. **Lo pasa la interfaz, no lo
calcula el motor:** `motor.js` sigue sin llamar a `new Date()` fuera de
`Fechas.sumarDias()`, y el render sigue siendo repetible en los arneses. Si llega vacío
sale vacío; si llega fuera de ISO **rompe**, que es la lección del bug de los cierres de
venta. Detalle en `README.md` §4.

De paso apareció un desfase real: `new Date().toISOString()` da la fecha **UTC**, así
que pasadas las 8 de la noche en Venezuela ya es mañana allá. La cotización habría
salido fechada al día siguiente, y el aviso de "la fecha de entrada ya pasó" se adelantaba
esas cuatro horas. Ahora `logica.js` tiene `hoyLocalISO()` y los dos usos pasan por ahí.
**`admin.js` todavía usa la fecha UTC** para el horizonte del validador, donde un día de
diferencia no cambia nada; si alguna vez importa, es el mismo arreglo.

### La promo de niño gratis, extendida

`PRO_NINO_GRATIS` hasta el **20/12/2026** en Isla Margarita y Playa el Agua. En Morrocoy
se queda en el **15/10/2026**, que es donde ya estaba. Verificado renderizando el 01/12
en los dos hoteles de playa: la promoción aplica y se anuncia.

### Lo que queda de esta sesión

Cuatro hallazgos de datos. **Ninguno es del código y ninguno lo decido yo:**

1. **`politica-ninos.json` de Maracay se contradice.** Las edades dicen `INF 0-2`,
   `NIN 3-9`, `MAY 10-17`, pero las etiquetas que ve el cliente dicen `0-4 años`,
   `5-10 años` y `11-17 años`. El motor cobra por las edades e imprime las etiquetas:
   hoy un mensaje de Maracay puede decirle al cliente un rango distinto del que se le
   cobró. El Word de Luisana coincide con las **edades** (3 a 9 y 10 a 17), así que lo
   más probable es que las etiquetas sean las viejas. Son tres campos.
2. **Valencia y Maracay no tienen `extras.json`.** Por eso el early y el late quedaron
   escritos a mano en sus plantillas. Cargarlos como filas los haría cobrables desde el
   cotizador — salvo el de Maracay, que es "50% de la tarifa" y el motor no tiene ese
   tipo: sería un tipo nuevo, no una fila.
3. **El "pax adicional por niño" de Valencia no cuadra con `adicionales.json`.** El Word
   dice 3-9 años $10 y 10-17 años $20; los datos solo tienen la Family Suite a $20 desde
   los 3 años. Es el pendiente §4.5 visto desde el otro lado.
4. **Dos horas de salida que no coinciden.** El late check out de Valencia: `hoteles.json`
   dice 2:00 PM, su Word dice 4:00 PM. Y en Maracay su Word rotula "LATE CHECK IN ...
   desde las 5:00 PM", que se escribió como "LATE CHECK OUT ... hasta las 5:00 PM" por
   ser lo único que tiene sentido para un cliente. Los dos valores están hoy escritos a
   mano en sus plantillas; en cuanto se confirmen, mejor que salgan de `hoteles.json`.

Y lo de siempre: **probarlo en el teléfono.** Sus plantillas son bastante más largas que
las de Marla —el asomo del mensaje y el arrastre son justo lo que cambia con el largo—.

---

# Registro histórico

Lo que sigue es el diario de las sesiones anteriores. Describe estados que ya no son el
actual —hay secciones que hablan de Apps Script o de pushes pendientes— pero se conserva
porque es el **por qué** de cada decisión, y es lo que evita que alguien revierta algo
sin saber qué resolvía. Para saber cómo está el proyecto hoy, lee de la §1 a la §7.

---

## Decisiones de arquitectura y por qué

| Decisión | Motivo |
|---|---|
| Toda la lógica de negocio fuera del código | La gerencia cambia tarifas sin programador. Agregar un hotel son filas, no código |
| Una sola implementación del cálculo | Imposible que diverjan dos copias |
| Fechas como texto ISO, un solo punto toca `Date` | Los corrimientos de zona horaria eran el bug recurrente |
| Prioridad en temporadas en vez de fragmentar rangos | Permite cargar feriados como capa encima de la temporada base sin recortar fechas a mano |
| Promociones opt-in, evaluadas noche por noche | Una promo puede cubrir parte de la estadía; el requisito lo pedía explícitamente |
| Copiado en tres niveles desde el día uno | El iframe de Apps Script bloqueaba la API moderna en móvil |
| Arneses en Node además de las pruebas del catálogo | Un ciclo de prueba en segundos en vez de minutos |
| Los datos de Sheets a JSON en Git | Los cambios de tarifa quedan en el historial, con autor y fecha, y se pueden revertir |
| Se eliminó el registro de cotizaciones | No se necesitaba |
| Sitio estático en GitHub Pages | Sin escritura en Sheets, nada obliga a tener servidor. Se fue la cuota de Apps Script y el iframe que rompía el copiado en móvil |
| Repo público | Asumido a conciencia: las tarifas quedan legibles para quien tenga la URL |

**Dos invariantes cambiaron al migrar.** "Un solo motor, cliente y servidor" perdió la
mitad servidor y se conserva en su forma útil: **una sola implementación del cálculo**.
"El servidor siempre recalcula" desapareció con el registro de cotizaciones. Los demás
—cero lógica de negocio en el código, fechas ISO, nunca un 0 silencioso— siguen mandando.

---

## 01/09/2026 · Migración de los datos

Los JSON de `datos/` se generaron desde **`BD_Cotizador_Hesperia.xlsx`**, el export del
Sheet de producción (`VERSION_TARIFAS` = **v2026.08.21**), y **no** desde
`cargarDatosDemo_()` de `00_Setup.gs`, que había quedado atrás. Las cabeceras de las 13
hojas coinciden exactamente con el `ESQUEMA`, así que la conversión fue directa.

| Archivo | Filas |
|---|---|
| `datos/hoteles.json` | 5 |
| `datos/habitaciones.json` | 21 |
| `datos/temporadas.json` | 14 |
| `datos/tarifas.json` | 57 |
| `datos/stop-sales.json` | 1 |
| `datos/politica-ninos.json` | 15 |
| `datos/promociones.json` | 2 |
| `datos/cargos-fecha.json` | 6 |
| `datos/plantillas.json` | 5 |
| `datos/config.json` | 8 claves |

Los `SI`/`NO` pasaron a booleanos y los importes a números; las fechas quedaron en ISO.

### En qué difería el código de la realidad

Buena parte de lo que dice `README.md` y las secciones viejas de este documento se quedó
corto. Producción tenía:

- **WTC y HMC activos**, con **9 tarifas** cargadas. El código los tenía en `activo = NO`
- **Dos habitaciones nuevas en WTC** (`DLX_TPL`, `SUITE_FLY`) y otras dos reordenadas
- **`ocup_min_fisica` bajó de 2–3 a 1** en cuatro habitaciones de Morrocoy
- **`pax_min_cobrados` quedó vacío** en las cuádruples de Morrocoy, donde el código
  tenía `3`
- **Solo 14 temporadas**, no 20

### Cuatro cosas que hay que decidir o arreglar

1. **Bug latente en StopSales.** La única fila cargada tiene las fechas como texto
   `18/09/26`, no en ISO. `enRango()` compara strings, así que ese cierre **no bloquea
   nada y no avisa**: comprobado, `'20/09/26' >= '2026-09-19'` es `false`. Es el mismo
   patrón del bug del `"5,6"`. Pasó desapercibido porque la fila está en `activo = NO`.
   → **El validador debe rechazar cualquier fecha que no sea `YYYY-MM-DD`.** Al generar
   los JSON se normalizó a `2026-09-18`/`2026-09-20`, pero la fila parece un ensayo:
   sin motivo y desactivada. Confirmar si se borra.

2. **Los hoteles de ciudad se quedan sin tarifas el 30/12/2026.** WTC y HMC tienen una
   sola temporada, `BAJA_26`, hasta esa fecha. No tienen Navidad ni Fin de Año: cotizar
   el 31/12 en Valencia o Maracay falla **hoy**, no en 2027.

3. **`pax_min_cobrados` vacío en las cuádruples de Morrocoy.** Resuelve un pendiente de negocio — o lo borró alguien sin querer. Hay que confirmarlo con el negocio.

4. **El validador no se ha vuelto a correr desde que se activaron WTC y HMC.** La hoja
   `Validacion` es del 21/08/2026 y todavía los reporta inactivos. Nadie ha validado el
   catálogo tal como está hoy en producción.


---

## 01/09/2026 · Conversión a sitio estático

Google Apps Script desapareció del proyecto. El sitio se sirve desde la raíz del repo.

| Antes | Ahora |
|---|---|
| `02_Motor.html` | `assets/motor.js` — **sin un solo cambio de lógica** |
| `07_Estilos.html` | `assets/estilos.css` |
| `08_Logica.html` | `assets/logica.js` |
| `01_Catalogo.gs` | `assets/catalogo.js` — misma forma de objeto, pero por `fetch` |
| `04_Validador.gs` | `assets/validador.js` — devuelve hallazgos, ya no abre diálogos |
| `05_Pruebas.gs` | `verificacion/pruebas.js` |
| `06_SPA.html` | `index.html` |
| `00_Setup.gs`, `03_Api.gs`, `appsscript.json` | eliminados |

Lo que se fue con ellos: el registro de cotizaciones, la caché de Apps Script, el menú
del Sheet, el generador de hojas y los datos de instalación. Las iniciales de la asesora
pasaron de `PropertiesService` a `localStorage`.

### El IVA se eliminó por completo

Ninguna tarifa lleva impuestos encima y el mensaje no los menciona en ningún hotel. Se
quitó `iva_pct` del motor, del catálogo y de `datos/hoteles.json`, y con él el renglón
`"Precio por noche $200 + IVA= $232"`.

**Los hoteles de ciudad bajan de precio:** la tarifa cargada pasa a ser el precio final,
así que Valencia cotiza $200 por noche donde antes cobraba $232. Fue una decisión
explícita, no un efecto colateral.

### Las suites siguen siendo el control

**231 aserciones y 51 chequeos de interfaz, todo en verde.** Y ahora corren contra
`assets/` y `datos/` reales: se cerró la brecha que dejaba fuera la capa de persistencia.

Al migrar, ocho aserciones fallaron. Ninguna era un error de conversión: todas
reflejaban cambios que el Sheet ya tenía y el código no.

- `pax_min_cobrados` vacío: las cuádruples de Morrocoy cobran 2,5 pax donde antes
  forzaban 3. **Cambia el precio al público** — quedó confirmado con el negocio
- `ocup_min_fisica` en 1: ahora se acepta una pareja en una cuádruple
- WTC y HMC activos: dejaron de estar ocultos

Las tres reglas que ya ningún dato ejercita (`pax_min_cobrados`, `ocup_min_fisica` alto)
siguen probadas inyectándolas con `conHab_()`, porque el motor las soporta y la gerencia
puede volver a cargarlas.

### Mejora de interfaz

Las habitaciones nuevas se agregan **al principio** de la lista y las ya configuradas
bajan una posición. En el celular, agregar la cuarta habitación ya no la mandaba fuera
de la pantalla.

### Pendientes de negocio abiertos

- **La King de Maracay admite hasta 4 huéspedes por decisión mía, no tuya.** Se indicó
  que cobra adicionales pero no cuántos caben; se copió el criterio de la Twin. Si son
  solo 3, o solo 2, es cambiar un número en `datos/habitaciones.json`.
- **La quinta persona de la Family Suite paga $20 a cualquier edad.** En Maracay los
  adicionales sí distinguen edad; en Valencia no se indicó, y se cargó monto único.

### Lo que falta para publicar

- Activar GitHub Pages (rama `main`, carpeta raíz)
- **Probar en un celular real.** Al salir del iframe de Apps Script, el copiado en tres
  niveles puede simplificarse — pero eso se comprueba en un teléfono, no en jsdom
- Revisar `README.md`, que todavía describe la arquitectura de Apps Script


---

## 02/09/2026 · Sistema visual aplicado

Marla definió el sistema con Claude Design y `assets/tokens.css` es el entregable tal
cual: los colores, la tipografía, las alturas de lo táctil, los radios, los espacios y
el foco de teclado viven ahí. `estilos.css` solo los consume — si un color cambia, se
cambia en un sitio.

### Lo que cambió respecto de lo que había

- **`--tinta-45` pasó de `#7D8CA0` a `#64758C`.** El anterior daba 3.3:1 sobre blanco:
  no cumplía AA y desaparecía al sol, que es justo donde se usa la app.
- **Ámbar de advertencia** (`--aviso` `#9A5B08`). Antes las advertencias se veían
  iguales que los errores rojos, y no son lo mismo.
- **Acentos de hotel reasignados:** Morrocoy verde mar, Isla Margarita mostaza, Playa
  el Agua azul agua, **Valencia vino** y **Maracay naranja** — los dos que faltaban.
- **La mostaza y el naranja no sirven para texto** (2.1:1 y 3.5:1). Como relleno con
  letra blanca funcionan; como color de letra hay `--acento-texto`.
- **El botón principal es tinta, no el acento.** El botón más importante de la
  aplicación no puede cambiar de color según lo que se cotice: se busca con el pulgar
  sin mirar.
- **El foco de teclado ya no depende del hotel.** Si el indicador cambia de color en
  cada pantalla, deja de ser una señal fija.
- **El color nunca informa solo:** el acento viaja con la sigla del hotel, y los avisos
  llevan la palabra ERROR o SIN DISPONIBILIDAD además del color.
- **El total se apaga a `$ —`** cuando no se puede cotizar. Es imposible copiar un
  precio que no existe.
- **En escritorio el copiar sube a la cabecera** del panel de vista previa. En el
  celular sigue al pie, donde cae el pulgar.

### El mini cotizador ahora es una ventana, no un modal

Decisión del diseño, y es mejor: cuando hace falta un precio suelto el navegador suele
estar detrás de otra cosa. Tres niveles, como el copiado:

1. **Ventana de documento** (Chrome y Edge de escritorio): flota sobre cualquier
   aplicación, incluso con el cotizador cerrado.
2. **Ventana emergente:** propia, pero se va detrás al hacer clic fuera.
3. **Panel dentro de la página:** cuando un bloqueador de emergentes impide las dos
   anteriores. Es mejor que un botón que no hace nada.

**Ya no existe en el celular**, también por decisión del diseño: allí no hay ventanas
flotantes y la asesora tiene la aplicación entera a mano.

### Un bug que solo apareció en un navegador de verdad

Al mover el panel a la otra ventana, sus campos dejan de pertenecer al documento
principal y `document.getElementById` devuelve `null`. Las pruebas en jsdom no lo veían
porque jsdom nunca abría la ventana: se descubrió abriendo la página en Chromium.

Arreglado buscando los campos dentro del propio panel, que viaja entero con sus hijos.
El arnés ahora le da una ventana de verdad —otro documento jsdom— para que no vuelva.

Es el cuarto caso del patrón que este proyecto ya conocía: **las pruebas validan la
lógica, la plataforma solo la valida la plataforma.**


---

## 02/09/2026 · Listo para publicar

Ocho commits locales. **Falta el push**, que necesita las credenciales de GitHub del
usuario y no se puede hacer desde el entorno de trabajo.

```powershell
cd C:\dev\cotizador
git push -u origin main
```

Después, en GitHub: **Settings › Pages › Source: Deploy from a branch › main / (root)**.
La URL queda en `https://juankcasal.github.io/cotizador/`. Cada push publica.

### Estado

| | |
|---|---|
| Aserciones | **309** |
| Chequeos de interfaz | **95** |
| Validador sobre el catálogo real | 0 errores, 2 advertencias |

Las dos advertencias son el horizonte de Valencia y Maracay, que termina el 20/12/2026.

### Lo que queda

- **Probarlo en el celular de Marla.** Cinco de los fallos históricos aparecieron en
  dispositivos reales; ninguna suite los habría visto.
- **Cargar los cierres de venta reales.** La tabla sigue vacía.
- **Pantalla de administración** (Fase 5), para que la gerencia edite el catálogo sin
  pasar por un programador. Aplazada hasta ver el uso real.
- **Cargar las temporadas de 2027**, y las de fin de año de los hoteles de ciudad.


---

## 02/09/2026 · Pantalla de administración

`admin.html` + `assets/admin.js` + `assets/admin.css`. Se llega desde el botón
**Administración** de la cabecera del cotizador, en escritorio.

**Cabecera en tinta llena, invertida.** Decisión del diseño y vale la pena respetarla:
marca que esto no es la pantalla de venta antes de que nadie lea una palabra. Aquí un
error se lo lleva el cliente.

### Qué hace

- Edita las cinco tablas que se tocan: tarifas, temporadas, fechas bloqueadas,
  promociones y servicios. Cada pestaña declara sus columnas en un esquema; agregar una
  columna es una entrada ahí, no código nuevo.
- **El validador corre en cada tecla.** Es lo que separa esta pantalla de editar el JSON
  a mano: un error de carga se ve al escribirlo, no cuando una asesora manda un precio
  malo. Las filas con hallazgos se marcan en la tabla, no solo en el panel lateral.
- **Con errores no deja publicar.** Publicar un catálogo que no carga deja a las asesoras
  sin cotizador. Las advertencias sí dejan seguir.
- Un punto ámbar en las pestañas que tienen hallazgos, para verlos sin ir buscándolos.
- El borrador se guarda en el navegador mientras se trabaja: cargar un tarifario son
  cuarenta filas y perderlas por recargar sin querer no es aceptable.
- **Publicar descarga los archivos que cambiaron** —solo esos— para subirlos a `datos/`.
  Ese rodeo es deliberado: sin servidor no hay forma de autenticar a nadie, y un token de
  escritura viviendo en un navegador es peor que un paso manual.

### Lo que no hace

- No sube nada por su cuenta. Alguien tiene que arrastrar los archivos al repositorio.
- No edita hoteles, habitaciones ni la política de niños: son cambios de estructura, más
  raros y más delicados, y se hacen sobre el JSON con el validador al lado.
- No hay control de acceso, porque no puede haberlo en un sitio estático. La URL es
  pública: quien la conozca puede abrirla. Lo que **no** puede es cambiar nada de lo
  publicado sin acceso de escritura al repositorio.

### Estado

| | |
|---|---|
| Aserciones | **309** |
| Chequeos de interfaz | **92** |
| Chequeos de administración | **48** |

`npm test` corre las tres suites.
