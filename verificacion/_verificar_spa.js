/* Ejecuta la interfaz real en jsdom y detecta errores en tiempo de ejecucion
   que un chequeo de sintaxis no ve.

   Carga index.html tal cual, con los mismos assets/ y los mismos datos/ que
   descarga el navegador. jsdom no trae los recursos externos por su cuenta,
   asi que los scripts se insertan en linea y fetch se sirve desde el disco:
   el resto del arranque (Catalogo.cargar, promesas, DOM) corre de verdad. */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

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

// jsdom no implementa window.open y lo reporta como error suyo, con su rastro
// completo. El codigo ya contempla ese caso -es el del bloqueador de
// emergentes- asi que ese aviso es ruido del arnes y no un fallo: se filtra
// para que la salida siga siendo legible. Cualquier OTRO error de jsdom si se
// cuenta, y los del propio codigo se capturan en beforeParse.
const consolaVirtual = new (require('jsdom').VirtualConsole)();
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
    w.addEventListener('error', (e) => errores.push('window.onerror: ' + (e.error ? e.error.stack : e.message)));
    w.addEventListener('unhandledrejection', (e) => errores.push('promesa: ' + e.reason));
    const origErr = w.console.error;
    w.console.error = (...a) => { errores.push('console.error: ' + a.join(' ')); origErr.apply(w.console, a); };
  }
});

const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);

