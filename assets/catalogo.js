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
                'plantillas', 'adicionales', 'extras', 'asesoras'];

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
          nombreCorto: String(r.nombre_corto || r.nombre_display).trim(),
          horaIn: r.hora_checkin, horaOut: r.hora_checkout,
          formatoFecha: String(r.formato_fecha || 'dd/MM/yy').trim(),
          modoTarifa: String(r.modo_tarifa || 'POR_PERSONA').trim().toUpperCase(),
          formatoOcupantes: String(r.formato_ocupantes || 'INLINE').trim().toUpperCase(),
          deposito: Number(r.deposito_toallas), labelDeposito: r.label_deposito,
          horaLate: r.hora_late_checkout
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

    /**
     * hotel|cod_hab|cod_temp -> { tarifa, ninoOverride, porPax, paxOrdenados }
     *
     * `pax` vacio: una sola tarifa, sin importar cuantos se alojen. Es el caso
     * de los hoteles de playa, donde la tarifa es por persona y multiplicarla
     * ya refleja la ocupacion.
     *
     * `pax` con numero: una fila por ocupacion. Los hoteles de ciudad cobran
     * por habitacion y el precio cambia segun cuantos duerman en ella: la
     * Deluxe King de Valencia son $160 con un huesped y $180 con dos. Sin esta
     * dimension habria que inventar un tipo de habitacion por ocupacion.
     */
    var tarifas = {};
    (crudo.tarifas || []).forEach(function (r) {
      if (r.tarifa_pp_noche === '' || r.tarifa_pp_noche === null) return;
      var k = r.hotel + '|' + r.cod_hab + '|' + r.cod_temp;
      if (!tarifas[k]) {
        tarifas[k] = { tarifa: null, ninoOverride: null, porPax: {}, paxOrdenados: [] };
      }
      var monto = Number(r.tarifa_pp_noche);
      var pax = num(r.pax);
      if (pax === null) {
        tarifas[k].tarifa = monto;
        tarifas[k].ninoOverride = num(r.tarifa_nino_override);
      } else {
        tarifas[k].porPax[pax] = monto;
      }
    });
    Object.keys(tarifas).forEach(function (k) {
      tarifas[k].paxOrdenados = Object.keys(tarifas[k].porPax)
        .map(Number)
        .sort(function (a, b) { return a - b; });
    });

    /**
     * hotel|cod_hab -> [ {edadMin, edadMax, monto, etiqueta} ]
     *
     * Lo que paga cada huesped por encima de la ocupacion que cubre la tarifa.
     * En Maracay una Deluxe Twin son $144 por dos personas y admite dos mas,
     * a $20 si pasan de 10 anos y $10 entre 3 y 9.
     */
    var adicionales = {};
    (crudo.adicionales || []).forEach(function (r) {
      var k = r.hotel + '|' + String(r.cod_hab || 'TODAS').trim();
      if (!adicionales[k]) adicionales[k] = [];
      adicionales[k].push({
        edadMin: Number(r.edad_min), edadMax: Number(r.edad_max),
        monto: Number(r.monto_noche),
        etiqueta: String(r.etiqueta || 'persona adicional').trim()
      });
    });
    Object.keys(adicionales).forEach(function (k) {
      adicionales[k].sort(function (a, b) { return a.edadMin - b.edadMin; });
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
          // MENOR_GRATIS nombra un rango de la politica de ninos, no unas
          // edades: NIN es 5-9 en Morrocoy y 5-10 en Margarita, y quien manda
          // sobre eso es el hotel. Asi la misma promocion sirve en los tres
          // sin repetir edades en la fila.
          rangoMenor: String(r.rango_menor || '').trim().toUpperCase(),
          minAdultos: Number(r.min_adultos) || 0,
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

    /**
     * hotel -> [ servicios que se pueden agregar a la cotizacion ]
     *
     * Early check-in, late check-out y el brazalete VIP eran columnas de la
     * tabla de hoteles y solo salian como texto informativo. Son servicios que
     * se venden, no atributos del hotel: como tabla se pueden cobrar, activar
     * y desactivar sin tocar el codigo, y agregar uno nuevo es una fila.
     */
    var extras = {};
    (crudo.extras || [])
      .filter(function (r) { return siNo(r.activo); })
      .slice()
      .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
      .forEach(function (r) {
        if (!extras[r.hotel]) extras[r.hotel] = [];
        extras[r.hotel].push({
          hotel: r.hotel, cod: r.cod_extra, nombre: r.nombre,
          detalle: String(r.detalle || '').trim(),
          tipo: String(r.tipo || 'POR_PERSONA_ESTADIA').trim().toUpperCase(),
          monto: Number(r.monto) || 0,
          aplicaFactorNinos: siNo(r.aplica_factor_ninos),
          orden: Number(r.orden) || 0
        });
      });

    /**
     * hotel|asesor -> plantilla, con la del hotel bajo la clave hotel|.
     *
     * Cada asesora escribe distinto, y el mensaje sale con sus iniciales: que
     * lo firme una y suene a otra es raro para el cliente que ya habia hablado
     * con ella. Quien no tenga juego propio usa el del hotel.
     */
    var plantillas = {};
    (crudo.plantillas || []).forEach(function (r) {
      plantillas[r.hotel + '|' + String(r.asesor || '').trim().toUpperCase()] = r.plantilla;
    });

    var asesoras = (crudo.asesoras || [])
      .filter(function (r) { return siNo(r.activo); })
      .map(function (r) {
        return {
          iniciales: String(r.iniciales || '').trim().toUpperCase(),
          nombre: String(r.nombre || '').trim()
        };
      });

    return {
      config: config, hoteles: hoteles, habitaciones: habitaciones,
      temporadas: temporadas, tarifas: tarifas, stopSales: stopSales,
      politica: politica, promociones: promociones, cargos: cargos,
      plantillas: plantillas, adicionales: adicionales, extras: extras,
      asesoras: asesoras,
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
