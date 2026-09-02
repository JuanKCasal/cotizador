# HANDOFF.md

Estado del proyecto y plan de trabajo.

**Repo:** https://github.com/JuanKCasal/cotizador (público)
**Local:** `C:\dev\cotizador`
**Última actualización:** 01/09/2026

---

## 1. Estado actual

El cotizador **está en producción y funcionando** sobre Google Apps Script + Google
Sheets. Lo que sigue no arregla nada roto: cambia la plataforma y agrega funciones.

| | |
|---|---|
| Hoteles activos | Morrocoy (HBK), Isla Margarita (HIM), Playa el Agua (HPA) |
| Hoteles preparados sin tarifas | WTC Valencia (WTC), Maracay (HMC) — `activo = NO` |
| Hojas del catálogo | 13 |
| Tipos de habitación | 19 |
| Tarifas cargadas | 48 (reales, no demo) |
| Temporadas | 20 (4 por hotel) |
| Horizonte de tarifas | hasta **12/01/2027** |
| Pruebas en el Sheet | 201 aserciones, todas en verde |
| Pruebas en Node | 218 aserciones + 47 chequeos de interfaz, todas en verde |

### Lo que ya está resuelto

- Motor de cálculo compartido cliente/servidor, con recálculo obligatorio en el servidor
- Cruce de temporadas con prioridad, promociones noche por noche, **stop sales**
- Política de niños por edad exacta, distinta por hotel
- Suplemento de habitación individual, mínimo facturable, cargos de fecha fija
- Dos modos de tarifa: `POR_PERSONA` (playa) y `POR_HABITACION` con IVA 16% (ciudad)
- Interfaz responsiva con copiado a WhatsApp en tres niveles de respaldo
- Validador de integridad del catálogo con 8+ chequeos
- Tres bugs de plataforma detectados en dispositivos reales y corregidos

---

## 2. Cambio de rumbo — decidido el 01/09/2026

El proyecto deja Google. Las decisiones, con su motivo:

| Decisión | Motivo |
|---|---|
| **Los datos pasan de Sheets a archivos JSON versionados en Git** | Los cambios de tarifa quedan en el historial, con autor y fecha, y se pueden revertir |
| **Se elimina el registro de cotizaciones** | No se necesita. Desaparecen las hojas `Cotizaciones` y `CotizacionLineas` |
| **La app pasa a sitio estático en GitHub Pages** | Sin datos en Sheets ni escritura, nada obliga a tener servidor. Se va la cuota de Apps Script y el iframe que rompe el copiado en móvil. El despliegue pasa a ser un push |
| **Repo público** | Asumido a conciencia: las tarifas y los cierres de venta quedan legibles para quien tenga la URL |
| **La gerencia edita con una pantalla de administración que descarga el JSON** | Sin servidor no hay login real. La pantalla valida y genera el archivo; una persona lo sube al repo. Ninguna credencial vive en el navegador |
| **Early Check-In y Late Check-Out entran al total, por persona y una vez por estadía** | Hoy solo salen como texto informativo en la plantilla |
| **Los menores pagan esos extras según `factor_pago` de `PoliticaNinos`** | Reutiliza el mecanismo que ya rige las tarifas; no agrega conceptos al modelo |

### Los dos invariantes que cambian

`CLAUDE.md` §Invariantes queda editado al ejecutar la migración:

- **#2 "un solo motor, cliente y servidor"** pierde la mitad servidor. `02_Motor.html`
  pasa a ser `motor.js`, cargado una sola vez. El invariante se conserva en su forma
  útil: **una sola implementación del cálculo, en ningún otro archivo.**
- **#3 "el servidor siempre recalcula"** desaparece con el registro de cotizaciones.

Los invariantes **#1 (cero lógica de negocio en el código), #4 (fechas ISO), #5 (nunca
un 0 silencioso) y #6 (cálculo en el cliente) siguen intactos** y mandan igual que antes.

---

## 3. Lo que falta y lo que no

### Stop Sales — el motor ya lo tiene, faltan los datos

Cuidado con darlo por inexistente. Ya está construido de punta a punta:

