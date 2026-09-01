/**
 * COTIZADOR HESPERIA - 00_Setup.gs
 * Genera la estructura completa de hojas, formatos, validaciones y datos.
 *
 * USO: Ejecutar instalarTodo() una sola vez. Luego usar el menu "Cotizador".
 */

// ============================================================================
// ESQUEMA CENTRAL - unica fuente de verdad de la estructura
// ============================================================================
var ESQUEMA = {
  Config: {
    cols: ['clave', 'valor', 'descripcion'],
    fechas: [],
    texto: ['valor']
  },
  Hoteles: {
    cols: ['codigo', 'nombre_display', 'emojis_titulo', 'hora_checkin', 'hora_checkout',
           'formato_fecha', 'modo_tarifa', 'iva_pct', 'formato_ocupantes',
           'deposito_toallas', 'label_deposito', 'early_checkin_pp',
           'late_checkout_pp', 'hora_late_checkout', 'brazalete_vip_dia', 'activo'],
    fechas: [],
    texto: ['hora_checkin', 'hora_checkout', 'hora_late_checkout', 'formato_fecha']
  },
  Habitaciones: {
    cols: ['hotel', 'cod_hab', 'categoria', 'ocupacion', 'atributo', 'nombre_display',
           'ocup_min_fisica', 'ocup_max_total', 'ocup_max_adultos', 'permite_single',
           'suplemento_single', 'pax_min_cobrados', 'orden', 'activo'],
    fechas: [],
    texto: []
  },
  Temporadas: {
    cols: ['hotel', 'cod_temp', 'nombre', 'fecha_inicio', 'fecha_fin', 'prioridad'],
    fechas: ['fecha_inicio', 'fecha_fin'],
    texto: []
  },
  Tarifas: {
    cols: ['hotel', 'cod_hab', 'cod_temp', 'tarifa_pp_noche', 'tarifa_nino_override'],
    fechas: [],
    texto: []
  },
  StopSales: {
    cols: ['hotel', 'cod_hab', 'fecha_inicio', 'fecha_fin', 'motivo', 'activo'],
    fechas: ['fecha_inicio', 'fecha_fin'],
    texto: []
  },
  PoliticaNinos: {
    cols: ['hotel', 'cod_rango', 'edad_min', 'edad_max', 'etiqueta_sing', 'etiqueta_plur',
           'etiqueta_rango', 'factor_pago', 'cuenta_ocupacion', 'categoria_cargo', 'orden'],
    fechas: [],
    texto: ['etiqueta_rango']
  },
  Promociones: {
    cols: ['hotel', 'cod_promo', 'nombre', 'vig_inicio', 'vig_fin', 'cod_hab', 'tipo',
           'valor', 'min_noches', 'dias_semana', 'mensaje', 'prioridad', 'activo'],
    fechas: ['vig_inicio', 'vig_fin'],
    texto: ['dias_semana', 'mensaje']
  },
  CargosFecha: {
    cols: ['hotel', 'fecha', 'nombre', 'monto_adulto', 'monto_nino', 'monto_infante', 'obligatorio'],
    fechas: ['fecha'],
    texto: []
  },
  Plantillas: {
    cols: ['hotel', 'plantilla'],
    fechas: [],
    texto: ['plantilla']
  },
  Cotizaciones: {
    cols: ['id', 'timestamp', 'asesor_email', 'asesor_iniciales', 'cliente', 'hotel',
           'checkin', 'checkout', 'noches', 'total_habitaciones', 'subtotal',
           'cargos_fecha', 'total', 'promos', 'texto_generado', 'version_tarifas', 'estado'],
    fechas: ['checkin', 'checkout'],
    texto: ['texto_generado', 'version_tarifas']
  },
  CotizacionLineas: {
    cols: ['id_cotizacion', 'n_linea', 'cod_hab', 'nombre_hab', 'cantidad', 'adultos',
           'edades_menores', 'menores_detalle', 'pax_pagos', 'aplico_single',
           'costo_noche_prom', 'subtotal_linea', 'cargos_linea'],
    fechas: [],
    texto: ['edades_menores', 'menores_detalle']
  },
  Validacion: {
    cols: ['severidad', 'hoja', 'codigo', 'mensaje', 'fecha_chequeo'],
    fechas: [],
    texto: []
  }
};

