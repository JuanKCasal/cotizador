# Guía para definir el estilo del Cotizador

**Para:** Marla Zuluaga
**Herramienta:** Claude Design (dentro de Claude)
**Tiempo estimado:** una hora, sin apuro

---

## Por qué lo haces tú

El cotizador lo usas tú, todos los días, con un cliente esperando del otro lado de
WhatsApp. Quien mejor sabe qué se lee rápido, qué botón se pulsa con el pulgar y qué
pantalla cansa a la tercera cotización eres tú, no el que programa.

Lo que vas a producir no es un dibujo bonito: es la referencia que se convierte en el
CSS real de la aplicación. Las decisiones que tomes aquí son las que van a quedar.

---

## Cómo funciona

1. Abre Claude y empieza una conversación nueva.
2. Copia **todo** el bloque grande de más abajo (desde `INICIO DEL ENCARGO` hasta
   `FIN DEL ENCARGO`) y pégalo como primer mensaje.
3. Claude te devuelve un lienzo con varias pantallas dibujadas, una al lado de otra.
4. **Tócalo.** Puedes hacer clic en cualquier texto, color o botón y cambiarlo tú misma,
   sin pedirle nada a Claude.
5. Para variantes, háblale normal: "muéstrame la misma pantalla con un verde más
   apagado", "el botón de copiar más grande", "prueba sin las esquinas redondeadas".
6. Cuando estés conforme, guarda y **pásame el enlace**.

Si a mitad de camino te trabas o algo no se deja cambiar, no pelees con la herramienta:
mándame lo que llevas y lo vemos juntos.

---

## Las cuatro preguntas que solo tú puedes contestar

Cuando veas las pantallas, no te quedes en "me gusta" o "no me gusta":

1. **¿El total se lee sin buscarlo?** Es el número que el cliente te está pidiendo.
2. **¿El botón de copiar cae donde tienes el pulgar?** Lo vas a pulsar cientos de veces.
3. **¿El aviso de "no hay disponibilidad" te detiene?** Si te lo puedes saltar sin
   notarlo, está mal diseñado, por bonito que sea.
4. **¿Distingues los hoteles de un vistazo por el color?** Sobre todo Valencia y
   Maracay, que son nuevos y todavía no tienen color propio.

Si algo te incomoda pero no sabes explicar por qué, díselo así mismo: "esta pantalla me
cansa la vista pero no sé por qué". Sabe trabajar con eso.

---

# INICIO DEL ENCARGO

> Copia desde aquí hasta el final, incluyendo las tablas.

