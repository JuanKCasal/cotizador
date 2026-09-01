/* Arnes local (Node) para validar el motor fuera de Apps Script.
   NO forma parte del entregable.

   A diferencia de la version anterior, este arnes NO duplica las aserciones:
   carga 05_Pruebas.gs y ejecuta la MISMA suite que corre dentro del Sheet,
   con stubs de las APIs de Google. Una asercion nueva en 05_Pruebas.gs
   aparece aqui sola, y es imposible que las dos listas se desincronicen. */

const fs = require('fs');
const vm = require('vm');

/* Los archivos fuente viven en apps-script/. El arnes los lee de ahi
   directamente: si se copiaran aqui, las copias divergirian y las pruebas
   validarian codigo viejo sin avisar. */
const path = require('path');
const SRC = path.join(__dirname, '..', 'apps-script');
const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const ctx = { console };
ctx.global = ctx;
vm.createContext(ctx);

// --- Stubs minimos de Apps Script ---
ctx.Utilities = {
  formatDate: (d, tz, f) => d.toISOString().slice(0, 10),
  getUuid: () => 'uuid'
};
ctx.Logger = { log: (s) => console.log(s) };
ctx.Session = { getScriptTimeZone: () => 'UTC' };
ctx.PropertiesService = {
  getUserProperties: () => ({ getProperty: () => null, setProperty: () => {} })
};
ctx.CacheService = {
  getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} })
};
ctx.LockService = {
  getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
};

let ALERTAS = [];
ctx.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: () => null,
    insertSheet: () => null,
    setActiveSheet: () => {}
  }),
  getUi: () => ({
    alert: (...a) => ALERTAS.push(a.join(' | ')),
    ButtonSet: { OK: 1 },
    createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} })
  }),
  newDataValidation: () => ({
    requireValueInList() { return this; },
    setAllowInvalid() { return this; },
    build() { return {}; }
  }),
  flush: () => {}
};

// --- Carga 00_Setup (esquema + datos) ---
vm.runInContext(leer('00_Setup.gs'), ctx);

// Captura de las filas que instalarTodo() escribiria en cada hoja
const DATOS = {};
ctx.escribir_ = function (ss, hoja, filas) { DATOS[hoja] = filas; };
vm.runInContext('cargarDatosDemo_({});', ctx);

// --- Carga 01_Catalogo, sustituyendo leerHoja_ por lectura de DATOS ---
vm.runInContext(leer('01_Catalogo.gs'), ctx);

ctx.__DATOS = DATOS;
vm.runInContext(`
leerHoja_ = function (ss, nombre) {
  var def = ESQUEMA[nombre];
  var filas = __DATOS[nombre] || [];
  return filas.map(function (fila, i) {
    var obj = {};
    def.cols.forEach(function (h, j) {
      var v = fila[j];
      if (def.fechas.indexOf(h) !== -1) obj[h] = normalizarFecha_(v, nombre + '!' + h + ' fila ' + (i + 2));
      else obj[h] = (typeof v === 'string') ? v.trim() : v;
    });
    return obj;
  });
};
`, ctx);

// --- Motor y puente MOTOR() ---
const motorSrc = leer('02_Motor.html')
  .replace(/<script[^>]*>/gi, '').replace(/<\/script>/gi, '');
vm.runInContext(motorSrc, ctx);
const M = ctx.Motor;
ctx.MOTOR = () => M;

// --- Validador y suite ---
vm.runInContext(leer('04_Validador.gs'), ctx);
vm.runInContext(leer('05_Pruebas.gs'), ctx);

// La suite escribe en la hoja "Pruebas"; aqui solo se recogen los resultados.
let RESULTADOS = [];
ctx.escribirResultados_ = function (res) { RESULTADOS = res; };

// ============================================================================
// 1. SUITE COMPARTIDA (la misma que corre en el Sheet)
// ============================================================================
vm.runInContext('ejecutarPruebas();', ctx);

const cat = vm.runInContext('getCatalogo(true)', ctx);
let fallos = RESULTADOS.filter(r => !r.pass)
  .map(r => `[${r.caso}] ${r.desc}${r.detalle ? ' -> ' + r.detalle : ''}`);
let total = RESULTADOS.length;

// ============================================================================
// 2. FLUJO DE LA SPA (no vive en 05_Pruebas.gs porque es logica de cliente)
// ============================================================================
let casoActual = 'SPA flujo';
function eq(a, e, d) {
  total++;
  const pass = (typeof a === 'number' && typeof e === 'number') ? Math.abs(a - e) < 0.005 : a === e;
  if (!pass) fallos.push(`[${casoActual}] ${d} -> esperado=${e} obtenido=${JSON.stringify(a)}`);
}
function ok(c, d, det) { total++; if (!c) fallos.push(`[${casoActual}] ${d} ${det || ''}`); }

const habsDe = (h) => Object.keys(cat.habitaciones).map(k => cat.habitaciones[k])
  .filter(x => x.hotel === h).sort((a, b) => a.orden - b.orden);
const unicos = (a) => a.filter((v, i) => a.indexOf(v) === i);

// Cascada categoria -> ocupacion -> atributo
const hpa = habsDe('HPA');
eq(JSON.stringify(unicos(hpa.map(x => x.categoria))), '["HOLIDAY VILLAGE","PREMIUM"]',
   'categorias HPA');