// ============================================================================
// INSTALACION
// ============================================================================
function instalarTodo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  crearHojas_(ss);
  cargarDatosDemo_(ss);
  aplicarValidacionesDatos_(ss);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    'Instalacion completa',
    'Se crearon las hojas y se cargaron las tarifas reales (HBK, HIM, HPA).\n\n' +
    'WTC y HMC quedaron con activo = NO: tienen habitaciones y temporadas pero\n' +
    'todavia no tienen tarifas. Cargue las tarifas y luego ponga activo = SI.\n\n' +
    'Siguiente paso: menu Cotizador > Validar catalogo.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function crearHojas_(ss) {
  Object.keys(ESQUEMA).forEach(function(nombre) {
    var def = ESQUEMA[nombre];
    var sh = ss.getSheetByName(nombre);
    if (!sh) sh = ss.insertSheet(nombre);

    sh.clear();
    sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols])
      .setFontWeight('bold')
      .setBackground('#1f3864')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);

    // CRITICO: fechas Y columnas de texto se formatean como TEXTO PLANO
    // ANTES de escribir nada. Sin esto Sheets convierte "5,6" en el numero 5.6
    // y "3:00 PM" en un valor de hora, corrompiendo el catalogo en silencio.
    def.fechas.concat(def.texto || []).forEach(function(colName) {
      var idx = def.cols.indexOf(colName) + 1;
      if (idx <= 0) return;
      sh.getRange(2, idx, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });

    if (nombre === 'Plantillas') {
      sh.getRange(2, 2, sh.getMaxRows() - 1, 1).setWrap(true);
      sh.setColumnWidth(2, 600);
    }
    sh.autoResizeColumns(1, Math.min(def.cols.length, 12));
  });

  // Hoja por defecto vacia
  var h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (h1 && ss.getSheets().length > 1) ss.deleteSheet(h1);
}

function escribir_(ss, hoja, filas) {
  if (!filas.length) return;
  var sh = ss.getSheetByName(hoja);
  var cols = ESQUEMA[hoja].cols.length;
  sh.getRange(2, 1, filas.length, cols).setValues(filas);
}

