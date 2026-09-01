/**
 * COTIZADOR HESPERIA - 04_Validador.gs
 * Detecta problemas de datos ANTES de que una asesora se tope con ellos.
 */

function validarCatalogo() {
  var hallazgos = validarCatalogoCore_();
  escribirValidacion_(hallazgos);

  var err = hallazgos.filter(function (h) { return h[0] === 'ERROR'; }).length;
  var adv = hallazgos.filter(function (h) { return h[0] === 'ADVERTENCIA'; }).length;

  SpreadsheetApp.getUi().alert(
    'Validacion del catalogo',
    err + ' error(es), ' + adv + ' advertencia(s).\n\n' +
    (err ? 'Hay errores que impiden cotizar correctamente. Revise la hoja "Validacion".'
         : 'Sin errores criticos. Revise la hoja "Validacion" para el detalle.'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  return hallazgos;
}

function validarCatalogoCore_() {
  var cat = getCatalogo(true);
  var M = MOTOR();
  var F = M.Fechas;
  var out = [];
  function add(sev, hoja, codigo, msg) { out.push([sev, hoja, codigo, msg]); }

  var hoteles = Object.keys(cat.hoteles);

  // --- 1. Solapamientos de temporadas con la misma prioridad ---------------
  hoteles.forEach(function (h) {
    var ts = cat.temporadas.filter(function (t) { return t.hotel === h; });
    for (var i = 0; i < ts.length; i++) {
      for (var j = i + 1; j < ts.length; j++) {
        var a = ts[i], b = ts[j];
        if (a.inicio > b.fin || b.inicio > a.fin) continue;
        if (a.prioridad === b.prioridad) {
          add('ERROR', 'Temporadas', 'SOLAPE_EMPATE',
              h + ': "' + a.cod + '" y "' + b.cod + '" se solapan con la misma prioridad (' +
              a.prioridad + '). El resultado seria impredecible.');
        }
      }
      if (ts[i].inicio > ts[i].fin) {
        add('ERROR', 'Temporadas', 'RANGO_INVERTIDO',
            h + ': "' + ts[i].cod + '" tiene fecha_inicio posterior a fecha_fin.');
      }
    }
  });

  // --- 2. Tarifas huerfanas y faltantes ------------------------------------
  var codsTemp = {}, codsHab = {};
  cat.temporadas.forEach(function (t) { codsTemp[t.hotel + '|' + t.cod] = true; });
  Object.keys(cat.habitaciones).forEach(function (k) { codsHab[k] = true; });

  Object.keys(cat.tarifas).forEach(function (k) {
    var p = k.split('|'); // hotel|cod_hab|cod_temp
    if (!codsHab[p[0] + '|' + p[1]]) {
      add('ERROR', 'Tarifas', 'HAB_INEXISTENTE',
          'Tarifa para habitacion inexistente o inactiva: ' + p[0] + ' / ' + p[1]);
    }
    if (!codsTemp[p[0] + '|' + p[2]]) {
      add('ERROR', 'Tarifas', 'TEMP_INEXISTENTE',
          'Tarifa para temporada inexistente: ' + p[0] + ' / ' + p[2]);
    }
  });

  // Un hotel inactivo (todavia sin tarifas cargadas) no es un error de datos:
  // es el estado normal mientras se prepara. Se reporta una sola vez, como
  // recordatorio, en lugar de un error por cada habitacion.
  var inactivosAvisados = {};
  Object.keys(cat.habitaciones).forEach(function (kh) {
    var hab = cat.habitaciones[kh];
    if (!cat.hoteles[hab.hotel]) {
      if (!inactivosAvisados[hab.hotel]) {
        inactivosAvisados[hab.hotel] = true;
        add('ADVERTENCIA', 'Hoteles', 'HOTEL_INACTIVO',
            hab.hotel + ' esta en activo = NO. Sus habitaciones no se validan ni ' +
            'aparecen en el cotizador. Cargue las tarifas y pongalo en SI.');
      }
      return;
    }
    var ts = cat.temporadas.filter(function (t) { return t.hotel === hab.hotel; });
    var faltan = ts.filter(function (t) {
      return !cat.tarifas[hab.hotel + '|' + hab.cod + '|' + t.cod];
    });
    if (faltan.length === ts.length && ts.length) {
      add('ERROR', 'Tarifas', 'HAB_SIN_TARIFAS',
          hab.hotel + ' / ' + hab.cod + ' (' + hab.nombre + ') no tiene ninguna tarifa cargada.');
    } else if (faltan.length) {
      add('ERROR', 'Tarifas', 'TARIFA_FALTANTE',
          hab.hotel + ' / ' + hab.cod + ': faltan tarifas para ' +
          faltan.map(function (t) { return t.cod; }).join(', '));
    }
  });

  // --- 3. Cobertura: noches sin tarifa resoluble ---------------------------
  hoteles.forEach(function (h) {
    var ts = cat.temporadas.filter(function (t) { return t.hotel === h; });
    if (!ts.length) {
      add('ERROR', 'Temporadas', 'SIN_TEMPORADAS', h + ' no tiene temporadas cargadas.');
      return;
    }
    var horizonte = ts.reduce(function (m, t) { return t.fin > m ? t.fin : m; }, ts[0].fin);
    var hoy = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
    var desde = hoy;

    var habs = Object.keys(cat.habitaciones)
      .map(function (k) { return cat.habitaciones[k]; })
      .filter(function (x) { return x.hotel === h; });

    habs.forEach(function (hab) {
      var huecos = [], d = desde, guard = 0;
      while (d <= horizonte && guard++ < 800) {
        var r = M._interno.tarifaNoche(cat, h, hab.cod, d, 1, []);
        // Una noche con stop sale no es un hueco de carga: esta cerrada a
        // proposito y el motor ya da un mensaje propio.
        if (r.error && !r.sinCupo) {
          var ult = huecos[huecos.length - 1];
          if (ult && F.sumarDias(ult.hasta, 1) === d) ult.hasta = d;
          else huecos.push({ desde: d, hasta: d });
        }
        d = F.sumarDias(d, 1);
      }
      huecos.forEach(function (x) {
        add('ERROR', 'Tarifas', 'HUECO_COBERTURA',
            h + ' / ' + hab.nombre + ': sin tarifa desde ' + F.fmtCorto(x.desde) +
            ' hasta ' + F.fmtCorto(x.hasta) + '.');
      });
    });

    var diasRestantes = F.diffDias(hoy, horizonte);
    if (diasRestantes < 120) {
      add('ADVERTENCIA', 'Temporadas', 'HORIZONTE_CORTO',
          h + ': la cobertura de tarifas termina el ' + F.fmtCorto(horizonte) +
          ' (' + diasRestantes + ' dias). Cargue las temporadas siguientes.');
    }
  });

  // --- 4. Politica de ninos: huecos y solapes de edad ----------------------
  hoteles.forEach(function (h) {
    var rs = (cat.politica[h] || []).slice().sort(function (a, b) { return a.edadMin - b.edadMin; });
    if (!rs.length) {
      add('ERROR', 'PoliticaNinos', 'SIN_POLITICA', h + ' no tiene politica de ninos cargada.');
      return;
    }
    if (rs[0].edadMin !== 0) {
      add('ERROR', 'PoliticaNinos', 'NO_INICIA_EN_0', h + ': el primer rango debe iniciar en edad 0.');
    }
    for (var i = 1; i < rs.length; i++) {
      var prev = rs[i - 1], cur = rs[i];
      if (cur.edadMin <= prev.edadMax) {
        add('ERROR', 'PoliticaNinos', 'SOLAPE_EDAD',
            h + ': los rangos ' + prev.cod + ' (' + prev.edadMin + '-' + prev.edadMax +
            ') y ' + cur.cod + ' (' + cur.edadMin + '-' + cur.edadMax + ') se solapan.');
      } else if (cur.edadMin > prev.edadMax + 1) {
        add('ERROR', 'PoliticaNinos', 'HUECO_EDAD',
            h + ': las edades ' + (prev.edadMax + 1) + ' a ' + (cur.edadMin - 1) +
            ' no estan cubiertas por ningun rango.');
      }
    }
  });

  // --- 5. Promociones ------------------------------------------------------
  cat.promociones.forEach(function (p) {
    if (['SUSTITUYE', 'DESCUENTO_PCT', 'DESCUENTO_MONTO'].indexOf(p.tipo) === -1) {
      add('ERROR', 'Promociones', 'TIPO_INVALIDO', p.cod + ': tipo desconocido "' + p.tipo + '".');
    }
    if (p.inicio > p.fin) {
      add('ERROR', 'Promociones', 'RANGO_INVERTIDO', p.cod + ': vigencia invertida.');
    }
    if (p.codHab !== 'TODAS' && !cat.habitaciones[p.hotel + '|' + p.codHab]) {
      add('ERROR', 'Promociones', 'HAB_INEXISTENTE',
          p.cod + ': apunta a la habitacion "' + p.codHab + '" que no existe o esta inactiva.');
    }
    if (p.tipo === 'DESCUENTO_PCT' && (p.valor <= 0 || p.valor >= 100)) {
      add('ADVERTENCIA', 'Promociones', 'PCT_SOSPECHOSO', p.cod + ': descuento de ' + p.valor + '%.');
    }
    // Sheets convierte "5,6" en el numero 5.6 si la columna no es texto plano.
    // El sintoma es una promo que nunca se aplica y un total silenciosamente
    // equivocado, asi que se reporta como ERROR con la instruccion de arreglo.
    var crudo = p.diasSemanaCrudo;
    if (crudo !== '' && crudo !== null && crudo !== undefined && typeof crudo !== 'string') {
      add('ERROR', 'Promociones', 'DIAS_CONVERTIDOS_A_NUMERO',
          p.cod + ': la celda dias_semana vale ' + crudo + ' (numero) en lugar de texto. ' +
          'Sheets convirtio la coma en separador decimal. Arreglo: seleccione la celda, ' +
          'Formato > Numero > Texto sin formato, reescriba el valor y use "Publicar cambios".');
    }
    if (typeof crudo === 'string' && crudo.trim() !== '' && !p.diasSemana.length) {
      add('ERROR', 'Promociones', 'DIAS_ILEGIBLES',
          p.cod + ': dias_semana = "' + crudo + '" no produjo ningun dia valido ' +
          '(use numeros del 1 al 7 separados por coma).');
    }
    if (p.diasSemana.length > 7) {
      add('ADVERTENCIA', 'Promociones', 'DIAS_DUPLICADOS',
          p.cod + ': dias_semana tiene mas de 7 entradas.');
    }
  });

  // --- 5b. Cierres de venta (stop sales) -----------------------------------
  (cat.stopSales || []).forEach(function (s) {
    var etq = s.hotel + ' / ' + s.codHab + ' (' + F.fmtCorto(s.inicio) + ' a ' +
              F.fmtCorto(s.fin) + ')';
    if (!cat.hoteles[s.hotel]) {
      add('ERROR', 'StopSales', 'HOTEL_INEXISTENTE',
          etq + ': el hotel no existe o esta inactivo.');
      return;
    }
    if (s.codHab !== 'TODAS' && !cat.habitaciones[s.hotel + '|' + s.codHab]) {
      add('ERROR', 'StopSales', 'HAB_INEXISTENTE',
          etq + ': la habitacion no existe o esta inactiva. Use TODAS para ' +
          'cerrar el hotel completo.');
    }
    if (s.inicio > s.fin) {
      add('ERROR', 'StopSales', 'RANGO_INVERTIDO',
          etq + ': fecha_inicio posterior a fecha_fin.');
    }
    var largo = F.diffDias(s.inicio, s.fin) + 1;
    if (largo > 180) {
      add('ADVERTENCIA', 'StopSales', 'CIERRE_LARGO',
          etq + ': el cierre dura ' + largo + ' noches. Verifique que sea correcto.');
    }
    var hoy = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
    if (s.fin < hoy) {
      add('ADVERTENCIA', 'StopSales', 'CIERRE_VENCIDO',
          etq + ': el cierre ya vencio. Puede borrar la fila o poner activo = NO.');
    }
  });

  // Un hotel cerrado por completo durante todo su horizonte deja el cotizador
  // sin nada que ofrecer: conviene saberlo antes de que lo descubra la asesora.
  hoteles.forEach(function (h) {
    var habs = Object.keys(cat.habitaciones)
      .map(function (k) { return cat.habitaciones[k]; })
      .filter(function (x) { return x.hotel === h; });
    var hoy = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
    var cerradas = habs.filter(function (hab) {
      var d = hoy, guard = 0, libre = false;
      while (guard++ < 120 && !libre) {
        if (!M._interno.stopSaleDe(cat, h, hab.cod, d)) libre = true;
        d = F.sumarDias(d, 1);
      }
      return !libre;
    });
    if (habs.length && cerradas.length === habs.length) {
      add('ADVERTENCIA', 'StopSales', 'HOTEL_SIN_CUPO',
          h + ': todas las habitaciones estan cerradas los proximos 120 dias.');
    }
  });

  // --- 6. Cargos de fecha --------------------------------------------------
  Object.keys(cat.cargos).forEach(function (k) {
    var p = k.split('|');
    if (!cat.hoteles[p[0]]) {
      add('ERROR', 'CargosFecha', 'HOTEL_INEXISTENTE', 'Cargo para hotel desconocido: ' + p[0]);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p[1])) {
      add('ERROR', 'CargosFecha', 'FECHA_INVALIDA', 'Fecha invalida en cargo: ' + p[1]);
    }
  });

  // --- 7. Plantillas: marcadores desconocidos ------------------------------
  // La lista vive en el motor: agregar un marcador alli lo habilita aqui solo.
  var conocidos = M.MARCADORES;

  hoteles.forEach(function (h) {
    var pl = cat.plantillas[h];
    if (!pl) {
      add('ERROR', 'Plantillas', 'SIN_PLANTILLA', h + ' no tiene plantilla configurada.');
      return;
    }
    var usados = (pl.match(/\{\{(\w+)\}\}/g) || []).map(function (x) { return x.slice(2, -2); });
    usados.filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (u) {
      if (conocidos.indexOf(u) === -1) {
        add('ERROR', 'Plantillas', 'MARCADOR_DESCONOCIDO',
            h + ': la plantilla usa {{' + u + '}} que el motor no sabe resolver.');
      }
    });
    ['BLOQUE_HABITACIONES', 'TOTAL'].forEach(function (req) {
      if (usados.indexOf(req) === -1) {
        add('ADVERTENCIA', 'Plantillas', 'MARCADOR_FALTANTE',
            h + ': la plantilla no incluye {{' + req + '}}.');
      }
    });
  });

  // --- 8. Consistencia de catalogo de habitaciones -------------------------
  Object.keys(cat.habitaciones).forEach(function (k) {
    var hb = cat.habitaciones[k];
    if (hb.ocupMaxAdultos > hb.ocupMaxTotal) {
      add('ERROR', 'Habitaciones', 'OCUP_INCOHERENTE',
          hb.cod + ': ocup_max_adultos (' + hb.ocupMaxAdultos +
          ') mayor que ocup_max_total (' + hb.ocupMaxTotal + ').');
    }
    if (hb.ocupMinFisica > hb.ocupMaxTotal) {
      add('ERROR', 'Habitaciones', 'OCUP_INCOHERENTE',
          hb.cod + ': ocup_min_fisica mayor que ocup_max_total.');
    }
    var htl = cat.hoteles[hb.hotel];
    if (hb.permiteSingle && !hb.suplementoSingle) {
      add('ADVERTENCIA', 'Habitaciones', 'SUPL_CERO',
          hb.cod + ': permite single pero el suplemento es 0.');
    }
    if (htl && htl.modoTarifa === 'POR_HABITACION' && hb.permiteSingle) {
      add('ADVERTENCIA', 'Habitaciones', 'SINGLE_IRRELEVANTE',
          hb.hotel + ' / ' + hb.cod + ': el hotel cobra POR_HABITACION, ' +
          'asi que permite_single no tiene efecto. Pongalo en NO.');
    }
    if (!hb.permiteSingle && hb.suplementoSingle) {
      add('ADVERTENCIA', 'Habitaciones', 'SUPL_MUERTO',
          hb.hotel + ' / ' + hb.cod + ': tiene suplemento_single = ' +
          hb.suplementoSingle + ' pero permite_single = NO, asi que nunca se cobra.');
    }
    if (hb.paxMinCobrados !== null && hb.paxMinCobrados > hb.ocupMaxTotal) {
      add('ERROR', 'Habitaciones', 'PAXMIN_INCOHERENTE',
          hb.cod + ': pax_min_cobrados mayor que la ocupacion maxima.');
    }
  });

  if (!out.length) add('OK', '-', 'SIN_HALLAZGOS', 'El catalogo no presenta problemas.');
  return out;
}

