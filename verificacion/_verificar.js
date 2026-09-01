/* Arnes de verificacion del Cotizador Hesperia.
   NO forma parte del sitio publicado.

   Corre la suite de pruebas.js contra los archivos de datos/ REALES, los
   mismos que descarga el navegador. Cuando el catalogo vivia en Sheets esto
   no era posible y quedaba un hueco: el bug del "5,6" no aparecia aqui porque
   el dato nunca pasaba por Google. Ahora la fuente es la misma en los dos
   lados, asi que lo que pasa aqui es lo que va a pasar en produccion. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const leerAsset = (f) => fs.readFileSync(path.join(RAIZ, 'assets', f), 'utf8');
const leerDato = (f) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'datos', f), 'utf8'));

// --- Motor, catalogo y validador, en un contexto limpio ---------------------
const ctx = { console };
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(leerAsset('motor.js'), ctx);
vm.runInContext(leerAsset('catalogo.js'), ctx);
vm.runInContext(leerAsset('validador.js'), ctx);

const M = ctx.Motor;
const Validador = ctx.Validador;

// --- Catalogo construido desde datos/ ---------------------------------------
const crudo = {};
ctx.Catalogo.TABLAS.forEach((t) => { crudo[t] = leerDato(t + '.json'); });

let cat;
try {
  cat = ctx.Catalogo.construir(crudo);
} catch (e) {
  console.error('\nNo se pudo construir el catalogo desde datos/:\n  ' + e.message + '\n');
  process.exit(1);
}

// ============================================================================
// 1. SUITE FUNCIONAL
// ============================================================================
const { ejecutarPruebas } = require('./pruebas.js');
const RESULTADOS = ejecutarPruebas(cat, M, Validador, ctx.Catalogo);

let fallos = RESULTADOS.filter((r) => !r.pass)
  .map((r) => `[${r.caso}] ${r.desc}${r.detalle ? ' -> ' + r.detalle : ''}`);
let total = RESULTADOS.length;

// ============================================================================
// 2. FLUJO DE LA SPA (logica de cliente, no vive en pruebas.js)
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
// WTC ya esta activo con tarifas propias: se cotiza contra el catalogo real,
// sin inyectar nada.
muestra('WTC ciudad', 'WTC', '2026-08-22', '2026-08-25',
        [{ cod_hab: 'DLX_KING', cantidad: 1, adultos: 1, edades: [] }]);

// ============================================================================
console.log('\n========================================');
console.log(`TOTAL: ${total} | PASAN: ${total - fallos.length} | FALLAN: ${fallos.length}`);
if (fallos.length) {
  console.log('\nFALLOS:');
  fallos.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('========================================');