// ============================================================================
// VALIDACIONES DE DATOS (dropdowns y notas en la hoja)
// ============================================================================
function aplicarValidacionesDatos_(ss) {
  var sh = ss.getSheetByName('Habitaciones');
  var cols = ESQUEMA.Habitaciones.cols;
  var listas = {
    ocupacion: ['SENCILLA', 'DOBLE', 'TRIPLE', 'CUÁDRUPLE', 'QUÍNTUPLE'],
    permite_single: ['SI', 'NO'],
    activo: ['SI', 'NO']
  };
  Object.keys(listas).forEach(function(c) {
    var idx = cols.indexOf(c) + 1;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(listas[c], true).setAllowInvalid(false).build();
    sh.getRange(2, idx, 500, 1).setDataValidation(rule);
  });

  var shH = ss.getSheetByName('Hoteles');
  var colsH = ESQUEMA.Hoteles.cols;
  var listasH = {
    modo_tarifa: ['POR_PERSONA', 'POR_HABITACION'],
    formato_ocupantes: ['INLINE', 'LINEAS'],
    formato_fecha: ['dd/MM/yy', 'dd/MM/yyyy'],
    activo: ['SI', 'NO']
  };
  Object.keys(listasH).forEach(function(c) {
    var idx = colsH.indexOf(c) + 1;
    shH.getRange(2, idx, 200, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(listasH[c], true).setAllowInvalid(false).build()
    );
  });
  shH.getRange(2, colsH.indexOf('modo_tarifa') + 1, 200, 1).setNote(
    'POR_PERSONA: la tarifa de la hoja Tarifas es por persona/noche (hoteles de playa).\n' +
    'POR_HABITACION: la tarifa es por habitacion/noche sin importar cuantos huespedes\n' +
    'haya (hoteles de ciudad). En este modo NO se aplica suplemento single.');
  shH.getRange(2, colsH.indexOf('iva_pct') + 1, 200, 1).setNote(
    'IVA en porcentaje. 0 = la tarifa cargada ya es el precio final.\n' +
    '16 = la tarifa es neta y el mensaje muestra "$100 + IVA= $116".');
  shH.getRange(2, colsH.indexOf('formato_ocupantes') + 1, 200, 1).setNote(
    'INLINE: "2 adultos + 1 nino (8 anos)" en un solo renglon.\n' +
    'LINEAS: renglones separados "Adultos: 2" / "Ninos: 8 anos".');

  var shP = ss.getSheetByName('Promociones');
  var idxTipo = ESQUEMA.Promociones.cols.indexOf('tipo') + 1;
  shP.getRange(2, idxTipo, 500, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['SUSTITUYE', 'DESCUENTO_PCT', 'DESCUENTO_MONTO'], true)
      .setAllowInvalid(false).build()
  );

  var idxDias = ESQUEMA.Promociones.cols.indexOf('dias_semana') + 1;
  shP.getRange(2, idxDias, 500, 1)
    .setNote('Dias de la semana separados por coma. 1=lunes ... 7=domingo.\n' +
             'Ejemplo: 5,6 (viernes y sabado). Vacio = todos los dias.\n' +
             'La columna DEBE estar en formato Texto sin formato.');

  var idxMsg = ESQUEMA.Promociones.cols.indexOf('mensaje') + 1;
  shP.getRange(2, idxMsg, 500, 1)
    .setNote('Renglon que se agrega al mensaje de WhatsApp cuando la promo aplica.\n' +
             'Ejemplo: "Promocion aplicable previa presentacion del RIF".\n' +
             'Vacio = solo se nombra la promocion, sin renglon extra.');

  var shS = ss.getSheetByName('StopSales');
  var colsS = ESQUEMA.StopSales.cols;
  shS.getRange(2, colsS.indexOf('activo') + 1, 500, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['SI', 'NO'], true).setAllowInvalid(false).build()
  );
  shS.getRange(2, colsS.indexOf('cod_hab') + 1, 500, 1).setNote(
    'TODAS = el hotel completo queda sin cupo.\n' +
    'Un codigo de habitacion = solo esa categoria queda sin cupo.');
  shS.getRange(2, colsS.indexOf('fecha_inicio') + 1, 500, 2).setNote(
    'Rango de NOCHES sin cupo, ambos extremos incluidos.\n' +
    'Un stop sale del 10 al 12 bloquea las noches del 10, 11 y 12.\n' +
    'Un cliente que sale el 10 por la manana NO se ve afectado: la noche\n' +
    'del 10 no forma parte de su estadia.');

  var shN = ss.getSheetByName('PoliticaNinos');
  var idxCat = ESQUEMA.PoliticaNinos.cols.indexOf('categoria_cargo') + 1;
  shN.getRange(2, idxCat, 500, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['ADULTO', 'NINO', 'INFANTE'], true)
      .setAllowInvalid(false).build()
  );
}