const ocupHol = unicos(hpa.filter(x => x.categoria === 'HOLIDAY VILLAGE').map(x => x.ocupacion));
eq(JSON.stringify(ocupHol), '["TRIPLE","CUÁDRUPLE"]', 'ocupaciones HOLIDAY VILLAGE');
const attrPre = unicos(hpa.filter(x => x.categoria === 'PREMIUM').map(x => x.atributo));
eq(JSON.stringify(attrPre), '["VISTA JARDÍN","VISTA PISCINA"]', 'atributos PREMIUM');
const resuelto = hpa.find(x => x.categoria === 'PREMIUM' && x.ocupacion === 'CUÁDRUPLE' &&
                               x.atributo === 'VISTA PISCINA');
eq(resuelto.cod, 'PRE_POOL', 'la cascada resuelve cod_hab');

const him = habsDe('HIM');
eq(unicos(him.map(x => x.categoria)).length, 1, 'HIM: una sola categoria');
eq(JSON.stringify(unicos(him.map(x => x.atributo))), '["VISTA MONTAÑA","VISTA AL MAR"]',
   'HIM: la vista es el atributo, no una categoria aparte');
eq(unicos(habsDe('HBK').map(x => x.atributo)).join('|'), '', 'HBK sin atributos: nivel oculto');

// Request tal como lo arma la SPA (con edades)
const reqSPA = {
  hotel: 'HBK', checkin: '2026-09-01', checkout: '2026-09-03', promos: [],
  lineas: [{ cod_hab: 'BAS_QUA', cantidad: 1, adultos: 2, edades: [6, 8] }]
};
const resSPA = M.calcular(cat, reqSPA);
ok(resSPA.ok, 'req de la SPA calcula', (resSPA.errores || []).join('; '));
eq(resSPA.lineas[0].paxEfectivo, 3, 'pax_min_cobrados desde el req de la SPA');
eq(resSPA.total, 510, 'total desde el req de la SPA');

// Un menor recien agregado todavia no tiene edad: la SPA manda '' y el motor
// tiene que decirlo, no calcular con un valor inventado.
const reqSinEdad = {
  hotel: 'HBK', checkin: '2026-09-01', checkout: '2026-09-03', promos: [],
  lineas: [{ cod_hab: 'BAS_TPL', cantidad: 1, adultos: 2, edades: [''] }]
};
ok(!M.calcular(cat, reqSinEdad).ok, 'menor sin edad -> la SPA muestra el error');

// Vista previa: markdown de WhatsApp -> HTML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const aHtmlWhatsApp = (t) => esc(t)
  .replace(/\*([^\s*][^*\n]*?)\*/g, '<strong>$1</strong>')
  .replace(/_([^\s_][^_\n]*?)_/g, '<em>$1</em>');
eq(aHtmlWhatsApp('*TOTAL: $340*'), '<strong>TOTAL: $340</strong>', 'negrita');
eq(aHtmlWhatsApp('_texto_'), '<em>texto</em>', 'cursiva');
eq(aHtmlWhatsApp('a * b'), 'a * b', 'asterisco suelto intacto');
eq(aHtmlWhatsApp('<script>'), '&lt;script&gt;', 'escapa HTML');
const prev = aHtmlWhatsApp(M.render(cat, resSPA, { asesorIniciales: 'MZ', cliente: 'X' }));
ok(prev.indexOf('<strong>HOTEL HESPERIA MORROCOY</strong>') !== -1, 'preview con titulo en negrita');
ok(prev.indexOf('{{') === -1, 'preview sin marcadores');

// ============================================================================
// 3. TEXTOS DE MUESTRA (para comparar contra los formatos escritos a mano)
// ============================================================================
function muestra(titulo, hotel, ci, co, lineas, promos, catUsar) {
  const c = catUsar || cat;
  const r = M.calcular(c, { hotel, checkin: ci, checkout: co, lineas, promos: promos || [] });
  console.log(`\n----- ${titulo} -----`);
  if (!r.ok) { console.log('ERRORES: ' + r.errores.join(' | ')); return; }
  console.log(M.render(c, r, { asesorIniciales: 'MZ', cliente: 'Cliente' }));
}

muestra('HBK familia con edades', 'HBK', '2026-09-01', '2026-09-04',
        [{ cod_hab: 'BAS_QUA', cantidad: 1, adultos: 2, edades: [3, 8] }]);
muestra('HIM con Promocion Residentes', 'HIM', '2026-09-14', '2026-09-17',
        [{ cod_hab: 'DLX_VMON', cantidad: 1, adultos: 2, edades: [] }], ['PRO_RESIDENTES']);
muestra('WTC ciudad con IVA', 'WTC', '2026-08-22', '2026-08-25',
        [{ cod_hab: 'DLX_KING', cantidad: 1, adultos: 1, edades: [] }], [],
        vm.runInContext('conWTC_(getCatalogo(true), 100)', ctx));

// ============================================================================
console.log('\n========================================');
console.log(`TOTAL: ${total} | PASAN: ${total - fallos.length} | FALLAN: ${fallos.length}`);
if (fallos.length) {
  console.log('\nFALLOS:');
  fallos.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('========================================');
