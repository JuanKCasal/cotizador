/**
 * COTIZADOR HESPERIA - validador.js
 * Detecta problemas de datos ANTES de que una asesora se tope con ellos.
 *
 * Era 04_Validador.gs. Perdio la parte que escribia en la hoja "Validacion" y
 * abria dialogos: ahora devuelve los hallazgos y quien llama los muestra.
 */
var Validador = (function () {
  'use strict';

  /**
   * Recorre el catalogo y devuelve una lista de [severidad, tabla, codigo, mensaje].
   * Funcion pura: no toca el DOM ni escribe en ningun lado. Quien la llama
   * decide como mostrar los hallazgos.
   *
   * @param {Object} cat  catalogo ya construido
   * @param {Object} M    el motor (Motor)
   * @param {string} hoy  fecha ISO de referencia; se inyecta para que las
   *                      pruebas puedan fijarla en vez de depender del reloj
   */
  function validar(cat, M, hoy) {
    hoy = hoy || new Date().toISOString().slice(0, 10);
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
            add('ERROR', 'temporadas', 'SOLAPE_EMPATE',
                h + ': "' + a.cod + '" y "' + b.cod + '" se solapan con la misma prioridad (' +
                a.prioridad + '). El resultado seria impredecible.');
          }
        }
        if (ts[i].inicio > ts[i].fin) {
          add('ERROR', 'temporadas', 'RANGO_INVERTIDO',
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
        add('ERROR', 'tarifas', 'HAB_INEXISTENTE',
            'Tarifa para habitacion inexistente o inactiva: ' + p[0] + ' / ' + p[1]);
      }
      if (!codsTemp[p[0] + '|' + p[2]]) {
        add('ERROR', 'tarifas', 'TEMP_INEXISTENTE',
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
          add('ADVERTENCIA', 'hoteles', 'HOTEL_INACTIVO',
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
        add('ERROR', 'tarifas', 'HAB_SIN_TARIFAS',
            hab.hotel + ' / ' + hab.cod + ' (' + hab.nombre + ') no tiene ninguna tarifa cargada.');
      } else if (faltan.length) {
        add('ERROR', 'tarifas', 'TARIFA_FALTANTE',
            hab.hotel + ' / ' + hab.cod + ': faltan tarifas para ' +
            faltan.map(function (t) { return t.cod; }).join(', '));
      }
    });

    // --- 3. Cobertura: noches sin tarifa resoluble ---------------------------
    hoteles.forEach(function (h) {
      var ts = cat.temporadas.filter(function (t) { return t.hotel === h; });
      if (!ts.length) {
        add('ERROR', 'temporadas', 'SIN_TEMPORADAS', h + ' no tiene temporadas cargadas.');
        return;
      }
      var horizonte = ts.reduce(function (m, t) { return t.fin > m ? t.fin : m; }, ts[0].fin);
      var desde = hoy;

      var habs = Object.keys(cat.habitaciones)
        .map(function (k) { return cat.habitaciones[k]; })
        .filter(function (x) { return x.hotel === h; });

      habs.forEach(function (hab) {
        // Se chequea la cobertura con la ocupacion minima vendible: si esa no
        // tiene tarifa, la habitacion no se puede cotizar de ninguna forma.
        var ocupChequeo = hab.ocupMinFisica || 1;
        var huecos = [], d = desde, guard = 0;
        while (d <= horizonte && guard++ < 800) {
          var r = M._interno.tarifaNoche(cat, h, hab.cod, d, 1, [], ocupChequeo);
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
          add('ERROR', 'tarifas', 'HUECO_COBERTURA',
              h + ' / ' + hab.nombre + ': sin tarifa desde ' + F.fmtCorto(x.desde) +
              ' hasta ' + F.fmtCorto(x.hasta) + '.');
        });
      });

      // Ocupaciones intermedias sin tarifa. Una habitacion que cobra por
      // ocupacion y tiene precio para 1 y para 3 pero no para 2 deja un hueco
      // que solo aparece cuando la asesora intenta esa combinacion exacta.
      habs.forEach(function (hab) {
        var ts = cat.temporadas.filter(function (t) { return t.hotel === h; });
        ts.forEach(function (temp) {
          var t = cat.tarifas[h + '|' + hab.cod + '|' + temp.cod];
          if (!t || t.tarifa !== null || !t.paxOrdenados.length) return;
          var maxCargado = t.paxOrdenados[t.paxOrdenados.length - 1];
          var faltan = [];
          for (var o = hab.ocupMinFisica || 1; o <= maxCargado; o++) {
            if (t.porPax[o] === undefined) faltan.push(o);
          }
          if (faltan.length) {
            add('ERROR', 'tarifas', 'OCUPACION_SIN_TARIFA',
                h + ' / ' + hab.nombre + ' (' + temp.cod + '): sin tarifa para ' +
                faltan.join(', ') + ' huesped(es), pero si para ' + maxCargado + '.');
          }
          if (maxCargado < hab.ocupMaxTotal &&
              !(cat.adicionales || {})[h + '|' + hab.cod] &&
              !(cat.adicionales || {})[h + '|TODAS']) {
            add('ADVERTENCIA', 'tarifas', 'ADICIONAL_SIN_MONTO',
                h + ' / ' + hab.nombre + ': admite hasta ' + hab.ocupMaxTotal +
                ' huespedes, la tarifa cubre ' + maxCargado +
                ' y no hay monto de persona adicional cargado.');
          }
        });
      });

      var diasRestantes = F.diffDias(hoy, horizonte);
      if (diasRestantes < 120) {
        add('ADVERTENCIA', 'temporadas', 'HORIZONTE_CORTO',
            h + ': la cobertura de tarifas termina el ' + F.fmtCorto(horizonte) +
            ' (' + diasRestantes + ' dias). Cargue las temporadas siguientes.');
      }
    });

    // --- 4. Politica de ninos: huecos y solapes de edad ----------------------
    hoteles.forEach(function (h) {
      var rs = (cat.politica[h] || []).slice().sort(function (a, b) { return a.edadMin - b.edadMin; });
      if (!rs.length) {
        add('ERROR', 'politica-ninos', 'SIN_POLITICA', h + ' no tiene politica de ninos cargada.');
        return;
      }
      if (rs[0].edadMin !== 0) {
        add('ERROR', 'politica-ninos', 'NO_INICIA_EN_0', h + ': el primer rango debe iniciar en edad 0.');
      }
      for (var i = 1; i < rs.length; i++) {
        var prev = rs[i - 1], cur = rs[i];
        if (cur.edadMin <= prev.edadMax) {
          add('ERROR', 'politica-ninos', 'SOLAPE_EDAD',
              h + ': los rangos ' + prev.cod + ' (' + prev.edadMin + '-' + prev.edadMax +
              ') y ' + cur.cod + ' (' + cur.edadMin + '-' + cur.edadMax + ') se solapan.');
        } else if (cur.edadMin > prev.edadMax + 1) {
          add('ERROR', 'politica-ninos', 'HUECO_EDAD',
              h + ': las edades ' + (prev.edadMax + 1) + ' a ' + (cur.edadMin - 1) +
              ' no estan cubiertas por ningun rango.');
        }
      }
    });

    // --- 5. Promociones ------------------------------------------------------
    cat.promociones.forEach(function (p) {
      if (['SUSTITUYE', 'DESCUENTO_PCT', 'DESCUENTO_MONTO'].indexOf(p.tipo) === -1) {
        add('ERROR', 'promociones', 'TIPO_INVALIDO', p.cod + ': tipo desconocido "' + p.tipo + '".');
      }
      if (p.inicio > p.fin) {
        add('ERROR', 'promociones', 'RANGO_INVERTIDO', p.cod + ': vigencia invertida.');
      }
      if (p.codHab !== 'TODAS' && !cat.habitaciones[p.hotel + '|' + p.codHab]) {
        add('ERROR', 'promociones', 'HAB_INEXISTENTE',
            p.cod + ': apunta a la habitacion "' + p.codHab + '" que no existe o esta inactiva.');
      }
      if (p.tipo === 'DESCUENTO_PCT' && (p.valor <= 0 || p.valor >= 100)) {
        add('ADVERTENCIA', 'promociones', 'PCT_SOSPECHOSO', p.cod + ': descuento de ' + p.valor + '%.');
      }
      // Sheets convierte "5,6" en el numero 5.6 si la columna no es texto plano.
      // El sintoma es una promo que nunca se aplica y un total silenciosamente
      // equivocado, asi que se reporta como ERROR con la instruccion de arreglo.
      var crudo = p.diasSemanaCrudo;
      if (crudo !== '' && crudo !== null && crudo !== undefined && typeof crudo !== 'string') {
        add('ERROR', 'promociones', 'DIAS_CONVERTIDOS_A_NUMERO',
            p.cod + ': la celda dias_semana vale ' + crudo + ' (numero) en lugar de texto. ' +
            'Sheets convirtio la coma en separador decimal. Arreglo: seleccione la celda, ' +
            'Formato > Numero > Texto sin formato, reescriba el valor y use "Publicar cambios".');
      }
      if (typeof crudo === 'string' && crudo.trim() !== '' && !p.diasSemana.length) {
        add('ERROR', 'promociones', 'DIAS_ILEGIBLES',
            p.cod + ': dias_semana = "' + crudo + '" no produjo ningun dia valido ' +
            '(use numeros del 1 al 7 separados por coma).');
      }
      if (p.diasSemana.length > 7) {
        add('ADVERTENCIA', 'promociones', 'DIAS_DUPLICADOS',
            p.cod + ': dias_semana tiene mas de 7 entradas.');
      }
    });

    // --- 5b. Cierres de venta (stop sales) -----------------------------------
    (cat.stopSales || []).forEach(function (s) {
      var etq = s.hotel + ' / ' + s.codHab + ' (' + F.fmtCorto(s.inicio) + ' a ' +
                F.fmtCorto(s.fin) + ')';
      if (!cat.hoteles[s.hotel]) {
        add('ERROR', 'stop-sales', 'HOTEL_INEXISTENTE',
            etq + ': el hotel no existe o esta inactivo.');
        return;
      }
      if (s.codHab !== 'TODAS' && !cat.habitaciones[s.hotel + '|' + s.codHab]) {
        add('ERROR', 'stop-sales', 'HAB_INEXISTENTE',
            etq + ': la habitacion no existe o esta inactiva. Use TODAS para ' +
            'cerrar el hotel completo.');
      }
      if (s.inicio > s.fin) {
        add('ERROR', 'stop-sales', 'RANGO_INVERTIDO',
            etq + ': fecha_inicio posterior a fecha_fin.');
      }
      var largo = F.diffDias(s.inicio, s.fin) + 1;
      if (largo > 180) {
        add('ADVERTENCIA', 'stop-sales', 'CIERRE_LARGO',
            etq + ': el cierre dura ' + largo + ' noches. Verifique que sea correcto.');
      }
      if (s.fin < hoy) {
        add('ADVERTENCIA', 'stop-sales', 'CIERRE_VENCIDO',
            etq + ': el cierre ya vencio. Puede borrar la entrada o poner activo en NO.');
      }
    });

    // Un hotel cerrado por completo durante todo su horizonte deja el cotizador
    // sin nada que ofrecer: conviene saberlo antes de que lo descubra la asesora.
    hoteles.forEach(function (h) {
      var habs = Object.keys(cat.habitaciones)
        .map(function (k) { return cat.habitaciones[k]; })
        .filter(function (x) { return x.hotel === h; });
      var cerradas = habs.filter(function (hab) {
        var d = hoy, guard = 0, libre = false;
        while (guard++ < 120 && !libre) {
          if (!M._interno.stopSaleDe(cat, h, hab.cod, d)) libre = true;
          d = F.sumarDias(d, 1);
        }
        return !libre;
      });
      if (habs.length && cerradas.length === habs.length) {
        add('ADVERTENCIA', 'stop-sales', 'HOTEL_SIN_CUPO',
            h + ': todas las habitaciones estan cerradas los proximos 120 dias.');
      }
    });

    // --- 6. Cargos de fecha --------------------------------------------------
    Object.keys(cat.cargos).forEach(function (k) {
      var p = k.split('|');
      if (!cat.hoteles[p[0]]) {
        add('ERROR', 'cargos-fecha', 'HOTEL_INEXISTENTE', 'Cargo para hotel desconocido: ' + p[0]);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p[1])) {
        add('ERROR', 'cargos-fecha', 'FECHA_INVALIDA', 'Fecha invalida en cargo: ' + p[1]);
      }
    });

    // --- 7. Plantillas: marcadores desconocidos ------------------------------
    // La lista vive en el motor: agregar un marcador alli lo habilita aqui solo.
    var conocidos = M.MARCADORES;

    hoteles.forEach(function (h) {
      var pl = cat.plantillas[h];
      if (!pl) {
        add('ERROR', 'plantillas', 'SIN_PLANTILLA', h + ' no tiene plantilla configurada.');
        return;
      }
      var usados = (pl.match(/\{\{(\w+)\}\}/g) || []).map(function (x) { return x.slice(2, -2); });
      usados.filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (u) {
        if (conocidos.indexOf(u) === -1) {
          add('ERROR', 'plantillas', 'MARCADOR_DESCONOCIDO',
              h + ': la plantilla usa {{' + u + '}} que el motor no sabe resolver.');
        }
      });
      ['BLOQUE_HABITACIONES', 'TOTAL'].forEach(function (req) {
        if (usados.indexOf(req) === -1) {
          add('ADVERTENCIA', 'plantillas', 'MARCADOR_FALTANTE',
              h + ': la plantilla no incluye {{' + req + '}}.');
        }
      });
    });

    // --- 8. Consistencia de catalogo de habitaciones -------------------------
    Object.keys(cat.habitaciones).forEach(function (k) {
      var hb = cat.habitaciones[k];
      if (hb.ocupMaxAdultos > hb.ocupMaxTotal) {
        add('ERROR', 'habitaciones', 'OCUP_INCOHERENTE',
            hb.cod + ': ocup_max_adultos (' + hb.ocupMaxAdultos +
            ') mayor que ocup_max_total (' + hb.ocupMaxTotal + ').');
      }
      if (hb.ocupMinFisica > hb.ocupMaxTotal) {
        add('ERROR', 'habitaciones', 'OCUP_INCOHERENTE',
            hb.cod + ': ocup_min_fisica mayor que ocup_max_total.');
      }
      var htl = cat.hoteles[hb.hotel];
      if (hb.permiteSingle && !hb.suplementoSingle) {
        add('ADVERTENCIA', 'habitaciones', 'SUPL_CERO',
            hb.cod + ': permite single pero el suplemento es 0.');
      }
      if (htl && htl.modoTarifa === 'POR_HABITACION' && hb.permiteSingle) {
        add('ADVERTENCIA', 'habitaciones', 'SINGLE_IRRELEVANTE',
            hb.hotel + ' / ' + hb.cod + ': el hotel cobra POR_HABITACION, ' +
            'asi que permite_single no tiene efecto. Pongalo en NO.');
      }
      if (!hb.permiteSingle && hb.suplementoSingle) {
        add('ADVERTENCIA', 'habitaciones', 'SUPL_MUERTO',
            hb.hotel + ' / ' + hb.cod + ': tiene suplemento_single = ' +
            hb.suplementoSingle + ' pero permite_single = NO, asi que nunca se cobra.');
      }
      if (hb.paxMinCobrados !== null && hb.paxMinCobrados > hb.ocupMaxTotal) {
        add('ERROR', 'habitaciones', 'PAXMIN_INCOHERENTE',
            hb.cod + ': pax_min_cobrados mayor que la ocupacion maxima.');
      }
    });

    // --- Servicios adicionales ------------------------------------------------
    var TIPOS_EXTRA = ['POR_PERSONA_ESTADIA', 'POR_PERSONA_DIA'];
    Object.keys(cat.extras || {}).forEach(function (h) {
      if (!cat.hoteles[h]) {
        add('ADVERTENCIA', 'extras', 'HOTEL_INACTIVO',
            'Hay servicios cargados para ' + h + ', que no esta activo.');
        return;
      }
      var vistos = {};
      cat.extras[h].forEach(function (x) {
        if (vistos[x.cod]) {
          add('ERROR', 'extras', 'EXTRA_DUPLICADO',
              h + ' / ' + x.cod + ': hay dos servicios con el mismo codigo.');
        }
        vistos[x.cod] = true;

        if (TIPOS_EXTRA.indexOf(x.tipo) === -1) {
          add('ERROR', 'extras', 'TIPO_DESCONOCIDO',
              h + ' / ' + x.cod + ': tipo "' + x.tipo + '" no reconocido. Use ' +
              TIPOS_EXTRA.join(' o ') + '.');
        }
        // Un servicio en cero se marca y no cobra nada: la asesora lo ofrece y
        // el cliente no lo ve en el total. Mejor darlo de baja.
        if (!(x.monto > 0)) {
          add('ERROR', 'extras', 'MONTO_INVALIDO',
              h + ' / ' + x.cod + ': el monto es ' + x.monto +
              '. Un servicio activo tiene que cobrar algo.');
        }
        if (!x.nombre) {
          add('ERROR', 'extras', 'SIN_NOMBRE',
              h + ' / ' + x.cod + ': sin nombre, saldria en blanco en el mensaje.');
        }
      });
    });

    // Una plantilla sin el marcador de servicios los cobra sin mencionarlos:
    // el cliente ve un total mas alto y ninguna explicacion.
    Object.keys(cat.extras || {}).forEach(function (h) {
      if (!cat.hoteles[h] || !cat.extras[h].length) return;
      var pl = cat.plantillas[h] || cat.plantillas['*'] || '';
      if (pl && pl.indexOf('{{BLOQUE_EXTRAS}}') === -1) {
        add('ADVERTENCIA', 'plantillas', 'SIN_BLOQUE_EXTRAS',
            h + ': tiene servicios adicionales pero su plantilla no incluye ' +
            '{{BLOQUE_EXTRAS}}. Se cobrarian sin aparecer en el mensaje.');
      }
    });

    if (!out.length) add('OK', '-', 'SIN_HALLAZGOS', 'El catalogo no presenta problemas.');
    return out;
  }

  /**
   * Combinaciones habitacion x temporada que no tienen tarifa cargada.
   * La pantalla de administracion las usa para ofrecer las filas a completar.
   */
  function tarifasFaltantes(cat) {
    var nuevas = [];
    Object.keys(cat.habitaciones).forEach(function (k) {
      var hab = cat.habitaciones[k];
      cat.temporadas.filter(function (t) { return t.hotel === hab.hotel; })
        .forEach(function (t) {
          if (!cat.tarifas[hab.hotel + '|' + hab.cod + '|' + t.cod]) {
            nuevas.push({ hotel: hab.hotel, cod_hab: hab.cod, cod_temp: t.cod,
                          tarifa_pp_noche: '', tarifa_nino_override: '' });
          }
        });
    });
    nuevas.sort(function (a, b) {
      return a.hotel.localeCompare(b.hotel) ||
             a.cod_hab.localeCompare(b.cod_hab) ||
             a.cod_temp.localeCompare(b.cod_temp);
    });
    return nuevas;
  }

  /** Cuenta hallazgos por severidad: { ERROR: n, ADVERTENCIA: n, OK: n }. */
  function resumir(hallazgos) {
    var r = { ERROR: 0, ADVERTENCIA: 0, OK: 0 };
    hallazgos.forEach(function (h) { r[h[0]] = (r[h[0]] || 0) + 1; });
    return r;
  }

  return { validar: validar, tarifasFaltantes: tarifasFaltantes, resumir: resumir };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Validador;