// ============================================================================
// DATOS
// ============================================================================
function cargarDatosDemo_(ss) {
  escribir_(ss, 'Config', [
    ['VERSION_TARIFAS', 'v2026.08.10', 'Se incrementa al publicar cambios'],
    ['MONEDA', '$', 'Simbolo de moneda'],
    ['SEPARADOR_DECIMAL', ',', 'Separador decimal (los montos salen sin decimales)'],
    ['MENSAJE_CASHEA', '¡Págalo en cómodas cuotas con CASHEA! \uD83D\uDC9B \u2728', 'Linea promocional'],
    ['CAMBIOS_SIN_PUBLICAR', 'NO', 'Se marca SI al editar el catalogo'],
    ['HORIZONTE_VALIDACION_MESES', '18', 'Meses hacia adelante que revisa el validador'],
    ['INICIALES_POR_DEFECTO', 'MZ', 'Iniciales precargadas en el cotizador'],
    ['CONTADOR_COTIZACIONES', '0', 'Correlativo interno de cotizaciones']
  ]);

  // codigo, nombre_display, emojis, hora_in, hora_out, formato_fecha,
  // modo_tarifa, iva_pct, formato_ocupantes, deposito, label_deposito,
  // early_pp, late_pp, hora_late, vip_dia, activo
  escribir_(ss, 'Hoteles', [
    ['HBK', 'HOTEL HESPERIA MORROCOY',       '\u2600\uFE0F\uD83C\uDF34', '3:00 PM', '12:00 PM', 'dd/MM/yy',   'POR_PERSONA',    0,  'INLINE', 40, 'Depósito de toallas', 20, 35, '5:00 PM', 35, 'SI'],
    ['HIM', 'HOTEL HESPERIA ISLA MARGARITA', '\uD83C\uDFE4 \uD83C\uDF34', '3:00 PM', '12:00 PM', 'dd/MM/yy',   'POR_PERSONA',    0,  'INLINE', 40, 'Depósito de toallas', 20, 35, '6:00 PM', 30, 'SI'],
    ['HPA', 'HOTEL HESPERIA PLAYA EL AGUA',  '\uD83C\uDF0A\uD83C\uDF34', '3:00 PM', '12:00 PM', 'dd/MM/yy',   'POR_PERSONA',    0,  'INLINE', 40, 'Garantía de toallas', 20, 35, '6:00 PM', 30, 'SI'],
    ['WTC', 'HOTEL HESPERIA WTC VALENCIA',   '\uD83C\uDFE8',             '3:00 PM', '12:00 PM', 'dd/MM/yyyy', 'POR_HABITACION', 16, 'LINEAS', 0,  'Depósito',            0,  0,  '2:00 PM', 0,  'NO'],
    ['HMC', 'HOTEL HESPERIA MARACAY',        '\uD83C\uDFE8',             '3:00 PM', '12:00 PM', 'dd/MM/yyyy', 'POR_HABITACION', 16, 'LINEAS', 0,  'Depósito',            0,  0,  '2:00 PM', 0,  'NO']
  ]);

  // hotel, cod_hab, categoria, ocupacion, atributo, nombre_display,
  // ocup_min_fisica, ocup_max_total, ocup_max_adultos, permite_single,
  // suplemento_single, pax_min_cobrados, orden, activo
  escribir_(ss, 'Habitaciones', [
    ['HBK', 'BAS_DBL', 'ESTÁNDAR BÁSICA',        'DOBLE',     '', 'ESTÁNDAR BÁSICA',        1, 2, 2, 'SI', 30, '', 1, 'SI'],
    ['HBK', 'BAS_TPL', 'JUNIOR BÁSICA',          'TRIPLE',    '', 'JUNIOR BÁSICA',          2, 3, 3, 'NO', 0,  '', 2, 'SI'],
    ['HBK', 'BAS_QUA', 'FAMILIAR MASTER BÁSICA', 'CUÁDRUPLE', '', 'FAMILIAR MASTER BÁSICA', 3, 4, 4, 'NO', 0,  3,  3, 'SI'],
    ['HBK', 'DLX_DBL', 'ESTÁNDAR DELUXE',        'DOBLE',     '', 'ESTÁNDAR DELUXE',        1, 2, 2, 'SI', 30, '', 4, 'SI'],
    ['HBK', 'DLX_TPL', 'JUNIOR DELUXE',          'TRIPLE',    '', 'JUNIOR DELUXE',          2, 3, 3, 'NO', 0,  '', 5, 'SI'],
    ['HBK', 'DLX_QUA', 'FAMILIAR MASTER DELUXE', 'CUÁDRUPLE', '', 'FAMILIAR MASTER DELUXE', 3, 4, 4, 'NO', 0,  3,  6, 'SI'],

    ['HIM', 'DLX_VMON', 'DELUXE', 'DOBLE', 'VISTA MONTAÑA', 'DELUXE',              1, 4, 4, 'SI', 20, '', 1, 'SI'],
    ['HIM', 'DLX_VMAR', 'DELUXE', 'DOBLE', 'VISTA AL MAR',  'DELUXE VISTA AL MAR', 1, 4, 4, 'SI', 20, '', 2, 'SI'],

    ['HPA', 'HOL_GARD', 'HOLIDAY VILLAGE', 'TRIPLE',    'VISTA JARDÍN',  'HOLIDAY VILLAGE',               1, 3, 3, 'SI', 20, '', 1, 'SI'],
    ['HPA', 'HOL_POOL', 'HOLIDAY VILLAGE', 'CUÁDRUPLE', 'VISTA PISCINA', 'HOLIDAY VILLAGE VISTA PISCINA', 1, 4, 4, 'SI', 20, '', 2, 'SI'],
    ['HPA', 'PRE_GARD', 'PREMIUM',         'CUÁDRUPLE', 'VISTA JARDÍN',  'PREMIUM',                       1, 4, 4, 'SI', 20, '', 3, 'SI'],
    ['HPA', 'PRE_POOL', 'PREMIUM',         'CUÁDRUPLE', 'VISTA PISCINA', 'PREMIUM VISTA PISCINA',         1, 4, 4, 'SI', 20, '', 4, 'SI'],

    // --- Pendientes de tarifa: el hotel esta inactivo hasta cargarlas -------
    ['WTC', 'DLX_KING',  'DELUXE',          'DOBLE', 'KING', 'DELUXE KING',     1, 2, 2, 'NO', 0, '', 1, 'SI'],
    ['WTC', 'DLX_TWIN',  'DELUXE',          'DOBLE', 'TWIN', 'DELUXE TWIN',     1, 2, 2, 'NO', 0, '', 2, 'SI'],
    ['WTC', 'JR_SUITE',  'JUNIOR SUITE',    'DOBLE', '',     'JUNIOR SUITE',    1, 2, 2, 'NO', 0, '', 3, 'SI'],
    ['WTC', 'SUITE_EXE', 'SUITE EXECUTIVE', 'DOBLE', '',     'SUITE EXECUTIVE', 1, 2, 2, 'NO', 0, '', 4, 'SI'],

    ['HMC', 'DLX_KING', 'DELUXE', 'DOBLE', 'KING', 'DELUXE KING', 1, 2, 2, 'NO', 0, '', 1, 'SI'],
    ['HMC', 'DLX_TWIN', 'DELUXE', 'DOBLE', 'TWIN', 'DELUXE TWIN', 1, 2, 2, 'NO', 0, '', 2, 'SI'],
    ['HMC', 'SUITE',    'SUITE',  'DOBLE', '',     'SUITE',       1, 2, 2, 'NO', 0, '', 3, 'SI']
  ]);

  var temporadas = [];
  ['HBK', 'HIM', 'HPA', 'WTC', 'HMC'].forEach(function(h) {
    temporadas.push(
      [h, 'ALTA_26', 'Temporada Alta 2026', '2026-08-01', '2026-09-15', 10],
      [h, 'BAJA_26', 'Temporada Baja 2026', '2026-09-16', '2026-12-20', 10],
      [h, 'NAV_26',  'Navidad 2026',        '2026-12-21', '2026-12-27', 50],
      [h, 'FIN_26',  'Fin de año 2026-27',  '2026-12-28', '2027-01-12', 50]
    );
  });
  escribir_(ss, 'Temporadas', temporadas);

  // tarifa_pp_noche por [cod_hab][cod_temp]
  var T = {
    HBK: {
      BAS_DBL: {ALTA_26: 85,  BAJA_26: 70, NAV_26: 95,  FIN_26: 120},
      BAS_TPL: {ALTA_26: 85,  BAJA_26: 70, NAV_26: 95,  FIN_26: 120},
      BAS_QUA: {ALTA_26: 85,  BAJA_26: 70, NAV_26: 95,  FIN_26: 120},
      DLX_DBL: {ALTA_26: 105, BAJA_26: 90, NAV_26: 115, FIN_26: 140},
      DLX_TPL: {ALTA_26: 105, BAJA_26: 90, NAV_26: 115, FIN_26: 140},
      DLX_QUA: {ALTA_26: 105, BAJA_26: 90, NAV_26: 115, FIN_26: 140}
    },
    HIM: {
      DLX_VMON: {ALTA_26: 70, BAJA_26: 55, NAV_26: 70, FIN_26: 100},
      DLX_VMAR: {ALTA_26: 75, BAJA_26: 60, NAV_26: 75, FIN_26: 105}
    },
    HPA: {
      HOL_GARD: {ALTA_26: 65, BAJA_26: 50, NAV_26: 60, FIN_26: 90},
      HOL_POOL: {ALTA_26: 67, BAJA_26: 52, NAV_26: 62, FIN_26: 92},
      PRE_GARD: {ALTA_26: 70, BAJA_26: 55, NAV_26: 65, FIN_26: 95},
      PRE_POOL: {ALTA_26: 72, BAJA_26: 57, NAV_26: 67, FIN_26: 97}
    }
    // WTC y HMC: sin tarifas todavia. El menu
    // "Generar matriz de tarifas faltantes" crea las filas vacias.
  };
  var tarifas = [];
  Object.keys(T).forEach(function(h) {
    Object.keys(T[h]).forEach(function(hab) {
      Object.keys(T[h][hab]).forEach(function(temp) {
        tarifas.push([h, hab, temp, T[h][hab][temp], '']);
      });
    });
  });
  escribir_(ss, 'Tarifas', tarifas);

  // Sin cierres de venta cargados. Se agregan filas aqui cuando el hotel avisa.
  escribir_(ss, 'StopSales', []);

  // hotel, cod_rango, edad_min, edad_max, etiqueta_sing, etiqueta_plur,
  // etiqueta_rango, factor_pago, cuenta_ocupacion, categoria_cargo, orden
  var politica = [];
  [['HBK', 9], ['HIM', 10], ['HPA', 10], ['WTC', 10], ['HMC', 10]].forEach(function(p) {
    var h = p[0], corte = p[1];
    politica.push(
      [h, 'INF', 0,         4,     'infante', 'infantes', '0-4 años',               0,   'SI', 'INFANTE', 3],
      [h, 'NIN', 5,         corte, 'niño',    'niños',    '5-' + corte + ' años',   0.5, 'SI', 'NINO',    2],
      [h, 'MAY', corte + 1, 17,    'niño',    'niños',    (corte + 1) + '-17 años', 1,   'SI', 'NINO',    1]
    );
  });
  escribir_(ss, 'PoliticaNinos', politica);

  // hotel, cod_promo, nombre, vig_inicio, vig_fin, cod_hab, tipo, valor,
  // min_noches, dias_semana, mensaje, prioridad, activo
  var msgRif = 'Promoción aplicable previa presentación del RIF';
  escribir_(ss, 'Promociones', [
    ['HIM', 'PRO_RESIDENTES', 'Promoción para Residentes', '2026-08-01', '2026-09-15', 'TODAS', 'DESCUENTO_MONTO', 5, 1, '', msgRif, 100, 'SI'],
    ['HPA', 'PRO_RESIDENTES', 'Promoción para Residentes', '2026-08-01', '2026-09-15', 'TODAS', 'DESCUENTO_MONTO', 5, 1, '', msgRif, 100, 'SI']
  ]);

  escribir_(ss, 'CargosFecha', [
    ['HBK', '2026-12-24', 'Cena de Navidad',      120, 60, 0, 'SI'],
    ['HBK', '2026-12-31', 'Fiesta de Fin de Año', 140, 70, 0, 'SI'],
    ['HIM', '2026-12-24', 'Cena de Navidad',      100, 50, 0, 'SI'],
    ['HIM', '2026-12-31', 'Fiesta de Fin de Año', 120, 60, 0, 'SI'],
    ['HPA', '2026-12-24', 'Cena de Navidad',      100, 50, 0, 'SI'],
    ['HPA', '2026-12-31', 'Fiesta de Fin de Año', 120, 60, 0, 'SI']
  ]);

  escribir_(ss, 'Plantillas', [
    ['HBK', plantillaHBK_()],
    ['HIM', plantillaHIM_()],
    ['HPA', plantillaHPA_()],
    ['WTC', plantillaCiudad_()],
    ['HMC', plantillaCiudad_()]
  ]);
}

