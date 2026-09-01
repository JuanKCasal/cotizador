# CLAUDE.md

Instrucciones para trabajar en este repositorio. Léelo completo antes de tocar código.

## Qué es esto

Cotizador de habitaciones para la cadena de hoteles Hesperia (Venezuela). Corre sobre
**Google Apps Script + Google Sheets**. Una asesora abre un enlace, arma la cotización y
copia un mensaje ya formateado para pegar en WhatsApp.

No es una app web normal: el "servidor" es Apps Script, la "base de datos" es un Google
Sheet, y el despliegue es un botón en el editor de Google. Eso condiciona casi todas las
decisiones técnicas que verás.

## Estructura

```
apps-script/     Los 10 archivos que suben a Google Apps Script. Es el producto.
verificacion/    Arneses de prueba en Node. NO se despliegan.
docs/            Guías de instalación y operación.
README.md        Documentación funcional completa (9 secciones).
HANDOFF.md       Estado del proyecto y próximos pasos.
```

### Los 10 archivos de `apps-script/`

| Archivo | Rol |
|---|---|
| `00_Setup.gs` | `ESQUEMA` (13 hojas), generador de hojas, datos demo, menú |
| `01_Catalogo.gs` | Lee las hojas → objeto `catalogo`. Caché. Normalizadores defensivos |
| `02_Motor.html` | **Motor de cálculo y render.** Corre igual en cliente y servidor |
| `03_Api.gs` | `doGet`, endpoints `api*`, carga del motor con `new Function()` |
| `04_Validador.gs` | 8+ chequeos de integridad del catálogo |
| `05_Pruebas.gs` | Suite dentro del Sheet (201 aserciones) |
| `06_SPA.html` | Markup de la interfaz |
| `07_Estilos.html` | CSS |
| `08_Logica.html` | Estado, cascada de habitación, cálculo en vivo, copiado |

Los nombres son parte del contrato: `03_Api.gs` carga los HTML por nombre con
`createHtmlOutputFromFile('02_Motor')`. **Renombrar un archivo rompe la app.**

## Comandos

```bash
cd verificacion
npm install                 # solo la primera vez (jsdom)
node _verificar.js          # 218 aserciones: motor + flujo de la SPA
node _verificar_spa.js      # 47 chequeos: interfaz en un DOM simulado
```

Ambos deben terminar en `FALLAN: 0` y `Sin errores de ejecucion`.

**Corre las dos suites antes y después de cualquier cambio al motor.** No es opcional:
es lo único que separa un refactor seguro de un error de precio en producción.

La suite autoritativa es la del Sheet (**menú Cotizador › Ejecutar pruebas funcionales**),
porque es la única que atraviesa la capa de persistencia. Ver "Límite conocido" abajo.

## Invariantes de arquitectura

No los cambies sin una razón explícita y sin decirlo. Cada uno existe por un bug real.

1. **Cero lógica de negocio en el código.** Ni un precio, ni un nombre de hotel, ni una
   política. Todo vive en las 13 hojas. Agregar un hotel, categoría o temporada debe ser
   **solo filas**. Si tu cambio necesita un `if (hotel === 'HBK')`, el modelo de datos
   falló: arréglalo ahí, no en el código.

2. **Un solo motor.** `02_Motor.html` se incluye en la página *y* se evalúa en el servidor
   con `new Function()`. Cliente y servidor ejecutan el mismo código. No dupliques lógica
   de cálculo en `08_Logica.html` ni en `03_Api.gs`.

3. **El servidor siempre recalcula.** `apiRegistrarCotizacion` nunca guarda los totales que
   manda el navegador. Recalcula desde el `req` y guarda su propio resultado.

4. **Fechas como texto ISO `YYYY-MM-DD`.** Se comparan como strings (en ISO, lexicográfico
   = cronológico). **Un solo punto del código toca `Date`: `Fechas.sumarDias()`.** Si
   escribes `new Date()` en el motor, casi seguro estás introduciendo un bug de zona
   horaria.

5. **Nunca un `0` ni un `NaN` silencioso.** Una noche sin tarifa devuelve un error explícito
   con la fecha (`"Sin tarifa cargada para 15/06/27"`) y bloquea el registro.

6. **El cálculo corre en el cliente.** La asesora ajusta fechas y edades docenas de veces
   por cotización; un round-trip por cambio haría la app inusable.

