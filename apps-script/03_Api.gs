/**
 * COTIZADOR HESPERIA - 03_Api.gs
 * Puente entre el motor compartido y Apps Script.
 */

var __MOTOR_CACHE = null;

/**
 * Carga Motor.html y lo evalua en el servidor.
 * Misma implementacion que usa el cliente -> imposible que diverjan.
 */
function MOTOR() {
  if (__MOTOR_CACHE) return __MOTOR_CACHE;
  var src = HtmlService.createHtmlOutputFromFile('02_Motor').getContent();
  src = src.replace(/<script[^>]*>/gi, '').replace(/<\/script>/gi, '');
  __MOTOR_CACHE = (new Function(src + '\nreturn Motor;'))();
  return __MOTOR_CACHE;
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

// ============================================================================
// ENDPOINTS PARA LA SPA
// ============================================================================
function apiGetCatalogo() {
  var cat = getCatalogo(false);
  // La SPA no necesita las plantillas completas para calcular; se envian igual
  // porque pesan poco y permiten preview instantaneo sin round-trip.
  return cat;
}

function apiCalcular(req) {
  var cat = getCatalogo(false);
  return MOTOR().calcular(cat, req);
}

/**
 * Registro. El servidor RECALCULA: nunca confia en los totales del cliente.
 */
function apiRegistrarCotizacion(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, error: 'El sistema esta ocupado. Intente de nuevo en unos segundos.' };
  }
  try {
    var cat = getCatalogo(false);
    var M = MOTOR();
    var res = M.calcular(cat, payload.req);
    if (!res.ok) return { ok: false, error: res.errores.join(' | ') };

    if (!payload.cliente || !String(payload.cliente).trim()) {
      return { ok: false, error: 'Debe indicar el nombre del cliente.' };
    }

    var texto = M.render(cat, res, {
      asesorIniciales: payload.asesorIniciales || '',
      cliente: payload.cliente
    });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var id = generarId_(ss, payload.req.hotel);
    var ahora = new Date();
    var email = '';
    try { email = Session.getActiveUser().getEmail(); } catch (e) { email = 'desconocido'; }

    var shC = ss.getSheetByName('Cotizaciones');
    shC.appendRow([
      id, ahora, email, payload.asesorIniciales || '', String(payload.cliente).trim(),
      payload.req.hotel, res.checkin, res.checkout, res.nNoches, res.totalHabitaciones,
      res.subtotal, res.cargos, res.total,
      res.promosAplicadas.map(function (p) { return p.cod; }).join(','),
      texto, cat.config.VERSION_TARIFAS || '', 'REGISTRADA'
    ]);

    var shL = ss.getSheetByName('CotizacionLineas');
    var filas = res.lineas.map(function (l) {
      return [
        id, l.n, l.cod_hab, l.nombre, l.cantidad, l.adultos,
        (l.edades || []).join(','),
        l.menores.map(function (m) { return m.cod + ':' + m.cant; }).join(','),
        l.paxEfectivo, l.aplicoSingle ? 'SI' : 'NO',
        res.nNoches ? Math.round((l.subtotalUnidad / res.nNoches) * 100) / 100 : 0,
        l.subtotalLinea, l.cargosLinea
      ];
    });
    if (filas.length) {
      shL.getRange(shL.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    }
    SpreadsheetApp.flush();

    return { ok: true, id: id, texto: texto, total: res.total };
  } catch (err) {
    return { ok: false, error: 'Error al registrar: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ID robusto bajo concurrencia: contador en Config, dentro del lock del caller.
 */
function generarId_(ss, hotel) {
  var sh = ss.getSheetByName('Config');
  var datos = sh.getDataRange().getValues();
  var fila = -1, actual = 0;
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][0] === 'CONTADOR_COTIZACIONES') { fila = i + 1; actual = Number(datos[i][1]) || 0; }
  }
  if (fila === -1) {
    sh.appendRow(['CONTADOR_COTIZACIONES', 1, 'Correlativo interno de cotizaciones']);
    actual = 0; fila = sh.getLastRow();
  } else {
    sh.getRange(fila, 2).setValue(actual + 1);
  }
  var d = new Date();
  var ym = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2);
  return hotel + '-' + ym + '-' + ('0000' + (actual + 1)).slice(-4);
}

// ============================================================================
// PUNTO DE ENTRADA DE LA SPA
// ============================================================================
function doGet(e) {
  if (e && e.parameter && e.parameter.diag === '1') return paginaDiagnostico_();
  return HtmlService.createTemplateFromFile('06_SPA')
    .evaluate()
    .setTitle('Cotizador Hesperia')
    .addMetaTag('viewport',
      'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Una sola llamada al arrancar: catalogo + preferencias de la asesora.
 * Evita un segundo round-trip solo para leer las iniciales.
 */
function apiIniciar() {
  var cat = getCatalogo(false);
  return {
    catalogo: cat,
    prefs: { asesorIniciales: leerIniciales_(cat) }
  };
}

/**
 * Iniciales de la asesora. La app la usa una sola persona, asi que el valor
 * de Config (INICIALES_POR_DEFECTO) llena el campo desde el primer arranque
 * y solo se pisa si alguien escribio otras iniciales en este navegador.
 */
function leerIniciales_(cat) {
  var porDefecto = 'MZ';
  try {
    if (cat && cat.config && cat.config.INICIALES_POR_DEFECTO) {
      porDefecto = String(cat.config.INICIALES_POR_DEFECTO).trim().toUpperCase();
    }
  } catch (e) { /* se queda con MZ */ }
  try {
    return PropertiesService.getUserProperties().getProperty('iniciales') || porDefecto;
  } catch (e) { return porDefecto; }
}

function apiGuardarIniciales(v) {
  try {
    PropertiesService.getUserProperties()
      .setProperty('iniciales', String(v || '').trim().slice(0, 4).toUpperCase());
  } catch (e) { /* no es critico */ }
}

// ============================================================================
// DIAGNOSTICO (se abre agregando ?diag=1 a la URL)
// ============================================================================
function paginaDiagnostico_() {
  var out = [];
  try {
    var cat = getCatalogo(false);
    out.push('Catalogo cargado: ' + cat.generado);
    out.push('Hoteles: ' + Object.keys(cat.hoteles).join(', '));
    out.push('Habitaciones: ' + Object.keys(cat.habitaciones).length);
    out.push('Tarifas: ' + Object.keys(cat.tarifas).length);
    out.push('Stop sales activos: ' + (cat.stopSales || []).length);
    out.push('Version: ' + cat.config.VERSION_TARIFAS);
    var M = MOTOR();
    out.push('Motor cargado OK. Prueba de fecha: ' + M.Fechas.fmtCorto('2026-03-07'));
  } catch (e) {
    out.push('ERROR: ' + e.message);
  }
  return HtmlService.createHtmlOutput(
    '<pre style="font:13px monospace;padding:16px">' +
    out.join('\n').replace(/</g, '&lt;') + '</pre>'
  ).setTitle('Cotizador Hesperia - Diagnostico');
}
