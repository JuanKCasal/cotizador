/* La publicación a GitHub, contra un GitHub de mentira.

   Es la única parte de la app que escribe fuera del navegador, y lo que
   escribe son los precios. Lo que se comprueba aquí no es que "funcione":
   es que el commit lleve EXACTAMENTE lo editado, que sea UNO solo aunque
   cambien varios archivos, que no se publique nada si algo falla a mitad, y
   que la clave no quede en ningún sitio después. */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const RAIZ = path.join(__dirname, '..');
const leerRaiz = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let pagina = leerRaiz('admin.html');
pagina = pagina.replace(/\s*<link rel="icon"[^>]*>/g, '');
pagina = pagina.replace(/<link rel="stylesheet" href="(assets\/[^"?]+)(?:\?[^"]*)?">/g,
  (_, r) => '<style>\n' + leerRaiz(r) + '\n</style>');
pagina = pagina.replace(/<script src="(assets\/[^"?]+)(?:\?[^"]*)?"><\/script>/g,
  (_, r) => '<script>\n' + leerRaiz(r) + '\n</script>');

const errores = [];
const vc = new VirtualConsole();
['log', 'info', 'warn', 'dir'].forEach((n) => vc.on(n, (...a) => console[n](...a)));
vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errores.push('jsdom: ' + e.message); });

// ---------------------------------------------------------- GitHub de mentira
const SHA_COMMIT = 'c0ffee1', SHA_ARBOL = 'a2b3c4d';
let pedidos = [];          // todo lo que se le mandó
let clavesVistas = [];
let fallarEn = null;       // ruta que debe romperse, para el caso del fallo
let refActualizada = null;

function githubFalso(url, op) {
  const ruta = String(url).replace('https://api.github.com/repos/JuanKCasal/cotizador', '');
  const cuerpo = op && op.body ? JSON.parse(op.body) : null;
  pedidos.push({ ruta, metodo: (op && op.method) || 'GET', cuerpo });
  if (op && op.headers) clavesVistas.push(op.headers.Authorization);

  const responder = (obj, status) => Promise.resolve({
    ok: status === undefined || (status >= 200 && status < 300),
    status: status || 200,
    json: () => Promise.resolve(obj),
    text: () => Promise.resolve(JSON.stringify(obj))
  });

  if (fallarEn && ruta.indexOf(fallarEn) === 0) {
    return responder({ message: 'Bad credentials' }, 401);
  }
  if (ruta === '/git/ref/heads/main') return responder({ object: { sha: SHA_COMMIT } });
  if (ruta === '/git/commits/' + SHA_COMMIT) return responder({ tree: { sha: SHA_ARBOL } });
  if (ruta === '/git/blobs') return responder({ sha: 'blob-' + pedidos.length });
  if (ruta === '/git/trees') return responder({ sha: 'arbol-nuevo' });
  if (ruta === '/git/commits') return responder({ sha: 'commit-nuevo' });
  if (ruta === '/git/refs/heads/main') { refActualizada = cuerpo; return responder({ object: cuerpo }); }
  return responder({ message: 'Not Found' }, 404);
}

const dom = new JSDOM(pagina, {
  runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
  url: 'https://juankcasal.github.io/cotizador/admin.html',
  beforeParse(w) {
    w.fetch = (url, op) => {
      if (String(url).indexOf('https://api.github.com') === 0) return githubFalso(url, op);
      const nombre = String(url).split('?')[0].replace(/^.*\//, '');
      const ruta = path.join(RAIZ, 'datos', nombre);
      if (!fs.existsSync(ruta)) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({ ok: true, status: 200,
        json: () => Promise.resolve(JSON.parse(fs.readFileSync(ruta, 'utf8'))) });
    };
    const mem = {};
    w.localStorage = {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; }
    };
    w.__mem = mem;
    w.confirm = () => true;
    w.URL.createObjectURL = () => 'blob:falso';
    w.URL.revokeObjectURL = () => {};
    w.TextEncoder = require('util').TextEncoder;
    w.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
    w.addEventListener('error', (e) => errores.push('window.onerror: ' + (e.error ? e.error.stack : e.message)));
    w.addEventListener('unhandledrejection', (e) => errores.push('promesa: ' + e.reason));
    const orig = w.console.error;
    w.console.error = (...a) => { errores.push('console.error: ' + a.join(' ')); orig.apply(w.console, a); };
  }
});

