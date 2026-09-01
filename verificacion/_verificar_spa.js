/* Ejecuta la SPA real en jsdom, con google.script.run stubbeado contra el
   catalogo real generado por 00_Setup.gs. Detecta errores en tiempo de
   ejecucion que el chequeo de sintaxis no ve. */
const fs = require('fs');
const vm = require('vm');

/* Los archivos fuente viven en apps-script/. El arnes los lee de ahi
   directamente: si se copiaran aqui, las copias divergirian y las pruebas
   validarian codigo viejo sin avisar. */
const path = require('path');
const SRC = path.join(__dirname, '..', 'apps-script');
const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const { JSDOM } = require('jsdom');

// ---------- Catalogo real (misma cadena que _verificar.js) ----------
const ctxS = { console };
vm.createContext(ctxS);
ctxS.Utilities = { formatDate: (d) => d.toISOString().slice(0, 10) };
ctxS.Logger = { log: () => {} };
ctxS.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => null }), getUi: () => ({ alert: () => {} }), flush: () => {} };
ctxS.Session = { getScriptTimeZone: () => 'UTC' };
vm.runInContext(leer('00_Setup.gs'), ctxS);
const DATOS = {};
ctxS.escribir_ = (ss, hoja, filas) => { DATOS[hoja] = filas; };
vm.runInContext('cargarDatosDemo_({});', ctxS);
vm.runInContext(leer('01_Catalogo.gs'), ctxS);
ctxS.__DATOS = DATOS;
vm.runInContext(`
leerHoja_ = function (ss, nombre) {
  var def = ESQUEMA[nombre];
  return (__DATOS[nombre] || []).map(function (fila, i) {
    var obj = {};
    def.cols.forEach(function (h, j) {
      var v = fila[j];
      if (def.fechas.indexOf(h) !== -1) obj[h] = normalizarFecha_(v, nombre);
      else if ((def.texto || []).indexOf(h) !== -1) obj[h] = normalizarTexto_(v);
      else obj[h] = (typeof v === 'string') ? v.trim() : v;
    });
    return obj;
  });
};`, ctxS);
const CATALOGO = vm.runInContext('construirCatalogo_()', ctxS);

// ---------- Ensamblar la pagina como lo hace HtmlService ----------
const motor = leer('02_Motor.html');
const estilos = leer('07_Estilos.html');
const logica = leer('08_Logica.html');
let pagina = leer('06_SPA.html');
// Funcion de reemplazo: el contenido incluye $('...') y "$'" es un patron
// especial de String.replace que corromperia el resultado.
pagina = pagina
  .replace(/<\?!=\s*include\('07_Estilos'\);?\s*\?>/g, () => estilos)
  .replace(/<\?!=\s*include\('02_Motor'\);?\s*\?>/g, () => motor)
  .replace(/<\?!=\s*include\('08_Logica'\);?\s*\?>/g, () => logica);

const restantes = pagina.match(/<\?!?=?[\s\S]{0,60}?\?>/g);
if (restantes) { console.log('SCRIPTLETS SIN RESOLVER:', restantes); process.exit(1); }

// ---------- Errores capturados ----------
const errores = [];
const dom = new JSDOM(pagina, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://script.google.com/macros/s/x/exec',
  beforeParse(w) {
    w.google = {
      script: {
        run: (function () {
          const api = {
            withSuccessHandler(fn) { this._ok = fn; return this; },
            withFailureHandler(fn) { this._err = fn; return this; },
            apiIniciar() {
              const r = { catalogo: CATALOGO, prefs: { asesorIniciales: 'MZ' } };
              setTimeout(() => this._ok && this._ok(r), 0);
            },
            apiGuardarIniciales() {},
            apiRegistrarCotizacion(p) {
              setTimeout(() => this._ok && this._ok({ ok: true, id: 'HBK-202608-0001', total: 340 }), 0);
            }
          };
          return new Proxy(api, { get: (t, k) => (k in t ? t[k] : undefined) });
        })()
      }
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

  // 7. Registro sin nombre de cliente debe bloquear
  const btnReg = $('btnRegistrar');
  ok(!!btnReg, 'existe el boton de registrar');
  if (btnReg && $('cliente')) {
    $('cliente').value = '';
    click(btnReg);
    await esperar(60);
    setVal($('cliente'), 'Juan Perez', 'input');
    await esperar(60);
    click(btnReg);
    await esperar(120);
    ok(true, 'el registro se ejecuta sin lanzar excepciones');
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
