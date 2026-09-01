# Cotizador Hesperia

Cotizador de habitaciones y paquetes para la cadena Hesperia. Google Apps Script +
Google Sheets. La asesora entra por un enlace, arma la cotización y copia el mensaje
listo para pegar en WhatsApp.

**Hoteles en producción:** Morrocoy (HBK), Isla Margarita (HIM), Playa el Agua (HPA).
**Hoteles preparados, sin tarifas:** WTC Valencia (WTC), Maracay (HMC) — ver §8.

**Estado:** tarifas reales cargadas. 201 aserciones dentro del Sheet, 218 en el arnés
de Node y 47 chequeos de la interfaz en jsdom, todos en verde.

---

## 1. Instalación

Crear un Google Sheet nuevo → **Extensiones › Apps Script**.

En el editor, crear los archivos con **estos nombres exactos**. El nombre importa:
`03_Api.gs` carga el motor y la interfaz buscándolos por nombre.

| Archivo en el editor | Tipo | Contenido |
|---|---|---|
| `00_Setup` | Script | `00_Setup.gs` |
| `01_Catalogo` | Script | `01_Catalogo.gs` |
| `02_Motor` | HTML | `02_Motor.html` |
| `03_Api` | Script | `03_Api.gs` |
| `04_Validador` | Script | `04_Validador.gs` |
| `05_Pruebas` | Script | `05_Pruebas.gs` |
| `06_SPA` | HTML | `06_SPA.html` |
| `07_Estilos` | HTML | `07_Estilos.html` |
| `08_Logica` | HTML | `08_Logica.html` |

Luego:

1. **Configuración del proyecto** (⚙️) → marcar *"Mostrar el archivo de manifiesto
   appsscript.json"* y ajustar la zona horaria a **Caracas**.
2. Reemplazar el contenido de `appsscript.json`.
3. Ejecutar `instalarTodo()` una vez y autorizar los permisos.
4. Recargar la hoja → aparece el menú **Cotizador**.

> `instalarTodo()` **borra y recarga** todas las hojas del catálogo, incluidas las
> tarifas. Sobre un Sheet que ya está en uso, primero exportar una copia.

---

## 2. Publicar y compartir

**Implementar › Nueva implementación › Aplicación web**

| Campo | Valor |
|---|---|
| Ejecutar como | **Yo** |
| Quién tiene acceso | **Cualquier usuario de la organización** |

Con esa combinación las asesoras usan la app **sin tener acceso al Sheet**: cotizan y
registran, pero no ven ni modifican las tarifas.

El enlace que termina en `/exec` es el que se comparte. En celular conviene guardarlo con
**⋮ › Agregar a pantalla principal**, así queda como una app.

Agregando `?diag=1` al final se abre la pantalla de diagnóstico (catálogo cargado, número
de tarifas, cierres de venta activos, versión) en lugar del cotizador.

### Al actualizar el código

**Implementar › Administrar implementaciones › ✏️ › Versión: Nueva versión › Implementar.**

El enlace **no cambia**, así que las asesoras no hacen nada. Si en vez de eso se crea una
*implementación nueva*, se genera otro enlace y hay que repartirlo de nuevo.

Los cambios de **tarifas, cierres de venta o promociones** no requieren re-implementar:
basta con **Cotizador › Publicar cambios**.

---

## 3. Menú Cotizador

| Opción | Qué hace |
|---|---|
| Instalar / Reinstalar hojas | Recrea la estructura y recarga los datos (**borra lo cargado**) |
| Validar catálogo | Chequeos de integridad → hoja `Validacion` |
| Generar matriz de tarifas faltantes | Crea las filas habitación × temporada que faltan, en amarillo |
| Publicar cambios | Limpia la caché e incrementa `VERSION_TARIFAS` |
| Ejecutar pruebas funcionales | 201 aserciones → hoja `Pruebas` |

---

## 4. Arquitectura