## Convenciones de código

- **`apps-script/` es ES5.** `var`, `function`, sin arrow functions, sin `const`/`let`, sin
  template literals. Apps Script soporta V8, pero el código es homogéneo y el motor se
  evalúa con `new Function()` en un contexto sin transpilación. Mantén el estilo.
- **`verificacion/` es Node moderno.** Ahí sí `const`, arrow functions, `async/await`.
- **Comentarios en español sin acentos dentro de los `.gs`.** Los strings de cara al usuario
  sí llevan acentos y emojis (con escapes `\uXXXX` para los emojis).
- **Comenta el *por qué*, no el *qué*.** Los comentarios valiosos de este repo explican
  qué bug de plataforma motivó una línea rara. Consérvalos.
- El código y la UI están en español. Mantenlo.

## Bugs de plataforma ya resueltos — no los reintroduzcas

Los tres aparecieron en producción, no en las pruebas. Si "simplificas" alguno, vuelven.

1. **Sheets convierte `"5,6"` en el número `5.6`.** La coma se interpreta como separador
   decimal y el filtro de días de la semana queda roto **en silencio**: la promoción no se
   aplica y el total sale mal sin ningún error.
   → El `ESQUEMA` declara columnas `texto` que se formatean como texto plano *antes* de
   escribir, y `parseDias_()` tolera el dato ya corrompido.

2. **`matchMedia` no existe en algunos WebViews** (WhatsApp en Android antiguo). Rompía
   `esMovil()`, que se llama **dentro del último recurso de copiado** — la asesora quedaba
   sin ninguna forma de copiar.
   → `esMovil()` prueba tres alternativas con `try/catch` y nunca lanza. `copiarNivel3()`
   abre el modal y carga el texto *antes* de cualquier paso decorativo.

3. **Los selectores nativos de Android tratan `min` como exclusivo.** Con `min = entrada+1`
   era imposible cotizar una sola noche desde el celular.
   → El `min` del campo de salida es la **fecha de entrada**, no entrada+1. El orden lo
   valida el motor, que ya devuelve un mensaje claro.

El patrón común: los tres viven en la frontera entre el código y una plataforma real. Las
pruebas validan la lógica; **solo un dispositivo real valida la plataforma.**

## Trampas de este repositorio

**Los arneses leen de `apps-script/`, no de copias.** `verificacion/` duplicaba ocho
archivos; las copias se eliminaron y los arneses resuelven las rutas con
`path.join(__dirname, '..', 'apps-script')`. **No vuelvas a copiar archivos ahí:** una
copia obsoleta hace que las pruebas validen código viejo sin avisar. Como las rutas ya
no dependen del directorio actual, las suites corren igual desde `verificacion/` o
desde la raíz.

**`instalarTodo()` borra y recarga todas las hojas del catálogo, incluidas las tarifas
reales.** Nunca sugieras ejecutarlo sobre un Sheet en producción sin exportar una copia.

**Límite conocido de los arneses de Node.** Validan la lógica del motor, **no** la capa de
persistencia. El bug del `"5,6"` no aparecía ahí porque el dato nunca pasaba por Sheets.
Un cambio no está validado hasta que pasan las pruebas *dentro* del Sheet.

## Definición de "listo"

Un cambio está terminado cuando:

- [ ] Las dos suites de Node pasan con 0 fallos
- [ ] Las pruebas del menú Cotizador pasan dentro del Sheet
- [ ] `Cotizador › Validar catálogo` no reporta errores nuevos
- [ ] Si tocaste el motor, hay un caso de prueba nuevo que cubre el cambio
- [ ] Si tocaste la interfaz, se probó en un celular real (no solo en jsdom)
- [ ] El `README.md` refleja el cambio si alteró comportamiento o modelo de datos

## Al proponer cambios

- **Pregunta antes de asumir reglas de negocio.** Varias decisiones de precio quedaron
  abiertas a propósito; están en §9 del `README.md`. No las resuelvas por tu cuenta.
- **Prefiere una fila en una hoja antes que una línea de código.**
- Si un cambio obliga a tocar el motor para soportar un hotel nuevo, dilo explícitamente:
  es señal de que el modelo de datos necesita un concepto nuevo, como pasó con
  `modo_tarifa`, `iva_pct` y `formato_ocupantes` al agregar los hoteles de ciudad.