```
Necesito que definas el sistema visual de una aplicación web que uso a diario para
trabajar. Usa Claude Design y devuélveme un lienzo con las pantallas que te detallo al
final.

## QUÉ ES LA APLICACIÓN

Un cotizador de habitaciones para la cadena de hoteles Hesperia en Venezuela. Soy asesora
de ventas: un cliente me escribe por WhatsApp preguntando precios, yo armo la cotización
en esta app y copio el mensaje ya formateado para pegárselo. Todo ocurre mientras el
cliente espera, así que cada segundo de más en la pantalla es un segundo de silencio en
la conversación.

## CÓMO LA USO DE VERDAD

- Desde el celular la mayor parte del tiempo, con una sola mano, muchas veces de pie.
  También desde la computadora cuando estoy en la oficina. Tiene que funcionar bien en
  las dos, no ser una pensada para PC y encogida para el teléfono.
- A veces con sol directo sobre la pantalla.
- Hago la misma cotización cinco o seis veces cambiando fechas y edades hasta que al
  cliente le cuadra el precio. La pantalla la veo decenas de veces al día.
- Salto entre esta app y WhatsApp constantemente.
- Tiene que andar en celulares viejos y con conexión lenta.

## LO QUE HAY EN LA PANTALLA

Es una sola página con dos columnas en computadora: a la izquierda armo la cotización, a
la derecha veo cómo va quedando el mensaje de WhatsApp. En el celular se apilan, y la
vista del mensaje se abre como un panel encima.

Armando la cotización:
- Elijo el hotel entre cinco. Tres de playa (Morrocoy, Isla Margarita, Playa el Agua) y
  dos de ciudad (Valencia, Maracay).
- Fecha de entrada y fecha de salida.
- Agrego una o varias habitaciones (hasta 8). En cada una elijo categoría, ocupación y a
  veces un atributo como "vista piscina" —son tres listas desplegables encadenadas—,
  cuántos adultos, cuántos niños, y la edad exacta de cada niño, porque la edad cambia el
  precio. Al agregar una habitación nueva aparece arriba de la lista.
- Marco promociones si aplican.
- Escribo el nombre del cliente y mis iniciales.
- Abajo, siempre visible, una barra con el total que se actualiza sola.

A la derecha:
- El mensaje de WhatsApp tal como le va a llegar al cliente, dentro de una burbuja verde
  sobre fondo de chat, para que yo vea exactamente lo que va a recibir.
- Un botón grande de copiar. Es la acción más importante de toda la aplicación.

Además:
- Una calculadora rápida, en una ventanita aparte que abro con un botón flotante. Sirve
  para sacar un precio suelto sin perder la cotización que ya tengo armada. En la
  computadora es un panel chico en una esquina que puedo mirar mientras hablo por
  teléfono; en el celular sube desde abajo. Adentro tiene: hotel, habitación, fechas,
  adultos, niños con sus edades, y un total grande.
- Avisos de error cuando algo no cuadra: una fecha sin tarifa cargada, un hotel cerrado
  esas noches por falta de habitaciones, una ocupación que no se vende (la Deluxe Twin de
  Valencia solo se alquila para dos personas). Estos avisos tienen que detenerme de
  verdad: si mando un precio malo, el problema es mío frente al cliente.
- Una pantalla aparte de administración, donde la gerencia carga tarifas, temporadas y
  fechas bloqueadas. La usa otra persona, desde una computadora, con calma. Puede verse
  distinta: más densa, más tabla, menos botón grande.

## EL SISTEMA VISUAL QUE YA EXISTE

Esto es lo que hay hoy funcionando. **Mejóralo, no lo tires.** Si quieres cambiar algo,
explícame por qué antes.

### Colores

| Nombre | Código | Para qué |
|---|---|---|
| tinta | #0B2545 | Azul marino profundo. Es el color base de todo el texto y la marca |
| tinta-70 | #4A6079 | Texto secundario |
| tinta-45 | #7D8CA0 | Texto de apoyo, pistas, etiquetas tenues |
| sal | #EEF2F5 | Fondo de la página |
| papel | #FFFFFF | Fondo de las tarjetas |
| arena | #DCE3E9 | Bordes |
| arena-sut | #EDF1F4 | Bordes y fondos muy tenues |
| alerta | #B3382F | Errores |
| alerta-sut | #FDF1F0 | Fondo de los errores |
| exito | #1B7A5A | Confirmaciones |
| wa-fondo | #E4DDD5 | Fondo del chat en la vista previa |
| wa-burbuja | #E8FDD8 | Burbuja verde del mensaje |
| wa-texto | #10241C | Texto dentro de la burbuja |

### El acento cambia por hotel

Un color distinto por hotel, para reconocer de un vistazo cuál estoy cotizando. Cada uno
tiene su versión fuerte y una suave para fondos.

| Hotel | Acento | Acento suave |
|---|---|---|
| Morrocoy | #D96A22 (naranja atardecer) | #FDF2EA |
| Isla Margarita | #17796E (verde mar) | #E9F5F3 |
| Playa el Agua | #12688C (azul agua) | #E8F2F7 |
| Valencia (WTC) | **falta** | **falta** |
| Maracay (HMC) | **falta** | **falta** |

Los dos de ciudad todavía usan el azul marino por defecto. Propón colores que se
distingan bien de los tres de playa y entre sí, y que se noten "de ciudad" al lado de
los otros.

### Tipografías

| Uso | Fuente | Dónde |
|---|---|---|
| Títulos | Bricolage Grotesque (600 y 800) | Marca, títulos, nombres de hotel |
| Cuerpo | Instrument Sans (400, 500, 600) | Todo el texto normal |
| Números | IBM Plex Mono (400, 500, 600) | Precios, totales, versión de tarifas |

Tamaños que se usan hoy: base 16px, títulos de sección 11px en mayúsculas con mucho
espaciado entre letras, campos 15–16px, pistas 12,5px, total de la barra 21px, total de
la calculadora 30px.

### Formas y espacio

- Esquinas: 8px (chico), 12px (medio), 18px (grande).
- La barra inferior del total mide 68px de alto.
- El corte entre celular y computadora está en 900px de ancho.

## LO QUE NECESITO QUE ME ENTREGUES

Un lienzo con estos artboards, en este orden y con estos nombres:

**Fundamentos**
1. `Paleta` — cada color con su nombre, su código y para qué sirve. Incluye los cinco
   acentos de hotel, con los dos que faltan ya propuestos.
2. `Tipografía` — la escala completa: título grande, título de sección, texto normal,
   texto pequeño, precio, total. Con el tamaño y el peso de cada uno escritos al lado.
3. `Componentes` — botón principal, secundario y de peligro; campo de texto; lista
   desplegable; campo de fecha; contador de adultos y niños; tarjeta; ficha de
   habitación; chip de promoción; aviso de error; aviso de advertencia; barra del total;
   botón flotante. Cada uno en sus estados: normal, con el cursor encima, presionado,
   deshabilitado y con foco de teclado.

**La aplicación en celular** (ancho 390px)
4. `Móvil · cotización` — la pantalla principal con dos habitaciones ya cargadas y la
   barra del total abajo.
5. `Móvil · error` — la misma pantalla mostrando "el hotel está cerrado esas fechas".
6. `Móvil · mensaje` — la vista previa de WhatsApp abierta, con su botón de copiar.
7. `Móvil · calculadora` — la calculadora subiendo desde abajo, con un total calculado.

**La aplicación en computadora** (ancho 1280px)
8. `PC · cotización` — las dos columnas, formulario y vista previa, con una cotización
   de dos habitaciones.
9. `PC · calculadora` — la misma pantalla con el panel de la calculadora abierto en la
   esquina, sin tapar el total ni el botón de copiar.
10. `PC · administración` — la pantalla de la gerencia cargando tarifas: una tabla densa,
    con el validador mostrando dos advertencias.

**Comprobación**
11. `Acentos` — la misma tarjeta de habitación repetida cinco veces, una por hotel, para
    ver que el sistema aguanta el cambio de color sin romperse.

Para cada artboard, anota al lado las medidas que un programador necesita: tamaños de
letra, espacios, altos de los elementos que se tocan.

## REGLAS QUE NO SE NEGOCIAN

- Primero el celular. Si algo se ve bien en computadora pero mal en el teléfono, está mal.
- Todo lo que se toca mide al menos 44 píxeles de alto. Se usa con el pulgar, con prisa.
- Contraste alto de verdad, pensando en pantalla al sol. Nada de gris claro sobre blanco.
  El texto normal tiene que cumplir contraste AA como mínimo.
- El total y el botón de copiar son lo más importante de la pantalla. Que se note.
- Los errores tienen que verse como errores. Si un aviso de "no hay disponibilidad" pasa
  desapercibido, le mando un precio equivocado a un cliente.
- Nada de depender solo del color para dar información: quien no distingue bien los
  colores tiene que poder usar la app igual.
- Todo en español.

## CÓMO QUIERO TRABAJARLO

Empieza mostrándome nada más la paleta y la tipografía. Cuando yo te las apruebe, sigue
con los componentes. Recién con eso aprobado, arma las pantallas completas. No me
muestres las once cosas de una vez.
```

# FIN DEL ENCARGO

---

## Cuando termines

Guarda el lienzo y mándame el enlace. Yo me encargo de convertirlo en la aplicación real.
