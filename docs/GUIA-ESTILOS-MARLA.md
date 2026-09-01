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

## Lo que hay hoy

La app ya tiene un estilo. **No lo tires: mejóralo.** Vale la pena que lo tengas presente
al decidir.

- **Color base:** azul marino profundo (`#0B2545`), llamado "tinta marina".
- **Un color de acento por hotel**, para que sepas de un vistazo qué estás cotizando:
  Morrocoy naranja atardecer (`#D96A22`), Isla Margarita verde mar (`#17796E`),
  Playa el Agua azul agua (`#12688C`). Faltan Valencia y Maracay, que son hoteles de
  ciudad y probablemente pidan otro tono.
- **Fondos claros:** gris muy tenue (`#EEF2F5`) con tarjetas blancas.
- **Tipografías:** Bricolage Grotesque para títulos, Instrument Sans para el cuerpo,
  IBM Plex Mono para números.
- **Esquinas redondeadas** en tres tamaños (8, 12 y 18 píxeles).

---

## Paso a paso

1. Abre Claude y empieza una conversación nueva.
2. Copia **todo** el bloque de la sección siguiente y pégalo como primer mensaje.
3. Claude te va a devolver un lienzo con varias pantallas dibujadas, una al lado de otra.
4. **Tócalo.** Puedes hacer clic en cualquier texto, color o botón y cambiarlo tú misma,
   sin pedirle nada a Claude. Si algo no te gusta, cámbialo y ya.
5. Cuando quieras variantes, pídeselas en palabras: "muéstrame la misma pantalla con un
   verde más apagado", "el botón de copiar más grande", "prueba sin las esquinas
   redondeadas".
6. Cuando estés conforme, guarda y **pásame el enlace**.

---

## El texto para copiar y pegar

> Copia desde aquí hasta el final del recuadro.