function escribirValidacion_(hallazgos) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Validacion');
  var cols = ESQUEMA.Validacion.cols.length;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, cols).clear();

  var ahora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var filas = hallazgos.map(function (h) { return h.concat([ahora]); });
  sh.getRange(2, 1, filas.length, cols).setValues(filas);

  var rango = sh.getRange(2, 1, filas.length, 1);
  rango.setBackgrounds(filas.map(function (f) {
    return [f[0] === 'ERROR' ? '#f4cccc' : (f[0] === 'ADVERTENCIA' ? '#fff2cc' : '#d9ead3')];
  }));
  sh.autoResizeColumns(1, cols);
  ss.setActiveSheet(sh);
}

/**
 * Crea las combinaciones habitacion x temporada que faltan en la hoja Tarifas,
 * con la columna de precio en blanco para que la gerencia solo llene numeros.
 */
function generarMatrizTarifas() {
  var cat = getCatalogo(true);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Tarifas');
  var nuevas = [];

  Object.keys(cat.habitaciones).forEach(function (k) {
    var hab = cat.habitaciones[k];
    cat.temporadas.filter(function (t) { return t.hotel === hab.hotel; })
      .forEach(function (t) {
        if (!cat.tarifas[hab.hotel + '|' + hab.cod + '|' + t.cod]) {
          nuevas.push([hab.hotel, hab.cod, t.cod, '', '']);
        }
      });
  });

  if (!nuevas.length) {
    SpreadsheetApp.getUi().alert('No falta ninguna combinacion. La matriz de tarifas esta completa.');
    return;
  }
  nuevas.sort(function (a, b) {
    return a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]);
  });
  sh.getRange(sh.getLastRow() + 1, 1, nuevas.length, 5).setValues(nuevas)
    .setBackground('#fff2cc');
  ss.setActiveSheet(sh);
  SpreadsheetApp.getUi().alert(
    'Se agregaron ' + nuevas.length + ' filas resaltadas en amarillo.\n' +
    'Complete la columna tarifa_pp_noche y luego use "Publicar cambios".'
  );
}