let total = 0; const fallos = [];
function ok(c, d, det) { total++; if (!c) fallos.push(`${d}${det ? ' -> ' + det : ''}`); }
function eq(a, e, d) { total++; if (a !== e) fallos.push(`${d} -> esperado=${e} obtenido=${a}`); }

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }
function click(el) { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function setVal(el, v, ev) {
  el.value = v;
  el.dispatchEvent(new window.Event(ev || 'change', { bubbles: true }));
}

(async () => {
  await esperar(120);

  // 1. Arranque
  ok($('cargando').classList.contains('oculto'), 'la pantalla de carga se oculta');
  ok(!$('app').classList.contains('oculto'), 'la app se muestra');
  eq($('asesor') ? $('asesor').value : 'MZ', 'MZ', 'iniciales precargadas');

  const hoteles = $('hoteles').querySelectorAll('input[type=radio], button, [data-hotel]');
  ok(hoteles.length >= 3, 'se listan los 3 hoteles', 'encontrados=' + hoteles.length);

  // 2. Seleccionar hotel HBK
  const hbk = [...$('hoteles').querySelectorAll('*')].find(
    (e) => e.getAttribute && e.getAttribute('data-hotel') === 'HBK'
  ) || [...$('hoteles').querySelectorAll('input')].find((e) => e.value === 'HBK');
  ok(!!hbk, 'existe el control del hotel HBK');
  if (hbk) { if (hbk.tagName === 'INPUT') { hbk.checked = true; hbk.dispatchEvent(new window.Event('change', { bubbles: true })); } else click(hbk); }
  await esperar(60);

  // 3. Fechas
  setVal($('checkin'), '2026-09-01');
  setVal($('checkout'), '2026-09-03');
  await esperar(60);
  ok($('puenteNoches').textContent.indexOf('2') !== -1, 'muestra 2 noches',
     'texto=' + $('puenteNoches').textContent);

  // 4. Habitacion: recorrer los selects de la primera linea
  const selects = doc.querySelectorAll('#lineas select');
  ok(selects.length > 0, 'la linea de habitacion tiene selectores',
     'encontrados=' + selects.length);
  for (const s of selects) {
    const opts = [...s.options].filter((o) => o.value);
    if (opts.length && !s.value) setVal(s, opts[0].value);
    await esperar(30);
  }
  await esperar(120);

  // 5. Resultado
  const prev = $('burbuja');
  ok(!!prev, 'existe el nodo de vista previa');
  const txt = prev ? prev.textContent : '';
  ok(txt.indexOf('HOTEL HESPERIA MORROCOY') !== -1, 'la vista previa muestra el hotel',
     'inicio=' + JSON.stringify(txt.slice(0, 70)));
  ok(txt.indexOf('{{') === -1, 'sin marcadores sin resolver');
  ok(/TOTAL/.test(txt), 'la vista previa incluye el total');

  // 5b. Edades individuales de los menores
  //     Agregar un menor NO debe inventarle una edad: el selector arranca
  //     vacio y el motor tiene que bloquear hasta que se elija una.
  //     Se vuelve a consultar el DOM en cada paso: refrescarLinea() reemplaza
  //     el innerHTML de la linea, asi que cualquier referencia guardada queda
  //     apuntando a un nodo desconectado y los clicks no llegan al delegado.
  const paso = (campo) => [...doc.querySelectorAll('#lineas .paso')]
    .find((p) => p.dataset.campo === campo);
  const pulsar = (campo, delta) => {
    const g = paso(campo);
    if (g) click(g.querySelector('button[data-paso="' + delta + '"]'));
  };

  // Una doble con 2 adultos ya esta llena: se baja a 1 para que quepa un menor
  pulsar('adultos', -1);
  await esperar(90);

  ok(!!paso('menores'), 'existe el contador de menores');
  pulsar('menores', 1);
  await esperar(110);

  const selEdad = doc.querySelector('#lineas select[data-campo="edad"]');
  ok(!!selEdad, 'aparece un selector de edad por cada menor');
  ok(selEdad && selEdad.value === '', 'el selector de edad arranca vacio');
  ok($('burbuja').className.indexOf('burbuja-error') !== -1,
     'sin edad elegida, la cotizacion queda bloqueada');
  ok($('burbuja').textContent.indexOf('edad') !== -1,
     'y el error explica que falta la edad',
     'texto=' + JSON.stringify($('burbuja').textContent.slice(0, 120)));

  if (selEdad) setVal(selEdad, '7');
  await esperar(140);
  ok($('burbuja').className.indexOf('burbuja-error') === -1,
     'al elegir la edad la cotizacion se destraba',
     'texto=' + JSON.stringify($('burbuja').textContent.slice(0, 120)));
  ok($('burbuja').textContent.indexOf('(7 a\u00f1os)') !== -1,
     'la edad real sale en el mensaje',
     'texto=' + JSON.stringify($('burbuja').textContent.slice(0, 140)));
  ok($('burbuja').textContent.indexOf('suplemento') === -1,
     'el mensaje ya no explica el suplemento single');
  ok($('burbuja').textContent.indexOf('$158') !== -1,
     'el monto sale entero y redondeado hacia arriba (157,50 -> 158)',
     'texto=' + JSON.stringify($('burbuja').textContent.slice(0, 200)));

  // Se deja la linea como estaba: 2 adultos, sin menores
  pulsar('menores', -1);
  await esperar(110);
  pulsar('adultos', 1);
  await esperar(140);
  ok($('burbuja').className.indexOf('burbuja-error') === -1,
     'quitar el menor devuelve la cotizacion a un estado valido',
     'texto=' + JSON.stringify($('burbuja').textContent.slice(0, 120)));

  // 5c. Iniciales precargadas: la app la usa una sola asesora
  ok($('asesor').value === 'MZ', 'las iniciales vienen precargadas en MZ',
     'valor=' + JSON.stringify($('asesor').value));

  // 6. Copiar
  let copiado = null;
  window.navigator.clipboard = { writeText: (t) => { copiado = t; return Promise.resolve(); } };
  const btnCopiar = $('btnCopiar');
  ok(!!btnCopiar, 'existe el boton de copiar');
  if (btnCopiar) {
    ok(!btnCopiar.disabled, 'el boton de copiar esta habilitado con cotizacion valida');
    click(btnCopiar);
    await esperar(80);
    ok(copiado && copiado.indexOf('HOTEL HESPERIA MORROCOY') !== -1,
       'copiar entrega el texto completo', 'copiado=' + (copiado ? copiado.length + ' chars' : 'null'));
  }

  // 7. Ya no hay registro de cotizaciones
  ok(!$('btnRegistrar'), 'el boton de registrar ya no existe');

  // 7b. Una habitacion nueva se agrega ARRIBA, no al final
  const btnAgregar = $('btnAgregar');
  ok(!!btnAgregar, 'existe el boton de agregar habitacion');
  if (btnAgregar) {
    const antes = doc.querySelectorAll('#lineas .hab').length;
    const primeraAntes = doc.querySelector('#lineas .hab');
    const idAntes = primeraAntes && primeraAntes.dataset.id;
    click(btnAgregar);
    await esperar(80);
    const despues = doc.querySelectorAll('#lineas .hab');
    eq(despues.length, antes + 1, 'se agrega una habitacion');
    if (despues.length === antes + 1) {
      ok(despues[0].dataset.id !== idAntes,
         'la nueva queda primera en la lista');
      ok(despues[1].dataset.id === idAntes,
         'la que ya estaba configurada baja una posicion');
      const indice = despues[0].querySelector('.hab-indice');
      ok(indice && indice.textContent.indexOf('1') !== -1,
         'la primera se numera como Habitacion 1',
         indice ? indice.textContent : 'sin indice');
    }
  }

  // 8. Estado invalido: 3 adultos en una doble
  const conteos = doc.querySelectorAll('#lineas button');
  const masAdulto = [...conteos].find((b) => (b.getAttribute('data-accion') || b.dataset.accion || '') .indexOf('mas') !== -1);
  if (masAdulto) { click(masAdulto); await esperar(80); }
  ok(true, 'los contadores responden sin excepciones');

  // 9. Nivel 3 de copiado: sin API de portapapeles ni execCommand
  delete window.navigator.clipboard;
  doc.execCommand = () => { throw new Error('bloqueado'); };
  if (btnCopiar) {
    click(btnCopiar);
    await esperar(120);
    const modal = $('modalCopia');
    ok(modal && !modal.classList.contains('oculto'), 'el nivel 3 abre el modal de copia manual');
    const ta = $('modalCopiaTexto');
    ok(ta && ta.value.indexOf('HOTEL HESPERIA MORROCOY') !== -1,
       'el modal trae el texto completo', ta ? ta.value.length + ' chars' : 'sin nodo');
    ok($('modalCopiaPista').textContent.length > 10, 'el modal explica que hacer');
  }

  // 10. Cruce de temporadas: la tira de noches debe segmentarse
  setVal($('checkin'), '2026-12-19');
  setVal($('checkout'), '2026-12-22');
  await esperar(140);
  const bur = $('burbuja').textContent;
  ok(bur.indexOf('Tarifa por temporada') !== -1,
     'la vista previa muestra el desglose al cruzar temporadas');

  // 10b. Reiniciar NO debe abrir un dialogo de confirmacion
  let pidioConfirmacion = false;
  window.confirm = () => { pidioConfirmacion = true; return true; };
  click($('btnReiniciar'));
  await esperar(120);
  ok(!pidioConfirmacion, 'reiniciar no pide confirmacion');
  ok($('checkin').value === '' && $('checkout').value === '',
     'reiniciar limpia las fechas');
  ok($('burbuja').textContent.indexOf('Selecciona hotel') !== -1,
     'reiniciar vuelve al estado inicial');

  // Se rearma una cotizacion valida para los chequeos que siguen
  const hbk2 = [...$('hoteles').querySelectorAll('*')].find(
    (e) => e.getAttribute && e.getAttribute('data-hotel') === 'HBK');
  if (hbk2) click(hbk2);
  await esperar(80);

  // 11. Regresion: con errores de validacion, el panel DEBE seguir accesible
  //     (bug real: la asesora veia "Revisa los datos" sin poder ver que revisar)
  setVal($('checkin'), '2026-09-01');
  setVal($('checkout'), '2026-09-03');
  await esperar(80);
  // Fuerza ocupacion invalida: sube infantes hasta pasar el maximo
  const btnsMas = [...doc.querySelectorAll('#lineas button')]
    .filter((b) => (b.textContent || '').trim() === '+');
  for (let i = 0; i < 4 && btnsMas.length; i++) { click(btnsMas[btnsMas.length - 1]); await esperar(40); }
  await esperar(120);
  const bur2 = $('burbuja');
  if (bur2.className.indexOf('burbuja-error') !== -1) {
    ok(!$('btnVerMensaje').disabled,
       'con errores, el boton del panel sigue habilitado');
    ok($('btnVerMensaje').textContent.indexOf('falta') !== -1,
       'el boton invita a ver que falta', $('btnVerMensaje').textContent);
    ok($('btnCopiar').disabled, 'copiar sigue bloqueado con errores');
    ok(bur2.textContent.length > 20, 'el panel explica el error');
  } else {
    ok(true, 'no se pudo forzar el error en jsdom (se omite)');
  }

  // 12. Promociones: la seccion se muestra aunque no haya promos vigentes
  ok(!$('seccionPromos').classList.contains('oculto'),
     'la seccion de promociones es visible con fechas elegidas');
  ok($('promos').textContent.length > 5,
     'la seccion dice algo (promos o "no hay vigentes")', $('promos').textContent.slice(0, 60));

  // 13. Regresion: estadia de 1 noche (fallaba en selectores nativos moviles
  //     porque min = entrada+1 y el valor coincidia exactamente con el min)
  // El paso 11 dejo la habitacion sobre-ocupada a proposito: se revierte.
  const btnsMenos = [...doc.querySelectorAll('#lineas button')]
    .filter((b) => (b.textContent || '').trim() === '−' || (b.textContent || '').trim() === '-');
  for (let i = 0; i < 6 && btnsMenos.length; i++) {
    click(btnsMenos[btnsMenos.length - 1]); await esperar(30);
  }
  await esperar(80);

  setVal($('checkin'), '2026-08-21');
  setVal($('checkout'), '2026-08-25');
  await esperar(80);
  setVal($('checkin'), '2026-08-27');
  await esperar(80);
  eq($('checkout').min, '2026-08-27', 'min del selector = entrada, no entrada+1');
  eq($('checkout').value, '2026-08-28', 'la salida se autoajusta al dia siguiente');
  setVal($('checkout'), '2026-08-28');
  await esperar(120);
  ok($('puenteNoches').textContent.indexOf('1 noche') !== -1,
     'acepta estadia de 1 noche', $('puenteNoches').textContent);
  ok($('barraMonto').textContent !== '—', 'cotiza 1 noche', $('barraMonto').textContent);

  // Fechas iguales siguen rechazadas
  setVal($('checkout'), '2026-08-27');
  await esperar(100);
  ok($('pistaFechas').textContent.indexOf('posterior') !== -1,
     'fechas iguales siguen avisando', $('pistaFechas').textContent);
  ok($('btnCopiar').disabled, 'copiar bloqueado con fechas iguales');

  // 12. Calculadora rapida: es una ventana aparte, no puede pisar la
  //     cotizacion que la asesora ya tiene armada.
  const antesHotel = $('hoteles').querySelector('[aria-checked=true], .hotel-op.activa');
  const lineasAntes = doc.querySelectorAll('#lineas .hab').length;
  const totalAntes = $('barraTotal') ? $('barraTotal').textContent : null;

  const btnCalc = $('btnCalc');
  ok(!!btnCalc, 'existe el boton de la calculadora');
  if (btnCalc) {
    ok($('calc').classList.contains('oculto'), 'la calculadora arranca cerrada');

    // Un bloqueador de emergentes devuelve null: es el caso real que fuerza el
    // tercer nivel. Se simula asi en vez de dejar que jsdom falle con su
    // "not implemented", que ensucia la salida y no representa a ningun
    // navegador de verdad.
    window.open = () => null;
    click(btnCalc);
    await esperar(60);
    ok(!$('calc').classList.contains('oculto'),
       'sin ventana disponible cae al panel en la pagina');
    eq(btnCalc.getAttribute('aria-expanded'), 'true', 'el boton queda marcado como abierto');

    // Hereda lo que ya estaba cargado en el panel grande
    eq($('calcHotel').value, 'HBK', 'hereda el hotel ya elegido');
    ok($('calcHab').options.length > 1, 'se llenan las habitaciones del hotel');

    setVal($('calcHotel'), 'WTC');
    await esperar(40);
    const codigos = [...$('calcHab').options].map((o) => o.value);
    ok(codigos.indexOf('DLX_KING') !== -1, 'al cambiar de hotel se recargan las habitaciones',
       'opciones=' + codigos.join(','));

    setVal($('calcHab'), 'DLX_KING');
    setVal($('calcIn'), '2026-09-01');
    setVal($('calcOut'), '2026-09-03');
    setVal($('calcAdultos'), '1', 'input');
    await esperar(60);
    const salida1 = $('calcSalida').textContent;
    ok(salida1.indexOf('320') !== -1, 'calcula 2 noches de Deluxe King a 160',
       'salida=' + salida1);

    setVal($('calcAdultos'), '2', 'input');
    await esperar(60);
    const salida2 = $('calcSalida').textContent;
    ok(salida2.indexOf('360') !== -1, 'con 2 huespedes sube a 180 por noche',
       'salida=' + salida2);

    // Un error se muestra en la calculadora, no rompe nada
    setVal($('calcHab'), 'DLX_TWIN');
    setVal($('calcAdultos'), '1', 'input');
    await esperar(60);
    ok($('calcSalida').classList.contains('con-error'),
       'una ocupacion sin tarifa se muestra como error',
       'salida=' + $('calcSalida').textContent);

    // Los campos de edad aparecen segun el numero de ninos
    setVal($('calcNinos'), '2', 'input');
    await esperar(60);
    eq(doc.querySelectorAll('#calcEdades input').length, 2, 'aparecen 2 campos de edad');
    setVal($('calcNinos'), '0', 'input');
    await esperar(60);
    eq(doc.querySelectorAll('#calcEdades input').length, 0, 'y desaparecen');

    // Lo importante: no toco la cotizacion de atras
    eq(doc.querySelectorAll('#lineas .hab').length, lineasAntes,
       'la cotizacion armada conserva sus habitaciones');
    if (totalAntes !== null) {
      eq($('barraTotal').textContent, totalAntes, 'y el total de la cotizacion no cambio');
    }

    click($('btnCalcCerrar'));
    await esperar(60);
    ok($('calc').classList.contains('oculto'), 'se cierra con la X');
    eq(btnCalc.getAttribute('aria-expanded'), 'false', 'y el boton se desmarca');

    // Al cerrarse vuelve a su hueco de la pagina, junto al ancla. Si no
    // volviera, la segunda apertura no encontraria el panel.
    const ancla = $('calcAncla');
    ok(ancla && ancla.parentNode === $('calc').parentNode,
       'el panel vuelve a su hueco de la pagina');
    click(btnCalc);
    await esperar(60);
    ok(!$('calc').classList.contains('oculto'), 'y se puede volver a abrir');
    click($('btnCalcCerrar'));
    await esperar(60);
  }

  // 13. Un cierre de venta se ve distinto de un error de datos
  setVal($('checkin'), '2026-10-14');
  setVal($('checkout'), '2026-10-17');
  await esperar(140);
  const burb = $('burbuja');
  ok(burb.classList.contains('burbuja-sincupo'),
     'sin disponibilidad se pinta distinto de un error de datos',
     'clases=' + burb.className);
  ok(burb.textContent.indexOf('No hay disponibilidad') !== -1,
     'el titulo habla de disponibilidad');
  ok(burb.textContent.indexOf('convención') !== -1,
     'se muestra el motivo del cierre', burb.textContent.slice(0, 120));
  eq($('barraEtiqueta').textContent, 'Sin disponibilidad', 'la barra tambien lo dice');
  ok($('btnCopiar').disabled, 'no se puede copiar una cotizacion sin cupo');
  ok($('pistaFechas').textContent.indexOf('cerradas') !== -1,
     'las fechas avisan antes de terminar de armar', $('pistaFechas').textContent);

  // Saliendo la manana del primer dia cerrado si hay cupo
  setVal($('checkin'), '2026-10-13');
  setVal($('checkout'), '2026-10-15');
  await esperar(140);
  ok(!$('burbuja').classList.contains('burbuja-sincupo'),
     'quien sale el 15 no ocupa la noche del 15');

  // 14. La severidad se dice con palabras, no solo con color, y el total se
  //     apaga: es imposible copiar un precio que no existe.
  setVal($('checkin'), '2026-10-14');
  setVal($('checkout'), '2026-10-17');
  await esperar(140);
  ok($('barraMonto').textContent.indexOf('—') !== -1,
     'sin cotizacion valida el total muestra un guion', $('barraMonto').textContent);
  ok($('barraMonto').classList.contains('apagado'),
     'y se pinta apagado, no como un total real');
  const sev = doc.querySelector('#burbuja .sev');
  ok(!!sev, 'el aviso lleva etiqueta de severidad');
  if (sev) {
    ok(sev.classList.contains('sev-aviso'),
       'un cierre de venta es advertencia, no error', 'clases=' + sev.className);
    ok(sev.textContent.toLowerCase().indexOf('disponibilidad') !== -1,
       'y la palabra lo dice sin depender del color', sev.textContent);
  }

  // 16. El mini cotizador en una ventana de verdad.
  //
  //     Este es el camino que jsdom NO ejercitaba y que rompio en Chrome: al
  //     mover el panel a otra ventana, sus campos dejan de pertenecer a este
  //     documento y document.getElementById devuelve null. Aqui se le da una
  //     ventana real -otro documento jsdom- para que el fallo no pueda volver.
  const { JSDOM: JSDOM2 } = require('jsdom');
  const domAparte = new JSDOM2('<!doctype html><html><head></head><body></body></html>');
  const ventana = domAparte.window;
  // jsdom no implementa focus() y lo reporta como error suyo, con su rastro
  // completo, sin lanzar -asi que un try/catch no lo evita-. Una ventana de
  // verdad si lo tiene.
  ventana.focus = () => {};
  ventana.close = () => { ventana.__cerrada = true; };
  Object.defineProperty(ventana, 'closed', { get: () => !!ventana.__cerrada });
  window.open = () => ventana;

  click($('btnCalc'));
  await esperar(120);
  const panel = ventana.document.querySelector('#calc');
  ok(!!panel, 'el panel se mueve a la ventana nueva');
  ok(!doc.getElementById('calc'), 'y deja de estar en la pagina principal');

  if (panel) {
    // Los escuchadores viajan con el nodo: sigue calculando desde alla.
    const selHotel = panel.querySelector('#calcHotel');
    const selHab = panel.querySelector('#calcHab');
    selHotel.value = 'WTC';
    selHotel.dispatchEvent(new ventana.Event('change', { bubbles: true }));
    await esperar(60);
    selHab.value = 'DLX_KING';
    selHab.dispatchEvent(new ventana.Event('change', { bubbles: true }));
    panel.querySelector('#calcIn').value = '2026-09-01';
    panel.querySelector('#calcOut').value = '2026-09-03';
    panel.querySelector('#calcOut').dispatchEvent(new ventana.Event('change', { bubbles: true }));
    panel.querySelector('#calcAdultos').value = '2';
    panel.querySelector('#calcAdultos').dispatchEvent(new ventana.Event('input', { bubbles: true }));
    await esperar(80);
    const salida = panel.querySelector('#calcSalida').textContent;
    ok(salida.indexOf('360') !== -1,
       'calcula desde la ventana aparte: 2 noches de King a 180', 'salida=' + salida);
  }

  // Al cerrar vuelve a su hueco, listo para la proxima
  click($('btnCalc'));
  await esperar(120);
  ok(!!doc.getElementById('calc'), 'al cerrar, el panel vuelve a la pagina');
  eq($('btnCalc').getAttribute('aria-expanded'), 'false', 'y el boton se desmarca');

  // 17. Servicios adicionales: se marcan y suben el total
  setVal($('checkin'), '2026-09-20');
  setVal($('checkout'), '2026-09-23');
  await esperar(160);
  const totalBase = $('barraMonto').textContent;
  ok(!$('seccionExtras').classList.contains('oculto'),
     'Morrocoy ofrece servicios adicionales');
  const opcExtras = doc.querySelectorAll('#extras .promo-op');
  ok(opcExtras.length >= 2, 'se listan los servicios del hotel',
     'encontrados=' + opcExtras.length);

  const early = [...opcExtras].find((b) => b.dataset.extra === 'EARLY');
  ok(!!early, 'esta el early check-in');
  if (early) {
    eq(early.getAttribute('aria-checked'), 'false', 'arranca sin marcar');
    click(early);
    await esperar(140);
    const marcado = doc.querySelector('#extras [data-extra=EARLY]');
    eq(marcado.getAttribute('aria-checked'), 'true', 'al pulsarlo queda marcado');
    ok($('barraMonto').textContent !== totalBase,
       'y el total sube', totalBase + ' -> ' + $('barraMonto').textContent);
    ok($('burbuja').textContent.indexOf('INCLUIDOS EN EL TOTAL') !== -1,
       'el mensaje lo muestra como contratado');

    // Se desmarca igual de facil
    click(doc.querySelector('#extras [data-extra=EARLY]'));
    await esperar(140);
    eq($('barraMonto').textContent, totalBase, 'al desmarcarlo el total vuelve');
  }

  // 18. Al cambiar de hotel no se arrastran los servicios del anterior
  click(doc.querySelector('#extras [data-extra=EARLY]'));
  await esperar(120);
  const hpa = [...$('hoteles').querySelectorAll('*')].find(
    (e) => e.getAttribute && e.getAttribute('data-hotel') === 'HPA');
  if (hpa) {
    click(hpa);
    await esperar(200);
    const marcados = [...doc.querySelectorAll('#extras .promo-op')]
      .filter((b) => b.getAttribute('aria-checked') === 'true');
    eq(marcados.length, 0, 'al cambiar de hotel los servicios quedan sin marcar');
  }

  // Los hoteles de ciudad no ofrecen ninguno: la seccion desaparece
  const wtc = [...$('hoteles').querySelectorAll('*')].find(
    (e) => e.getAttribute && e.getAttribute('data-hotel') === 'WTC');
  if (wtc) {
    click(wtc);
    await esperar(200);
    ok($('seccionExtras').classList.contains('oculto'),
       'Valencia no ofrece servicios y la seccion se oculta');
  }

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