```
Necesito que definas el sistema visual de una aplicación web que uso a diario para
trabajar. Usa Claude Design y devuélveme un lienzo con varias pantallas.

QUÉ ES LA APLICACIÓN

Un cotizador de habitaciones para la cadena de hoteles Hesperia en Venezuela. Soy asesora
de ventas: un cliente me escribe por WhatsApp preguntando precios, yo armo la cotización
en esta app y copio el mensaje ya formateado para pegárselo. Todo ocurre mientras el
cliente espera, así que cada segundo de más en la pantalla es un segundo de silencio en
la conversación.

CÓMO LA USO DE VERDAD

- Casi siempre desde el celular, con una sola mano, muchas veces de pie.
- A veces con sol directo sobre la pantalla, en la recepción o en la calle.
- Hago la misma cotización cinco o seis veces cambiando fechas y edades hasta que al
  cliente le cuadra el precio. La pantalla la veo decenas de veces al día.
- Salto entre esta app y WhatsApp constantemente.
- La app tiene que funcionar en celulares viejos y en conexiones lentas.

QUÉ HAY EN LA PANTALLA

La app es una sola página con dos mitades: a la izquierda armo la cotización, a la
derecha veo cómo va quedando el mensaje de WhatsApp. En el celular se apilan una encima
de la otra.

Al armar la cotización:
- Elijo el hotel entre cinco opciones. Tres son de playa (Morrocoy, Isla Margarita, Playa
  el Agua) y dos de ciudad (Valencia, Maracay).
- Pongo fecha de entrada y fecha de salida.
- Agrego una o varias habitaciones. En cada una elijo el tipo, cuántos adultos y cuántos
  niños, y la edad exacta de cada niño (la edad cambia el precio).
- Marco promociones si aplican.
- Marco servicios opcionales: entrada anticipada y salida tardía, que se cobran por
  persona.
- Abajo, siempre visible, una barra con el total que se actualiza sola cada vez que
  cambio algo.

A la derecha:
- El mensaje de WhatsApp tal como le va a llegar al cliente, dentro de una burbuja verde
  sobre fondo de chat, para que yo vea exactamente lo que va a recibir.
- Un botón grande de copiar. Es la acción más importante de toda la aplicación.

Y además:
- Avisos de error cuando algo no cuadra: una fecha sin tarifa cargada, o un hotel cerrado
  para esas noches porque no hay habitaciones disponibles. Estos avisos tienen que
  detenerme de verdad, no pasar desapercibidos: si mando un precio malo, el problema es
  mío frente al cliente.
- Una pantalla aparte de administración, donde la gerencia carga tarifas, temporadas y
  fechas bloqueadas. La usa otra persona, desde una computadora, con calma. Puede verse
  distinta: más densa, más tabla, menos botón grande.

LO QUE YA EXISTE Y QUIERO CONSERVAR EN ESPÍRITU

- Un azul marino profundo como color base: #0B2545.
- Un color de acento distinto por hotel, para reconocer de un vistazo cuál estoy
  cotizando. Hoy: Morrocoy #D96A22, Isla Margarita #17796E, Playa el Agua #12688C.
  Faltan los dos hoteles de ciudad; propón tonos que se distingan bien de los de playa.
- Fondo gris muy claro con tarjetas blancas.
- Tipografías: Bricolage Grotesque para títulos, Instrument Sans para el cuerpo,
  IBM Plex Mono para los números y precios.

Puedes mejorar todo esto, pero explícame por qué antes de cambiarlo.

LO QUE NECESITO QUE ME ENTREGUES

Un lienzo con estas pantallas dibujadas, en este orden:

1. La paleta completa: cada color con su nombre, para qué sirve y su código.
2. Las tipografías: cómo se ven los títulos, el texto normal, los precios, las
   etiquetas pequeñas. Con los tamaños concretos.
3. Los componentes sueltos: botones (el principal, el secundario, el de peligro),
   campos de texto, listas desplegables, tarjetas, avisos de error, avisos de
   advertencia, la barra del total.
4. La pantalla completa en celular, con una cotización de dos habitaciones ya cargada.
5. La misma pantalla en computadora, con las dos columnas.
6. La pantalla en celular con un aviso de error visible: el hotel está cerrado para
   esas fechas.
7. La vista del mensaje de WhatsApp con su botón de copiar.
8. La pantalla de administración cargando tarifas.

Repite la pantalla principal con el acento de dos hoteles distintos, para comprobar
que el sistema aguanta el cambio de color sin romperse.

REGLAS QUE NO SE NEGOCIAN

- Primero el celular. Si algo se ve bien en computadora pero mal en el teléfono, está mal.
- Todo lo que se toca tiene que medir al menos 44 píxeles de alto. Se usa con el pulgar,
  a veces con prisa.
- Contraste alto de verdad, pensando en pantalla al sol. Nada de gris claro sobre blanco.
- El total y el botón de copiar son lo más importante de la pantalla. Que se note.
- Los errores tienen que verse como errores. Si un aviso de "no hay disponibilidad" pasa
  desapercibido, le mando un precio equivocado a un cliente.
- Todo en español.

Empieza mostrándome la paleta y las tipografías. Cuando yo te las apruebe, sigue con
las pantallas completas.
```

---

## Las decisiones que solo tú puedes tomar

Cuando veas las pantallas, no te quedes en "me gusta" o "no me gusta". Estas cuatro
preguntas son las que de verdad importan y nadie más las puede contestar:

1. **¿El total se lee sin buscarlo?** Es el número que el cliente te está pidiendo.
2. **¿El botón de copiar cae donde tienes el pulgar?** Lo vas a pulsar cientos de veces.
3. **¿El aviso de "no hay disponibilidad" te detiene?** Si te lo puedes saltar sin
   notarlo, está mal diseñado, por bonito que sea.
4. **¿Distingues los hoteles de un vistazo por el color?** Sobre todo los dos de ciudad,
   que son nuevos.

Si algo te incomoda pero no sabes explicar por qué, díselo así mismo a Claude: "esta
pantalla me cansa la vista pero no sé por qué". Sabe trabajar con eso.

---

## Cuando termines

Guarda el lienzo y mándame el enlace. Yo me encargo de convertirlo en la aplicación real.

Si a mitad de camino te trabas o algo no se deja cambiar, no pelees con la herramienta:
mándame lo que llevas y lo vemos juntos.
