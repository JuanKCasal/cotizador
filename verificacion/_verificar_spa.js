/* Ejecuta la interfaz real en jsdom y detecta errores en tiempo de ejecucion
   que un chequeo de sintaxis no ve.

   Carga index.html tal cual, con los mismos assets/ y los mismos datos/ que
   descarga el navegador. jsdom no trae los recursos externos por su cuenta,
   asi que los scripts se insertan en linea y fetch se sirve desde el disco:
   el resto del arranque (Catalogo.cargar, promesas, DOM) corre de verdad. */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const RAIZ = path.join(__dirname, '..');
const leerRaiz = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// ---------- Pagina con los assets embebidos ----------
let pagina = leerRaiz('index.html');

pagina = pagina.replace(
  /<link rel="stylesheet" href="(assets\/[^"]+)">/g,
  (_, ruta) => '<style>\n' + leerRaiz(ruta) + '\n</style>'
);

// Funcion de reemplazo, no string: el codigo contiene $('...') y "$'" es un
// patron especial de String.replace que corromperia el resultado.
pagina = pagina.replace(
  /<script src="(assets\/[^"]+)"><\/script>/g,
  (_, ruta) => '<script>\n' + leerRaiz(ruta) + '\n</script>'
);

const pendientes = pagina.match(/(src|href)="assets\/[^"]*"/g);
if (pendientes) { console.log('ASSETS SIN RESOLVER:', pendientes); process.exit(1); }

// ---------- Errores capturados ----------
const errores = [];

// jsdom reporta como error suyo lo que no implementa (window.focus, por
// ejemplo), con su rastro completo y sin lanzar, asi que un try/catch no lo
// evita. Ese ruido se filtra; cualquier OTRO error de jsdom si se cuenta, y
// los del propio codigo se capturan en beforeParse.
const consolaVirtual = new VirtualConsole();
['log', 'info', 'warn', 'error', 'dir'].forEach((nivel) => {
  consolaVirtual.on(nivel, (...a) => console[nivel](...a));
});
consolaVirtual.on('jsdomError', (e) => {
  if (!/Not implemented/.test(e.message)) errores.push('jsdom: ' + e.message);
});

const dom = new JSDOM(pagina, {
  runScripts: 'dangerously',
  virtualConsole: consolaVirtual,
  pretendToBeVisual: true,
  url: 'https://juankcasal.github.io/cotizador/',
  beforeParse(w) {
    // fetch contra datos/, que es exactamente lo que hace Catalogo.cargar().
    w.fetch = (url) => {
      const nombre = String(url).split('?')[0].replace(/^.*\//, '');
      const ruta = path.join(RAIZ, 'datos', nombre);
      if (!fs.existsSync(ruta)) {
        return Promise.resolve({ ok: false, status: 404,
                                 json: () => Promise.reject(new Error('404')) });
      }
      let datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));

      // El catalogo real no tiene cierres de venta cargados, asi que la
      // interfaz de "no hay disponibilidad" no se ejercitaria nunca. Se agrega
      // uno del arnes, en octubre, lejos de las fechas que usan los demas
      // chequeos. El archivo real se sigue leyendo: si estuviera roto, se veria.
      if (nombre === 'stop-sales.json') {
        datos = datos.concat([{
          hotel: 'HBK', cod_hab: '', fecha_inicio: '2026-10-15',
          fecha_fin: '2026-10-17', motivo: 'Hotel lleno por convención',
          activo: true
        }]);
      }
      return Promise.resolve({
        ok: true, status: 200, json: () => Promise.resolve(datos)
      });
    };

    // Un navegador con el almacenamiento bloqueado tira excepcion al tocarlo;
    // aqui se emula el caso normal, que si guarda.
    const memoria = {};
    w.localStorage = {
      getItem: (k) => (k in memoria ? memoria[k] : null),
      setItem: (k, v) => { memoria[k] = String(v); },
      removeItem: (k) => { delete memoria[k]; }
    };

    // La aplicacion solo monta el mini cotizador en escritorio.
    Object.defineProperty(w, 'innerWidth', { value: 1280, configurable: true });

    w.addEventListener('error', (e) => errores.push('window.onerror: ' + (e.error ? e.error.stack : e.message)));
    w.addEventListener('unhandledrejection', (e) => errores.push('promesa: ' + e.reason));
    const origErr = w.console.error;
    w.console.error = (...a) => { errores.push('console.error: ' + a.join(' ')); origErr.apply(w.console, a); };
  }
});

