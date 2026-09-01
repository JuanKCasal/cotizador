/**
 * COTIZADOR HESPERIA - catalogo.js
 * Carga los archivos de datos/ y arma el objeto `catalogo` que consume el motor.
 *
 * Reemplaza a 01_Catalogo.gs, que leia hojas de Google Sheets. La forma del
 * objeto que devuelve es identica: el motor no se entero del cambio.
 *
 * ES5 a proposito, igual que motor.js.
 */
var Catalogo = (function () {
  'use strict';

  var TABLAS = ['config', 'hoteles', 'habitaciones', 'temporadas', 'tarifas',
                'stop-sales', 'politica-ninos', 'promociones', 'cargos-fecha',
                'plantillas'];

  // ==========================================================================
  // NORMALIZADORES
  // ==========================================================================

  /**
   * Fechas: solo ISO YYYY-MM-DD, sin excepciones.
   *
   * En el Sheet esto era tolerante y aceptaba dd/MM/yy, porque Google
   * reformateaba las celdas por su cuenta. Esa tolerancia escondio un cierre de
   * venta escrito "18/09/26" que nunca bloqueo nada: enRango() compara strings,
   * y '20/09/26' >= '2026-09-19' es false. No fallaba, simplemente no aplicaba.
   *
   * Con los datos en JSON nadie los reformatea, asi que la tolerancia solo
   * puede volver a esconder un error de tipeo. Ahora se rechaza y se ve.
   */
  function fecha(v, contexto) {
    if (v === '' || v === null || v === undefined) return '';
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    throw new Error('Fecha invalida en ' + contexto + ': "' + s +
                    '". Debe ser YYYY-MM-DD.');
  }

  /** Acepta el booleano del JSON y el "SI"/"NO" heredado del Sheet. */
  function siNo(v) {
    if (typeof v === 'boolean') return v;
    return String(v).trim().toUpperCase() === 'SI';
  }

  function num(v) {
    return (v === '' || v === null || v === undefined) ? null : Number(v);
  }

  /**
   * Parser tolerante de dias_semana.
   *
   * En Sheets, una columna mal formateada convertia "5,6" en el numero 5.6 y
   * la promocion dejaba de aplicarse sin dar ningun error. Los JSON no tienen
   * ese problema, pero quien edite el catalogo a mano puede escribir "5;6",
   * "5 6" o 5.6 igual. Sigue tolerando todas esas formas.
   *
   * Acepta: "5,6"  "5;6"  "5 6"  5.6  [5,6]  ""  ->  [5,6] / []
   */
  function parseDias(v) {
    if (v === '' || v === null || v === undefined) return [];
    if (Object.prototype.toString.call(v) === '[object Array]') {
      return v.map(Number).filter(function (n) { return !isNaN(n) && n >= 1 && n <= 7; });
    }
    return String(v).trim()
      .split(/[,;.\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter(function (n) { return !isNaN(n) && n >= 1 && n <= 7; });
  }

  // ==========================================================================
  // CONSTRUCCION DEL CATALOGO
  // ==========================================================================
  /**
   * @param {Object} crudo  { config, hoteles, habitaciones, ... } tal como
   *                        vienen los archivos de datos/.
   */
  function construir(crudo) {
    var config = crudo.config || {};

    var hoteles = {};
    (crudo.hoteles || []).filter(function (r) { return siNo(r.activo); })
      .forEach(function (r) {
        hoteles[r.codigo] = {
          codigo: r.codigo, nombre: r.nombre_display, emojis: r.emojis_titulo,
          horaIn: r.hora_checkin, horaOut: r.hora_checkout,
          formatoFecha: String(r.formato_fecha || 'dd/MM/yy').trim(),
          modoTarifa: String(r.modo_tarifa || 'POR_PERSONA').trim().toUpperCase(),
          formatoOcupantes: String(r.formato_ocupantes || 'INLINE').trim().toUpperCase(),
          deposito: Number(r.deposito_toallas), labelDeposito: r.label_deposito,
          earlyPP: Number(r.early_checkin_pp), latePP: Number(r.late_checkout_pp),
          horaLate: r.hora_late_checkout, vipDia: Number(r.brazalete_vip_dia)
        };
      });

    var habitaciones = {};
    (crudo.habitaciones || []).filter(function (r) { return siNo(r.activo); })
      .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
      .forEach(function (r) {
        habitaciones[r.hotel + '|' + r.cod_hab] = {
          hotel: r.hotel, cod: r.cod_hab, categoria: r.categoria, ocupacion: r.ocupacion,
          atributo: r.atributo || '', nombre: r.nombre_display,
          ocupMinFisica: Number(r.ocup_min_fisica) || 1,
          ocupMaxTotal: Number(r.ocup_max_total),
          ocupMaxAdultos: Number(r.ocup_max_adultos),
          permiteSingle: siNo(r.permite_single),
          suplementoSingle: Number(r.suplemento_single) || 0,
          paxMinCobrados: num(r.pax_min_cobrados),
          orden: Number(r.orden)
        };
      });

    var temporadas = (crudo.temporadas || []).map(function (r, i) {
      var ctx = 'temporadas.json[' + i + '] ' + r.hotel + '/' + r.cod_temp;
      return {
        hotel: r.hotel, cod: r.cod_temp, nombre: r.nombre,
        inicio: fecha(r.fecha_inicio, ctx + '.fecha_inicio'),
        fin: fecha(r.fecha_fin, ctx + '.fecha_fin'),
        prioridad: Number(r.prioridad) || 0
      };
    });

    var tarifas = {}; // hotel|cod_hab|cod_temp -> {tarifa, ninoOverride}
    (crudo.tarifas || []).forEach(function (r) {
      if (r.tarifa_pp_noche === '' || r.tarifa_pp_noche === null) return;
      tarifas[r.hotel + '|' + r.cod_hab + '|' + r.cod_temp] = {
        tarifa: Number(r.tarifa_pp_noche),
        ninoOverride: num(r.tarifa_nino_override)
      };
    });

    // Cierres de venta. Lista plana: son pocos y se recorren una vez por noche.
    // La clave no puede ser hotel|fecha porque un cierre abarca un rango y
    // puede convivir con otro de distinto alcance.
    var stopSales = (crudo['stop-sales'] || [])
      .filter(function (r) { return siNo(r.activo); })
      .map(function (r, i) {
        var ctx = 'stop-sales.json[' + i + '] ' + r.hotel;
        return {
          hotel: r.hotel,
          codHab: String(r.cod_hab || 'TODAS').trim() || 'TODAS',
          inicio: fecha(r.fecha_inicio, ctx + '.fecha_inicio'),
          fin: fecha(r.fecha_fin, ctx + '.fecha_fin'),
          motivo: String(r.motivo || '').trim()
        };
      })
      .filter(function (r) { return r.inicio && r.fin; });

    var politica = {}; // hotel -> [rangos]
    (crudo['politica-ninos'] || [])
      .slice()
      .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
      .forEach(function (r) {
        if (!politica[r.hotel]) politica[r.hotel] = [];
        politica[r.hotel].push({
          cod: r.cod_rango, edadMin: Number(r.edad_min), edadMax: Number(r.edad_max),
          sing: r.etiqueta_sing, plur: r.etiqueta_plur, rango: r.etiqueta_rango,
          factor: Number(r.factor_pago), cuentaOcupacion: siNo(r.cuenta_ocupacion),
          categoriaCargo: String(r.categoria_cargo || 'NINO').toUpperCase(),
          orden: Number(r.orden)
        });
      });

    var promociones = (crudo.promociones || [])
      .filter(function (r) { return siNo(r.activo); })
      .map(function (r, i) {
        var ctx = 'promociones.json[' + i + '] ' + r.cod_promo;
        return {
          hotel: r.hotel, cod: r.cod_promo, nombre: r.nombre,
          inicio: fecha(r.vig_inicio, ctx + '.vig_inicio'),
          fin: fecha(r.vig_fin, ctx + '.vig_fin'),
          codHab: String(r.cod_hab || 'TODAS').trim() || 'TODAS',
          tipo: String(r.tipo).trim().toUpperCase(),
          valor: Number(r.valor),
          minNoches: Number(r.min_noches) || 0,
          diasSemana: parseDias(r.dias_semana),
          diasSemanaCrudo: r.dias_semana,
          mensaje: String(r.mensaje || '').trim(),
          prioridad: Number(r.prioridad) || 0
        };
      });

    var cargos = {}; // hotel|fecha -> cargo
    (crudo['cargos-fecha'] || []).forEach(function (r, i) {
      var f = fecha(r.fecha, 'cargos-fecha.json[' + i + '].fecha');
      cargos[r.hotel + '|' + f] = {
        nombre: r.nombre,
        ADULTO: Number(r.monto_adulto) || 0,
        NINO: Number(r.monto_nino) || 0,
        INFANTE: Number(r.monto_infante) || 0,
        obligatorio: siNo(r.obligatorio)
      };
    });

    var plantillas = {};
    (crudo.plantillas || []).forEach(function (r) { plantillas[r.hotel] = r.plantilla; });

    return {
      config: config, hoteles: hoteles, habitaciones: habitaciones,
      temporadas: temporadas, tarifas: tarifas, stopSales: stopSales,
      politica: politica, promociones: promociones, cargos: cargos,
      plantillas: plantillas,
      generado: new Date().toISOString()
    };
  }

  // ==========================================================================
  // CARGA
  // ==========================================================================
  /**
   * Descarga las diez tablas y devuelve el catalogo ya construido.
   *
   * La version de tarifas va como parametro de la URL para que un despliegue
   * nuevo no quede escondido detras de la cache del navegador. Sin eso, la
   * asesora podria seguir cotizando con precios viejos despues de publicar.
   *
   * @param {string} base    prefijo de los archivos, por defecto 'datos/'
   * @param {string} version se agrega como ?v= para romper la cache
   * @returns {Promise<Object>}
   */
  function cargar(base, version) {
    base = base || 'datos/';
    var sufijo = version ? ('?v=' + encodeURIComponent(version)) : '';

    return Promise.all(TABLAS.map(function (t) {
      var url = base + t + '.json' + sufijo;
      return fetch(url, { cache: 'no-cache' }).then(function (res) {
        if (!res.ok) {
          throw new Error('No se pudo leer ' + t + '.json (' + res.status + ')');
        }
        return res.json();
      });
    })).then(function (partes) {
      var crudo = {};
      TABLAS.forEach(function (t, i) { crudo[t] = partes[i]; });
      return construir(crudo);
    });
  }

  return {
    cargar: cargar,
    construir: construir,
    TABLAS: TABLAS,
    _interno: { fecha: fecha, siNo: siNo, num: num, parseDias: parseDias }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Catalogo;
