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
  var PORTAPAPELES = '';  // lo que se esta copiando ahora mismo
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
    var ver = CAT.config.VERSION_TARIFAS || '';
    $('version').textContent = ver ? 'tarifas ' + ver : '';
    $('calcVersion').textContent = ver;
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
    $('hoteles').innerHTML = botonesHotel(estado.hotel);
    renderChipHotel();
  }

  /**
   * Los cinco hoteles como botones.
   *
   * Cada uno lleva SU acento, no el del elegido: el color es lo que permite
   * reconocerlos antes de leer el nombre, y para eso tiene que estar en los
   * cinco a la vez.
   */
  function botonesHotel(activo) {
    return Object.keys(CAT.hoteles).map(function (cod) {
      var h = CAT.hoteles[cod];
      return '<button type="button" class="hotel-op" role="radio" data-h="' + esc(cod) + '"' +
               ' data-hotel="' + esc(cod) + '"' +
               ' aria-checked="' + (activo === cod) + '"' +
               ' title="' + esc(h.nombre) + '">' +
               '<span class="hotel-sigla">' + esc(cod) + '</span>' +
               '<span class="hotel-nombre">' + esc(h.nombreCorto) + '</span>' +
             '</button>';
    }).join('');
  }

  /**
   * El hotel elegido, en la cabecera y siempre visible.
   *
   * El acento de color no basta por si solo: hay dos hoteles cuyo tono no se
   * distingue bien para quien no ve los colores igual, y la asesora cotiza
   * cinco hoteles seguidos sin mirar dos veces. Por eso el color viaja pegado
   * a la sigla y al nombre.
   */
  function renderChipHotel() {
    var chip = $('chipHotel');
    var h = CAT.hoteles[estado.hotel];
    if (!h) { chip.classList.add('oculto'); return; }
    chip.classList.remove('oculto');
    $('chipSigla').textContent = h.codigo;
    $('chipNombre').textContent = h.nombreCorto;
  }

  function renderLineas() {
    var cont = $('lineas');
    cont.innerHTML = '';
    $('btnAgregar').disabled = !estado.hotel;

    if (!estado.hotel) {
      cont.innerHTML = '<p class="t-pista pista">Selecciona un hotel para elegir habitaciones.</p>';
      $('tituloHabitaciones').textContent = 'Habitaciones';
      return;
    }
    $('tituloHabitaciones').textContent = 'Habitaciones · ' + estado.lineas.length;
    estado.lineas.forEach(function (l, i) {
      cont.appendChild(nodoLinea(l, i));
    });
    pintarPreciosLineas();
  }

  function nodoLinea(l, i) {
    var div = document.createElement('div');
    div.className = 'hab';
    div.dataset.id = l.id;
    div.innerHTML = envolver(htmlLinea(l, i));
    return div;
  }

  /**
   * La ficha es una fila: la barra del acento a la izquierda y TODO lo demas
   * apilado a su derecha. Sin este envoltorio, la cabecera y los controles se
   * reparten esa fila y la ficha se sale por el costado.
   */
  function envolver(html) { return '<div class="hab-cuerpo">' + html + '</div>'; }

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
    h.push(  '<span class="hab-idet">');
    h.push(    '<span class="hab-sigla">' + esc(estado.hotel) + '</span>');
    h.push(    '<span class="t-titulo-tarjeta hab-indice">Habitación ' + (i + 1) + '</span>');
    h.push(  '</span>');
    h.push(  '<span class="hab-derecha">');
    h.push(    '<span class="t-precio hab-precio pendiente" data-precio>$ —</span>');
    if (estado.lineas.length > 1) {
      h.push(  '<button type="button" class="hab-quitar" data-act="quitar" ' +
                 'aria-label="Quitar esta habitación">×</button>');
    }
    h.push(  '</span>');
    h.push('</div>');

    h.push('<div class="hab-controles">');
    h.push(select('categoria', 'Categoría', cats, l.categoria));
    h.push(select('ocupacion', 'Ocupación', ocups, l.ocupacion, ocups.length < 2, null, 'corto'));
    h.push(select('atributo', 'Vista', atrs, l.atributo, atrs.length < 2,
                  function (v) { return v || 'Sin atributo'; }, 'atributo'));
    h.push(contador('adultos', 'Ad.', l.adultos, 0, hab ? hab.ocupMaxAdultos : 9));
    h.push(contador('menores', 'Niños', l.edades.length, 0, 9));
    h.push('</div>');

    h.push(htmlEdades(l));

    // En el celular el precio de la habitación va al pie: arriba, junto al
    // título, no cabe sin apretar el resto.
    h.push('<div class="t-pista hab-pie">');
    h.push(  '<span data-noches>' + textoNoches() +
             (l.cantidad > 1 ? ' · ' + l.cantidad + ' habitaciones iguales' : '') + '</span>');
    h.push(  '<span class="t-precio hab-pie-monto" data-precio>$ —</span>');
    h.push('</div>');

    return h.join('');
  }

  /**
   * Un campo de edad por menor. Arranca VACIO a proposito: la asesora tiene
   * que declarar la edad real, no aceptar un valor por defecto que despues
   * termina impreso en el mensaje del cliente.
   */
  function htmlEdades(l) {
    if (!l.edades.length) return '';
    var h = ['<div class="hab-edades">'];
    l.edades.forEach(function (edad, i) {
      // El texto elegido queda a la vista dentro de un campo estrecho, asi que
      // dice solo la edad. Lo que esa edad implica -mitad de precio, sin cargo-
      // va en la pista de abajo, donde se lee entero y para todos los rangos.
      var op = ['<option value=""' + (edad === '' ? ' selected' : '') + '>—</option>'];
      for (var e = 0; e <= 17; e++) {
        op.push('<option value="' + e + '"' + (String(edad) === String(e) ? ' selected' : '') +
                '>' + e + (e === 1 ? ' año' : ' años') + '</option>');
      }
      h.push('<label class="t-campo campo-caja campo-edad' + (edad === '' ? ' falta' : '') + '">' +
               '<span class="t-seccion campo-etiqueta">Niño ' + (i + 1) + '</span>' +
               '<select data-campo="edad" data-idx="' + i + '" ' +
                 'aria-label="Edad del niño ' + (i + 1) + '">' + op.join('') + '</select>' +
             '</label>');
    });
    h.push('</div>');
    h.push('<p class="t-pista pista">' + esc(leyendaRangos()) + '</p>');
    return h.join('');
  }

  /** "0-4 años: sin cargo · 5-9: mitad de precio · 10-17: precio completo" */
  function leyendaRangos() {
    return rangosDe(estado.hotel).map(function (r) {
      return r.rango + ': ' + textoFactor(r.factor);
    }).join(' · ');
  }

  function select(campo, etiqueta, opciones, valor, unica, formato, clase) {
    var f = formato || function (v) { return v; };
    var o = opciones.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === valor ? ' selected' : '') + '>' +
             esc(f(v)) + '</option>';
    }).join('');
    return '<label class="t-campo campo-select' + (clase ? ' ' + clase : '') + '">' +
             '<select data-campo="' + campo + '" aria-label="' + esc(etiqueta) + '"' +
             (unica ? ' disabled' : '') + '>' + o + '</select>' +
           '</label>';
  }

  function contador(campo, nombre, valor, min, max) {
    return '<div class="contador">' +
             '<span class="t-pista contador-et">' + esc(nombre) + '</span>' +
             '<span class="pasos" data-campo="' + campo + '" data-min="' + min +
                   '" data-max="' + max + '">' +
               '<button type="button" data-paso="-1"' +
                 (valor <= min ? ' disabled' : '') + ' aria-label="Restar ' + esc(nombre) +
                 '">−</button>' +
               '<span class="t-precio cifra">' + valor + '</span>' +
               '<button type="button" data-paso="1"' +
                 (valor >= max ? ' disabled' : '') + ' aria-label="Sumar ' + esc(nombre) +
                 '">+</button>' +
             '</span>' +
           '</div>';
  }

  /**
   * Los precios de cada habitación, sin volver a dibujar las fichas.
   *
   * Redibujarlas enteras en cada tecla haría perder el foco del campo que la
   * asesora está usando: el precio cambia con cada ajuste, y el ajuste se hace
   * mirando el precio.
   */
  function pintarPreciosLineas() {
    var nodos = $('lineas').querySelectorAll('.hab');
    for (var i = 0; i < nodos.length; i++) {
      var noches = nodos[i].querySelector('[data-noches]');
      if (noches) {
        var l = estado.lineas[i];
        noches.textContent = textoNoches() +
          (l && l.cantidad > 1 ? ' · ' + l.cantidad + ' habitaciones iguales' : '');
      }
      var celdas = nodos[i].querySelectorAll('[data-precio]');
      var linea = ULTIMO && ULTIMO.lineas && ULTIMO.lineas[i];
      for (var c = 0; c < celdas.length; c++) {
        if (linea) {
          celdas[c].textContent = '$' + Motor.fmtMoney(CAT, linea.subtotalLinea);
          celdas[c].classList.remove('pendiente');
        } else {
          celdas[c].textContent = '$ —';
          celdas[c].classList.add('pendiente');
        }
      }
    }
  }

  function renderPromos() {
    var cont = $('promos');
    var seccion = $('seccionPromos');
    var aplicables = promosAplicables();

    // La sección se oculta solo si aún no hay hotel y fechas. Con fechas ya
    // elegidas se muestra siempre, aunque no haya promos vigentes: si se
    // ocultara, la asesora no sabría si la función existe o si el hotel
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
      cont.innerHTML = '<p class="t-pista pista">No hay promociones vigentes para estas fechas.</p>';
      return;
    }
    cont.innerHTML = aplicables.map(function (p) {
      var sel = estado.promos.indexOf(p.cod) !== -1;
      var det = p.tipo === 'SUSTITUYE' ? 'tarifa $' + p.valor + ' p/p'
              : p.tipo === 'DESCUENTO_PCT' ? '−' + p.valor + '%'
              : '−$' + p.valor + ' p/p';
      if (p.minNoches > 1) det += ' · mín. ' + p.minNoches + ' noches';
      return '<button type="button" class="chip" data-promo="' + esc(p.cod) + '"' +
               ' role="checkbox" aria-checked="' + sel + '">' +
               esc(p.nombre) +
               '<span class="t-pista chip-detalle">' + esc(det) + '</span>' +
             '</button>';
    }).join('');
  }

  /**
   * Servicios adicionales del hotel.
   *
   * Se muestran una vez elegido el hotel, sin esperar a las fechas: el precio
   * no depende de ellas —salvo el que se cobra por día— y la asesora suele
   * preguntar por el early check-in antes de cerrar la estadía.
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
      var det = '$' + x.monto + ' p/p' + (x.tipo === 'POR_PERSONA_DIA' ? ' por día' : '');
      return '<button type="button" class="chip" data-extra="' + esc(x.cod) + '"' +
               ' role="checkbox" aria-checked="' + sel + '">' +
               esc(x.nombre) +
               '<span class="t-pista chip-detalle">' + esc(det) + '</span>' +
             '</button>';
    }).join('');
  }

  function textoNoches() {
    if (!estado.checkin || !estado.checkout || estado.checkout <= estado.checkin) {
      return 'Elige las fechas';
    }
    var d = Motor.Fechas.diffDias(estado.checkin, estado.checkout);
    return d + (d === 1 ? ' noche' : ' noches');
  }

  /** El recuadro de noches de la fila de estadía. */
  function pintarNoches() {
    var caja = $('puenteNoches');
    var n = caja.querySelector('.caja-noches-n');
    var t = caja.querySelector('.caja-noches-t');
    if (estado.checkin && estado.checkout && estado.checkout > estado.checkin) {
      var d = Motor.Fechas.diffDias(estado.checkin, estado.checkout);
      n.textContent = d;
      t.textContent = d === 1 ? 'noche' : 'noches';
    } else {
      n.textContent = '—';
      t.textContent = 'noches';
    }
  }

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
    // La caja de noches la repinta pintarNoches(), desde avisoFechas(): aqui
    // se escribia el texto plano y se borraban los dos <span> de dentro.
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
    pintarNoches();
    var p = $('pistaFechas');
    var hoy = new Date().toISOString().slice(0, 10);
    if (estado.checkin && estado.checkout && estado.checkout <= estado.checkin) {
      p.textContent = 'La salida debe ser posterior a la entrada.';
      p.classList.add('alerta');
    } else if (estado.checkin && estado.checkin < hoy) {
      p.textContent = 'La fecha de entrada ya pasó. Verifica antes de enviar.';
      p.classList.add('alerta');
    } else {
      var cierres = cierresDelRango(estado.hotel, estado.checkin, estado.checkout);
      if (cierres.length) {
        var todoElHotel = cierres.some(function (c) { return c.codHab === 'TODAS'; });
        p.textContent = todoElHotel
          ? 'Ojo: el hotel tiene noches cerradas en ese rango.'
          : 'Ojo: hay habitaciones cerradas en ese rango.';
        p.classList.add('alerta');
      } else {
        p.textContent = 'La noche de salida no se cobra.';
        p.classList.remove('alerta');
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
    marcarSello(false);
    pintarPreciosLineas();
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
    marcarSello(false);
    pintarPreciosLineas();
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
    marcarSello(false);
    pintarPreciosLineas();
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

  /** "actualizado hace 3 s": dice que lo que se ve corresponde a lo cargado. */
  var selloTimer = null, selloDesde = 0;
  function marcarSello(activo) {
    clearInterval(selloTimer);
    var el = $('barraSello');
    if (!activo) { el.textContent = ''; return; }
    selloDesde = Date.now();
    var pintar = function () {
      var s = Math.round((Date.now() - selloDesde) / 1000);
      el.textContent = s < 1 ? 'actualizado ahora'
                     : s < 60 ? 'actualizado hace ' + s + ' s'
                     : 'actualizado hace ' + Math.round(s / 60) + ' min';
    };
    pintar();
    selloTimer = setInterval(pintar, 5000);
  }

  function pintarVistaSub() {
    var quien = estado.cliente.trim();
    $('vistaSub').textContent = quien ? 'WhatsApp · ' + quien : 'WhatsApp';
  }

  function pintarMensaje(res, texto) {
    $('burbuja').className = 'burbuja';
    $('burbuja').innerHTML = aHtmlWhatsApp(texto);

    var partes = [
      res.nNoches + (res.nNoches === 1 ? ' noche' : ' noches'),
      res.totalHabitaciones + (res.totalHabitaciones === 1 ? ' habitación' : ' habitaciones')
    ];
    res.promosAplicadas.forEach(function (p) { partes.push(p.nombre.toLowerCase()); });
    res.extras.forEach(function (x) { partes.push(x.nombre.toLowerCase()); });

    $('barraEtiqueta').textContent = partes.join(' · ');
    $('barraMonto').textContent = '$' + Motor.fmtMoney(CAT, res.total);
    $('barraMonto').className = 'barra-monto';
    pintarVistaSub();
    marcarSello(true);
    pintarPreciosLineas();
    habilitar(true);
    botonPanel('ok');
  }

  /** Copiar: solo con una cotizacion valida. */
  function habilitar(v) {
    $('btnCopiar').disabled = !v;
  }

  /**
   * El boton de la barra, en movil.
   *
   * Con el mensaje asomado ya no hace falta un boton para "verlo": se ve. Asi
   * que este boton pasa a ser lo que de verdad cierra la tarea, copiar. La
   * excepcion son los errores: ahi el texto no existe todavia, no hay nada que
   * copiar, y el boton lleva al sitio donde se explica que falta. Nunca se
   * deshabilita con errores, porque seria dejar "Revisa los datos" sin ninguna
   * forma de saber que revisar.
   */
  var panelEnError = false;

  function botonPanel(estadoPanel) {
    var b = $('btnVerMensaje');
    panelEnError = (estadoPanel === 'error');
    if (estadoPanel === 'vacio') {
      b.disabled = true;
      b.textContent = 'Copiar mensaje';
      b.classList.remove('btn-alerta');
    } else if (estadoPanel === 'error') {
      b.disabled = false;
      b.textContent = 'Ver qué falta';
      b.classList.add('btn-alerta');
    } else {
      b.disabled = false;
      b.textContent = 'Copiar mensaje';
      b.classList.remove('btn-alerta');
    }
  }

  // ==========================================================================
  // EL ASOMO DEL MENSAJE
  //
  // En el telefono el mensaje se asoma por debajo del formulario y se arrastra
  // para leerlo entero. Dos piezas hacen falta:
  //
  // 1. La barra del total se muda DENTRO del panel. Es lo que lo convierte en
  //    el cierre de la tarea -mensaje, total y copiar juntos- en vez de dejar
  //    una franja aparte por debajo. Se mueve, no se duplica: duplicarla
  //    obligaria a mantener dos totales en pantalla y algun dia dirian cosas
  //    distintas.
  // 2. El arrastre. Un panel que solo se abre de un toque no deja mirar "un
  //    poco": el dedo tiene que poder subirlo lo justo para leer una linea mas.
  // ==========================================================================
  var asomoAbierto = false;

  /**
   * El mismo corte que la hoja de estilos, preguntado de la misma forma.
   *
   * OJO: hay otro esMovil() mas abajo que detecta TACTIL, no ancho, y sirve
   * para el ultimo recurso de copiado. Son dos preguntas distintas y no se
   * pueden confundir: un portatil con pantalla tactil a 1440 es tactil pero no
   * es un telefono, y ahi el asomo no va. Se pregunta por la media query para
   * que el JS y el CSS no puedan discrepar nunca.
   */
  var mqMovil = (typeof window.matchMedia === 'function')
    ? window.matchMedia('(max-width: 899px)')
    : null;

  function anchoDeMovil() {
    return mqMovil ? mqMovil.matches : (window.innerWidth || 1024) < 900;
  }

  /** La barra vive dentro del panel en movil y fuera en escritorio. */
  function colocarBarra() {
    var barra = document.querySelector('.barra');
    var panel = $('columnaVista');
    var app = $('app');
    if (!barra || !panel || !app) return;
    if (anchoDeMovil()) {
      if (barra.parentNode !== panel) panel.appendChild(barra);
    } else if (barra.parentNode !== app) {
      app.appendChild(barra);
      asomoCerrar();
    }
  }

  function asomoAbrir() {
    $('columnaVista').classList.add('abierta');
    $('asomoTirador').setAttribute('aria-expanded', 'true');
    asomoAbierto = true;
  }

  function asomoCerrar() {
    $('columnaVista').classList.remove('abierta');
    var t = $('asomoTirador');
    if (t) t.setAttribute('aria-expanded', 'false');
    asomoAbierto = false;
  }

  /**
   * Arrastre del asomo.
   *
   * Se sigue el dedo en vivo y al soltar se decide por dos cosas: cuanto se
   * movio y con cuanta prisa. Solo por distancia, un gesto corto y rapido
   * -que es como se abre una cosa asi- no alcanzaria el umbral y el panel se
   * volveria a cerrar en la cara.
   */
  function montarAsomo() {
    colocarBarra();
    if (mqMovil && typeof mqMovil.addEventListener === 'function') {
      mqMovil.addEventListener('change', colocarBarra);
    } else if (mqMovil && typeof mqMovil.addListener === 'function') {
      mqMovil.addListener(colocarBarra);       // Safari viejo
    } else {
      window.addEventListener('resize', colocarBarra);
    }

    var t = $('asomoTirador');
    var panel = $('columnaVista');
    if (!t || !panel) return;

    var y0 = 0, t0 = 0, dy = 0, arrastrando = false, movio = false;

    function alto() { return panel.getBoundingClientRect().height; }
    function base() {
      // Cuanto esta bajado el panel en cada estado, en pixeles.
      var asomo = parseFloat(getComputedStyle(panel).getPropertyValue('--h-asomo')) || 196;
      return asomoAbierto ? 0 : Math.max(0, alto() - asomo);
    }

    t.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      arrastrando = true; movio = false;
      y0 = e.clientY; t0 = Date.now(); dy = 0;
      panel.classList.add('arrastrando');
      try { t.setPointerCapture(e.pointerId); } catch (err) { /* navegador viejo */ }
    });

    t.addEventListener('pointermove', function (e) {
      if (!arrastrando) return;
      dy = e.clientY - y0;
      if (Math.abs(dy) > 4) movio = true;
      // Sin pasarse de los dos topes: arriba del todo o asomado.
      var y = Math.min(Math.max(base() + dy, 0), Math.max(0, alto() - 40));
      panel.style.transform = 'translateY(' + y + 'px)';
    });

    function soltar(e) {
      if (!arrastrando) return;
      arrastrando = false;
      panel.classList.remove('arrastrando');
      panel.style.transform = '';
      try { t.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }

      if (!movio) { (asomoAbierto ? asomoCerrar : asomoAbrir)(); return; }

      var prisa = Math.abs(dy) / Math.max(1, Date.now() - t0);   // px por ms
      var lejos = Math.abs(dy) > alto() * 0.22;
      if (prisa > 0.5 || lejos) {
        (dy < 0 ? asomoAbrir : asomoCerrar)();
      }
      // Ni lejos ni deprisa: se queda donde estaba.
    }
    t.addEventListener('pointerup', soltar);
    t.addEventListener('pointercancel', soltar);
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
  function copiar(texto) {
    texto = (typeof texto === 'string' && texto) ? texto : TEXTO;
    if (!texto) return;
    PORTAPAPELES = texto;

    // Nivel 1: API moderna del portapapeles
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(PORTAPAPELES).then(
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
      ta.value = PORTAPAPELES;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, PORTAPAPELES.length);
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
    if (!ta || !modal) { alert(PORTAPAPELES); return; }

    ta.value = PORTAPAPELES;
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
        ta.setSelectionRange(0, PORTAPAPELES.length);
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
      if (!b || estado.hotel === b.dataset.hotel) return;
      estado.hotel = b.dataset.hotel;
      document.body.dataset.hotel = estado.hotel;
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
        // Se marca solo este campo: repintar la ficha entera cerraria el
        // selector nativo que la asesora acaba de usar.
        var caja = sel.closest('.campo-edad');
        if (caja) caja.classList.toggle('falta', sel.value === '');
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

      var btn = e.target.closest('.pasos button');
      if (!btn) return;
      var grupo = btn.closest('.pasos');
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
      var b = e.target.closest('.chip');
      if (!b) return;
      var cod = b.dataset.promo;
      var i = estado.promos.indexOf(cod);
      if (i === -1) estado.promos.push(cod); else estado.promos.splice(i, 1);
      renderPromos();
      recalcular();
    });

    $('extras').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
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
      pintarVistaSub();
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
      // Con errores no hay texto que copiar: lleva a donde se explica.
      if (panelEnError) { asomoAbrir(); return; }
      copiar();
    });
    $('btnCerrarVista').addEventListener('click', asomoCerrar);
    montarAsomo();
    $('btnCerrarModal').addEventListener('click', function () {
      $('modalCopia').classList.add('oculto');
    });
    // Sin dialogo de confirmacion: el boton no borra nada que no se pueda
    // rehacer en segundos, y el confirm() nativo interrumpe el flujo en movil.
    $('btnReiniciar').addEventListener('click', function () {
      estado.hotel = ''; estado.checkin = ''; estado.checkout = '';
      estado.lineas = []; estado.promos = []; estado.cliente = '';
      document.body.dataset.hotel = '';
      $('checkin').value = ''; $('checkout').value = ''; $('cliente').value = '';
      asomoCerrar();
      estado.extras = [];
      renderHoteles(); renderLineas(); renderPromos(); renderExtras(); recalcular();
      aviso('Cotización nueva', 'exito');
    });

    $('btnVaciar').addEventListener('click', function () {
      $('btnReiniciar').click();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      $('modalCopia').classList.add('oculto');
      asomoCerrar();
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
    nodo.innerHTML = envolver(htmlLinea(l, i));
    pintarPreciosLineas();
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
  var CALC_ANCHO = 382;
  var CALC_ALTO = 461;      // por debajo de 459 de contenido se corta el total

  var calcAbierta = false;
  var calcVentana = null;   // la ventana externa, si se pudo abrir
  var calcNivel = 0;        // 1 = ventana de documento, 2 = emergente, 3 = en pagina
  var calcRes = null;       // ultimo resultado valido, para copiar y abrir

  var calcEstado = { hotel: '', cod: '', ci: '', co: '', adultos: 2, edades: [] };

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

  function calcMontar() {
    $c('calcHotel').innerHTML = botonesHotel(calcEstado.hotel);

    $c('calcHotel').addEventListener('click', function (e) {
      var b = e.target.closest('.hotel-op');
      if (!b || calcEstado.hotel === b.dataset.hotel) return;
      calcEstado.hotel = b.dataset.hotel;
      calcEstado.cod = '';
      $c('calcHotel').innerHTML = botonesHotel(calcEstado.hotel);
      calcLlenarHabs();
      calcCalcular();
    });
    $c('calcHab').addEventListener('change', function () {
      calcEstado.cod = this.value;
      calcCalcular();
    });
    $c('calcIn').addEventListener('change', function () {
      calcEstado.ci = this.value;
      calcCalcular();
    });
    $c('calcOut').addEventListener('change', function () {
      calcEstado.co = this.value;
      calcCalcular();
    });

    calcCaja().addEventListener('click', function (e) {
      var b = e.target.closest('[data-calcpaso]');
      if (!b) return;
      var delta = Number(b.dataset.delta);
      if (b.dataset.calcpaso === 'adultos') {
        calcEstado.adultos = Math.min(9, Math.max(1, calcEstado.adultos + delta));
      } else {
        var n = Math.min(6, Math.max(0, calcEstado.edades.length + delta));
        if (n > calcEstado.edades.length) calcEstado.edades.push('');
        else calcEstado.edades.length = n;
      }
      calcPintarPax();
      calcCalcular();
    });

    $c('calcEdades').addEventListener('change', function (e) {
      var sel = e.target.closest('[data-edad]');
      if (!sel) return;
      calcEstado.edades[Number(sel.dataset.edad)] = sel.value;
      // Se marca solo este campo: repintarlos todos cerraria el desplegable
      // que se acaba de usar.
      var caja = sel.closest('.campo-edad');
      if (caja) caja.classList.toggle('falta', sel.value === '');
      calcCalcular();
    });

    $c('calcCopiar').addEventListener('click', calcCopiarMensaje);
    $c('calcAbrir').addEventListener('click', calcAbrirCompleto);

    $('btnCalc').addEventListener('click', function () {
      calcAbierta ? calcCerrar() : calcAbrir();
    });
    $c('btnCalcCerrar').addEventListener('click', calcCerrar);
    $c('btnCalcVaciar').addEventListener('click', calcVaciar);
    $c('btnCalcColapsar').addEventListener('click', calcColapsar);
    montarArrastre();

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && calcAbierta && calcNivel === 3) calcCerrar();
    });

    // Si el navegador se lleva la pagina, la ventana se va con ella.
    window.addEventListener('pagehide', function () {
      if (calcVentana && !calcVentana.closed) calcVentana.close();
    });

    calcPintarPax();
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
    doc.body.setAttribute('data-hotel', calcEstado.hotel || '');
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
    // Solo el nivel 1 flota de verdad sobre otras aplicaciones. Prometerlo
    // cuando el navegador no puede cumplirlo seria peor que no decir nada.
    $c('calcChip').hidden = (calcNivel !== 1);
    calcColapsado = false;
    calcCaja().classList.remove('colapsada');
    calcMarcarPlegado();
    $c('calcVersion').textContent = CAT.config.VERSION_TARIFAS || '';
    calcPintarPax();
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
    calcColapsado = false;
    var b = $('calcBurbuja');
    if (b) b.classList.add('oculto');
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
    if (!calcEstado.hotel && estado.hotel) {
      calcEstado.hotel = estado.hotel;
      $c('calcHotel').innerHTML = botonesHotel(calcEstado.hotel);
      calcLlenarHabs();
    }
    if (!calcEstado.ci && estado.checkin) {
      calcEstado.ci = estado.checkin;
      $c('calcIn').value = estado.checkin;
    }
    if (!calcEstado.co && estado.checkout) {
      calcEstado.co = estado.checkout;
      $c('calcOut').value = estado.checkout;
    }
  }

  function calcLlenarHabs() {
    var habs = calcEstado.hotel ? habsDe(calcEstado.hotel) : [];
    $c('calcHab').innerHTML = '<option value="">Elige la habitación…</option>' +
      habs.map(function (h) {
        var etq = h.categoria + ' · ' + h.ocupacion + (h.atributo ? ' · ' + h.atributo : '');
        return '<option value="' + esc(h.cod) + '">' + esc(etq) + '</option>';
      }).join('');
    $c('calcHab').value = calcEstado.cod;
  }

  /** Contadores y campos de edad, segun el estado propio del mini. */
  function calcPintarPax() {
    $c('calcAdultos').textContent = calcEstado.adultos;
    $c('calcNinos').textContent = calcEstado.edades.length;

    var cont = $c('calcEdades');
    if (!calcEstado.edades.length) {
      cont.innerHTML = '';
      cont.classList.add('oculto');
      return;
    }
    cont.classList.remove('oculto');
    cont.innerHTML = calcEstado.edades.map(function (edad, i) {
      var op = ['<option value=""' + (edad === '' ? ' selected' : '') + '>—</option>'];
      for (var e = 0; e <= 17; e++) {
        op.push('<option value="' + e + '"' + (String(edad) === String(e) ? ' selected' : '') +
                '>' + e + (e === 1 ? ' año' : ' años') + '</option>');
      }
      return '<label class="t-campo campo-caja campo-edad' + (edad === '' ? ' falta' : '') + '">' +
               '<span class="t-seccion campo-etiqueta">Niño ' + (i + 1) + '</span>' +
               '<select data-edad="' + i + '">' + op.join('') + '</select>' +
             '</label>';
    }).join('');
  }

  function calcNochesTexto() {
    var caja = $c('calcNoches');
    var n = caja.querySelector('.caja-noches-n');
    var t = caja.querySelector('.caja-noches-t');
    if (calcEstado.ci && calcEstado.co && calcEstado.co > calcEstado.ci) {
      var d = Motor.Fechas.diffDias(calcEstado.ci, calcEstado.co);
      n.textContent = d;
      t.textContent = d === 1 ? 'noche' : 'noches';
      return d;
    }
    n.textContent = '—';
    t.textContent = 'noches';
    return 0;
  }

  function calcSalida(detalle, total, hayError) {
    if (hayError || total === '$ —') { calcRes = null; calcPintarBurbuja(); }
    $c('calcDetalle').textContent = detalle;
    $c('calcDetalle').className = 'calc-detalle' + (hayError ? ' error' : '');
    $c('calcTotal').textContent = total;
    $c('calcTotal').className = 'calc-total' + (total === '$ —' ? ' apagado' : '');
    var listo = !hayError && total !== '$ —';
    $c('calcCopiar').disabled = !listo;
    $c('calcAbrir').disabled = !listo;
  }

  function calcCalcular() {
    calcNochesTexto();
    calcRes = null;

    var e = calcEstado;
    if (!e.hotel || !e.cod || !e.ci || !e.co) {
      calcSalida('Elige hotel, habitación y fechas', '$ —', false);
      return;
    }

    var edades = e.edades
      .filter(function (v) { return v !== ''; })
      .map(Number);
    if (edades.length !== e.edades.length) {
      calcSalida('Falta la edad de algún niño', '$ —', true);
      return;
    }

    var req = {
      hotel: e.hotel, checkin: e.ci, checkout: e.co, promos: [], extras: [],
      lineas: [{ cod_hab: e.cod, cantidad: 1, adultos: e.adultos, edades: edades }]
    };

    var r;
    try {
      r = Motor.calcular(CAT, req);
    } catch (err) {
      calcSalida('No se pudo calcular: ' + err.message, '$ —', true);
      return;
    }

    if (!r.ok) {
      var titulo = (r.sinCupo && r.sinCupo.length)
        ? 'Sin disponibilidad esas noches'
        : r.errores[0];
      calcSalida(titulo, '$ —', true);
      return;
    }

    calcRes = r;
    calcPintarBurbuja();
    var temp = r.lineas[0].detalleNoches[0];
    var detalle = r.nNoches + (r.nNoches === 1 ? ' noche' : ' noches') +
                  (temp && temp.temporada ? ' · ' + temp.temporada.toLowerCase() : '');
    calcSalida(detalle, '$' + Motor.fmtMoney(CAT, r.total), false);
  }

  function calcCopiarMensaje() {
    if (!calcRes) return;
    var texto;
    try {
      texto = Motor.render(CAT, calcRes, { asesorIniciales: estado.asesor, cliente: '' });
    } catch (err) {
      aviso('No se pudo armar el mensaje', 'error');
      return;
    }
    copiar(texto);
  }

  /**
   * Pasa lo calculado a la aplicacion, para seguir armando la cotizacion sin
   * volver a teclear lo mismo. Reemplaza lo que hubiera: si la asesora pulsa
   * esto es porque quiere trabajar sobre este precio.
   */
  function calcAbrirCompleto() {
    if (!calcRes) return;
    var e = calcEstado;
    var hab = habsDe(e.hotel).filter(function (h) { return h.cod === e.cod; })[0];
    if (!hab) return;

    estado.hotel = e.hotel;
    estado.checkin = e.ci;
    estado.checkout = e.co;
    estado.promos = [];
    estado.extras = [];
    estado.lineas = [{
      id: ++secuencia,
      categoria: hab.categoria, ocupacion: hab.ocupacion, atributo: hab.atributo || '',
      cantidad: 1, adultos: e.adultos, edades: e.edades.slice()
    }];

    document.body.dataset.hotel = estado.hotel;
    fijarFecha($('checkin'), estado.checkin);
    fijarFecha($('checkout'), estado.checkout);

    renderHoteles();
    renderLineas();
    renderPromos();
    renderExtras();
    recalcular();

    calcCerrar();
    try { window.focus(); } catch (err) { /* el navegador puede negar el foco */ }
    aviso('Pasado al cotizador', 'exito');
  }

  // ==========================================================================
  // COLAPSAR Y ARRASTRAR
  //
  // Solo en el nivel 3, el panel dentro de la pagina. En los niveles 1 y 2 el
  // panel vive en su propia ventana del navegador: moverla y minimizarla es
  // cosa del sistema operativo, y duplicar esos controles seria pelearse con
  // el.
  //
  // La burbuja lleva el total encima. Colapsada y sin cifra seria un boton
  // cualquiera; con la cifra sigue siendo un cotizador, que es la razon de
  // tenerlo abierto mientras se habla por telefono.
  // ==========================================================================
  var calcColapsado = false;
  var burbujaPos = null;     // {x, y} en pixeles desde la esquina superior izquierda

  // Plegado en su propia ventana: cuanto se encoge.
  var CALC_ANCHO_MIN = 240;
  var CALC_ALTO_MIN = 48;

  /**
   * Plegar.
   *
   * Dos formas, porque el mini vive en dos sitios distintos y en cada uno "un
   * icono flotante que no ocupe mucho espacio" quiere decir otra cosa:
   *
   * - En su propia ventana (niveles 1 y 2) lo que flota es la VENTANA. Plegar
   *   es encogerla hasta su barra de titulo, con el total dentro. Se sigue
   *   arrastrando por donde se arrastra cualquier ventana y sigue por encima
   *   de WhatsApp, que es la razon de tenerlo abierto.
   * - Dentro de la pagina (nivel 3) no hay ventana que encoger, asi que el
   *   panel se cambia por una burbuja que se arrastra con el dedo.
   *
   * Antes el boton solo existia en el nivel 3, que es justo el que casi nadie
   * ve: Chrome da ventana de documento y la funcion quedaba inalcanzable.
   */
  function calcColapsar() {
    if (calcColapsado) return;

    if (calcNivel === 3) {
      calcColapsado = true;
      calcCaja().classList.add('oculto');
      var b = $('calcBurbuja');
      b.classList.remove('oculto');
      calcPintarBurbuja();
      colocarBurbuja();
      b.focus();
      calcMarcarPlegado();
      return;
    }

    var caja = calcCaja();
    caja.classList.add('colapsada');
    calcColapsado = true;
    calcMarcarPlegado();

    // Encoger la ventana es lo unico que puede negarnos el navegador. Si no se
    // deja, el panel plegado quedaria como una barra dentro de una ventana
    // vacia, que es peor que no plegar: se deshace y se avisa.
    var w = calcVentana;
    var anchoAntes = 0;
    try { anchoAntes = w ? w.outerWidth : 0; } catch (e) { anchoAntes = 0; }
    try { if (w) w.resizeTo(CALC_ANCHO_MIN, CALC_ALTO_MIN); } catch (e) { /* lo dice la comprobacion */ }

    setTimeout(function () {
      var ahora = 0;
      try { ahora = w ? w.outerWidth : 0; } catch (e) { ahora = 0; }
      if (anchoAntes && ahora >= anchoAntes) {
        calcExpandir();
        aviso('Este navegador no deja encoger la ventana del mini', 'error');
      }
    }, 120);
  }

  function calcExpandir() {
    calcColapsado = false;
    var caja = calcCaja();
    caja.classList.remove('colapsada');
    calcMarcarPlegado();

    if (calcNivel === 3) {
      $('calcBurbuja').classList.add('oculto');
      caja.classList.remove('oculto');
    } else if (calcVentana) {
      try { calcVentana.resizeTo(CALC_ANCHO, CALC_ALTO); } catch (e) { /* daba igual */ }
    }
    try { $c('calcHab').focus(); } catch (e) { /* aun sin foco */ }
  }

  /** El boton y el total de la cabecera, segun este plegado o no. */
  function calcMarcarPlegado() {
    var b, t;
    try { b = $c('btnCalcColapsar'); t = $c('calcTotalBarra'); } catch (e) { return; }
    if (b) {
      b.textContent = calcColapsado ? '□' : '−';
      b.setAttribute('aria-label', calcColapsado
        ? 'Volver a abrir el mini cotizador'
        : 'Plegar el mini cotizador');
      b.title = calcColapsado ? 'Volver a abrir' : 'Plegar a una barra';
    }
    if (t) {
      var enVentana = (calcNivel === 1 || calcNivel === 2);
      t.hidden = !(calcColapsado && enVentana);
      t.textContent = calcRes ? '$' + Motor.fmtMoney(CAT, calcRes.total) : 'Sin cotizar';
    }
  }

  function calcPintarBurbuja() {
    if (calcColapsado) calcMarcarPlegado();
    var m = $('calcBurbujaMonto');
    if (!m) return;
    m.textContent = calcRes ? '$' + Motor.fmtMoney(CAT, calcRes.total) : '';
  }

  /** Coloca la burbuja donde se la dejo, sin salirse de la pantalla. */
  function colocarBurbuja() {
    var b = $('calcBurbuja');
    if (!burbujaPos) return;                 // primera vez: la deja el CSS
    var r = b.getBoundingClientRect();
    var x = Math.max(8, Math.min(burbujaPos.x, window.innerWidth - r.width - 8));
    var y = Math.max(8, Math.min(burbujaPos.y, window.innerHeight - r.height - 8));
    b.style.left = x + 'px';
    b.style.top = y + 'px';
    b.style.right = 'auto';
    b.style.bottom = 'auto';
  }

  /**
   * Arrastre con captura de puntero.
   *
   * Un arrastre de menos de 4 pixeles no es un arrastre: es un toque con pulso.
   * Si no se distinguen, la burbuja se vuelve imposible de abrir con el dedo.
   */
  function montarArrastre() {
    var b = $('calcBurbuja');
    if (!b) return;
    var arrastrando = false, movio = false, dx = 0, dy = 0;

    b.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var r = b.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      arrastrando = true;
      movio = false;
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* navegador viejo */ }
    });

    b.addEventListener('pointermove', function (e) {
      if (!arrastrando) return;
      var x = e.clientX - dx, y = e.clientY - dy;
      if (!movio && (Math.abs(e.movementX) + Math.abs(e.movementY)) > 0) {
        var r0 = b.getBoundingClientRect();
        if (Math.abs(x - r0.left) > 4 || Math.abs(y - r0.top) > 4) {
          movio = true;
          b.classList.add('arrastrando');
        }
      }
      if (!movio) return;
      // transform y no left/top mientras se arrastra: no dispara maquetado.
      burbujaPos = { x: x, y: y };
      colocarBurbuja();
    });

    function soltar(e) {
      if (!arrastrando) return;
      arrastrando = false;
      b.classList.remove('arrastrando');
      try { b.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
      // El click llega despues del pointerup; si hubo arrastre, se ignora.
      if (movio) { b.dataset.arrastro = '1'; setTimeout(function () { delete b.dataset.arrastro; }, 0); }
    }
    b.addEventListener('pointerup', soltar);
    b.addEventListener('pointercancel', soltar);

    b.addEventListener('click', function () {
      if (b.dataset.arrastro) return;
      calcExpandir();
    });

    // Si la ventana cambia de tamaño, la burbuja podria quedar fuera.
    window.addEventListener('resize', function () { if (calcColapsado) colocarBurbuja(); });
  }

  /** Borra todo lo cargado en el mini, sin tocar la cotizacion de la app. */
  function calcVaciar() {
    calcEstado = { hotel: '', cod: '', ci: '', co: '', adultos: 2, edades: [] };
    calcRes = null;
    $c('calcHotel').innerHTML = botonesHotel('');
    calcLlenarHabs();
    $c('calcIn').value = '';
    $c('calcOut').value = '';
    calcPintarPax();
    calcCalcular();
    aviso('Mini cotizador vacío', 'exito');
  }

  // ==========================================================================
  iniciar();
})();