const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
const q = (sel) => doc.querySelector(sel);
const qa = (sel) => [...doc.querySelectorAll(sel)];

let total = 0; const fallos = [];
function ok(c, d, det) { total++; if (!c) fallos.push(`${d}${det ? ' -> ' + det : ''}`); }
function eq(a, e, d) { total++; if (a !== e) fallos.push(`${d} -> esperado=${e} obtenido=${a}`); }

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }
function click(el) { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function setVal(el, v, ev) {
  el.value = v;
  el.dispatchEvent(new window.Event(ev || 'change', { bubbles: true }));
}
/** Pulsa el + o el − de un contador dentro de una ficha de habitación. */
function paso(ficha, campo, signo) {
  const g = ficha.querySelector(`.pasos[data-campo="${campo}"]`);
  click(g.querySelector(`button[data-paso="${signo}"]`));
}

(async () => {
  await esperar(150);

  // ======================================================== 1. ARRANQUE
  ok($('cargando').classList.contains('oculto'), 'la pantalla de carga se oculta');
  ok(!$('app').classList.contains('oculto'), 'la app se muestra');
  eq($('asesor').value, 'MZ', 'iniciales precargadas');
  ok($('version').textContent.indexOf('v2026') !== -1,
     'la version de tarifas se muestra', $('version').textContent);
  ok($('chipHotel').classList.contains('oculto'), 'sin hotel elegido no hay chip');
  ok($('btnAgregar').disabled, 'sin hotel no se pueden agregar habitaciones');

  // Botones y no un desplegable: los cinco a la vista, cada uno con su acento.
  const botones = qa('#hoteles .hotel-op');
  eq(botones.length, 5, 'los cinco hoteles estan a la vista como botones');
  eq(botones.filter((b) => b.getAttribute('aria-checked') === 'true').length, 0,
     'ninguno arranca elegido');
  ok(botones.every((b) => b.querySelector('.hotel-sigla')),
     'cada boton lleva su sigla, no solo el color');

  // ======================================================== 2. ELEGIR HOTEL
  click(q('#hoteles [data-hotel=HBK]'));
  await esperar(140);
  eq(doc.body.dataset.hotel, 'HBK', 'el acento del hotel se aplica al cuerpo');
  ok(!$('chipHotel').classList.contains('oculto'), 'aparece el chip del hotel');
  eq($('chipSigla').textContent, 'HBK', 'con su sigla');
  eq($('chipNombre').textContent, 'Morrocoy', 'y su nombre corto');
  ok(!$('btnAgregar').disabled, 'ya se pueden agregar habitaciones');
  eq(qa('#lineas .hab').length, 1, 'arranca con una habitacion');
  ok($('tituloHabitaciones').textContent.indexOf('· 1') !== -1,
     'el titulo cuenta las habitaciones', $('tituloHabitaciones').textContent);

  // La sigla tambien va dentro de la ficha: el color no informa solo.
  eq(q('#lineas .hab-sigla').textContent, 'HBK', 'la ficha lleva la sigla del hotel');

  // ======================================================== 3. CASCADA
  const ficha = q('#lineas .hab');
  const selCat = ficha.querySelector('[data-campo="categoria"]');
  const selOcu = ficha.querySelector('[data-campo="ocupacion"]');
  const selAtr = ficha.querySelector('[data-campo="atributo"]');
  ok(!!selCat && !!selOcu && !!selAtr, 'la ficha tiene categoria, ocupacion y atributo');

  const cats = qa('#lineas [data-campo="categoria"] option').map((o) => o.value);
  ok(cats.length >= 2, 'hay varias categorias en Morrocoy', 'cats=' + cats.join(','));

  // ======================================================== 4. FECHAS
  setVal($('checkin'), '2026-09-20');
  setVal($('checkout'), '2026-09-23');
  await esperar(160);
  eq($('puenteNoches').querySelector('.caja-noches-n').textContent, '3',
     'la caja de noches cuenta las noches');
  eq($('puenteNoches').querySelector('.caja-noches-t').textContent, 'noches', 'en plural');

  setVal($('checkout'), '2026-09-21');
  await esperar(160);
  eq($('puenteNoches').querySelector('.caja-noches-t').textContent, 'noche',
     'y en singular con una sola');
  setVal($('checkout'), '2026-09-23');
  await esperar(160);

  // ======================================================== 5. CALCULO EN VIVO
  ok($('barraMonto').textContent.indexOf('$') === 0, 'la barra muestra un total',
     $('barraMonto').textContent);
  ok(!$('barraMonto').classList.contains('apagado'), 'y no esta apagado');
  ok(!$('btnCopiar').disabled, 'copiar se habilita con una cotizacion valida');
  ok($('barraSello').textContent.indexOf('actualizado') !== -1,
     'la barra dice cuando se actualizo', $('barraSello').textContent);

  const precioFicha = q('#lineas .hab-precio').textContent;
  ok(precioFicha.indexOf('$') === 0 && precioFicha !== '$ —',
     'cada habitacion muestra su propio precio', precioFicha);

  const totalUno = $('barraMonto').textContent;

  // ======================================================== 6. CONTADORES
  paso(q('#lineas .hab'), 'adultos', '-1');
  await esperar(140);
  ok($('barraMonto').textContent !== totalUno, 'quitar un adulto cambia el total',
     totalUno + ' -> ' + $('barraMonto').textContent);
  paso(q('#lineas .hab'), 'adultos', '1');
  await esperar(140);
  eq($('barraMonto').textContent, totalUno, 'y volver a ponerlo lo restaura');

  // Un menor entra SIN edad y bloquea hasta que se declare: una edad por
  // defecto termina impresa en el mensaje del cliente.
  //
  // Se baja a un adulto primero: la habitacion por defecto es una doble y tres
  // huespedes la exceden, con lo que el total se apagaria por otra razon y el
  // chequeo no probaria nada.
  paso(q('#lineas .hab'), 'adultos', '-1');
  await esperar(140);
  paso(q('#lineas .hab'), 'menores', '1');
  await esperar(140);
  eq(qa('#lineas .campo-edad').length, 1, 'aparece un campo de edad');
  ok(q('#lineas .campo-edad').classList.contains('falta'),
     'marcado como pendiente mientras no tenga edad');
  ok($('barraMonto').classList.contains('apagado'),
     'y el total se apaga hasta declararla');

  setVal(q('#lineas [data-campo="edad"]'), '7');
  await esperar(160);
  ok(!$('barraMonto').classList.contains('apagado'), 'con la edad puesta vuelve el total');
  ok(!q('#lineas .campo-edad').classList.contains('falta'), 'y el campo deja de faltar');

  paso(q('#lineas .hab'), 'menores', '-1');
  await esperar(140);
  eq(qa('#lineas .campo-edad').length, 0, 'quitar el menor quita su campo');
  paso(q('#lineas .hab'), 'adultos', '1');
  await esperar(140);

  // ======================================================== 7. AGREGAR ARRIBA
  const idAntes = q('#lineas .hab').dataset.id;
  click($('btnAgregar'));
  await esperar(160);
  const fichas = qa('#lineas .hab');
  eq(fichas.length, 2, 'se agrega una habitacion');
  ok(fichas[0].dataset.id !== idAntes, 'la nueva queda primera');
  eq(fichas[1].dataset.id, idAntes, 'y la configurada baja una posicion');
  ok($('tituloHabitaciones').textContent.indexOf('· 2') !== -1, 'el titulo se actualiza');

  click(fichas[0].querySelector('[data-act="quitar"]'));
  await esperar(160);
  eq(qa('#lineas .hab').length, 1, 'la × quita la habitacion');

  // ======================================================== 8. PROMOCIONES
  click(q('#hoteles [data-hotel=HIM]'));
  await esperar(200);
  ok(!$('seccionPromos').classList.contains('oculto'), 'Isla Margarita tiene promociones');
  const promo = q('#promos .chip');
  if (promo) {
    eq(promo.getAttribute('aria-checked'), 'false', 'la promocion arranca sin marcar');
    const antes = $('barraMonto').textContent;
    click(promo);
    await esperar(160);
    eq(q('#promos .chip').getAttribute('aria-checked'), 'true', 'al pulsarla queda marcada');
    ok($('barraMonto').textContent !== antes, 'y el total baja',
       antes + ' -> ' + $('barraMonto').textContent);
    click(q('#promos .chip'));
    await esperar(160);
  }

  // ======================================================== 9. EXTRAS
  ok(!$('seccionExtras').classList.contains('oculto'), 'hay servicios adicionales');
  const early = qa('#extras .chip').find((b) => b.dataset.extra === 'EARLY');
  ok(!!early, 'esta el early check-in');
  if (early) {
    const antes = $('barraMonto').textContent;
    click(early);
    await esperar(160);
    eq(q('#extras [data-extra=EARLY]').getAttribute('aria-checked'), 'true',
       'el servicio queda marcado');
    ok($('barraMonto').textContent !== antes, 'y el total sube',
       antes + ' -> ' + $('barraMonto').textContent);
    ok($('burbuja').textContent.indexOf('INCLUIDOS EN EL TOTAL') !== -1,
       'el mensaje lo muestra como contratado');
    click(q('#extras [data-extra=EARLY]'));
    await esperar(160);
    eq($('barraMonto').textContent, antes, 'al desmarcarlo el total vuelve');
  }

  // Al cambiar de hotel no se arrastran los servicios del anterior
  click(qa('#extras .chip')[0]);
  await esperar(140);
  click(q('#hoteles [data-hotel=HPA]'));
  await esperar(220);
  eq(qa('#extras .chip[aria-checked="true"]').length, 0,
     'al cambiar de hotel los servicios quedan sin marcar');

  click(q('#hoteles [data-hotel=WTC]'));
  await esperar(220);
  ok($('seccionExtras').classList.contains('oculto'),
     'Valencia no ofrece servicios y la seccion se oculta');

  // ======================================================== 10. CLIENTE
  setVal($('cliente'), 'María Sánchez', 'input');
  await esperar(180);
  ok($('vistaSub').textContent.indexOf('María Sánchez') !== -1,
     'la vista previa dice para quien es', $('vistaSub').textContent);

  // ======================================================== 11. COPIADO
  let copiado = null;
  window.navigator.clipboard = { writeText: (t) => { copiado = t; return Promise.resolve(); } };
  click(q('#hoteles [data-hotel=HBK]'));
  await esperar(220);
  setVal($('checkin'), '2026-09-20');
  setVal($('checkout'), '2026-09-23');
  await esperar(200);
  ok(!$('btnCopiar').disabled, 'copiar habilitado');
  click($('btnCopiar'));
  await esperar(100);
  ok(copiado && copiado.indexOf('HOTEL HESPERIA MORROCOY') !== -1,
     'copiar entrega el texto completo',
     'copiado=' + (copiado ? copiado.length + ' chars' : 'null'));

  // ======================================================== 12. SIN CUPO
  setVal($('checkin'), '2026-10-14');
  setVal($('checkout'), '2026-10-17');
  await esperar(200);
  const burb = $('burbuja');
  ok(burb.classList.contains('burbuja-sincupo'),
     'sin disponibilidad se pinta distinto de un error de datos', 'clases=' + burb.className);
  ok(burb.textContent.indexOf('convención') !== -1, 'se muestra el motivo del cierre');
  const sev = q('#burbuja .sev');
  ok(!!sev && sev.classList.contains('sev-aviso'),
     'la severidad se dice con palabras, no solo con color');
  eq($('barraEtiqueta').textContent, 'Sin disponibilidad', 'la barra tambien lo dice');
  ok($('barraMonto').classList.contains('apagado'), 'y el total se apaga');
  ok($('btnCopiar').disabled, 'no se puede copiar una cotizacion sin cupo');
  ok(q('#lineas .hab-precio').textContent === '$ —',
     'la ficha tampoco muestra precio', q('#lineas .hab-precio').textContent);

  setVal($('checkin'), '2026-10-13');
  setVal($('checkout'), '2026-10-15');
  await esperar(200);
  ok(!$('burbuja').classList.contains('burbuja-sincupo'),
     'quien sale el 15 no ocupa la noche del 15');

  // ======================================================== 13. VACIAR
  click($('btnVaciar'));
  await esperar(200);
  eq(qa('#hoteles .hotel-op[aria-checked="true"]').length, 0,
     'vaciar deja los cinco botones sin elegir');
  ok($('chipHotel').classList.contains('oculto'), 'y el chip desaparece');
  ok($('barraMonto').classList.contains('apagado'), 'y el total se apaga');

  // ======================================================== 14. MINI COTIZADOR
  click(q('#hoteles [data-hotel=HBK]'));
  await esperar(200);
  setVal($('checkin'), '2026-09-20');
  setVal($('checkout'), '2026-09-23');
  await esperar(200);
  const lineasAntes = qa('#lineas .hab').length;
  const totalAntes = $('barraMonto').textContent;

  ok($('calc').classList.contains('oculto'), 'el mini cotizador arranca cerrado');

  // Un bloqueador de emergentes devuelve null: es el caso real que fuerza el
  // tercer nivel. Se simula asi en vez de dejar que jsdom falle con su
  // "not implemented", que ensucia la salida sin representar a ningun navegador.
  window.open = () => null;
  click($('btnCalc'));
  await esperar(160);
  ok(!$('calc').classList.contains('oculto'), 'sin ventana disponible cae al panel');
  eq($('btnCalc').getAttribute('aria-expanded'), 'true', 'el boton queda marcado');
  ok($('calcChip').hidden, 'sin ventana flotante NO se promete "siempre encima"');
  ok($('calcVersion').textContent.indexOf('v2026') !== -1, 'muestra la version de tarifas');

  // Hereda lo que ya estaba cargado
  eq(q('#calcHotel .hotel-op[aria-checked="true"]').dataset.hotel, 'HBK',
     'hereda el hotel ya elegido');
  eq($('calcIn').value, '2026-09-20', 'y las fechas');
  ok($('calcCopiar').disabled, 'sin habitacion elegida no se puede copiar');

  setVal($('calcHab'), 'BAS_DBL');
  await esperar(160);
  ok($('calcTotal').textContent.indexOf('$') === 0 && $('calcTotal').textContent !== '$ —',
     'calcula al elegir la habitacion', $('calcTotal').textContent);
  ok($('calcDetalle').textContent.indexOf('noches') !== -1,
     'y dice noches y temporada', $('calcDetalle').textContent);
  ok(!$('calcCopiar').disabled, 'ya se puede copiar');
  ok(!$('calcAbrir').disabled, 'y abrir completo');

  // Contadores propios
  const totalDos = $('calcTotal').textContent;
  click($('calc').querySelector('[data-calcpaso="adultos"][data-delta="-1"]'));
  await esperar(140);
  eq($('calcAdultos').textContent, '1', 'el contador de adultos baja');
  ok($('calcTotal').textContent !== totalDos, 'y el precio cambia');
  click($('calc').querySelector('[data-calcpaso="adultos"][data-delta="1"]'));
  await esperar(140);

  // Un niño sin edad bloquea, igual que en la app.
  // Se baja a un adulto primero: la habitacion elegida es una doble y tres
  // huespedes la exceden, con lo que el precio se apagaria por otra razon.
  click($('calc').querySelector('[data-calcpaso="adultos"][data-delta="-1"]'));
  await esperar(140);
  click($('calc').querySelector('[data-calcpaso="ninos"][data-delta="1"]'));
  await esperar(140);
  eq(qa('#calcEdades .campo-edad').length, 1, 'aparece el campo de edad');
  eq($('calcTotal').textContent, '$ —', 'y el precio se apaga hasta declararla');
  ok($('calcCopiar').disabled, 'sin la edad no se puede copiar');
  // Al declarar la edad, el campo deja de estar marcado y vuelve el precio
  setVal(q('#calcEdades select'), '6');
  await esperar(160);
  ok(!q('#calcEdades .campo-edad').classList.contains('falta'),
     'con la edad puesta el campo deja de faltar');
  ok($('calcTotal').textContent !== '$ —', 'y vuelve el precio',
     $('calcTotal').textContent);

  click($('calc').querySelector('[data-calcpaso="ninos"][data-delta="-1"]'));
  await esperar(140);
  click($('calc').querySelector('[data-calcpaso="adultos"][data-delta="1"]'));
  await esperar(140);

  // Copiar desde el mini: su propio mensaje, no el de la app
  copiado = null;
  click($('calcCopiar'));
  await esperar(140);
  ok(copiado && copiado.indexOf('HOTEL HESPERIA MORROCOY') !== -1,
     'el mini cotizador copia su propio mensaje',
     'copiado=' + (copiado ? copiado.length + ' chars' : 'null'));

  // Lo importante: no toco la cotizacion de atras
  eq(qa('#lineas .hab').length, lineasAntes, 'la cotizacion armada conserva sus habitaciones');
  eq($('barraMonto').textContent, totalAntes, 'y su total no cambio');

  // "Abrir completo" pasa lo calculado a la app
  setVal($('calcHab'), 'BAS_TPL');
  await esperar(160);
  const totalMini = $('calcTotal').textContent;
  click($('calcAbrir'));
  await esperar(220);
  ok($('calc').classList.contains('oculto'), 'abrir completo cierra el mini cotizador');
  eq(qa('#lineas .hab').length, 1, 'la app queda con una sola habitacion, la del mini');
  eq($('barraMonto').textContent, totalMini, 'y con el mismo total que mostraba el mini',
     totalMini + ' vs ' + $('barraMonto').textContent);

  // Vuelve a su hueco de la pagina, listo para la proxima
  const ancla = $('calcAncla');
  ok(ancla && ancla.parentNode === $('calc').parentNode,
     'el panel vuelve a su hueco de la pagina');

  // ======================================================== 15. VENTANA REAL
  // Este es el camino que jsdom NO ejercitaba y que rompio en Chrome: al mover
  // el panel a otra ventana, sus campos dejan de pertenecer a este documento y
  // getElementById devuelve null.
  const domAparte = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const ventana = domAparte.window;
  ventana.focus = () => {};
  ventana.close = () => { ventana.__cerrada = true; };
  Object.defineProperty(ventana, 'closed', { get: () => !!ventana.__cerrada });
  window.open = () => ventana;

  click($('btnCalc'));
  await esperar(180);
  const panel = ventana.document.querySelector('#calc');
  ok(!!panel, 'el panel se mueve a la ventana nueva');
  ok(!doc.getElementById('calc'), 'y deja de estar en la pagina principal');

  if (panel) {
    // Los escuchadores viajan con el nodo: sigue calculando desde alla.
    panel.querySelector('#calcHotel [data-hotel=WTC]')
      .dispatchEvent(new ventana.MouseEvent('click', { bubbles: true }));
    await esperar(140);
    const selHab = panel.querySelector('#calcHab');
    selHab.value = 'DLX_KING';
    selHab.dispatchEvent(new ventana.Event('change', { bubbles: true }));
    // Cada campo tiene su propio escuchador: el mini cotizador guarda su
    // estado y no lo relee del DOM, asi que hay que avisar de los dos.
    const cIn = panel.querySelector('#calcIn');
    const cOut = panel.querySelector('#calcOut');
    cIn.value = '2026-09-01';
    cIn.dispatchEvent(new ventana.Event('change', { bubbles: true }));
    cOut.value = '2026-09-03';
    cOut.dispatchEvent(new ventana.Event('change', { bubbles: true }));
    await esperar(160);
    const salida = panel.querySelector('#calcTotal').textContent;
    ok(salida.indexOf('400') !== -1,
       'calcula desde la ventana aparte: 2 noches de King a 200', 'salida=' + salida);
  }

  click($('btnCalc'));
  await esperar(180);
  ok(!!doc.getElementById('calc'), 'al cerrar, el panel vuelve a la pagina');
  eq($('btnCalc').getAttribute('aria-expanded'), 'false', 'y el boton se desmarca');

  // ======================================================== 16. VACIAR Y COLAPSAR
  // El mini cotizador vuelve a abrirse en el nivel 3 (panel en la pagina).
  window.open = () => null;
  click($('btnCalc'));
  await esperar(180);
  click(q('#calcHotel [data-hotel=HBK]'));
  await esperar(140);
  setVal($('calcHab'), 'BAS_DBL');
  await esperar(160);
  ok($('calcTotal').textContent !== '$ —', 'el mini vuelve a calcular',
     $('calcTotal').textContent);

  // Vaciar: borra lo del mini y NO toca la cotizacion de la app
  const lineasApp = qa('#lineas .hab').length;
  const totalApp = $('barraMonto').textContent;
  click($('btnCalcVaciar'));
  await esperar(180);
  eq(qa('#calcHotel .hotel-op[aria-checked="true"]').length, 0,
     'vaciar deja el mini sin hotel');
  eq($('calcTotal').textContent, '$ —', 'y sin precio');
  eq(qa('#lineas .hab').length, lineasApp, 'la cotizacion de la app sigue intacta');
  eq($('barraMonto').textContent, totalApp, 'con su mismo total');

  // Colapsar: el panel se esconde y queda la burbuja.
  // Vaciar borro tambien las fechas, asi que hay que volver a ponerlas.
  click(q('#calcHotel [data-hotel=HBK]'));
  await esperar(140);
  setVal($('calcHab'), 'BAS_DBL');
  setVal($('calcIn'), '2026-09-20');
  setVal($('calcOut'), '2026-09-23');
  await esperar(200);
  const totalMini2 = $('calcTotal').textContent;
  ok(totalMini2 !== '$ —', 'el mini calcula otra vez tras vaciarlo', totalMini2);

  ok(!$('btnCalcColapsar').hidden, 'en el panel de la pagina si se puede colapsar');
  click($('btnCalcColapsar'));
  await esperar(180);
  ok($('calc').classList.contains('oculto'), 'el panel se esconde');
  ok(!$('calcBurbuja').classList.contains('oculto'), 'y aparece la burbuja');
  eq($('calcBurbujaMonto').textContent, totalMini2,
     'la burbuja lleva el total encima: colapsada sigue siendo un cotizador');

  // Al pulsarla vuelve a abrirse
  click($('calcBurbuja'));
  await esperar(180);
  ok(!$('calc').classList.contains('oculto'), 'pulsar la burbuja reabre el panel');
  ok($('calcBurbuja').classList.contains('oculto'), 'y la burbuja se guarda');
  eq($('calcTotal').textContent, totalMini2, 'con lo que estaba cargado');

  // Un arrastre no debe abrirla: si no se distinguen, no hay forma de moverla
  click($('btnCalcColapsar'));
  await esperar(180);
  const burb2 = $('calcBurbuja');
  burb2.getBoundingClientRect = () => ({ left: 100, top: 100, width: 120, height: 52 });
  const ptr = (tipo, x, y) => {
    const e = new window.Event(tipo, { bubbles: true });
    e.clientX = x; e.clientY = y; e.pointerId = 1; e.button = 0;
    e.movementX = 40; e.movementY = 40;
    burb2.dispatchEvent(e);
  };
  ptr('pointerdown', 110, 110);
  ptr('pointermove', 300, 300);
  ptr('pointerup', 300, 300);
  click(burb2);
  await esperar(120);
  ok($('calc').classList.contains('oculto'),
     'arrastrar la burbuja NO la abre: el arrastre y el toque se distinguen');
  ok(burb2.style.left !== '', 'y la burbuja se movio', 'left=' + burb2.style.left);

  click(burb2);
  await esperar(150);
  ok(!$('calc').classList.contains('oculto'), 'un toque limpio si la abre');
  click($('btnCalcCerrar'));
  await esperar(150);
  ok($('calcBurbuja').classList.contains('oculto'),
     'cerrar el mini tambien recoge la burbuja');

  // ---------- Reporte ----------
  console.log('========================================');
  console.log(`SPA en jsdom -> ${total} chequeos | fallan: ${fallos.length}`);
  if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach((f) => console.log('  - ' + f)); }
  if (errores.length) {
    console.log('\nERRORES DE EJECUCION:');
    [...new Set(errores)].forEach((e) => console.log('  ! ' + e));
  } else {
    console.log('Sin errores de ejecucion.');
  }
  process.exit(fallos.length || errores.length ? 1 : 0);
})();