- Esquema `StopSales`: `hotel, cod_hab, fecha_inicio, fecha_fin, motivo, activo`
- `stopSaleDe()` en el motor, que bloquea **noche por noche**
- Cuatro chequeos en el validador: hotel inexistente, habitación inexistente, rango
  invertido, cierre vencido, y una advertencia de hotel sin ninguna habitación libre
- Caso de prueba T19, a nivel hotel y a nivel habitación

Un `cod_hab` vacío cierra el hotel completo; con código, solo esa habitación.

**Lo que falta:** la tabla está vacía (nadie ha cargado un cierre), y la interfaz no
tiene una forma cómoda de gestionarlos ni de explicarle a la asesora por qué un hotel
no se puede vender esas noches.

### Early Check-In / Late Check-Out — existen, pero no cobran

La tabla `Hoteles` ya trae `early_checkin_pp`, `late_checkout_pp`, `hora_late_checkout`
y `brazalete_vip_dia`, y la plantilla los imprime como línea informativa. **No entran al
cálculo y no hay dónde marcarlos.**

Lo pedido es que sean seleccionables y sumen. El brazalete VIP es el mismo patrón (por
día en vez de por estadía) y quedó fuera de este alcance, pero conviene modelar los tres
como una tabla `extras` en vez de tres casos especiales en el código — invariante #1.

---

## 4. Plan de trabajo, en orden

**Fase 0 — Commit del estado actual.** Antes de reescribir nada, dejar el legacy
funcionando en Git como punto de retorno.

**Fase 1 — Generar los JSON.** ✅ hecho (01/09/2026). Ver §10: los datos salieron del
**export real del Sheet**, no de `cargarDatosDemo_()`, que estaba desactualizado.

Las 13 hojas quedaron en 10 archivos bajo `datos/`: se fueron `Cotizaciones` y
`CotizacionLineas` (sin registro) y `Validacion` (era la salida del validador, ahora se
muestra en pantalla). Falta agregar `extras.json`.

**Fase 2 — Convertir a sitio estático.** ✅ hecho (01/09/2026). Ver §11.

**Fase 3 — Stop Sales de cara al usuario.** ✅ hecho el motor y la interfaz. Un cierre
ya no se lee como un error de datos: tiene su propio aviso, con el motivo y las noches
afectadas, y las fechas avisan antes de terminar de armar la cotización. **Falta cargar
los cierres reales** — la tabla sigue vacía.

**Fase 4 — Extras cobrables.** ✅ hecho (02/09/2026). `extras.json`, casilla en la
interfaz, suma en el motor, `{{BLOQUE_EXTRAS}}` en el mensaje y 27 aserciones nuevas.
El brazalete VIP quedó modelado como `POR_PERSONA_DIA` aunque nadie lo active todavía:
así activarlo es marcar una fila, no tocar el motor.

**Fase 5 — Pantalla de administración.** ✅ hecha (02/09/2026). Ver §14.

**Fase 6 — Estilo.** Aplicar el sistema visual que defina Marla
(`docs/GUIA-ESTILOS-MARLA.md`).

---

## 5. Migración a Git — lo ya hecho (01/09/2026)

- ✅ Contenido movido de `legacy/` a la raíz; `INSTALACION-RAPIDA.txt` a `docs/`
- ✅ `.gitignore` en la raíz
- ✅ **Duplicación corregida.** `verificacion/` contenía copias de ocho archivos de
  `apps-script/` (todos menos `03_Api.gs`). Se verificó que eran idénticas, los arneses
  se apuntaron a la carpeta real y las copias se borraron:

  ```js
  const path = require('path');
  const SRC = path.join(__dirname, '..', 'apps-script');
  const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
  ```

  Las once llamadas a `fs.readFileSync('X', 'utf8')` pasaron a `leer('X')`. Al usar
  `__dirname`, las suites corren igual desde `verificacion/` o desde la raíz.
  Suites después del cambio: **218/218** y **47 chequeos, 0 fallos**.
- ⏸ Primer commit — pendiente

Los pasos de `clasp` del plan anterior quedaron **sin efecto**: no habrá Apps Script.

---

## 6. Decisiones anteriores y por qué

Contexto para que nadie las revierta sin saber qué resolvían.