// ============================================================================
// PLANTILLAS (texto WhatsApp con marcadores)
// ============================================================================
function plantillaHBK_() {
  return [
    '*{{HOTEL_NOMBRE}}* {{EMOJIS}}',
    '*{{ASESOR_INICIALES}}*',
    'CHECK IN {{HORA_IN}}: {{FECHA_IN}}',
    'CHECK OUT {{HORA_OUT}}: {{FECHA_OUT}}',
    '',
    '{{BLOQUE_HABITACIONES}}',
    '',
    '*TOTAL: ${{TOTAL}}  ({{DIAS}} D\u00CDAS {{NOCHES}} NOCHES)*',
    '{{BLOQUE_CARGOS}}{{BLOQUE_PROMO}}',
    '{{MENSAJE_CASHEA}}',
    '',
    '*PLAN:* Todo Incluido',
    '',
    '*INCLUYE:*',
    '* Hospedaje.',
    '* Desayuno (7:00 AM - 10:00 AM).',
    '* Almuerzo (12:00 PM - 2:00 PM).',
    '* Snack de Media Tarde (3:00 PM - 5:00 PM).',
    '* Cena (7:00 PM - 10:00 PM).',
    '* Bebidas Seleccionadas (Alcoh\u00F3licas y no Alcoh\u00F3licas).',
    '* Open Bar (11:00 AM - 11:00 PM): Cerveza y C\u00F3cteles.',
    '* Actividades Recreativas para toda la Familia.',
    '* Piscina con Tumbona y Toalla.',
    '* Gimnasio Gratuito.',
    '',
    '\uD83D\uDCCC *IMPORTANTE:* {{LABEL_DEPOSITO}}: ${{DEPOSITO}} *en efectivo* por habitaci\u00F3n, se devuelven en el Check-out.',
    '',
    '\uD83D\uDD05 *SERVICIOS ADICIONALES: (Opcionales)*',
    'EARLY CHECK IN: {{EARLY_PP}}$ por persona: Desde las 11:00 AM',
    'LATE CHECK OUT: {{LATE_PP}}$ por persona: Hasta las {{HORA_LATE}}',
    'Brazalete VIP ${{VIP_DIA}} por d\u00EDa, consumo de bebidas alcoh\u00F3licas PREMIUM',
    '',
    '*_\u00A1Vive unas vacaciones excepcionales en el \u00FAnico hotel Todo Incluido de Morrocoy!_* \uD83C\uDF79\uD83D\uDE0E',
    '',
    '\u00A1La escapada perfecta al Caribe Venezolano!',
    '*Reservemos!* \u2728'
  ].join('\n');
}

