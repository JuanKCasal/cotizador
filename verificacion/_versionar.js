/* Pone (o actualiza) el ?v= de cada asset en las dos pantallas.

   GitHub Pages sirve el CSS y el JS con caché, así que al publicar un cambio
   el navegador de la asesora podía seguir con la versión vieja. Un ?v= nuevo
   es una URL nueva: el navegador la pide otra vez, y las que no cambiaron
   siguen sirviéndose de caché.

   Los JSON de datos NO se versionan aquí: los pide fetch() y catalogo.js ya
   les pone su propio anti-caché. Este script es solo para lo que va en el
   <head>.

   Uso:  node _versionar.js            -> sella con la fecha de hoy
         node _versionar.js 2026.09.03 -> sella con esa versión */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PANTALLAS = ['index.html', 'admin.html'];

function hoy() {
  const d = new Date();
  const dd = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${dd(d.getMonth() + 1)}.${dd(d.getDate())}`;
}

const version = process.argv[2] || hoy();
if (!/^[\w.-]+$/.test(version)) {
  console.error('Versión con caracteres raros:', version);
  process.exit(1);
}

let tocados = 0;
for (const pantalla of PANTALLAS) {
  const ruta = path.join(RAIZ, pantalla);
  const antes = fs.readFileSync(ruta, 'utf8');
  // Solo los assets propios. Las fuentes de Google traen su propia caché y el
  // favicon cambia una vez cada nunca.
  const despues = antes.replace(
    /(src|href)="(assets\/[^"?]+\.(?:css|js))(\?v=[\w.-]+)?"/g,
    (_, attr, archivo) => `${attr}="${archivo}?v=${version}"`
  );
  if (antes !== despues) { fs.writeFileSync(ruta, despues); tocados++; }
  const n = (despues.match(/\?v=/g) || []).length;
  console.log(`${pantalla}: ${n} assets sellados con v=${version}`);
}
console.log(tocados ? 'Listo. Recuerda comitear las dos pantallas.' : 'Sin cambios.');