| Decisión | Motivo |
|---|---|
| Toda la lógica de negocio fuera del código | La gerencia cambia tarifas sin programador. Agregar un hotel son filas, no código. **Sigue vigente con los JSON** |
| Una sola implementación del cálculo | Imposible que diverjan dos copias |
| Fechas como texto ISO, un solo punto toca `Date` | Los corrimientos de zona horaria eran el bug recurrente |
| Prioridad en temporadas en vez de fragmentar rangos | Permite cargar feriados como capa encima de la temporada base sin recortar fechas a mano |
| Promociones opt-in, evaluadas noche por noche | Una promo puede cubrir parte de la estadía; el requisito lo pedía explícitamente |
| Copiado en tres niveles desde el día uno | El iframe de Apps Script bloquea la API moderna en móvil. Al salir del iframe conviene revisar si los tres niveles siguen haciendo falta — **probar en un celular real antes de quitar ninguno** |
| Arneses en Node además de las pruebas del catálogo | Un ciclo de prueba en segundos en vez de minutos |

---

## 7. Pendientes de decisión del negocio

Ninguno bloquea el uso. Están en §9 del `README.md`; resumen:

1. **`DESCUENTO_MONTO` y los niños.** El descuento se resta de la tarifa por persona, así
   que con la Promoción para Residentes (−$5) un niño al 50% recibe $2,50. Si son $5 por
   cabeza sin importar el factor, hay que cambiarlo en el motor.
2. **Promoción para Residentes:** no existe en Morrocoy y vence el **15/09/2026** — es
   decir, en dos semanas.
3. **1 adulto + 1 niño de 10–17 años** queda sin suplemento. Son $20–30 por noche si
   comercialmente deciden lo contrario.
4. **`pax_min_cobrados = 3`** en las cuádruples de Morrocoy anula el descuento del menor
   cuando el pax facturable baja de 3. Verificar que sea la intención.

---

## 8. Riesgos y mantenimiento

**El horizonte de tarifas termina el 12/01/2027.** Una cotización posterior devuelve un
error explícito — correcto, pero inútil para la asesora. El validador avisa cuando quedan
menos de 120 días. **Cargar las temporadas de 2027 antes de octubre de 2026**, o sea el
mes que viene.

**Tarifas públicas.** Decisión asumida: quien tenga la URL puede leer precios y cierres.

**Migrar los datos es la operación de más riesgo del plan.** Un error de conversión
cambia precios en silencio. Comparar el JSON generado contra el Sheet fila por fila, con
un script, no a ojo.

**Cadencia sugerida:** correr el validador una vez al mes y antes de cada temporada alta.

**Discrepancia menor detectada.** El `README.md` §8 dice "20 tipos de habitación"; el
código carga **19**. Corregir el README en algún commit.

---

## 9. Para retomar el trabajo

1. Lee `CLAUDE.md` — invariantes, convenciones y los tres bugs que no hay que reintroducir
2. Lee `README.md` §5 (modelo de datos) y §9 (pendientes)
3. Corre las dos suites de `verificacion/` para confirmar el punto de partida
4. Recién entonces, plantea el cambio

El error más caro que se puede cometer aquí es tocar el motor sin correr las pruebas
antes. Son 218 aserciones que existen porque cada una atrapó algo.


---

## 10. Migración de los datos — hecho el 01/09/2026

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

3. **`pax_min_cobrados` vacío en las cuádruples de Morrocoy.** Resuelve el pendiente #4
   de §7 — o lo borró alguien sin querer. Hay que confirmarlo con el negocio.

4. **El validador no se ha vuelto a correr desde que se activaron WTC y HMC.** La hoja
   `Validacion` es del 21/08/2026 y todavía los reporta inactivos. Nadie ha validado el
   catálogo tal como está hoy en producción.


---

## 11. Conversión a sitio estático — hecha el 01/09/2026

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
  forzaban 3. **Cambia el precio al público** — es el pendiente 3 de §10
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

## 12. Sistema visual aplicado — 02/09/2026

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

## 13. Listo para publicar — 02/09/2026

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

## 14. Pantalla de administración — hecha el 02/09/2026

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
