/**
 * COTIZADOR HESPERIA - 01_Catalogo.gs
 * Lectura de hojas -> objeto catalogo. Normalizacion defensiva de fechas.
 */

var CACHE_KEY = 'catalogo_v1';
var CACHE_SEG = 21600; // 6 horas

// ============================================================================
// LECTURA GENERICA POR NOMBRE DE COLUMNA (robusta a reordenamiento)
// ============================================================================
function leerHoja_(ss, nombre) {
  var sh = ss.getSheetByName(nombre);
  if (!sh) throw new Error('Falta la hoja: ' + nombre + '. Ejecute Cotizador > Instalar.');
  var datos = sh.getDataRange().getValues();
  if (datos.length < 2) return [];

  var headers = datos[0].map(function(h) { return String(h).trim(); });
  var def = ESQUEMA[nombre];
  var filas = [];

  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    if (fila.every(function(c) { return c === '' || c === null; })) continue;
    var obj = {};
    headers.forEach(function(h, j) {
      if (!h) return;
      var v = fila[j];
      if (def && def.fechas.indexOf(h) !== -1) {
        obj[h] = normalizarFecha_(v, nombre + '!' + h + ' fila ' + (i + 1));
      } else if (def && (def.texto || []).indexOf(h) !== -1) {
        // Columna declarada como texto: si Sheets la convirtio a numero u hora,
        // se recupera como string en lugar de propagar el tipo equivocado.
        obj[h] = normalizarTexto_(v);
      } else {
        obj[h] = (typeof v === 'string') ? v.trim() : v;
      }
    });
    filas.push(obj);
  }
  return filas;
}

/**
 * Blindaje contra el bug clasico de zona horaria.
 * Acepta: 'YYYY-MM-DD', Date (si alguien reformateo la celda), 'DD/MM/YYYY'.
 * Cualquier otra cosa lanza error visible en lugar de corromper silenciosamente.
 */
function normalizarFecha_(v, contexto) {
  if (v === '' || v === null || v === undefined) return '';

  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    var a = m[3].length === 2 ? '20' + m[3] : m[3];
    return a + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  }
  throw new Error('Fecha con formato no reconocido en ' + contexto + ': "' + s + '". ' +
                  'Use texto plano YYYY-MM-DD.');
}

/**
 * Devuelve siempre un string. Si Sheets interpreto la celda como hora
 * (ej. "3:00 PM" -> Date), la reconstruye en formato legible.
 */
function normalizarTexto_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'h:mm a');
  }
  return String(v).trim();
}

function pad2_(n) { return ('0' + n).slice(-2); }
function siNo_(v) { return String(v).trim().toUpperCase() === 'SI'; }
function num_(v) { return (v === '' || v === null || v === undefined) ? null : Number(v); }

/**
 * Parser tolerante de dias_semana.
 *
 * Si la columna no esta en formato Texto sin formato, Sheets convierte "5,6"
 * en el NUMERO 5.6 y el filtro de dias queda roto sin dar ningun error: la
 * promocion simplemente no se aplica y el total sale mal en silencio.
 *
 * Acepta: "5,6"  "5;6"  "5 6"  5.6  "5,6,7"  ""  ->  [5,6] / [5,6,7] / []
 */