function plantillaHIM_() {
  return [
    '*{{HOTEL_NOMBRE}}* {{EMOJIS}}',
    '*{{ASESOR_INICIALES}}*',
    'CHECK IN {{HORA_IN}}: {{FECHA_IN}}',
    'CHECK OUT {{HORA_OUT}}: {{FECHA_OUT}}',
    '',
    '{{BLOQUE_HABITACIONES}}',
    '',
    '*TOTAL: ${{TOTAL}} ({{DIAS}} D\u00CDAS Y {{NOCHES}} NOCHES)*',
    '{{BLOQUE_CARGOS}}{{BLOQUE_PROMO}}',
    '{{MENSAJE_CASHEA}}',
    '',
    '*PLAN:* Todo Incluido',
    '',
    '*INCLUYE:*',
    '* Hospedaje.',
    '* Desayuno (7:00 AM - 10:00 AM).',
    '* Almuerzo (01:00 PM - 3:00 PM).',
    '* Snack de Media Tarde (3:00 PM - 5:00 PM).',
    '* Cena (7:00 PM - 10:00 PM).',
    '* Selecci\u00F3n de Bebidas Alcoh\u00F3licas Incluidas.',
    '* Wifi en el Hotel y Habitaciones.',
    '* Piscina para Adultos y Ni\u00F1os.',
    '* Estacionamiento Gratuito.',
    '* Club de Playa.',
    '* Cancha de Tenis.',
    '* 40 min de Golf Gratis.',
    '* Club N\u00E1utico en Kayack.',
    '* Sala de Videos Juegos.',
    '* Disfrute de Lobby Bar.',
    '* Disfrute de Bar Playa.',
    '',
    '\uD83D\uDCCC *IMPORTANTE:* {{LABEL_DEPOSITO}}: ${{DEPOSITO}} *en efectivo* por habitaci\u00F3n, se devuelven en el Check-out.',
    '',
    '\uD83D\uDD05 *SERVICIOS ADICIONALES: (Opcionales)*',
    'EARLY CHECK IN: {{EARLY_PP}}$ por persona: Desde las 11:00 AM',
    'LATE CHECK OUT: {{LATE_PP}}$ por persona: Hasta las {{HORA_LATE}}',
    'Brazalete VIP ${{VIP_DIA}} por d\u00EDa, consumo de bebidas alcoh\u00F3licas PREMIUM',
    '',
    '*_\u00A1Vive unas vacaciones inolvidables en Hesperia Isla Margarita!_* \uD83C\uDF79\uD83D\uDE0E',
    '*Reservemos!* \u2728'
  ].join('\n');
}