const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);
const qa = (s) => [...doc.querySelectorAll(s)];
let total = 0; const fallos = [];
const ok = (c, d, det) => { total++; if (!c) fallos.push(`${d}${det ? ' -> ' + det : ''}`); };
const eq = (a, e, d) => { total++; if (a !== e) fallos.push(`${d} -> esperado=${e} obtenido=${a}`); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const setVal = (el, v, ev) => { el.value = v; el.dispatchEvent(new window.Event(ev || 'change', { bubbles: true })); };
const celda = (n, campo) => qa('.adm-fila:not(.adm-encabezado)')[n].querySelector(`[data-campo="${campo}"]`);

(async () => {
  await esperar(250);

  // Un cambio de verdad: corregir una tarifa.
  setVal($('filtroHotel'), 'WTC', 'input');
  await esperar(120);
  setVal($('filtroTexto'), 'DLX_KING', 'input');
  await esperar(120);
  const antes = celda(0, 'tarifa_pp_noche').value;
  setVal(celda(0, 'tarifa_pp_noche'), '195');
  await esperar(250);
  ok(!$('btnPublicar').disabled, 'con un cambio se puede publicar');

  click($('btnPublicar'));
  await esperar(150);
  eq($('clavePublicar').value, '', 'el dialogo abre con la clave en blanco');
  eq($('quienPublica').value, 'MZ', 'y con quien publica en las iniciales por defecto');
  ok(qa('#quienPublica option').length >= 3,
     'con las asesoras activas y la opcion de no decirlo',
     qa('#quienPublica option').map((o) => o.value).join(','));

  // ============================================ 1. SIN CLAVE NO SE PUBLICA
  pedidos = [];
  click($('btnPublicarGit'));
  await esperar(150);
  eq(pedidos.length, 0, 'sin clave no se llama a GitHub');
  ok($('publicando').textContent.indexOf('Falta la clave') !== -1,
     'y lo dice', $('publicando').textContent);

  // ============================================ 2. UN FALLO NO PUBLICA NADA
  pedidos = []; fallarEn = '/git/ref/heads/main';
  setVal($('clavePublicar'), 'github_pat_malo', 'input');
  click($('btnPublicarGit'));
  await esperar(400);
  ok($('publicando').classList.contains('error'), 'una clave mala se reporta como error');
  ok($('publicando').textContent.indexOf('caducó') !== -1,
     'en palabras, no como "Error 401"', $('publicando').textContent);
  ok(refActualizada === null, 'y NO se movio la rama');
  ok(!$('btnPublicar').disabled, 'el borrador sigue ahi para reintentar');

  // ============================================ 3. PUBLICACION BUENA
  pedidos = []; fallarEn = null; clavesVistas = [];
  setVal($('clavePublicar'), 'github_pat_bueno', 'input');
  click($('btnPublicarGit'));
  await esperar(600);

  ok($('publicando').classList.contains('exito'), 'publica',
     $('publicando').textContent);

  const blobs = pedidos.filter((p) => p.ruta === '/git/blobs');
  eq(blobs.length, 1, 'un blob por archivo cambiado');
  const arboles = pedidos.filter((p) => p.ruta === '/git/trees');
  eq(arboles.length, 1, 'un solo arbol');
  const commits = pedidos.filter((p) => p.ruta === '/git/commits' && p.metodo === 'POST');
  eq(commits.length, 1, 'UN SOLO COMMIT aunque cambien varios archivos');
  eq(arboles[0].cuerpo.base_tree, SHA_ARBOL, 'el arbol cuelga del que ya habia');
  eq(arboles[0].cuerpo.tree[0].path, 'datos/tarifas.json', 'y apunta a la ruta correcta');
  eq(commits[0].cuerpo.parents[0], SHA_COMMIT, 'el commit cuelga del anterior');
  ok(commits[0].cuerpo.message.indexOf('tarifas.json') !== -1,
     'el mensaje dice que se cambio', commits[0].cuerpo.message);
  ok(commits[0].cuerpo.message.indexOf('Marla Zuluaga') !== -1,
     'y quien lo publico, para que el historial sirva de algo',
     commits[0].cuerpo.message);

  // Lo subido tiene que ser EXACTAMENTE lo editado.
  const subido = Buffer.from(blobs[0].cuerpo.content, 'base64').toString('utf8');
  ok(subido.charAt(subido.length - 1) === '\n', 'el archivo termina en salto de linea');
  let datos = null;
  try { datos = JSON.parse(subido); } catch (e) { /* lo dira el chequeo */ }
  ok(Array.isArray(datos), 'lo subido es un JSON valido');
  if (datos) {
    const fila = datos.find((f) => String(f.tarifa_pp_noche) === '195');
    ok(!!fila, 'y contiene la tarifa que se acaba de corregir');
  }

  ok(refActualizada && refActualizada.sha === 'commit-nuevo', 'la rama apunta al commit nuevo');
  eq(refActualizada && refActualizada.force, false,
     'sin force: si alguien publico mientras tanto, se avisa en vez de pisarlo');

  // La clave viaja como Bearer y solo a GitHub.
  ok(clavesVistas.every((c) => c === 'Bearer github_pat_bueno'),
     'la clave viaja en la cabecera de cada llamada');

  // ============================================ 4. NO QUEDA RASTRO DE LA CLAVE
  eq($('clavePublicar').value, '', 'la clave se borra del campo al publicar');
  const guardado = JSON.stringify(window.__mem);
  ok(guardado.indexOf('github_pat_bueno') === -1,
     'y NO queda en el almacenamiento del navegador', guardado.slice(0, 120));

  // ============================================ 5. DESPUES YA NO HAY BORRADOR
  await esperar(120);
  ok($('btnPublicar').disabled, 'publicado, ya no hay nada pendiente');
  ok($('admEstado').textContent.indexOf('sin cambios') !== -1,
     'y la cabecera lo dice', $('admEstado').textContent);

  console.log('========================================');
  console.log(`Publicacion a GitHub -> ${total} chequeos | fallan: ${fallos.length}`);
  if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach((f) => console.log('  - ' + f)); }
  if (errores.length) {
    console.log('\nERRORES DE EJECUCION:');
    [...new Set(errores)].forEach((e) => console.log('  ! ' + e));
  } else { console.log('Sin errores de ejecucion.'); }
  process.exit(fallos.length || errores.length ? 1 : 0);
})();