function parseDias_(v) {
  if (v === '' || v === null || v === undefined) return [];
  return String(v).trim()
    .split(/[,;.\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter(function(n) { return !isNaN(n) && n >= 1 && n <= 7; });
}

// ============================================================================
// CONSTRUCCION DEL CATALOGO
// ============================================================================
function construirCatalogo_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var config = {};
  leerHoja_(ss, 'Config').forEach(function(r) { config[r.clave] = r.valor; });

  var hoteles = {};
  leerHoja_(ss, 'Hoteles').filter(function(r) { return siNo_(r.activo); })
    .forEach(function(r) {
      hoteles[r.codigo] = {
        codigo: r.codigo, nombre: r.nombre_display, emojis: r.emojis_titulo,
        horaIn: r.hora_checkin, horaOut: r.hora_checkout,
        formatoFecha: String(r.formato_fecha || 'dd/MM/yy').trim(),
        modoTarifa: String(r.modo_tarifa || 'POR_PERSONA').trim().toUpperCase(),
        ivaPct: Number(r.iva_pct) || 0,
        formatoOcupantes: String(r.formato_ocupantes || 'INLINE').trim().toUpperCase(),
        deposito: Number(r.deposito_toallas), labelDeposito: r.label_deposito,
        earlyPP: Number(r.early_checkin_pp), latePP: Number(r.late_checkout_pp),
        horaLate: r.hora_late_checkout, vipDia: Number(r.brazalete_vip_dia)
      };
    });

  var habitaciones = {};
  leerHoja_(ss, 'Habitaciones').filter(function(r) { return siNo_(r.activo); })
    .sort(function(a, b) { return Number(a.orden) - Number(b.orden); })
    .forEach(function(r) {
      habitaciones[r.hotel + '|' + r.cod_hab] = {
        hotel: r.hotel, cod: r.cod_hab, categoria: r.categoria, ocupacion: r.ocupacion,
        atributo: r.atributo || '', nombre: r.nombre_display,
        ocupMinFisica: Number(r.ocup_min_fisica) || 1,
        ocupMaxTotal: Number(r.ocup_max_total),
        ocupMaxAdultos: Number(r.ocup_max_adultos),
        permiteSingle: siNo_(r.permite_single),
        suplementoSingle: Number(r.suplemento_single) || 0,
        paxMinCobrados: num_(r.pax_min_cobrados),
        orden: Number(r.orden)
      };
    });

  var temporadas = leerHoja_(ss, 'Temporadas').map(function(r) {
    return {
      hotel: r.hotel, cod: r.cod_temp, nombre: r.nombre,
      inicio: r.fecha_inicio, fin: r.fecha_fin, prioridad: Number(r.prioridad) || 0
    };
  });

  var tarifas = {}; // hotel|cod_hab|cod_temp -> {tarifa, ninoOverride}
  leerHoja_(ss, 'Tarifas').forEach(function(r) {
    if (r.tarifa_pp_noche === '' || r.tarifa_pp_noche === null) return;
    tarifas[r.hotel + '|' + r.cod_hab + '|' + r.cod_temp] = {
      tarifa: Number(r.tarifa_pp_noche),
      ninoOverride: num_(r.tarifa_nino_override)
    };
  });

  // Cierres de venta. Se guardan como lista plana: son pocos y se recorren
  // una vez por noche. La clave no puede ser hotel|fecha porque un cierre
  // abarca un rango y puede convivir con otro de distinto alcance.
  var stopSales = leerHoja_(ss, 'StopSales')
    .filter(function(r) { return siNo_(r.activo); })
    .map(function(r) {
      return {
        hotel: r.hotel,
        codHab: String(r.cod_hab || 'TODAS').trim(),
        inicio: r.fecha_inicio, fin: r.fecha_fin,
        motivo: String(r.motivo || '').trim()
      };
    })
    .filter(function(r) { return r.inicio && r.fin; });

  var politica = {}; // hotel -> [rangos]
  leerHoja_(ss, 'PoliticaNinos')
    .sort(function(a, b) { return Number(a.orden) - Number(b.orden); })
    .forEach(function(r) {
      if (!politica[r.hotel]) politica[r.hotel] = [];
      politica[r.hotel].push({
        cod: r.cod_rango, edadMin: Number(r.edad_min), edadMax: Number(r.edad_max),
        sing: r.etiqueta_sing, plur: r.etiqueta_plur, rango: r.etiqueta_rango,
        factor: Number(r.factor_pago), cuentaOcupacion: siNo_(r.cuenta_ocupacion),
        categoriaCargo: String(r.categoria_cargo || 'NINO').toUpperCase(),
        orden: Number(r.orden)
      });
    });

  var promociones = leerHoja_(ss, 'Promociones')
    .filter(function(r) { return siNo_(r.activo); })
    .map(function(r) {
      return {
        hotel: r.hotel, cod: r.cod_promo, nombre: r.nombre,
        inicio: r.vig_inicio, fin: r.vig_fin,
        codHab: String(r.cod_hab || 'TODAS').trim(),
        tipo: String(r.tipo).trim().toUpperCase(),
        valor: Number(r.valor),
        minNoches: Number(r.min_noches) || 0,
        diasSemana: parseDias_(r.dias_semana),
        diasSemanaCrudo: r.dias_semana,
        mensaje: String(r.mensaje || '').trim(),
        prioridad: Number(r.prioridad) || 0
      };
    });

  var cargos = {}; // hotel|fecha -> cargo
  leerHoja_(ss, 'CargosFecha').forEach(function(r) {
    cargos[r.hotel + '|' + r.fecha] = {
      nombre: r.nombre,
      ADULTO: Number(r.monto_adulto) || 0,
      NINO: Number(r.monto_nino) || 0,
      INFANTE: Number(r.monto_infante) || 0,
      obligatorio: siNo_(r.obligatorio)
    };
  });

  var plantillas = {};
  leerHoja_(ss, 'Plantillas').forEach(function(r) { plantillas[r.hotel] = r.plantilla; });

  return {
    config: config, hoteles: hoteles, habitaciones: habitaciones,
    temporadas: temporadas, tarifas: tarifas, stopSales: stopSales, politica: politica,
    promociones: promociones, cargos: cargos, plantillas: plantillas,
    generado: new Date().toISOString()
  };
}

// ============================================================================
// CACHE
// ============================================================================
function getCatalogo(forzar) {
  var cache = CacheService.getScriptCache();
  if (!forzar) {
    var hit = cache.get(CACHE_KEY);
    if (hit) {
      try { return JSON.parse(hit); } catch (e) { /* cache corrupta: recargar */ }
    }
  }
  var cat = construirCatalogo_();
  try {
    cache.put(CACHE_KEY, JSON.stringify(cat), CACHE_SEG);
  } catch (e) {
    // >100KB no cabe en cache; el catalogo sigue siendo valido, solo mas lento
    Logger.log('Catalogo excede el limite de cache: ' + e.message);
  }
  return cat;
}

function publicarCambios() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Config');
  var datos = sh.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][0] === 'VERSION_TARIFAS') {
      var v = String(datos[i][1]);
      var m = v.match(/^(.*\.)(\d+)$/);
      sh.getRange(i + 1, 2).setValue(m ? m[1] + (Number(m[2]) + 1) : v + '.1');
    }
    if (datos[i][0] === 'CAMBIOS_SIN_PUBLICAR') sh.getRange(i + 1, 2).setValue('NO');
  }
  getCatalogo(true);
  SpreadsheetApp.getUi().alert('Cambios publicados. Las asesoras veran las tarifas nuevas.');
}

function marcarCambiosSinPublicar_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  var datos = sh.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][0] === 'CAMBIOS_SIN_PUBLICAR' && datos[i][1] !== 'SI') {
      sh.getRange(i + 1, 2).setValue('SI').setBackground('#f4cccc');
      return;
    }
  }
}