function plantillaHPA_() {
  return [
    '*{{HOTEL_NOMBRE}}*{{EMOJIS}}',
    '*{{ASESOR_INICIALES}}*',
    'CHECK IN {{HORA_IN}}: {{FECHA_IN}}',
    'CHECK OUT {{HORA_OUT}}: {{FECHA_OUT}}',
    '',
    '{{BLOQUE_HABITACIONES}}',
    '',
    '*TOTAL: ${{TOTAL}} ({{DIAS}} D\u00CDAS {{NOCHES}} NOCHES)*',
    '{{BLOQUE_CARGOS}}{{BLOQUE_PROMO}}',
    '{{MENSAJE_CASHEA}}',
    '',
    '*PLAN:* Todo Incluido',
    '',
    '*INCLUYE:*',
    '* Hospedaje.',
    '* Desayuno (7:00 AM - 10:00 AM).',
    '* Almuerzo (12:00 PM - 2:00 PM).',
    '* Snack de Media Tarde (3:00 PM - 5:00 PM).',
    '* Cena (7:00 PM - 10:00 PM).',
    '* Selecci\u00F3n de Bebidas Alcoh\u00F3licas Incluidas.',
    '* Wifi en el Hotel.',
    '* Piscina para Adultos y Ni\u00F1os.',
    '* Estacionamiento Gratuito.',
    '* Club de Playa.',
    '* Zona Kids.',
    '* Disfrute de Lobby Bar.',
    '* Disfrute de Tiki Bar.',
    '',
    '\uD83D\uDCCC *IMPORTANTE:* {{LABEL_DEPOSITO}}: ${{DEPOSITO}} *en efectivo* por habitaci\u00F3n, se devuelven en el Check-out.',
    '*\u26A0\uFE0F Si uno de los hu\u00E9spedes es menor de edad debe traer partida de nacimiento o documento de identidad del mismo.*',
    '',
    '\uD83D\uDD05 *SERVICIOS ADICIONALES: (Opcionales)*',
    'EARLY CHECK IN: {{EARLY_PP}}$ por persona: Desde las 11:00 AM (La habitaci\u00F3n se entregar\u00E1 s\u00F3lo si est\u00E1 disponible)',
    'LATE CHECK OUT: {{LATE_PP}}$ por persona: Hasta las {{HORA_LATE}}',
    'Brazalete VIP ${{VIP_DIA}} por d\u00EDa, consumo de bebidas alcoh\u00F3licas PREMIUM',
    '',
    '*_El verano ser\u00E1 en la Isla de Margarita, \u00A1Hesperia Playa el Agua te espera!_* \uD83C\uDFDD\uFE0F\uD83D\uDE4C',
    '*Reservemos!* \u2728'
  ].join('\n');
}