```
doGet() ──► 06_SPA.html  [interfaz de la asesora]
              │
              ├─ apiIniciar()  ← UNA sola llamada: catálogo + iniciales
              │     └─ CacheService (6 h)
              │
              ├─ cálculo en el CLIENTE con 02_Motor.html (instantáneo)
              │
              └─ apiRegistrarCotizacion()
                    └─ LockService + RECÁLCULO en servidor + escritura
```

**Por qué el cálculo va en el cliente:** la asesora ajusta fechas y edades docenas de veces
por cotización. Una llamada al servidor por cada cambio (300–800 ms) haría la app inusable.

**Por qué no hay riesgo:** `02_Motor.html` se incluye en la página *y* se evalúa en el
servidor con `new Function()`. Cliente y servidor usan **el mismo código**, y al registrar
el servidor **siempre recalcula**: nunca guarda los totales que le manda el navegador.

---

## 5. Modelo de datos (13 hojas)

| Hoja | Rol |
|---|---|
| `Config` | Versión de tarifas, moneda, iniciales por defecto, mensajes |
| `Hoteles` | Datos y textos fijos de cada hotel, modo de tarifa e IVA |
| `Habitaciones` | Catálogo de productos: categoría × ocupación × atributo |
| `Temporadas` | Rangos de fecha con **prioridad** (resuelve solapamientos) |
| `Tarifas` | Precio por hotel × habitación × temporada |
| `StopSales` | Rangos de fechas **sin cupo**, por hotel o por habitación |
| `PoliticaNinos` | Rangos de edad y factor de pago, **distintos por hotel** |
| `Promociones` | Opt-in, se evalúan noche por noche, con renglón de mensaje |
| `CargosFecha` | Cenas de 24 y 31 de diciembre |
| `Plantillas` | Texto de WhatsApp con marcadores `{{...}}` |
| `Cotizaciones` | Registro: cabecera + texto generado |
| `CotizacionLineas` | Registro: detalle por habitación, con las edades |
| `Validacion` | Salida del validador |

El código **no contiene ningún precio ni nombre de hotel**. Todo vive en las hojas.

### Reglas implementadas

**Modo de tarifa.** La columna `modo_tarifa` de `Hoteles` decide cómo se lee `Tarifas`:

| Valor | Significado | Suplemento single |
|---|---|---|
| `POR_PERSONA` | La tarifa es por persona/noche (hoteles de playa) | Aplica |
| `POR_HABITACION` | La tarifa es por habitación/noche, sin importar cuántos huéspedes (hoteles de ciudad) | No aplica |

**IVA.** `iva_pct` en `Hoteles`. Con `0` la tarifa cargada ya es el precio final. Con `16`
la tarifa es neta y el mensaje imprime `Precio por noche $100 + IVA= $116`. El IVA se
aplica también a los cargos de fecha fija.

**Suplemento de habitación individual.** Aplica cuando la habitación no alcanza a facturar
dos personas completas:

```
pax_pagos = Σ factor(rango) de los huéspedes

SI modo = POR_PERSONA Y permite_single Y pax_pagos < 2:
    costo_noche = (tarifa_pp × pax_pagos) + suplemento_single
SINO SI modo = POR_PERSONA:
    costo_noche = tarifa_pp × pax_pagos
SINO:
    costo_noche = tarifa_habitacion
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

**Redondeo.** Todos los montos que ve el cliente son **enteros redondeados hacia arriba**.
El redondeo ocurre en el **costo de una habitación en una noche**, no al final: así el
desglose por noche suma exactamente el total y el cliente puede rehacer la cuenta. Por eso
la fila de $157,50 de arriba da $158 por noche y **$316** en dos noches, no $315.

**Edades de los menores.** La asesora indica la **edad real de cada menor**, no una
cantidad por rango. El motor mapea cada edad al rango del hotel (que cambia según el
hotel) y el mensaje imprime las edades:

```
2 adultos + 2 niños (6 y 8 años)
1 adulto + 1 infante (3 años) + 1 niño (12 años)
```

Un menor recién agregado arranca **sin edad** y bloquea la cotización con un error
explícito. Es a propósito: una edad por defecto termina impresa en el mensaje del cliente.
Una edad de 18 o más se rechaza pidiendo que se cuente como adulto.

**Cierres de venta (stop sales).** Una fila en `StopSales` marca un rango de **noches** sin
cupo, para el hotel completo (`cod_hab = TODAS`) o para una categoría. Si alguna noche de
la estadía cae en el rango, la cotización se bloquea con la fecha y el motivo. Como se
comparan noches y no días calendario, quien **sale** la mañana del primer día cerrado no se
ve afectado.

**Otras reglas:**

- Las noches son `[checkin, checkout)`. El día de salida no se cobra.
- **Prioridad** en temporadas: número mayor gana. Convención: `10` temporadas base,
  `50` feriados, `90` bloqueos puntuales. Solaparse con la misma prioridad es un **error**
  de carga, no un empate a resolver.
- **Promociones opt-in**, evaluadas noche por noche: cubren parcialmente la estadía.
  Cada promoción puede llevar un `mensaje` que se imprime debajo cuando aplica.
- `DESCUENTO_MONTO` se resta de la **tarifa por persona**, así que un niño que paga el 50%
  recibe la mitad del descuento. Ver §9.
- **Cargos de fecha fija** aplican si la fecha pertenece a `[checkin, checkout)`. Si el
  cliente sale el 24 al mediodía, no paga la cena de Navidad.
- Ante una noche sin tarifa: **error explícito con la fecha**, nunca un `0` ni un `NaN`.

---

## 6. Trampas de Apps Script y cómo se mitigaron

### Portapapeles — tres niveles

El iframe de HtmlService bloquea `navigator.clipboard` en varios escenarios:

1. `navigator.clipboard.writeText()`
2. `<textarea>` oculto + `document.execCommand('copy')`
3. Modal con el texto ya seleccionado e instrucción según dispositivo

El nivel 3 está blindado: carga el texto y abre el modal **antes** de cualquier paso
decorativo. Si algo falla, el mensaje sigue ahí para copiar a mano.

`esMovil()` (que decide el texto de la instrucción) vive dentro de ese último recurso, así
que **no puede lanzar**: `matchMedia` no existe en WhatsApp/Android antiguo ni en WebViews
viejos, y una excepción ahí dejaba a la asesora sin ninguna forma de copiar. Tiene tres
alternativas encadenadas y `try/catch` en cada una.

### Selectores de fecha nativos en Android — dos trampas distintas

**1. `min` tratado como exclusivo.** El `min` del campo de salida se fija en la fecha de
**entrada**, no en entrada+1. Varios selectores nativos de Android tratan `min` como
exclusivo, lo que bloqueaba el día siguiente y hacía **imposible cotizar una sola noche
desde el celular**. El orden de las fechas lo valida el motor, que ya da un mensaje claro.
(`08_Logica.html`, listener de `checkin`.)

**2. Valor rechazado en silencio.** Algunos selectores rechazan sin avisar un valor que
choca con un `min`/`max` recién asignado: la propiedad queda en cadena vacía y el campo
aparece en blanco. `fijarFecha()` verifica que el navegador haya aceptado el valor y, si
no, levanta la restricción, asigna y la restaura.

No simplificar ninguna de las dos: se ven como código redundante y no lo son.

### Fechas y zona horaria

Todas las fechas se guardan como **texto `YYYY-MM-DD`** y se comparan como strings
(en ISO, lexicográfico = cronológico). Un único punto del código toca `Date`: `sumarDias()`.
`normalizarFecha_()` recupera el valor aunque alguien reformatee la celda.

El formato que ve el cliente sale de la columna `formato_fecha` del hotel: `dd/MM/yy` para
los hoteles de playa, `dd/MM/yyyy` para los de ciudad.

### Columnas que DEBEN estar en formato Texto sin formato

`instalarTodo()` las formatea automáticamente. Sheets corrompe estos valores en silencio:

| Hoja | Columna | Qué pasa si no es texto |
|---|---|---|
| Promociones | `dias_semana` | `"5,6"` → número `5.6`; **la promo nunca se aplica** |
| Temporadas, Promociones, CargosFecha, StopSales | fechas | `Date` con corrimiento de zona horaria |
| Hoteles | horas de check-in/out | `"3:00 PM"` → valor de hora |

`parseDias_()` y `normalizarTexto_()` recuperan el dato aunque ya esté corrompido, y el
validador reporta el caso con la instrucción de arreglo.

### Caché desactualizada

`CacheService` guarda el catálogo 6 horas. **Cotizador › Publicar cambios** la limpia e
incrementa la versión. `onEdit` marca `CAMBIOS_SIN_PUBLICAR` en rojo para que quien edita
sepa que falta publicar. La hoja `StopSales` también dispara esa marca: un cierre cargado
y no publicado sigue vendiendo noches que no existen.

### Concurrencia

`LockService` alrededor del registro. Los IDs usan un contador en `Config` dentro del lock,
no `getLastRow()+1`, que es frágil bajo concurrencia.

---

## 7. Pruebas

### En el Sheet — 201 aserciones

**Cotizador › Ejecutar pruebas funcionales** → hoja `Pruebas`.

| Caso | Qué verifica |
|---|---|
| G1 | Fechas: fin de mes, bisiesto, cambio de año, el día de salida no es noche, ambos formatos |
| G2 | Redondeo: siempre entero, siempre hacia arriba, sin inflar enteros exactos |
| T01–T05 | Suplemento single en sus cinco variantes, con edades reales |
| T06 | Cruce de temporadas con prioridad |
| T07–T08 | Promoción Residentes parcial; y que no aplica sin seleccionarla |
| T09 | `DESCUENTO_MONTO` sobre un niño que paga el 50% |
| T10–T11 | Cena del 24; y que **no** se cobra si el 24 es día de salida |
| T12 | Múltiples habitaciones con ocupaciones distintas |
| T13 | `pax_min_cobrados` |
| T14 | Políticas de niños distintas por hotel (9/10 en HBK vs 10/11 en HIM) |
| T15 | `parseDias_`: tolerancia a que Sheets convierta `"5,6"` en `5.6` |
| T16 | Edades: sin edad, edad de adulto, agrupación por rango, compatibilidad con el formato viejo |
| T17 | 8 validaciones que deben bloquear |
| T18 | Hueco de tarifa → error explícito con la fecha |
| T19 | Stop sales: por hotel, por habitación, semántica de noches, sin contagio entre hoteles |
| T20 | Render de WhatsApp: marcadores, encabezado, tarifa, total |
| T21 | El suplemento single ya **no** se explica en el mensaje |
| T21b | El `p/p` no se muestra cuando hay mínimo facturable |
| T22 | Edades reales impresas, singular/plural, `textoEdades` |
| T23 | Desglose por tramos, pluralización, cargos, promo con su renglón de mensaje |
| T24 | Hotel de ciudad: `POR_HABITACION` + IVA + formato de ocupantes en renglones |
| T25 | Los hoteles activos renderizan; los inactivos no aparecen |
| T26 | El validador no reporta errores sobre los datos cargados |

`pruebaRegistro()` hace el ciclo completo y escribe una fila real en `Cotizaciones`
(borrarla después).

### Fuera de Apps Script

```bash
node _verificar.js          # 218 aserciones: la suite del Sheet + el flujo de la SPA
npm install
node _verificar_spa.js      # 47 chequeos: ejecuta la interfaz en un DOM simulado
```

`_verificar.js` **no duplica** las aserciones: carga `05_Pruebas.gs` y corre la misma suite
con stubs de las APIs de Google, más un bloque propio para lo que es lógica de cliente
(cascada de habitación, vista previa). Una aserción nueva en `05_Pruebas.gs` aparece sola
en el arnés, y es imposible que las dos listas se desincronicen.

`_verificar_spa.js` ensambla la página como lo hace `HtmlService` y recorre el flujo
completo: arranque, cascada de habitación, selectores de edad, cálculo en vivo, vista
previa, reinicio, los tres niveles de copiado y el registro. Detecta errores de ejecución
que el chequeo de sintaxis no ve — fue el que encontró que `matchMedia` rompía el último
recurso de copiado.

**Límite conocido:** ninguno de los dos arneses valida la capa de persistencia. El bug real
de `"5,6"` convertido por Sheets en `5.6` no aparecía ahí, porque el dato nunca pasaba por
Sheets. Las pruebas del menú Cotizador **dentro** del Sheet son la fuente de verdad.

---

## 8. Datos cargados

5 hoteles (3 activos), 20 tipos de habitación, 4 temporadas por hotel
(**2026-08-01 a 2027-01-12**), 48 tarifas, la Promoción para Residentes en HIM y HPA, y los
cargos de 24 y 31 de diciembre.

### Horizonte de tarifas

La cobertura termina el **12 de enero de 2027**. Una cotización con fecha posterior devuelve
un error explícito, que es el comportamiento correcto, pero conviene cargar las temporadas
siguientes antes de que llegue esa fecha. El validador avisa cuando quedan menos de 120 días.

### WTC Valencia y Maracay

Ambos están cargados con `activo = NO`: tienen habitaciones, temporadas, política de niños
y plantilla, pero **no tienen tarifas**. Mientras estén inactivos no aparecen en el
cotizador y el validador solo los menciona como advertencia.

Para ponerlos en producción:

1. **Cotizador › Generar matriz de tarifas faltantes** crea las combinaciones en amarillo.
2. Llenar `tarifa_pp_noche` — en estos dos hoteles es el precio **neto por habitación**,
   sin IVA: el 16% lo agrega el motor.
3. Revisar la plantilla en la hoja `Plantillas` (la cargada es un borrador según el formato
   enviado).
4. Poner `activo = SI` en `Hoteles`.
5. **Validar catálogo** y **Publicar cambios**.

### Al cargar tarifas nuevas

1. **Generar matriz de tarifas faltantes**.
2. Llenar solo la columna `tarifa_pp_noche`.
3. **Validar catálogo** antes de que nadie use la app.
4. **Publicar cambios**.

Agregar un hotel, una categoría o un atributo nuevo debería ser **solo filas en las hojas**.
Si hace falta tocar código, el modelo de datos falló y conviene corregirlo antes de seguir.

---

## 9. Pendientes de definición

- **`DESCUENTO_MONTO` y los niños.** El descuento se resta de la tarifa por persona, así
  que en la Promoción para Residentes (−$5) un niño que paga el 50% recibe $2,50. Si
  comercialmente son $5 por cabeza sin importar el factor, hay que cambiarlo en el motor.
- **La Promoción para Residentes no existe en Morrocoy** y vence el **15/09/2026**. Si
  aplica a HBK o si se extiende, son filas nuevas en `Promociones`.
- **1 adulto + 1 niño de 10–17 años** queda sin suplemento (la habitación ya factura dos
  tarifas completas). Si comercialmente quieren cobrarlo igual, la condición cambia a
  `cantidad_adultos == 1`.
- **`pax_min_cobrados = 3`** está activo en las dos cuádruples de Morrocoy (`BAS_QUA` y
  `DLX_QUA`). Con `ocup_min_fisica = 3` solo tiene efecto cuando hay menores que bajan el
  pax facturable por debajo de 3, y en ese caso **anula el descuento del menor**:
  2 adultos + 1 niño de 5 años son 2,5 pax que el mínimo sube a 3, así que el niño termina
  pagando tarifa completa. Si no es la intención, vaciar la celda en la hoja
  `Habitaciones` y usar `Publicar cambios`.
- **Ocupación máxima de HIM.** Las dos DELUXE están declaradas como `DOBLE` pero admiten
  4 huéspedes. El nombre no llega al cliente, así que no rompe nada, pero conviene alinear
  la etiqueta.
- **Suplemento single en hoteles de ciudad.** WTC y HMC cobran por habitación, así que
  `permite_single` quedó en `NO`. Si en la práctica cobran distinto por 1 persona, hay que
  decidir si es otra tarifa o un suplemento.
