/* Ejecuta la pantalla de administración en jsdom.

   Es la pantalla donde un error se propaga a todas las cotizaciones, así que
   lo que más se comprueba aquí no es que la tabla se dibuje, sino que NO deje
   publicar un catálogo roto y que lo que descarga sea exactamente lo editado. */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const RAIZ = path.join(__dirname, '..');
const leerRaiz = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let pagina = leerRaiz('admin.html');
pagina = pagina.replace(
  /<link rel="stylesheet" href="(assets\/[^"?]+)(?:\?[^"]*)?">/g,
  (_, ruta) => '<style>\n' + leerRaiz(ruta) + '\n</style>'
);
pagina = pagina.replace(
  /<script src="(assets\/[^"?]+)(?:\?[^"]*)?"><\/script>/g,
  (_, ruta) => '<script>\n' + leerRaiz(ruta) + '\n</script>'
);
// El favicon no se inserta: jsdom no lo pide y no es parte de la conducta
// de la pantalla. Se quita antes de comprobar que no quede nada suelto.
pagina = pagina.replace(/\s*<link rel="icon"[^>]*>/g, '');

const pendientes = pagina.match(/(src|href)="assets\/[^"]*"/g);
if (pendientes) { console.log('ASSETS SIN RESOLVER:', pendientes); process.exit(1); }

const errores = [];
const consolaVirtual = new VirtualConsole();
['log', 'info', 'warn', 'error', 'dir'].forEach((n) => {
  consolaVirtual.on(n, (...a) => console[n](...a));
});
consolaVirtual.on('jsdomError', (e) => {
  if (!/Not implemented/.test(e.message)) errores.push('jsdom: ' + e.message);
});

// Lo que la pantalla descarga al publicar
const descargas = [];
let confirmaciones = true;

const dom = new JSDOM(pagina, {
  runScripts: 'dangerously',
  virtualConsole: consolaVirtual,
  pretendToBeVisual: true,
  url: 'https://juankcasal.github.io/cotizador/admin.html',
  beforeParse(w) {
    w.fetch = (url) => {
      const nombre = String(url).split('?')[0].replace(/^.*\//, '');
      const ruta = path.join(RAIZ, 'datos', nombre);
      if (!fs.existsSync(ruta)) {
        return Promise.resolve({ ok: false, status: 404,
                                 json: () => Promise.reject(new Error('404')) });
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(JSON.parse(fs.readFileSync(ruta, 'utf8')))
      });
    };

    const memoria = {};
    w.localStorage = {
      getItem: (k) => (k in memoria ? memoria[k] : null),
      setItem: (k, v) => { memoria[k] = String(v); },
      removeItem: (k) => { delete memoria[k]; }
    };

    w.confirm = () => confirmaciones;

    // jsdom no implementa las descargas, y su Blob no deja leer el contenido.
    // Se envuelve el constructor para quedarse con el texto tal cual: lo que
    // interesa comprobar es exactamente lo que se bajaria al disco.
    const BlobOrig = w.Blob;
    w.Blob = function (partes, opts) {
      this.__texto = (partes || []).join('');
      this.__tipo = (opts && opts.type) || '';
      return this;
    };
    w.URL.createObjectURL = (blob) => {
      descargas.push(blob);
      return 'blob:falso/' + descargas.length;
    };
    w.URL.revokeObjectURL = () => {};

    w.addEventListener('error', (e) => errores.push('window.onerror: ' + (e.error ? e.error.stack : e.message)));
    w.addEventListener('unhandledrejection', (e) => errores.push('promesa: ' + e.reason));
    const origErr = w.console.error;
    w.console.error = (...a) => { errores.push('console.error: ' + a.join(' ')); origErr.apply(w.console, a); };
  }
});

const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
const q = (s) => doc.querySelector(s);
const qa = (s) => [...doc.querySelectorAll(s)];

let total = 0; const fallos = [];
function ok(c, d, det) { total++; if (!c) fallos.push(`${d}${det ? ' -> ' + det : ''}`); }
function eq(a, e, d) { total++; if (a !== e) fallos.push(`${d} -> esperado=${e} obtenido=${a}`); }
function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }
function click(el) { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function setVal(el, v, ev) {
  el.value = v;
  el.dispatchEvent(new window.Event(ev || 'change', { bubbles: true }));
}
/** La celda de una columna, en la fila visible n. */
function celda(n, campo) {
  return qa('.adm-fila:not(.adm-encabezado)')[n].querySelector(`[data-campo="${campo}"]`);
}

(async () => {
  await esperar(200);

  // ======================================================== 1. ARRANQUE
  ok($('cargando').classList.contains('oculto'), 'la pantalla de carga se oculta');
  ok(!$('app').classList.contains('oculto'), 'la administracion se muestra');
  ok($('admEstado').textContent.indexOf('sin cambios') !== -1,
     'arranca sin cambios pendientes', $('admEstado').textContent);
  ok($('btnPublicar').disabled, 'sin cambios no hay nada que publicar');
  ok($('btnDescartar').disabled, 'ni nada que descartar');

  const filas = qa('.adm-fila:not(.adm-encabezado)');
  ok(filas.length > 20, 'la tabla de tarifas trae las filas', 'filas=' + filas.length);
  ok($('pieFilas').textContent.indexOf('filas') !== -1, 'el pie cuenta las filas',
     $('pieFilas').textContent);

  // El catalogo real no tiene errores: el marcador lo dice
  ok($('marcadorValidador').textContent.indexOf('advertencia') !== -1,
     'el validador reporta las advertencias del horizonte',
     $('marcadorValidador').textContent);
  ok(!!q('.adm-todo-bien'), 'y dice que se puede publicar');

  // ======================================================== 2. FILTROS
  setVal($('filtroHotel'), 'WTC', 'input');
  await esperar(150);
  const soloWtc = qa('.adm-fila:not(.adm-encabezado)');
  ok(soloWtc.length > 0 && soloWtc.length < filas.length,
     'el filtro de hotel reduce la tabla', 'filas=' + soloWtc.length);
  ok($('pieFilas').textContent.indexOf('WTC') !== -1 ||
     $('pieFilas').textContent.indexOf('Valencia') !== -1,
     'y el pie dice de que hotel', $('pieFilas').textContent);
  eq(doc.body.dataset.hotel, 'WTC', 'el acento del hotel se aplica');

  setVal($('filtroTexto'), 'DLX_KING', 'input');
  await esperar(150);
  const soloKing = qa('.adm-fila:not(.adm-encabezado)');
  eq(soloKing.length, 2, 'buscar deja las dos filas de la Deluxe King');

  // ======================================================== 3. EDITAR
  // Este es el caso real: corregir una tarifa mal cargada.
  const antes = celda(0, 'tarifa_pp_noche').value;
  setVal(celda(0, 'tarifa_pp_noche'), '195');
  await esperar(200);
  ok(celda(0, 'tarifa_pp_noche').classList.contains('cambiada'),
     'la celda editada se marca como cambiada');
  ok(!$('btnPublicar').disabled, 'ya se puede publicar');
  ok(!$('btnDescartar').disabled, 'y descartar');
  ok($('admEstado').textContent.indexOf('borrador sin publicar') !== -1,
     'la cabecera avisa que hay un borrador', $('admEstado').textContent);
  ok($('pieGuardado').textContent.indexOf('guardado') !== -1,
     'el borrador queda guardado', $('pieGuardado').textContent);

  const resumen = $('resumen').textContent;
  ok(resumen.indexOf('Filas modificadas') !== -1, 'el resumen cuenta lo modificado');

  // Volver al valor original deja de contar como cambio
  setVal(celda(0, 'tarifa_pp_noche'), antes);
  await esperar(200);
  ok($('btnPublicar').disabled,
     'deshacer el cambio a mano vuelve a dejar todo sin publicar');

  // ======================================================== 4. NO PUBLICAR ROTO
  // Una tarifa sin monto rompe la cotizacion de esa habitacion. El validador
  // tiene que verlo y el boton de publicar tiene que apagarse.
  setVal(celda(0, 'cod_temp'), '');
  await esperar(250);
  const hayError = $('marcadorValidador').classList.contains('error');
  ok(hayError, 'una tarifa sin temporada es un error',
     $('marcadorValidador').textContent);
  ok($('btnPublicar').disabled, 'y con errores NO se puede publicar');
  ok(!q('.adm-todo-bien'), 'el panel deja de decir que todo esta bien');
  ok(!!q('.adm-hallazgo.es-error'), 'y muestra el hallazgo en rojo');
  ok(!!q('.adm-fila.con-error'),
     'la fila con el problema queda marcada en la tabla, no solo en el panel');

  // ======================================================== 5. DESCARTAR
  click($('btnDescartar'));
  await esperar(250);
  ok($('btnPublicar').disabled, 'descartar deja el catalogo como estaba');
  ok($('admEstado').textContent.indexOf('sin cambios') !== -1,
     'y la cabecera vuelve a "sin cambios"', $('admEstado').textContent);
  ok(!$('marcadorValidador').classList.contains('error'),
     'sin el error de antes');

  // ======================================================== 6. PESTAÑAS
  const pest = qa('.adm-pestana').map((p) => p.dataset.tab);
  eq(pest.length, 6, 'hay seis pestañas', pest.join(','));
  click(qa('.adm-pestana').find((p) => p.dataset.tab === 'stop-sales'));
  await esperar(200);
  ok(q('.adm-pestana.activa').dataset.tab === 'stop-sales', 'se cambia de pestaña');
  ok($('tabla').textContent.indexOf('Motivo') !== -1,
     'la tabla de cierres tiene su propia columna de motivo');

  // ======================================================== 7. AGREGAR Y BORRAR
  // Sin filtro de hotel: si se edita el hotel de una fila con el filtro puesto,
  // la fila sale de la vista, que es justo lo que se comprueba mas abajo.
  setVal($('filtroHotel'), '', 'input');
  await esperar(150);
  const antesCierres = qa('.adm-fila:not(.adm-encabezado)').length;
  click($('btnFila'));
  await esperar(200);
  eq(qa('.adm-fila:not(.adm-encabezado)').length, antesCierres + 1,
     'se agrega una fila');
  ok(!$('btnDescartar').disabled, 'agregar cuenta como cambio');

  // Un cierre nuevo con fechas de verdad tiene que validar
  setVal(celda(0, 'hotel'), 'HBK');
  await esperar(150);
  setVal(celda(0, 'fecha_inicio'), '2026-11-10');
  setVal(celda(0, 'fecha_fin'), '2026-11-12');
  setVal(celda(0, 'motivo'), 'Mantenimiento de piscina');
  await esperar(250);
  ok(!$('marcadorValidador').classList.contains('error'),
     'un cierre bien cargado no rompe nada', $('marcadorValidador').textContent);

  // Con un filtro puesto, editar la fila fuera de ese filtro la saca de la
  // vista: la pantalla lo dice en vez de dejar que parezca que se borro.
  setVal($('filtroHotel'), 'HBK', 'input');
  await esperar(200);
  const visiblesHbk = qa('.adm-fila:not(.adm-encabezado)').length;
  setVal(celda(0, 'hotel'), 'HIM');
  await esperar(250);
  eq(qa('.adm-fila:not(.adm-encabezado)').length, visiblesHbk - 1,
     'la fila editada sale del filtro');
  ok($('aviso').textContent.indexOf('filtro') !== -1,
     'y la pantalla avisa por que desaparecio', $('aviso').textContent);
  setVal($('filtroHotel'), '', 'input');
  await esperar(200);
  const vuelta = qa('.adm-fila:not(.adm-encabezado)')
    .find((f) => f.querySelector('[data-campo="motivo"]').value === 'Mantenimiento de piscina');
  ok(!!vuelta, 'sin filtro la fila sigue ahi');
  if (vuelta) setVal(vuelta.querySelector('[data-campo="hotel"]'), 'HBK');
  await esperar(250);

  // ======================================================== 8. PUBLICAR
  click($('btnPublicar'));
  await esperar(200);
  ok(!$('modalPublicar').classList.contains('oculto'), 'se abre el dialogo de publicar');
  const lista = $('listaArchivos').textContent;
  ok(lista.indexOf('stop-sales.json') !== -1,
     'lista el archivo que cambio', lista);
  ok(lista.indexOf('tarifas.json') === -1,
     'y NO los que no cambiaron', lista);

  descargas.length = 0;
  click($('btnDescargar'));
  await esperar(900);
  eq(descargas.length, 1, 'se descarga un solo archivo');

  if (descargas.length) {
    const texto = descargas[0].__texto;
    eq(descargas[0].__tipo, 'application/json;charset=utf-8',
       'se descarga como JSON');
    const bajado = JSON.parse(texto);
    ok(Array.isArray(bajado), 'el archivo descargado es un JSON valido');
    const nuevo = bajado.find((f) => f.motivo === 'Mantenimiento de piscina');
    ok(!!nuevo, 'y contiene la fila que se acaba de cargar');
    if (nuevo) {
      eq(nuevo.fecha_inicio, '2026-11-10', 'con su fecha de inicio');
      eq(nuevo.hotel, 'HBK', 'y su hotel');
      eq(nuevo.activo, true, 'activo como booleano, no como texto');
    }
    ok(texto.charAt(texto.length - 1) === '\n',
       'el archivo termina en salto de linea, como los del repositorio');
  }

  // ======================================================== 9. MENSAJES
  // La pestaña donde se editan los textos que recibe el cliente. Lo que
  // importa no es que el textarea se pinte, sino que la vista previa salga
  // del motor de verdad y que editar como asesora NO pise el mensaje del
  // hotel: si lo pisara, cambiar el estilo de una cambiaria el de todas.
  click(qa('.adm-pestana').find((p) => p.dataset.tab === 'plantillas'));
  await esperar(250);
  ok(!$('mensajes').classList.contains('oculto'), 'el panel de mensajes se muestra');
  ok($('tabla').classList.contains('oculto'), 'y la tabla se esconde');
  ok($('btnFila').classList.contains('oculto'),
     'sin "+ Fila": los mensajes no se agregan a mano');

  const quienes = [...$('filtroTemp').options].map((o) => o.value);
  ok(quienes.indexOf('MZ') !== -1 && quienes.indexOf('LR') !== -1,
     'el segundo filtro pasa a elegir asesora', quienes.join(','));
  eq(quienes[0], '', 'con el mensaje del hotel como primera opcion');

  setVal($('filtroHotel'), 'HBK', 'input');
  await esperar(250);
  const delHotel = $('plantillaTexto').value;
  ok(delHotel.length > 50, 'trae el mensaje del hotel', 'largo=' + delHotel.length);
  ok($('plantillaPrevia').textContent.indexOf('{{') === -1,
     'la vista previa no deja marcadores sin resolver',
     $('plantillaPrevia').textContent.slice(0, 120));
  ok($('plantillaPrevia').textContent.indexOf('CHECK IN') !== -1,
     'y sale del motor de verdad, con la cotizacion de ejemplo dentro');

  // Una asesora sin juego propio hereda el del hotel
  setVal($('filtroTemp'), 'MZ', 'input');
  await esperar(250);
  ok($('plantillaQuien').textContent.indexOf('MZ') !== -1 ||
     $('plantillaQuien').textContent.indexOf('Marla') !== -1,
     'la etiqueta dice de quien es el mensaje', $('plantillaQuien').textContent);

  // Editar como asesora crea SU fila, sin tocar la del hotel
  setVal($('plantillaTexto'), delHotel + '\nUn saludo, MZ.', 'input');
  await esperar(300);
  ok(!$('btnPublicar').disabled, 'editar un mensaje habilita publicar');

  setVal($('filtroTemp'), '', 'input');
  await esperar(250);
  eq($('plantillaTexto').value, delHotel,
     'el mensaje del hotel sigue intacto tras editar el de la asesora');

  setVal($('filtroTemp'), 'MZ', 'input');
  await esperar(250);
  ok($('plantillaTexto').value.indexOf('Un saludo, MZ.') !== -1,
     'y el de la asesora conserva lo editado');

  // Un marcador mal escrito tiene que verse ANTES, no con el cliente esperando
  setVal($('plantillaTexto'), 'Hola {{clientte}}, van {{noches}} noches.', 'input');
  await esperar(300);
  ok($('plantillaMarcadores').textContent.indexOf('clientte') !== -1,
     'un marcador mal escrito se reporta',
     $('plantillaMarcadores').textContent.slice(0, 140));
  ok($('plantillaPrevia').textContent.indexOf('{{clientte}}') !== -1,
     'y se ve tal cual saldria en el mensaje');

  click($('btnDescartar'));
  await esperar(300);
  eq($('plantillaTexto').value.indexOf('clientte'), -1,
     'descartar deja los mensajes como estaban');

  // ---------- Reporte ----------
  console.log('========================================');
  console.log(`Administracion en jsdom -> ${total} chequeos | fallan: ${fallos.length}`);
  if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach((f) => console.log('  - ' + f)); }
  if (errores.length) {
    console.log('\nERRORES DE EJECUCION:');
    [...new Set(errores)].forEach((e) => console.log('  ! ' + e));
  } else {
    console.log('Sin errores de ejecucion.');
  }
  process.exit(fallos.length || errores.length ? 1 : 0);
})();