/**
 * Hoteles de ciudad (WTC, HMC): tarifa por habitacion + IVA, plan con desayunos.
 * Borrador segun el formato enviado. Ajustar cuando esten los datos definitivos.
 */
function plantillaCiudad_() {
  return [
    '*{{HOTEL_NOMBRE}}* {{EMOJIS}}',
    '*{{ASESOR_INICIALES}}*',
    'CHECK IN {{HORA_IN}}: {{FECHA_IN}}',
    'CHECK OUT {{HORA_OUT}}: {{FECHA_OUT}}',
    '',
    '{{BLOQUE_HABITACIONES}}',
    '',
    '*TOTAL: ${{TOTAL}} ({{NOCHES_N}} {{PALABRA_NOCHES}})*',
    '{{BLOQUE_CARGOS}}{{BLOQUE_PROMO}}',
    '*PLAN:* Con Desayunos',
    '',
    '{{MENSAJE_CASHEA}}',
    '*Reservemos!* \u2728'
  ].join('\n');
}

// ============================================================================
// MENU
// ============================================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Cotizador')
    .addItem('Instalar / Reinstalar hojas', 'instalarTodo')
    .addSeparator()
    .addItem('Validar catalogo', 'validarCatalogo')
    .addItem('Generar matriz de tarifas faltantes', 'generarMatrizTarifas')
    .addSeparator()
    .addItem('Publicar cambios (limpiar cache)', 'publicarCambios')
    .addSeparator()
    .addItem('Ejecutar pruebas funcionales', 'ejecutarPruebas')
    .addToUi();
}

function onEdit(e) {
  try {
    var hojasCatalogo = ['Hoteles','Habitaciones','Temporadas','Tarifas','StopSales',
                         'PoliticaNinos','Promociones','CargosFecha','Plantillas','Config'];
    var nombre = e.range.getSheet().getName();
    if (hojasCatalogo.indexOf(nombre) === -1) return;
    if (nombre === 'Config' && e.range.getRow() === 5) return; // evita recursion
    marcarCambiosSinPublicar_();
  } catch (err) { /* onEdit debe fallar en silencio */ }
}
