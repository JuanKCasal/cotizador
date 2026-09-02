/**
 * COTIZADOR HESPERIA — 08_Logica.html
 * Estado de la SPA, cascada de habitaciones, calculo en vivo y copiado.
 * El calculo corre en el cliente con el mismo Motor que usa el servidor.
 */
(function () {
  'use strict';

  var CAT = null;
  var ULTIMO = null;      // ultimo resultado del motor
  var TEXTO = '';         // ultimo texto renderizado
  var secuencia = 0;

  var estado = {
    hotel: '',
    checkin: '',
    checkout: '',
    lineas: [],
    promos: [],
    extras: [],
    cliente: '',
    asesor: ''
  };

  var $ = function (id) { return document.getElementById(id); };

  /**
   * Asigna una fecha verificando que el navegador la haya aceptado.
   *
   * Algunos selectores nativos moviles rechazan en silencio un valor que
   * choca con un `min`/`max` recien asignado: la propiedad queda en cadena
   * vacia y el campo aparece en blanco. Si eso ocurre, se levanta la
   * restriccion, se asigna y se restaura.
   */
  function fijarFecha(input, iso) {
    input.value = iso;
    if (input.value === iso) return true;

    var min = input.min, max = input.max;
    input.min = ''; input.max = '';
    input.value = iso;
    input.min = min; input.max = max;
    return input.value === iso;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ==========================================================================
  // ARRANQUE
  // ==========================================================================
  function iniciar() {
    Catalogo.cargar()
      .then(function (cat) {
        CAT = cat;
        estado.asesor = leerIniciales(cat);
        montar();
      })
      .catch(function (err) {
        $('cargandoTexto').textContent =
          'No se pudieron cargar las tarifas: ' + err.message;
      });
  }

  /**
   * Iniciales de la asesora. El valor de config llena el campo desde el primer
   * arranque; solo se pisa si alguien escribio otras iniciales en este
   * navegador. Antes vivia en PropertiesService, del lado del servidor.
   */
  function leerIniciales(cat) {
    var porDefecto = 'MZ';
    try {
      if (cat && cat.config && cat.config.INICIALES_POR_DEFECTO) {
        porDefecto = String(cat.config.INICIALES_POR_DEFECTO).trim().toUpperCase();
      }
    } catch (e) { /* se queda con MZ */ }
    try {
      return localStorage.getItem('iniciales') || porDefecto;
    } catch (e) {
      return porDefecto;  // navegador con el almacenamiento bloqueado
    }
  }

  function guardarIniciales(v) {
    try {
      localStorage.setItem('iniciales', String(v || '').trim().slice(0, 4).toUpperCase());
    } catch (e) { /* no es critico */ }
  }

  function montar() {
    $('asesor').value = estado.asesor;
    $('version').textContent = 'Tarifas ' + (CAT.config.VERSION_TARIFAS || '');
    renderHoteles();
    conectarEventos();
    if (window.innerWidth >= 900) calcMontar();
    $('cargando').classList.add('oculto');
    $('app').classList.remove('oculto');
  }

  // ==========================================================================
  // CATALOGO: helpers de consulta
  // ==========================================================================
  function habsDe(hotel) {
    return Object.keys(CAT.habitaciones)
      .map(function (k) { return CAT.habitaciones[k]; })
      .filter(function (h) { return h.hotel === hotel; })
      .sort(function (a, b) { return a.orden - b.orden; });
  }

  function unicos(lista, campo) {
    var vistos = {}, out = [];
    lista.forEach(function (x) {
      if (!vistos[x[campo]]) { vistos[x[campo]] = true; out.push(x[campo]); }
    });
    return out;
  }

  function rangosDe(hotel) {
    return (CAT.politica[hotel] || []).slice()
      .sort(function (a, b) { return a.edadMin - b.edadMin; });
  }

  function habDeLinea(l) {
    var c = habsDe(estado.hotel).filter(function (h) {
      return h.categoria === l.categoria && h.ocupacion === l.ocupacion &&
             (h.atributo || '') === (l.atributo || '');
    });
    return c[0] || null;
  }

  /** Ajusta ocupacion y atributo a la primera opcion valida de la categoria. */
  function normalizarLinea(l) {
    var habs = habsDe(estado.hotel);
    if (!habs.length) return;

    var cats = unicos(habs, 'categoria');
    if (cats.indexOf(l.categoria) === -1) l.categoria = cats[0];

    var porCat = habs.filter(function (h) { return h.categoria === l.categoria; });
    var ocups = unicos(porCat, 'ocupacion');
    if (ocups.indexOf(l.ocupacion) === -1) l.ocupacion = ocups[0];

    var porOcup = porCat.filter(function (h) { return h.ocupacion === l.ocupacion; });
    var atrs = unicos(porOcup, 'atributo');
    if (atrs.indexOf(l.atributo || '') === -1) l.atributo = atrs[0] || '';

    // Las edades NO se tocan al cambiar de hotel: una edad es una edad. Lo que
    // cambia entre hoteles es a que rango cae, y de eso se encarga el motor.
    if (!l.edades) l.edades = [];
  }

  function nuevaLinea() {
    var l = { id: ++secuencia, categoria: '', ocupacion: '', atributo: '',
              cantidad: 1, adultos: 2, edades: [] };
    normalizarLinea(l);
    return l;
  }

  /** Rango de la politica del hotel al que cae una edad. null si no cae. */
  function rangoDeEdad(edad) {
    var rs = rangosDe(estado.hotel);
    for (var i = 0; i < rs.length; i++) {
      if (edad >= rs[i].edadMin && edad <= rs[i].edadMax) return rs[i];
    }
    return null;
  }

  function textoFactor(f) {
    return f === 0 ? 'no paga' : f === 1 ? 'tarifa completa'
                                         : Math.round(f * 100) + '% de la tarifa';
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  function renderHoteles() {
    var cont = $('hoteles');
    cont.innerHTML = '';
    Object.keys(CAT.hoteles).forEach(function (cod) {
      var h = CAT.hoteles[cod];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hotel-op';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', estado.hotel === cod ? 'true' : 'false');
      b.dataset.hotel = cod;
      b.innerHTML =
        '<span class="hotel-sigla">' + esc(cod) + '</span>' +
        '<span class="hotel-nombre">' + esc(nombreCorto(h.nombre)) + '</span>';
      cont.appendChild(b);
    });
  }

  function nombreCorto(n) {
    return String(n).replace(/^HOTEL\s+HESPERIA\s+/i, '');
  }

  function renderLineas() {
    var cont = $('lineas');
    cont.innerHTML = '';
    if (!estado.hotel) {
      cont.innerHTML = '<p class="pista">Selecciona un hotel para elegir habitaciones.</p>';
      return;
    }
    estado.lineas.forEach(function (l, i) {
      cont.appendChild(nodoLinea(l, i));
    });
  }

  function nodoLinea(l, i) {
    var div = document.createElement('div');
    div.className = 'hab';
    div.dataset.id = l.id;
    div.innerHTML = htmlLinea(l, i);
    return div;
  }

  function htmlLinea(l, i) {
    var habs = habsDe(estado.hotel);
    var cats = unicos(habs, 'categoria');
    var porCat = habs.filter(function (h) { return h.categoria === l.categoria; });
    var ocups = unicos(porCat, 'ocupacion');
    var porOcup = porCat.filter(function (h) { return h.ocupacion === l.ocupacion; });
    var atrs = unicos(porOcup, 'atributo');
    var hab = habDeLinea(l);

    var h = [];
    h.push('<div class="hab-cabecera">');
    h.push('<span class="hab-indice">Habitación ' + (i + 1) + '</span>');
    if (estado.lineas.length > 1) {
      h.push('<button type="button" class="hab-quitar" data-act="quitar">Quitar</button>');
    }
    h.push('</div>');

    h.push('<div class="hab-selects">');
    h.push(select('categoria', 'Categoría', cats, l.categoria));
    h.push(select('ocupacion', 'Ocupación', ocups, l.ocupacion, ocups.length < 2));
    if (atrs.length > 1) {
      h.push(select('atributo', 'Vista', atrs, l.atributo, false,
                    function (v) { return v || 'Estándar'; }));
    }
    h.push('</div>');

    h.push('<div class="hab-conteos">');
    h.push(conteo('cantidad', 'Habitaciones', 'iguales a esta', l.cantidad, 1, 20));
    h.push(conteo('adultos', 'Adultos', hab ? 'máx. ' + hab.ocupMaxAdultos : '',
                  l.adultos, 0, hab ? hab.ocupMaxAdultos : 9));
    h.push(conteo('menores', 'Menores de 18', 'se indica la edad de cada uno',
                  l.edades.length, 0, 9));
    h.push('</div>');

    h.push(htmlEdades(l));

    if (hab) {
      h.push('<p class="pista">' + esc(hab.nombre) + ' · hasta ' + hab.ocupMaxTotal +
             ' huésped' + (hab.ocupMaxTotal === 1 ? '' : 'es') +
             (hab.permiteSingle ? ' · suplemento individual $' + hab.suplementoSingle : '') +
             '</p>');
    }
    return h.join('');
  }

  /**
   * Un selector de edad por menor. Arranca VACIO a proposito: la asesora tiene
   * que declarar la edad real, no aceptar un valor por defecto que despues
   * termina impreso en el mensaje del cliente.
   */
  function htmlEdades(l) {
    if (!l.edades.length) return '';
    var h = ['<div class="edades">'];
    l.edades.forEach(function (edad, i) {
      var op = ['<option value=""' + (edad === '' ? ' selected' : '') + '>— edad —</option>'];
      for (var e = 0; e <= 17; e++) {
        var r = rangoDeEdad(e);
        op.push('<option value="' + e + '"' + (String(edad) === String(e) ? ' selected' : '') +
                '>' + e + (e === 1 ? ' año' : ' años') +
                (r ? ' · ' + textoFactor(r.factor) : '') + '</option>');
      }
      h.push('<label class="campo campo-edad">' +
               '<span class="campo-etiqueta">Menor ' + (i + 1) + '</span>' +
               '<select class="select" data-campo="edad" data-idx="' + i + '">' +
                 op.join('') +
               '</select>' +
             '</label>');
    });
    h.push('</div>');
    h.push('<p class="pista">' + esc(leyendaRangos()) + '</p>');
    return h.join('');
  }

  function leyendaRangos() {
    return rangosDe(estado.hotel).map(function (r) {
      return r.rango + ': ' + textoFactor(r.factor);
    }).join(' · ');
  }

  function select(campo, etiqueta, opciones, valor, unica, formato) {
    var f = formato || function (v) { return v; };
    var o = opciones.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === valor ? ' selected' : '') + '>' +
             esc(f(v)) + '</option>';
    }).join('');
    return '<label class="campo">' +
             '<span class="campo-etiqueta">' + esc(etiqueta) + '</span>' +
             '<select class="select" data-campo="' + campo + '"' +
             (unica ? ' disabled' : '') + '>' + o + '</select>' +
           '</label>';
  }

  function conteo(campo, nombre, detalle, valor, min, max) {
    return '<div class="conteo">' +
             '<span class="conteo-etiqueta">' +
               '<span class="conteo-nombre">' + esc(nombre) + '</span>' +
               (detalle ? '<span class="conteo-detalle">' + esc(detalle) + '</span>' : '') +
             '</span>' +
             '<span class="paso" data-campo="' + campo + '" data-min="' + min +
                   '" data-max="' + max + '">' +
               '<button type="button" class="paso-btn" data-paso="-1"' +
                 (valor <= min ? ' disabled' : '') + ' aria-label="Restar">−</button>' +
               '<span class="paso-valor" data-cero="' + (valor ? 'no' : 'si') + '">' +
                 valor + '</span>' +
               '<button type="button" class="paso-btn" data-paso="1"' +
                 (valor >= max ? ' disabled' : '') + ' aria-label="Sumar">+</button>' +
             '</span>' +
           '</div>';
  }

  function renderPromos() {
    var cont = $('promos');
    var seccion = $('seccionPromos');
    var aplicables = promosAplicables();

    // La seccion se oculta solo si aun no hay hotel y fechas. Con fechas ya
    // elegidas se muestra siempre, aunque no haya promos vigentes: si se
    // ocultara, la asesora no sabria si la funcion existe o si el hotel
    // simplemente no tiene promociones en ese rango.
    var listo = estado.hotel && estado.checkin && estado.checkout &&
                estado.checkout > estado.checkin;
    if (!listo) {
      seccion.classList.add('oculto');
      cont.innerHTML = '';
      return;
    }
    seccion.classList.remove('oculto');
    if (!aplicables.length) {
      cont.innerHTML = '<p class="pista">No hay promociones vigentes para estas fechas.</p>';
      return;
    }
    cont.innerHTML = aplicables.map(function (p) {
      var sel = estado.promos.indexOf(p.cod) !== -1;
      var det = p.tipo === 'SUSTITUYE' ? 'Tarifa especial de $' + p.valor + ' por persona'
              : p.tipo === 'DESCUENTO_PCT' ? p.valor + '% de descuento'
              : '$' + p.valor + ' de descuento por persona';
      if (p.minNoches > 1) det += ' · mínimo ' + p.minNoches + ' noches';
      if (p.mensaje) det += ' · ' + p.mensaje;
      return '<button type="button" class="promo-op" data-promo="' + esc(p.cod) + '"' +
               ' role="checkbox" aria-checked="' + sel + '">' +
               '<span class="promo-marca">' + (sel ? '✓' : '') + '</span>' +
               '<span>' +
                 '<span class="promo-nombre">' + esc(p.nombre) + '</span>' +
                 '<span class="promo-detalle">' + esc(det) + '</span>' +
               '</span>' +
             '</button>';
    }).join('');
  }

  /**
   * Servicios adicionales del hotel.
   *
   * Se muestran una vez elegido el hotel, sin esperar a las fechas: el precio
   * no depende de ellas -salvo el que se cobra por dia- y la asesora suele
   * preguntar por el early check-in antes de cerrar la estadia.
   */
  function renderExtras() {
    var cont = $('extras');
    var seccion = $('seccionExtras');
    var lista = (CAT.extras && CAT.extras[estado.hotel]) || [];

    if (!estado.hotel || !lista.length) {
      seccion.classList.add('oculto');
      cont.innerHTML = '';
      return;
    }
    seccion.classList.remove('oculto');

    cont.innerHTML = lista.map(function (x) {
      var sel = estado.extras.indexOf(x.cod) !== -1;
      var det = '$' + x.monto + ' por persona' +
                (x.tipo === 'POR_PERSONA_DIA' ? ', por día' : '') +
                (x.detalle ? ' · ' + x.detalle : '');
      return '<button type="button" class="promo-op" data-extra="' + esc(x.cod) + '"' +
               ' role="checkbox" aria-checked="' + sel + '">' +
               '<span class="promo-marca">' + (sel ? '✓' : '') + '</span>' +
               '<span>' +
                 '<span class="promo-nombre">' + esc(x.nombre) + '</span>' +
                 '<span class="promo-detalle">' + esc(det) + '</span>' +
               '</span>' +
             '</button>';
    }).join('');
  }

  /** Promos del hotel cuya vigencia toca el rango de la estadia. */
  function promosAplicables() {
    if (!estado.hotel || !estado.checkin || !estado.checkout) return [];
    if (estado.checkout <= estado.checkin) return [];
    var ultima = Motor.Fechas.sumarDias(estado.checkout, -1);
    return CAT.promociones.filter(function (p) {
      return p.hotel === estado.hotel && p.inicio <= ultima && p.fin >= estado.checkin;
    });
  }

  // ==========================================================================
  // CALCULO EN VIVO
  // ==========================================================================
  function completo() {
    return !!(estado.hotel && estado.checkin && estado.checkout &&
              estado.checkout > estado.checkin && estado.lineas.length);
  }

  function recalcular() {
    // Noches entre fechas
    var puente = $('puenteNoches');
    if (estado.checkin && estado.checkout && estado.checkout > estado.checkin) {
      var n = Motor.Fechas.diffDias(estado.checkin, estado.checkout);
      puente.textContent = n + (n === 1 ? ' noche' : ' noches');
    } else {
      puente.textContent = '—';
    }
    avisoFechas();

    if (!completo()) {
      ULTIMO = null; TEXTO = '';
      pintarVacio('Selecciona hotel, fechas y habitación para ver el mensaje.');
      return;
    }

    var req = {
      hotel: estado.hotel,
      checkin: estado.checkin,
      checkout: estado.checkout,
      promos: estado.promos.slice(),
      extras: estado.extras.slice(),
      lineas: estado.lineas.map(function (l) {
        var hab = habDeLinea(l);
        return {
          cod_hab: hab ? hab.cod : '',
          cantidad: l.cantidad,
          adultos: l.adultos,
          edades: l.edades.slice()
        };
      })
    };

    var res;
    try {
      res = Motor.calcular(CAT, req);
    } catch (e) {
      ULTIMO = null; TEXTO = '';
      pintarErrores(['Error inesperado en el cálculo: ' + e.message]);
      return;
    }

    if (!res.ok) {
      ULTIMO = null; TEXTO = '';
      if (res.sinCupo && res.sinCupo.length) pintarSinCupo(res.sinCupo);
      else pintarErrores(res.errores);
      return;
    }

    ULTIMO = res;
    try {
      TEXTO = Motor.render(CAT, res, {
        asesorIniciales: estado.asesor,
        cliente: estado.cliente
      });
    } catch (e) {
      TEXTO = '';
      pintarErrores(['No se pudo armar el mensaje: ' + e.message]);
      return;
    }
    pintarMensaje(res, TEXTO);
  }

  function avisoFechas() {
    var p = $('pistaFechas');
    var hoy = new Date().toISOString().slice(0, 10);
    if (estado.checkin && estado.checkout && estado.checkout <= estado.checkin) {
      p.textContent = 'La salida debe ser posterior a la entrada.';
      p.className = 'pista alerta';
    } else if (estado.checkin && estado.checkin < hoy) {
      p.textContent = 'La fecha de entrada ya pasó. Verifica antes de enviar.';
      p.className = 'pista alerta';
    } else {
      var cierres = cierresDelRango(estado.hotel, estado.checkin, estado.checkout);
      if (cierres.length) {
        var todoElHotel = cierres.some(function (c) { return c.codHab === 'TODAS'; });
        p.textContent = todoElHotel
          ? 'Ojo: el hotel tiene noches cerradas en ese rango.'
          : 'Ojo: hay habitaciones cerradas en ese rango.';
        p.className = 'pista alerta';
      } else {
        p.textContent = 'La noche de salida no se cobra.';
        p.className = 'pista';
      }
    }
  }

  // ==========================================================================
  // PINTADO DEL MENSAJE
  // ==========================================================================
  function pintarVacio(msg) {
    $('burbuja').className = 'burbuja';
    $('burbuja').innerHTML = '<p class="burbuja-vacio">' + esc(msg) + '</p>';
    $('barraEtiqueta').textContent = 'Sin cotizar';
    $('barraMonto').textContent = '$ —';
    $('barraMonto').className = 'barra-monto apagado';
    habilitar(false);
    botonPanel('vacio');
  }

  function pintarErrores(errores) {
    $('burbuja').className = 'burbuja burbuja-error';
    $('burbuja').innerHTML =
      '<p class="sev sev-error"><span class="sev-marca" aria-hidden="true">!</span>' +
      'Error · no se puede cotizar</p>' +
      '<p class="burbuja-titulo">Falta resolver esto:</p><ul>' +
      errores.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
      '</ul>';
    $('barraEtiqueta').textContent = errores.length === 1
      ? '1 cosa por corregir' : errores.length + ' cosas por corregir';
    $('barraMonto').textContent = '$ —';
    $('barraMonto').className = 'barra-monto apagado';
    habilitar(false);
    botonPanel('error');
  }

  /**
   * No hay habitaciones. Es distinto de un error de datos y se dice distinto:
   * ahi no hay nada que corregir, hay que ofrecer otra cosa. Si se muestra con
   * la misma cara que "falta el nombre del cliente", la asesora pierde tiempo
   * buscando su propio error y termina prometiendo algo que no existe.
   */
  function pintarSinCupo(cierres) {
    var porMotivo = {};
    cierres.forEach(function (c) {
      var k = c.hab + '|' + c.motivo;
      if (!porMotivo[k]) porMotivo[k] = { hab: c.hab, motivo: c.motivo, noches: [] };
      porMotivo[k].noches.push(c.noche);
    });

    var filas = Object.keys(porMotivo).map(function (k) {
      var c = porMotivo[k];
      var fechas = c.noches.map(function (n) { return Motor.Fechas.fmtCorto(n); });
      return '<li><strong>' + esc(c.hab) + '</strong>: ' +
             (fechas.length === 1 ? 'la noche del ' : 'las noches del ') +
             esc(fechas.join(', ')) +
             (c.motivo ? ' — ' + esc(c.motivo) : '') + '</li>';
    });

    $('burbuja').className = 'burbuja burbuja-sincupo';
    $('burbuja').innerHTML =
      '<p class="sev sev-aviso"><span class="sev-marca" aria-hidden="true">!</span>' +
      'Sin disponibilidad</p>' +
      '<p class="burbuja-titulo">No hay disponibilidad</p><ul>' + filas.join('') +
      '</ul><p class="burbuja-pie">Prueba con otras fechas o con otro tipo de ' +
      'habitación. El precio no es el problema.</p>';
    $('barraEtiqueta').textContent = 'Sin disponibilidad';
    $('barraMonto').textContent = '$ —';
    $('barraMonto').className = 'barra-monto apagado';
    habilitar(false);
    botonPanel('error');
  }

  /**
   * Cierres de venta que tocan las fechas elegidas, para avisar ANTES de que
   * la asesora termine de armar la cotizacion.
   */
  function cierresDelRango(hotel, ci, co) {
    if (!hotel || !ci || !co || co <= ci) return [];
    var noches = Motor.Fechas.noches(ci, co);
    var vistos = {}, out = [];
    (CAT.stopSales || []).forEach(function (s) {
      if (s.hotel !== hotel) return;
      for (var i = 0; i < noches.length; i++) {
        if (noches[i] >= s.inicio && noches[i] <= s.fin) {
          var k = s.codHab + '|' + s.inicio + '|' + s.fin;
          if (!vistos[k]) { vistos[k] = true; out.push(s); }
          return;
        }
      }
    });
    return out;
  }

  function pintarMensaje(res, texto) {
    $('burbuja').className = 'burbuja';
    $('burbuja').innerHTML = aHtmlWhatsApp(texto);
    $('barraEtiqueta').textContent =
      res.nNoches + (res.nNoches === 1 ? ' noche' : ' noches') + ' · ' +
      res.totalHabitaciones + (res.totalHabitaciones === 1 ? ' habitación' : ' habitaciones');
    $('barraMonto').textContent = '$' + Motor.fmtMoney(CAT, res.total);
    $('barraMonto').className = 'barra-monto';
    habilitar(true);
    botonPanel('ok');
  }

  /** Copiar: solo con una cotizacion valida. */
  function habilitar(v) {
    $('btnCopiar').disabled = !v;
  }

  /**
   * El boton de la barra movil es la UNICA via para abrir el panel, y el panel
   * es donde se explican los errores. Si se deshabilita al haber errores, la
   * asesora ve "Revisa los datos" sin ninguna forma de saber que revisar.
   */
  function botonPanel(estadoPanel) {
    var b = $('btnVerMensaje');
    if (estadoPanel === 'vacio') {
      b.disabled = true;
      b.textContent = 'Ver mensaje';
      b.classList.remove('btn-alerta');
    } else if (estadoPanel === 'error') {
      b.disabled = false;
      b.textContent = 'Ver qué falta';
      b.classList.add('btn-alerta');
    } else {
      b.disabled = false;
      b.textContent = 'Ver mensaje';
      b.classList.remove('btn-alerta');
    }
  }

  /** Convierte el formato de WhatsApp a HTML solo para la vista previa. */
  function aHtmlWhatsApp(texto) {
    return esc(texto)
      .replace(/\*([^\s*][^*\n]*?)\*/g, '<strong>$1</strong>')
      .replace(/_([^\s_][^_\n]*?)_/g, '<em>$1</em>');
  }

  // ==========================================================================
  // COPIAR — tres niveles de respaldo
  // ==========================================================================
  function copiar() {
    if (!TEXTO) return;

    // Nivel 1: API moderna del portapapeles
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(TEXTO).then(
        function () { aviso('Mensaje copiado', 'exito'); },
        function () { copiarNivel2(); }
      );
      return;
    }
    copiarNivel2();
  }

  function copiarNivel2() {
    try {
      var ta = document.createElement('textarea');
      ta.value = TEXTO;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, TEXTO.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) { aviso('Mensaje copiado', 'exito'); return; }
    } catch (e) { /* cae al nivel 3 */ }
    copiarNivel3();
  }

  function copiarNivel3() {
    // Ultimo recurso: pase lo que pase, el modal DEBE abrirse con el texto
    // dentro. Cada paso decorativo va aislado para que un fallo en el mensaje
    // de ayuda no impida mostrar el mensaje que hay que copiar.
    var ta = $('modalCopiaTexto');
    var modal = $('modalCopia');
    if (!ta || !modal) { alert(TEXTO); return; }

    ta.value = TEXTO;
    modal.classList.remove('oculto');

    try {
      $('modalCopiaPista').innerHTML = esMovil()
        ? 'El texto ya está seleccionado. Mantén presionado y elige <strong>Copiar</strong>.'
        : 'El texto ya está seleccionado. Presiona <strong>Ctrl + C</strong> ' +
          '(o <strong>⌘ + C</strong> en Mac).';
    } catch (e) { /* la pista es opcional; el texto ya esta visible */ }

    setTimeout(function () {
      try {
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, TEXTO.length);
      } catch (e) { /* la seleccion es opcional */ }
    }, 60);
  }

  /**
   * Deteccion de tactil. Se usa DENTRO del ultimo recurso de copiado, asi que
   * no puede lanzar: algunos navegadores integrados (WhatsApp en Android
   * antiguo, WebViews viejos) no exponen matchMedia, y una excepcion aqui
   * dejaria a la asesora sin ninguna forma de copiar el mensaje.
   */
  function esMovil() {
    try {
      if (typeof window.matchMedia === 'function') {
        return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
      }
    } catch (e) { /* sigue con las alternativas */ }
    try {
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return true;
    } catch (e) { /* sigue */ }
    return (window.innerWidth || 1024) < 900;
  }

  // ==========================================================================
  // AVISOS
  // ==========================================================================
  var avisoTimer = null;
  function aviso(msg, tipo) {
    var a = $('aviso');
    a.textContent = msg;
    a.className = 'aviso visible' + (tipo ? ' ' + tipo : '');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { a.className = 'aviso'; }, 2600);
  }

  // ==========================================================================
  // EVENTOS
  // ==========================================================================
  function conectarEventos() {
    // --- Hotel ---
    $('hoteles').addEventListener('click', function (e) {
      var b = e.target.closest('.hotel-op');
      if (!b) return;
      if (estado.hotel === b.dataset.hotel) return;
      estado.hotel = b.dataset.hotel;
      document.body.dataset.hotel = estado.hotel;
      $('marcaHotel').textContent = nombreCorto(CAT.hoteles[estado.hotel].nombre);
      estado.promos = [];
      if (!estado.lineas.length) estado.lineas = [nuevaLinea()];
      else estado.lineas.forEach(normalizarLinea);
      // Los servicios del hotel anterior no valen aqui: cada hotel tiene los
      // suyos, a su precio. Dejarlos marcados cobraria un early check-in que
      // este hotel quiza ni ofrece.
      estado.extras = [];
      renderHoteles();
      renderLineas();
      renderPromos();
      renderExtras();
      recalcular();
    });

    // --- Fechas ---
    // El `min` del selector se fija en la fecha de ENTRADA, no en entrada+1.
    // Varios selectores nativos de Android tratan `min` como exclusivo o
    // rechazan un valor que coincide exactamente con un `min` recien asignado,
    // lo que dejaba la salida vacia y el dia siguiente bloqueado: era imposible
    // cotizar una sola noche desde el celular. El orden de las fechas lo valida
    // el motor, que ya devuelve un mensaje claro.
    $('checkin').addEventListener('change', function () {
      estado.checkin = this.value;
      if (estado.checkin) {
        $('checkout').min = estado.checkin;
        if (estado.checkout && estado.checkout <= estado.checkin) {
          estado.checkout = Motor.Fechas.sumarDias(estado.checkin, 1);
          fijarFecha($('checkout'), estado.checkout);
        }
      }
      renderPromos();
      renderExtras();
      recalcular();
    });
    $('checkout').addEventListener('change', function () {
      estado.checkout = this.value;
      renderPromos();
      renderExtras();
      recalcular();
    });

    // --- Habitaciones: selects y contadores ---
    $('lineas').addEventListener('change', function (e) {
      var sel = e.target.closest('select[data-campo]');
      if (!sel) return;
      var nodo = sel.closest('.hab');
      var l = buscarLinea(nodo.dataset.id);
      if (!l) return;

      if (sel.dataset.campo === 'edad') {
        var idx = Number(sel.dataset.idx);
        l.edades[idx] = sel.value === '' ? '' : Number(sel.value);
        // Solo se repinta la pista: repintar la linea completa cerraria el
        // selector nativo que la asesora acaba de usar.
        recalcular();
        return;
      }

      l[sel.dataset.campo] = sel.value;
      normalizarLinea(l);
      refrescarLinea(nodo, l);
      recalcular();
    });

    $('lineas').addEventListener('click', function (e) {
      var nodo = e.target.closest('.hab');
      if (!nodo) return;
      var l = buscarLinea(nodo.dataset.id);
      if (!l) return;

      if (e.target.closest('[data-act="quitar"]')) {
        estado.lineas = estado.lineas.filter(function (x) { return x.id !== l.id; });
        renderLineas();
        recalcular();
        return;
      }

      var btn = e.target.closest('.paso-btn');
      if (!btn) return;
      var grupo = btn.closest('.paso');
      var campo = grupo.dataset.campo;
      var min = Number(grupo.dataset.min), max = Number(grupo.dataset.max);
      var delta = Number(btn.dataset.paso);

      var actual = campo === 'menores' ? l.edades.length : l[campo];
      var nuevo = Math.min(max, Math.max(min, actual + delta));
      if (nuevo === actual) return;

      if (campo === 'menores') {
        // Al sumar entra un menor SIN edad; al restar sale el ultimo.
        if (nuevo > actual) l.edades.push('');
        else l.edades.length = nuevo;
      } else {
        l[campo] = nuevo;
      }
      refrescarLinea(nodo, l);
      recalcular();
    });

    $('btnAgregar').addEventListener('click', function () {
      if (!estado.hotel) { aviso('Primero elige el hotel', 'error'); return; }
      if (estado.lineas.length >= 8) { aviso('Máximo 8 tipos de habitación', 'error'); return; }
      // Al inicio, no al final: la habitacion recien agregada es la que hay que
      // configurar, y en el celular una lista larga la dejaria fuera de la
      // pantalla. Las ya configuradas bajan una posicion.
      estado.lineas.unshift(nuevaLinea());
      renderLineas();
      recalcular();
      var primera = $('lineas').firstElementChild;
      if (primera && primera.scrollIntoView) {
        primera.scrollIntoView({ block: 'nearest' });
      }
    });

    // --- Promociones ---
    $('promos').addEventListener('click', function (e) {
      var b = e.target.closest('.promo-op');
      if (!b) return;
      var cod = b.dataset.promo;
      var i = estado.promos.indexOf(cod);
      if (i === -1) estado.promos.push(cod); else estado.promos.splice(i, 1);
      renderPromos();
      recalcular();
    });

    $('extras').addEventListener('click', function (e) {
      var b = e.target.closest('.promo-op');
      if (!b) return;
      var cod = b.dataset.extra;
      var i = estado.extras.indexOf(cod);
      if (i === -1) estado.extras.push(cod); else estado.extras.splice(i, 1);
      renderExtras();
      recalcular();
    });

    // --- Registro ---
    $('cliente').addEventListener('input', function () {
      estado.cliente = this.value;
      recalcular();
    });
    $('asesor').addEventListener('input', function () {
      estado.asesor = this.value.toUpperCase();
      this.value = estado.asesor;
      recalcular();
    });
    $('asesor').addEventListener('blur', function () {
      if (estado.asesor) guardarIniciales(estado.asesor);
    });

    // --- Acciones ---
    $('btnCopiar').addEventListener('click', copiar);
    $('btnVerMensaje').addEventListener('click', function () {
      $('columnaVista').classList.add('abierta');
    });
    $('btnCerrarVista').addEventListener('click', function () {
      $('columnaVista').classList.remove('abierta');
    });
    $('btnCerrarModal').addEventListener('click', function () {
      $('modalCopia').classList.add('oculto');
    });
    // Sin dialogo de confirmacion: el boton no borra nada que no se pueda
    // rehacer en segundos, y el confirm() nativo interrumpe el flujo en movil.
    $('btnReiniciar').addEventListener('click', function () {
      estado.hotel = ''; estado.checkin = ''; estado.checkout = '';
      estado.lineas = []; estado.promos = []; estado.cliente = '';
      document.body.dataset.hotel = '';
      $('marcaHotel').textContent = 'Hesperia';
      $('checkin').value = ''; $('checkout').value = ''; $('cliente').value = '';
      $('columnaVista').classList.remove('abierta');
      estado.extras = [];
      renderHoteles(); renderLineas(); renderPromos(); renderExtras(); recalcular();
      aviso('Cotización nueva', 'exito');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      $('modalCopia').classList.add('oculto');
      $('columnaVista').classList.remove('abierta');
    });

    renderLineas();
    recalcular();
  }

  function buscarLinea(id) {
    id = Number(id);
    for (var i = 0; i < estado.lineas.length; i++) {
      if (estado.lineas[i].id === id) return estado.lineas[i];
    }
    return null;
  }

  function refrescarLinea(nodo, l) {
    var i = estado.lineas.indexOf(l);
    nodo.innerHTML = htmlLinea(l, i);
  }

  // ==========================================================================
  // MINI COTIZADOR
  //
  // Un precio suelto, sin armar la cotizacion. La asesora esta hablando por
  // telefono, alguien pregunta "y cuanto sale la Junior Suite dos noches", y
  // ella no puede perder la cotizacion de tres habitaciones que lleva media
  // hora armando. Por eso tiene su propio estado y no toca `estado` ni
  // `ULTIMO`. Lo unico que comparte es el Motor: si diera un precio distinto
  // al del panel grande seria un error de este archivo, no de dos calculos
  // que compiten.
  //
  // Vive en su PROPIA ventana, no en un modal, porque el navegador suele
  // estar detras de otra cosa cuando hace falta. Tres niveles, de mejor a
  // peor, como el copiado:
  //
  //   1. Ventana de documento (Chrome y Edge de escritorio): flota sobre
  //      cualquier aplicacion, incluso con el cotizador cerrado.
  //   2. Ventana emergente: propia, pero se va detras al hacer clic fuera.
  //   3. Panel dentro de la pagina: cuando un bloqueador de emergentes
  //      impide las dos anteriores. Sigue siendo util, y es mejor que un
  //      boton que no hace nada.
  //
  // Solo en escritorio. En el celular no existen las ventanas flotantes y la
  // asesora ya tiene la aplicacion entera a mano.
  // ==========================================================================
  /**
   * El panel del mini cotizador, este donde este.
   *
   * Cuando viaja a su propia ventana deja de pertenecer a este documento y
   * document.getElementById devuelve null. Por eso se guarda la referencia al
   * montar y sus campos se buscan dentro de el: el nodo se mueve entero, con
   * sus hijos y sus escuchadores.
   */
  var _calcCaja = null;
  function calcCaja() {
    if (!_calcCaja) _calcCaja = document.getElementById('calc');
    return _calcCaja;
  }
  function $c(id) {
    var caja = calcCaja();
    return caja ? caja.querySelector('#' + id) : document.getElementById(id);
  }

  var CALC_ANCHO = 382;
  var CALC_ALTO = 461;      // por debajo de 459 de contenido se corta el total

  var calcAbierta = false;
  var calcVentana = null;   // la ventana externa, si se pudo abrir
  var calcNivel = 0;        // 1 = ventana de documento, 2 = emergente, 3 = en pagina

  function calcMontar() {
    var selH = $c('calcHotel');
    selH.innerHTML = '<option value="">Elige…</option>' +
      Object.keys(CAT.hoteles).map(function (c) {
        return '<option value="' + c + '">' + esc(CAT.hoteles[c].nombre) + '</option>';
      }).join('');

    $c('calcHotel').addEventListener('change', function () {
      calcLlenarHabs();
      calcCalcular();
    });

    ['calcHab', 'calcIn', 'calcOut'].forEach(function (id) {
      $(id).addEventListener('change', calcCalcular);
    });
    ['calcAdultos', 'calcNinos'].forEach(function (id) {
      $(id).addEventListener('input', function () { calcEdades(); calcCalcular(); });
    });
    $c('calcEdades').addEventListener('input', calcCalcular);

    $('btnCalc').addEventListener('click', function () {
      calcAbierta ? calcCerrar() : calcAbrir();
    });
    $('btnCalcCerrar').addEventListener('click', calcCerrar);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && calcAbierta && calcNivel === 3) calcCerrar();
    });

    // Si el navegador se lleva la pagina, la ventana se va con ella.
    window.addEventListener('pagehide', function () {
      if (calcVentana && !calcVentana.closed) calcVentana.close();
    });
  }

  /** Copia las hojas de estilo a la ventana nueva, con rutas absolutas. */
  function calcVestir(doc) {
    doc.title = 'Mini cotizador · Hesperia';
    var enlaces = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < enlaces.length; i++) {
      var l = doc.createElement('link');
      l.rel = 'stylesheet';
      l.href = new URL(enlaces[i].getAttribute('href'), location.href).href;
      doc.head.appendChild(l);
    }
    var meta = doc.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1';
    doc.head.appendChild(meta);

    // El acento del hotel se hereda del cuerpo principal.
    doc.body.setAttribute('data-hotel', document.body.getAttribute('data-hotel') || '');
    doc.body.className = 'calc-suelta';
  }

  function calcAbrir() {
    var caja = calcCaja();
    caja.classList.remove('oculto');

    calcSembrar();

    // --- Nivel 1: ventana de documento, siempre encima ---------------------
    if (window.documentPictureInPicture && documentPictureInPicture.requestWindow) {
      documentPictureInPicture
        .requestWindow({ width: CALC_ANCHO, height: CALC_ALTO })
        .then(function (win) {
          calcVentana = win;
          calcNivel = 1;
          calcVestir(win.document);
          win.document.body.appendChild(caja);   // se MUEVE, conserva eventos
          win.addEventListener('pagehide', calcDevolver);
          calcMarcarAbierta();
        })
        .catch(function () { calcAbrirEmergente(caja); });
      return;
    }
    calcAbrirEmergente(caja);
  }

  /** Nivel 2: ventana emergente. Nivel 3 si el navegador la bloquea. */
  function calcAbrirEmergente(caja) {
    var win = null;
    try {
      win = window.open('', 'minicotizador',
                        'width=' + CALC_ANCHO + ',height=' + (CALC_ALTO + 40) +
                        ',menubar=no,toolbar=no,location=no,status=no');
    } catch (e) { win = null; }

    if (!win || !win.document) {           // bloqueador de emergentes
      calcNivel = 3;
      calcVentana = null;
      calcMarcarAbierta();
      return;
    }

    calcVentana = win;
    calcNivel = 2;
    try {
      win.document.body.innerHTML = '';
      calcVestir(win.document);
      win.document.body.appendChild(caja);
      win.addEventListener('pagehide', calcDevolver);
      try { win.focus(); } catch (e) { /* el navegador puede negar el foco */ }
    } catch (e) {
      // Si algo falla a mitad de camino, el panel vuelve a la pagina antes
      // que dejar a la asesora con una ventana en blanco.
      try { win.close(); } catch (e2) { /* ya se cerro */ }
      calcNivel = 3;
      calcVentana = null;
      calcDevolverNodo();
    }
    calcMarcarAbierta();
  }

  function calcMarcarAbierta() {
    calcAbierta = true;
    $('btnCalc').setAttribute('aria-expanded', 'true');
    $('btnCalc').classList.add('activo');
    calcCalcular();
    try { $c('calcHotel').focus(); } catch (e) { /* la ventana aun no tiene foco */ }
  }

  /** Devuelve el panel a su hueco en la pagina. */
  function calcDevolverNodo() {
    var caja = calcCaja();
    var ancla = document.getElementById('calcAncla');
    if (caja && ancla && caja.parentNode !== ancla.parentNode) {
      ancla.parentNode.insertBefore(caja, ancla.nextSibling);
    }
  }

  /** La ventana se cerro: desde su boton, desde la X del sistema o al navegar. */
  function calcDevolver() {
    calcDevolverNodo();
    calcCaja().classList.add('oculto');
    calcVentana = null;
    calcNivel = 0;
    calcAbierta = false;
    var b = $('btnCalc');
    if (b) { b.setAttribute('aria-expanded', 'false'); b.classList.remove('activo'); }
  }

  function calcCerrar() {
    if (calcVentana && !calcVentana.closed) {
      try { calcVentana.close(); } catch (e) { /* ya no existe */ }
    }
    calcDevolver();
    var b = $('btnCalc');
    if (b) b.focus();
  }

  /** Arranca con lo que ya esta cargado: casi siempre se quiere variar sobre eso. */
  function calcSembrar() {
    if (!$c('calcHotel').value && estado.hotel) {
      $c('calcHotel').value = estado.hotel;
      calcLlenarHabs();
    }
    if (!$c('calcIn').value && estado.checkin) $c('calcIn').value = estado.checkin;
    if (!$c('calcOut').value && estado.checkout) $c('calcOut').value = estado.checkout;
  }

  function calcLlenarHabs() {
    var hotel = $c('calcHotel').value;
    var habs = hotel ? habsDe(hotel) : [];
    $c('calcHab').innerHTML = '<option value="">Elige…</option>' +
      habs.map(function (h) {
        return '<option value="' + esc(h.cod) + '">' + esc(h.nombre) + '</option>';
      }).join('');
  }

  /** Un campo de edad por cada nino declarado, conservando lo ya escrito. */
  function calcEdades() {
    var n = Math.max(0, Math.min(6, Number($c('calcNinos').value) || 0));
    var cont = $c('calcEdades');
    var previos = [].slice.call(cont.querySelectorAll('input'))
                    .map(function (i) { return i.value; });

    if (!n) { cont.innerHTML = ''; cont.classList.add('oculto'); return; }

    var html = [];
    for (var i = 0; i < n; i++) {
      html.push('<label class="campo campo-edad"><span class="campo-etiqueta">Edad ' +
                (i + 1) + '</span><input type="number" class="input" min="0" max="17" ' +
                'inputmode="numeric" value="' + esc(previos[i] || '') + '"></label>');
    }
    cont.innerHTML = html.join('');
    cont.classList.remove('oculto');
  }

  function calcSalida(html, hayError) {
    var s = $c('calcSalida');
    s.innerHTML = html;
    s.className = 'calc-salida' + (hayError ? ' con-error' : '');
  }

  function calcCalcular() {
    var hotel = $c('calcHotel').value;
    var cod = $c('calcHab').value;
    var ci = $c('calcIn').value;
    var co = $c('calcOut').value;

    if (!hotel || !cod || !ci || !co) {
      calcSalida('<span class="calc-espera">Elige hotel, habitación y fechas.</span>', false);
      return;
    }

    var edades = [].slice.call($c('calcEdades').querySelectorAll('input'))
      .map(function (i) { return Number(i.value); })
      .filter(edadDeMenor);

    var req = {
      hotel: hotel, checkin: ci, checkout: co, promos: [],
      lineas: [{ cod_hab: cod, cantidad: 1,
                 adultos: Math.max(1, Number($c('calcAdultos').value) || 1),
                 edades: edades }]
    };

    var r;
    try {
      r = Motor.calcular(CAT, req);
    } catch (e) {
      calcSalida('<span class="calc-error">No se pudo calcular: ' + esc(e.message) +
                 '</span>', true);
      return;
    }

    if (!r.ok) {
      var titulo = (r.sinCupo && r.sinCupo.length)
        ? 'Sin disponibilidad esas noches'
        : 'No se puede cotizar';
      calcSalida('<span class="calc-error"><strong>' + titulo + '</strong><br>' +
                 r.errores.map(esc).join('<br>') + '</span>', true);
      return;
    }

    var porNoche = r.lineas[0].costoUniforme;
    calcSalida(
      '<span class="calc-total">$' + Motor.fmtMoney(CAT, r.total) + '</span>' +
      '<span class="calc-detalle">' + r.nNoches +
      (r.nNoches === 1 ? ' noche' : ' noches') +
      (porNoche !== null ? ' · $' + Motor.fmtMoney(CAT, porNoche) + ' por noche' : '') +
      '</span>', false);
  }

  /** Una edad de menor: 0 a 17. Un "18" aqui seria un adulto mal contado. */
  function edadDeMenor(e) { return !isNaN(e) && e >= 0 && e <= 17; }

  // ==========================================================================
  iniciar();
})();
