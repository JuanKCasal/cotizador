/**
 * COTIZADOR HESPERIA - admin.js
 * Pantalla de administración del catálogo.
 *
 * No hay servidor: esta pantalla EDITA una copia en memoria de los archivos de
 * datos/ y al publicar los descarga para que alguien los suba al repositorio.
 * Ese rodeo es deliberado — sin servidor no hay forma de autenticar a nadie, y
 * un token de escritura viviendo en un navegador es peor que un paso manual.
 *
 * El borrador se guarda en este navegador mientras se trabaja: cargar un
 * tarifario son cuarenta filas, y perderlas por recargar sin querer no es
 * aceptable.
 *
 * ES5, igual que el resto: es el mismo código que corre en los arneses.
 */
(function () {
  'use strict';

  var LLAVE_BORRADOR = 'cotizador_borrador_v1';

  var ORIGINAL = null;   // los datos tal como vinieron de datos/
  var CRUDO = null;      // la copia que se edita
  var CAT = null;        // catalogo construido, para el validador
  var HALLAZGOS = [];
  var TAB = 'tarifas';
  var guardadoEn = 0;

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clonar(x) { return JSON.parse(JSON.stringify(x)); }

  // ==========================================================================
  // ARRANQUE
  // ==========================================================================
  function iniciar() {
    var partes = {};
    Promise.all(Catalogo.TABLAS.map(function (t) {
      return fetch('datos/' + t + '.json', { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('No se pudo leer ' + t + '.json (' + r.status + ')');
          return r.json();
        })
        .then(function (d) { partes[t] = d; });
    })).then(function () {
      ORIGINAL = partes;
      CRUDO = recuperarBorrador() || clonar(partes);
      montar();
    }).catch(function (e) {
      $('cargandoTexto').textContent = 'No se pudo cargar el catálogo: ' + e.message;
    });
  }

  function montar() {
    $('filtroHotel').innerHTML = '<option value="">Todos los hoteles</option>' +
      (CRUDO.hoteles || []).map(function (h) {
        return '<option value="' + esc(h.codigo) + '">' +
               esc(h.nombre_corto || h.nombre_display) + '</option>';
      }).join('');

    $('pestanas').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) return;
      TAB = b.dataset.tab;
      [].forEach.call(document.querySelectorAll('.adm-pestana'), function (p) {
        p.classList.toggle('activa', p.dataset.tab === TAB);
      });
      $('filtroTexto').value = '';
      pintar();
    });

    ['filtroHotel', 'filtroTemp', 'filtroTexto'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        if (id === 'filtroHotel') document.body.dataset.hotel = this.value || '';
        pintar();
      });
    });

    $('btnFila').addEventListener('click', filaNueva);
    $('plantillaTexto').addEventListener('input', alEditarPlantilla);
    $('btnDescartar').addEventListener('click', descartar);
    $('btnPublicar').addEventListener('click', abrirPublicar);
    $('btnCerrarPublicar').addEventListener('click', function () {
      $('modalPublicar').classList.add('oculto');
    });
    $('btnDescargar').addEventListener('click', descargar);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') $('modalPublicar').classList.add('oculto');
    });

    // Salir con cambios sin publicar cuesta el trabajo de una tarde.
    window.addEventListener('beforeunload', function (e) {
      if (!hayCambios()) return;
      e.preventDefault();
      e.returnValue = '';
    });

    revalidar();
    pintar();
    $('cargando').classList.add('oculto');
    $('app').classList.remove('oculto');
    setInterval(pintarPie, 20000);
  }

  // ==========================================================================
  // BORRADOR
  // ==========================================================================
  function guardarBorrador() {
    try {
      localStorage.setItem(LLAVE_BORRADOR, JSON.stringify({ ts: Date.now(), datos: CRUDO }));
      guardadoEn = Date.now();
    } catch (e) { /* almacenamiento lleno o bloqueado: se sigue en memoria */ }
  }

  function recuperarBorrador() {
    try {
      var b = JSON.parse(localStorage.getItem(LLAVE_BORRADOR) || 'null');
      if (!b || !b.datos) return null;
      guardadoEn = b.ts || 0;
      return b.datos;
    } catch (e) { return null; }
  }

  function olvidarBorrador() {
    try { localStorage.removeItem(LLAVE_BORRADOR); } catch (e) { /* da igual */ }
    guardadoEn = 0;
  }

  function hayCambios() {
    return archivosCambiados().length > 0;
  }

  function archivosCambiados() {
    return Catalogo.TABLAS.filter(function (t) {
      return JSON.stringify(CRUDO[t]) !== JSON.stringify(ORIGINAL[t]);
    });
  }

  function descartar() {
    if (!hayCambios()) return;
    if (!window.confirm('Se pierden todos los cambios que no hayas publicado. ¿Seguir?')) return;
    CRUDO = clonar(ORIGINAL);
    olvidarBorrador();
    revalidar();
    pintar();
    aviso('Borrador descartado', 'exito');
  }

  // ==========================================================================
  // VALIDACIÓN
  //
  // Corre en cada cambio. Es lo que separa esta pantalla de editar el JSON a
  // mano: aquí un error de carga se ve al escribirlo, no cuando una asesora
  // manda un precio malo.
  // ==========================================================================
  function revalidar() {
    HALLAZGOS = [];
    try {
      CAT = Catalogo.construir(CRUDO);
    } catch (e) {
      // construir() rechaza datos corruptos —una fecha fuera de formato, por
      // ejemplo— antes de que el motor los vea.
      CAT = null;
      HALLAZGOS = [['ERROR', 'datos', 'NO_CARGA', e.message]];
      return;
    }
    HALLAZGOS = Validador.validar(CAT, Motor, hoyISO());
  }

  function hoyISO() { return new Date().toISOString().slice(0, 10); }

  function cuenta(sev) {
    return HALLAZGOS.filter(function (h) { return h[0] === sev; }).length;
  }

  // ==========================================================================
  // TABLAS
  //
  // Cada pestaña declara sus columnas: ancho, etiqueta, campo del JSON y tipo.
  // Agregar una columna es una entrada aquí, no código nuevo.
  // ==========================================================================
  function hoteles() {
    return (CRUDO.hoteles || []).map(function (h) { return h.codigo; });
  }

  function opcionesHab(hotel) {
    return (CRUDO.habitaciones || [])
      .filter(function (h) { return h.hotel === hotel; })
      .map(function (h) { return h.cod_hab; });
  }

  function opcionesTemp(hotel) {
    return (CRUDO.temporadas || [])
      .filter(function (t) { return !hotel || t.hotel === hotel; })
      .map(function (t) { return t.cod_temp; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  var ESQUEMAS = {
    // Mensajes tiene su propio panel, no una tabla, pero necesita entrada aqui
    // para que el pie, los filtros y "ir a la fila" sepan de que tabla hablan.
    'plantillas': {
      titulo: 'mensajes',
      panel: true,
      cols: [
        { c: 'hotel', et: 'Hotel', w: '1fr', tipo: 'hotel' },
        { c: 'asesor', et: 'Asesora', w: '1fr', tipo: 'texto' }
      ]
    },
    'tarifas': {
      titulo: 'tarifas',
      cols: [
        { c: 'hotel', et: 'Hotel', w: '.8fr', tipo: 'hotel' },
        { c: 'cod_hab', et: 'Habitación', w: '1.4fr', tipo: 'hab' },
        { c: 'cod_temp', et: 'Temporada', w: '1.1fr', tipo: 'temp' },
        { c: 'pax', et: 'Pax', w: '.5fr', tipo: 'num',
          ayuda: 'Vacío = la tarifa no depende de la ocupación' },
        { c: 'tarifa_pp_noche', et: 'Tarifa', w: '.8fr', tipo: 'num' },
        { c: 'tarifa_nino_override', et: 'Niño', w: '.7fr', tipo: 'num' }
      ]
    },
    'temporadas': {
      titulo: 'temporadas',
      cols: [
        { c: 'hotel', et: 'Hotel', w: '.7fr', tipo: 'hotel' },
        { c: 'cod_temp', et: 'Código', w: '.9fr', tipo: 'texto' },
        { c: 'nombre', et: 'Nombre', w: '1.6fr', tipo: 'texto' },
        { c: 'fecha_inicio', et: 'Desde', w: '1fr', tipo: 'fecha' },
        { c: 'fecha_fin', et: 'Hasta', w: '1fr', tipo: 'fecha' },
        { c: 'prioridad', et: 'Prioridad', w: '.7fr', tipo: 'num' }
      ]
    },
    'stop-sales': {
      titulo: 'fechas bloqueadas',
      cols: [
        { c: 'hotel', et: 'Hotel', w: '.7fr', tipo: 'hotel' },
        { c: 'cod_hab', et: 'Habitación', w: '1.2fr', tipo: 'hab',
          ayuda: 'Vacío = el hotel completo' },
        { c: 'fecha_inicio', et: 'Desde', w: '1fr', tipo: 'fecha' },
        { c: 'fecha_fin', et: 'Hasta', w: '1fr', tipo: 'fecha' },
        { c: 'motivo', et: 'Motivo', w: '1.6fr', tipo: 'texto' },
        { c: 'activo', et: 'Activo', w: '.6fr', tipo: 'bool' }
      ]
    },
    'promociones': {
      titulo: 'promociones',
      cols: [
        { c: 'hotel', et: 'Hotel', w: '.6fr', tipo: 'hotel' },
        { c: 'cod_promo', et: 'Código', w: '1fr', tipo: 'texto' },
        { c: 'nombre', et: 'Nombre', w: '1.4fr', tipo: 'texto' },
        { c: 'vig_inicio', et: 'Desde', w: '.9fr', tipo: 'fecha' },
        { c: 'vig_fin', et: 'Hasta', w: '.9fr', tipo: 'fecha' },
        { c: 'tipo', et: 'Tipo', w: '1fr',
          tipo: 'lista', ops: ['SUSTITUYE', 'DESCUENTO_PCT', 'DESCUENTO_MONTO'] },
        { c: 'valor', et: 'Valor', w: '.6fr', tipo: 'num' },
        { c: 'min_noches', et: 'Mín.', w: '.5fr', tipo: 'num' },
        { c: 'activo', et: 'Activo', w: '.6fr', tipo: 'bool' }
      ]
    },
    'extras': {
      titulo: 'servicios',
      cols: [
        { c: 'hotel', et: 'Hotel', w: '.6fr', tipo: 'hotel' },
        { c: 'cod_extra', et: 'Código', w: '.8fr', tipo: 'texto' },
        { c: 'nombre', et: 'Nombre', w: '1.3fr', tipo: 'texto' },
        { c: 'detalle', et: 'Detalle', w: '1.8fr', tipo: 'texto' },
        { c: 'tipo', et: 'Cobro', w: '1.3fr',
          tipo: 'lista', ops: ['POR_PERSONA_ESTADIA', 'POR_PERSONA_DIA'] },
        { c: 'monto', et: 'Monto', w: '.6fr', tipo: 'num' },
        { c: 'activo', et: 'Activo', w: '.6fr', tipo: 'bool' }
      ]
    }
  };

  /** Índices reales de las filas que pasan los filtros, en orden. */
  function filasVisibles() {
    var hotel = $('filtroHotel').value;
    var temp = $('filtroTemp').value;
    var texto = $('filtroTexto').value.trim().toLowerCase();
    var todas = CRUDO[TAB] || [];
    var out = [];
    todas.forEach(function (f, i) {
      if (hotel && f.hotel !== hotel) return;
      if (temp && f.cod_temp !== temp) return;
      if (texto && JSON.stringify(f).toLowerCase().indexOf(texto) === -1) return;
      out.push(i);
    });
    return out;
  }

  var MENSAJES = 'plantillas';

  function pintar() {
    pintarFiltroTemp();
    var esMensajes = (TAB === MENSAJES);
    $('tabla').classList.toggle('oculto', esMensajes);
    $('mensajes').classList.toggle('oculto', !esMensajes);
    $('btnFila').classList.toggle('oculto', esMensajes);
    $('filtroTexto').classList.toggle('oculto', esMensajes);
    if (esMensajes) pintarMensajes(); else pintarTabla();
    pintarLateral();
    pintarPie();
    pintarEstado();
    pintarPips();
  }

  function pintarFiltroTemp() {
    var sel = $('filtroTemp');

    // En Mensajes el segundo filtro elige la ASESORA: es la otra dimension
    // por la que se parte esa tabla, igual que la temporada parte las tarifas.
    if (TAB === MENSAJES) {
      sel.parentNode.style.display = '';
      var actual = sel.value;
      var quienes = (CRUDO.asesoras || []).map(function (a) {
        return String(a.iniciales).toUpperCase();
      });
      sel.innerHTML = '<option value="">Mensaje del hotel</option>' +
        quienes.map(function (q) {
          var a = CRUDO.asesoras.filter(function (x) {
            return String(x.iniciales).toUpperCase() === q;
          })[0];
          return '<option value="' + esc(q) + '">' + esc(q + ' · ' + a.nombre) + '</option>';
        }).join('');
      sel.value = quienes.indexOf(actual) !== -1 ? actual : '';
      return;
    }

    var usa = (TAB === 'tarifas');
    sel.parentNode.style.display = usa ? '' : 'none';
    if (!usa) { sel.value = ''; return; }
    var ops = opcionesTemp($('filtroHotel').value);
    var actual2 = sel.value;
    sel.innerHTML = '<option value="">Todas las temporadas</option>' +
      ops.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('');
    sel.value = ops.indexOf(actual2) !== -1 ? actual2 : '';
  }

  function anchos(esq) {
    return esq.cols.map(function (c) { return c.w; }).join(' ') + ' 28px';
  }

  function pintarTabla() {
    var esq = ESQUEMAS[TAB];
    var cont = $('tabla');
    var vis = filasVisibles();
    var estilo = 'grid-template-columns:' + anchos(esq);

    var h = ['<div class="adm-fila adm-encabezado" style="' + estilo + '" role="row">'];
    esq.cols.forEach(function (c) {
      h.push('<div' + (c.tipo === 'num' ? ' class="adm-num"' : '') +
             (c.ayuda ? ' title="' + esc(c.ayuda) + '"' : '') + '>' + esc(c.et) + '</div>');
    });
    h.push('<div></div></div>');

    if (!vis.length) {
      h.push('<p class="adm-vacio">No hay ' + esq.titulo + ' que coincidan con el filtro.</p>');
      cont.innerHTML = h.join('');
      return;
    }

    vis.forEach(function (idx) {
      var f = CRUDO[TAB][idx];
      var sev = severidadFila(idx, f);
      h.push('<div class="adm-fila' + (sev ? ' con-' + sev : '') + '" ' +
             'style="' + estilo + '" data-idx="' + idx + '" role="row">');
      esq.cols.forEach(function (c) { h.push(celda(f, c, idx)); });
      h.push('<button type="button" class="adm-borrar" data-borrar="' + idx +
             '" aria-label="Borrar fila">×</button>');
      h.push('</div>');
    });
    cont.innerHTML = h.join('');

    cont.querySelectorAll('[data-campo]').forEach(function (el) {
      el.addEventListener('change', alEditar);
      if (el.tagName === 'INPUT') el.addEventListener('input', marcarSucio);
    });
    cont.querySelectorAll('[data-borrar]').forEach(function (b) {
      b.addEventListener('click', function () { borrarFila(Number(b.dataset.borrar)); });
    });
  }

  function celda(f, c, idx) {
    var v = f[c.c];
    var attrs = 'class="adm-celda' + (c.tipo === 'num' ? ' adm-num' : '') +
                (cambio(idx, c.c) ? ' cambiada' : '') + '" ' +
                'data-campo="' + c.c + '" data-idx="' + idx + '"';

    if (c.tipo === 'hotel' || c.tipo === 'hab' || c.tipo === 'temp' || c.tipo === 'lista') {
      var ops = c.tipo === 'hotel' ? hoteles()
              : c.tipo === 'hab' ? opcionesHab(f.hotel)
              : c.tipo === 'temp' ? opcionesTemp(f.hotel)
              : c.ops;
      var vacio = (c.tipo === 'hab' || c.tipo === 'temp');
      var html = '<select ' + attrs + '>';
      if (vacio || ops.indexOf(v) === -1) {
        html += '<option value=""' + (v === '' || v == null ? ' selected' : '') + '>—</option>';
      }
      ops.forEach(function (o) {
        html += '<option value="' + esc(o) + '"' + (String(v) === String(o) ? ' selected' : '') +
                '>' + esc(o) + '</option>';
      });
      return html + '</select>';
    }

    if (c.tipo === 'bool') {
      return '<select ' + attrs + '>' +
             '<option value="si"' + (v === true ? ' selected' : '') + '>Sí</option>' +
             '<option value="no"' + (v !== true ? ' selected' : '') + '>No</option>' +
             '</select>';
    }

    var tipoInput = c.tipo === 'fecha' ? 'date' : c.tipo === 'num' ? 'number' : 'text';
    return '<input type="' + tipoInput + '" ' + attrs +
           ' value="' + esc(v === null ? '' : v) + '"' +
           (c.tipo === 'num' ? ' step="any"' : '') + '>';
  }

  /** ¿Esta celda cambió respecto del archivo publicado? */
  function cambio(idx, campo) {
    var orig = (ORIGINAL[TAB] || [])[idx];
    var act = (CRUDO[TAB] || [])[idx];
    if (!orig) return true;                       // fila nueva
    return JSON.stringify(orig[campo]) !== JSON.stringify(act[campo]);
  }

  /**
   * ¿El validador tiene algo que decir de esta fila?
   *
   * Los hallazgos no traen número de fila —el validador trabaja sobre el
   * catálogo construido, no sobre el archivo—, así que se emparejan por los
   * códigos que aparecen en el mensaje. Es aproximado a propósito: marcar de
   * más en la tabla ayuda, y el texto exacto está en el panel.
   */
  function severidadFila(idx, f) {
    var claves = [f.cod_temp, f.cod_promo, f.cod_extra, f.hotel]
      .filter(Boolean).map(String);

    // El validador nombra las habitaciones por su nombre, no por su codigo:
    // sus mensajes los lee una persona. La fila tiene el codigo, asi que se
    // busca por el nombre correspondiente.
    if (f.cod_hab) {
      var hab = (CRUDO.habitaciones || []).filter(function (h) {
        return h.hotel === f.hotel && h.cod_hab === f.cod_hab;
      })[0];
      claves.push(hab ? String(hab.nombre_display) : String(f.cod_hab));
    }
    if (!claves.length) return '';
    var peor = '';
    HALLAZGOS.forEach(function (h) {
      if (h[1] !== TAB) return;
      var msg = h[3];
      var tocado = claves.every(function (k) { return msg.indexOf(k) !== -1; });
      if (!tocado) return;
      if (h[0] === 'ERROR') peor = 'error';
      else if (!peor) peor = 'aviso';
    });
    return peor;
  }

  // ==========================================================================
  // EDICIÓN
  // ==========================================================================
  function alEditar(e) {
    var el = e.target;
    var idx = Number(el.dataset.idx);
    var campo = el.dataset.campo;
    var fila = CRUDO[TAB][idx];
    var col = ESQUEMAS[TAB].cols.filter(function (c) { return c.c === campo; })[0];

    if (col.tipo === 'bool') {
      fila[campo] = (el.value === 'si');
    } else if (col.tipo === 'num') {
      fila[campo] = el.value === '' ? '' : Number(el.value);
    } else {
      fila[campo] = el.value;
    }

    // Cambiar de hotel invalida la habitación y la temporada elegidas: son de
    // otro hotel y dejarlas produce una fila que no cotiza nada.
    if (campo === 'hotel') {
      if ('cod_hab' in fila && opcionesHab(fila.hotel).indexOf(fila.cod_hab) === -1) fila.cod_hab = '';
      if ('cod_temp' in fila && opcionesTemp(fila.hotel).indexOf(fila.cod_temp) === -1) fila.cod_temp = '';
    }

    guardarBorrador();
    revalidar();

    // Editar puede sacar la fila del filtro activo -cambiar su hotel, por
    // ejemplo- y desaparece de la vista. Es lo que hace un filtro, pero visto
    // desde el otro lado parece que la edicion borro la fila.
    var visibleAntes = filasVisibles().indexOf(idx) !== -1;
    pintar();
    if (!visibleAntes) {
      aviso('La fila salió del filtro y ya no se ve aquí', 'exito');
    }
  }

  function marcarSucio() { pintarEstado(); }

  function filaNueva() {
    var esq = ESQUEMAS[TAB];
    var f = {};
    esq.cols.forEach(function (c) {
      f[c.c] = c.tipo === 'bool' ? true
             : c.c === 'hotel' ? ($('filtroHotel').value || hoteles()[0])
             : c.tipo === 'lista' ? c.ops[0]
             : '';
    });
    // Las columnas que la tabla no muestra pero el archivo sí tiene.
    var muestra = (ORIGINAL[TAB] || [])[0];
    if (muestra) {
      Object.keys(muestra).forEach(function (k) { if (!(k in f)) f[k] = ''; });
    }
    // Arriba: la fila recién agregada es la que hay que completar.
    CRUDO[TAB].unshift(f);
    guardarBorrador();
    revalidar();
    pintar();
    var primera = $('tabla').querySelector('.adm-fila:not(.adm-encabezado) [data-campo]');
    if (primera) primera.focus();
  }

  function borrarFila(idx) {
    var f = CRUDO[TAB][idx];
    var etq = [f.cod_hab, f.cod_temp, f.cod_promo, f.cod_extra, f.nombre]
      .filter(Boolean).join(' · ') || 'esta fila';
    if (!window.confirm('¿Borrar ' + etq + '?')) return;
    CRUDO[TAB].splice(idx, 1);
    guardarBorrador();
    revalidar();
    pintar();
  }

  // ==========================================================================
  // PANEL LATERAL
  // ==========================================================================
  function pintarLateral() {
    var err = cuenta('ERROR'), adv = cuenta('ADVERTENCIA');
    var m = $('marcadorValidador');
    if (err) {
      m.className = 'adm-marcador error';
      m.textContent = err + (err === 1 ? ' error' : ' errores');
    } else if (adv) {
      m.className = 'adm-marcador aviso';
      m.textContent = adv + (adv === 1 ? ' advertencia' : ' advertencias');
    } else {
      m.className = 'adm-marcador';
      m.textContent = 'todo en orden';
    }

    var cont = $('hallazgos');
    var reales = HALLAZGOS.filter(function (h) { return h[0] !== 'OK'; });
    var h = [];

    reales.forEach(function (x, i) {
      var esError = x[0] === 'ERROR';
      h.push('<div class="adm-hallazgo' + (esError ? ' es-error' : '') + '">');
      h.push(  '<span class="adm-hallazgo-marca" aria-hidden="true">!</span>');
      h.push(  '<div class="adm-hallazgo-cuerpo">');
      h.push(    '<span class="adm-hallazgo-tipo">' + esc(x[0]) + ' · ' + esc(x[2]) + '</span>');
      h.push(    '<span class="adm-hallazgo-texto">' + esc(x[3]) + '</span>');
      if (ESQUEMAS[x[1]]) {
        h.push(  '<button type="button" class="adm-hallazgo-ir" data-ir="' + i + '">' +
                 'Ir a la fila</button>');
      }
      h.push(  '</div>');
      h.push('</div>');
    });

    if (!err) {
      h.push('<p class="adm-todo-bien">Sin errores que impidan publicar.</p>');
    }
    cont.innerHTML = h.join('');

    cont.querySelectorAll('[data-ir]').forEach(function (b) {
      b.addEventListener('click', function () { irAlHallazgo(reales[Number(b.dataset.ir)]); });
    });

    // El botón de publicar se apaga con errores. Publicar un catálogo que no
    // carga deja a las asesoras sin cotizador.
    $('btnPublicar').disabled = (err > 0) || !hayCambios();
    $('btnDescartar').disabled = !hayCambios();

    pintarResumen();
  }

  /** Lleva a la pestaña y la fila del hallazgo, y la destaca un momento. */
  function irAlHallazgo(x) {
    var tabla = x[1];
    if (!ESQUEMAS[tabla]) return;
    if (TAB !== tabla) {
      TAB = tabla;
      [].forEach.call(document.querySelectorAll('.adm-pestana'), function (p) {
        p.classList.toggle('activa', p.dataset.tab === TAB);
      });
    }
    $('filtroTexto').value = '';
    $('filtroTemp').value = '';
    pintar();

    var candidata = $('tabla').querySelector('.adm-fila.con-error, .adm-fila.con-aviso');
    if (candidata) {
      candidata.scrollIntoView({ block: 'center' });
      candidata.classList.add('destacada');
      setTimeout(function () { candidata.classList.remove('destacada'); }, 1500);
    }
  }

  function pintarResumen() {
    var nuevas = 0, modificadas = 0;
    Catalogo.TABLAS.forEach(function (t) {
      var o = ORIGINAL[t], c = CRUDO[t];
      if (!Array.isArray(c)) return;
      if (!Array.isArray(o)) { nuevas += c.length; return; }
      if (c.length > o.length) nuevas += c.length - o.length;
      var n = Math.min(o.length, c.length);
      for (var i = 0; i < n; i++) {
        if (JSON.stringify(o[i]) !== JSON.stringify(c[i])) modificadas++;
      }
    });

    var cierres = (CRUDO['stop-sales'] || []).filter(function (s) { return s.activo; }).length;
    var juegos = {};
    (CRUDO.plantillas || []).forEach(function (p) {
      var q = String(p.asesor || '').trim();
      if (q) juegos[q] = true;
    });
    var filas = [
      ['Archivos por publicar', archivosCambiados().length],
      ['Juegos de mensajes propios', Object.keys(juegos).length],
      ['Filas modificadas', modificadas],
      ['Filas nuevas', nuevas],
      ['Cierres de venta activos', cierres]
    ];
    $('resumen').innerHTML = filas.map(function (f) {
      return '<div><dt>' + esc(f[0]) + '</dt>' +
             '<dd' + (f[1] ? '' : ' class="cero"') + '>' + f[1] + '</dd></div>';
    }).join('');
  }

  function pintarPie() {
    var vis = filasVisibles().length;
    var todas = (CRUDO[TAB] || []).length;
    var hotel = $('filtroHotel');
    var nom = hotel.value ? ' · ' + hotel.options[hotel.selectedIndex].text : '';

    // En Mensajes no se ve una tabla sino UN texto: contar filas ahi decia
    // "0 de 10 filas", que se lee como que algo fallo. Lo que importa es de
    // quien es el mensaje que se esta editando y si es propio o heredado.
    if (TAB === MENSAJES) {
      var quien = $('filtroTemp');
      var deQuien = quien.value
        ? quien.options[quien.selectedIndex].text
        : 'mensaje del hotel';
      $('pieFilas').textContent = !hotel.value
        ? 'elige un hotel'
        : deQuien + nom +
          ($('plantillaTexto').dataset.heredada ? ' · heredado del hotel' : '');
      piePendiente();
      return;
    }

    $('pieFilas').textContent = vis === todas
      ? todas + (todas === 1 ? ' fila' : ' filas') + nom
      : vis + ' de ' + todas + ' filas' + nom;

    piePendiente();
  }

  function piePendiente() {
    if (!guardadoEn) { $('pieGuardado').textContent = ''; return; }
    var s = Math.round((Date.now() - guardadoEn) / 1000);
    $('pieGuardado').textContent = s < 60 ? 'borrador guardado hace ' + s + ' s'
                                          : 'borrador guardado hace ' + Math.round(s / 60) + ' min';
  }

  function pintarEstado() {
    var ver = (CRUDO.config && CRUDO.config.VERSION_TARIFAS) || '';
    var el = $('admEstado');
    if (hayCambios()) {
      el.className = 'adm-estado sucio';
      el.textContent = ver + ' · borrador sin publicar';
    } else {
      el.className = 'adm-estado';
      el.textContent = ver + ' · sin cambios';
    }
  }

  /** Un punto en la pestaña que tiene hallazgos: se ven sin ir buscándolos. */
  function pintarPips() {
    [].forEach.call(document.querySelectorAll('.adm-pestana'), function (p) {
      var tabla = p.dataset.tab;
      var tiene = HALLAZGOS.some(function (h) { return h[1] === tabla && h[0] !== 'OK'; });
      var pip = p.querySelector('.adm-pip');
      if (tiene && !pip) {
        p.insertAdjacentHTML('beforeend', '<span class="adm-pip" aria-hidden="true"></span>');
      } else if (!tiene && pip) {
        pip.remove();
      }
    });
  }

  // ==========================================================================
  // MENSAJES
  //
  // Cada asesora escribe distinto, y el mensaje sale firmado con sus
  // iniciales: que lo firme una y suene a otra es raro para el cliente que ya
  // habia hablado con ella. Por eso hay un juego de mensajes por asesora, con
  // caida al del hotel para quien no tenga uno propio.
  //
  // No es una tabla: son textos largos que se leen enteros y se corrigen
  // palabra a palabra. Editor a la izquierda y, al lado, exactamente lo que va
  // a recibir el cliente — que es la unica forma de ver que una llave quedo
  // mal escrita antes de que lo descubra una asesora con el cliente esperando.
  // ==========================================================================

  /** La fila de plantillas que corresponde al filtro de hotel y asesora. */
  function filaPlantilla() {
    var hotel = $('filtroHotel').value;
    var quien = $('filtroTemp').value;      // en esta pestaña, la asesora
    if (!hotel) return null;
    var lista = CRUDO.plantillas || [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].hotel === hotel &&
          String(lista[i].asesor || '').toUpperCase() === quien) return lista[i];
    }
    return null;
  }

  function pintarMensajes() {
    var hotel = $('filtroHotel').value;
    var quien = $('filtroTemp').value;
    var fila = filaPlantilla();
    var ta = $('plantillaTexto');

    var nombre = quien
      ? ((CRUDO.asesoras || []).filter(function (a) {
          return String(a.iniciales).toUpperCase() === quien;
        })[0] || {}).nombre || quien
      : 'mensaje del hotel';
    $('plantillaQuien').textContent = hotel
      ? (CRUDO.hoteles.filter(function (h) { return h.codigo === hotel; })[0] || {}).nombre_corto +
        ' · ' + nombre
      : 'elige un hotel';

    ta.disabled = !hotel;
    if (!hotel) {
      ta.value = '';
      $('plantillaPrevia').textContent = 'Elige un hotel para ver su mensaje.';
      $('plantillaMarcadores').innerHTML = '';
      return;
    }

    if (!fila) {
      // Quien no tiene juego propio hereda el del hotel. Se muestra para que
      // se pueda partir de el, y solo se crea la fila si de verdad se edita.
      ta.value = plantillaHeredada(hotel);
      ta.dataset.heredada = '1';
    } else {
      ta.value = fila.plantilla;
      delete ta.dataset.heredada;
    }
    pintarPrevia();
  }

  function plantillaHeredada(hotel) {
    var lista = CRUDO.plantillas || [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].hotel === hotel && !String(lista[i].asesor || '').trim()) {
        return lista[i].plantilla;
      }
    }
    return '';
  }

  /**
   * La vista previa con una cotizacion de ejemplo.
   *
   * Se arma con el motor de verdad, no con texto de relleno: si la plantilla
   * tiene una llave mal escrita, aqui aparece tal cual y no como un hueco.
   */
  function pintarPrevia() {
    var hotel = $('filtroHotel').value;
    var quien = $('filtroTemp').value;
    var texto = $('plantillaTexto').value;
    var caja = $('plantillaPrevia');
    var ta = $('plantillaTexto');

    if (!CAT || !CAT.hoteles[hotel]) {
      caja.textContent = 'Este hotel no está activo: no se puede previsualizar.';
      return;
    }

    // Copia del catalogo con la plantilla que se esta escribiendo, sin tocar
    // el borrador: escribir a medias no puede romper lo guardado.
    var cat = Object.create(CAT);
    cat.plantillas = Object.create(CAT.plantillas);
    cat.plantillas[hotel + '|' + quien] = texto;
    if (!quien) cat.plantillas[hotel + '|'] = texto;

    var req = ejemploDe(hotel);
    var r;
    try {
      r = Motor.calcular(cat, req);
      if (!r.ok) throw new Error(r.errores[0]);
      caja.textContent = Motor.render(cat, r, {
        asesorIniciales: quien || 'MZ', cliente: 'María Sánchez'
      });
    } catch (e) {
      caja.textContent = 'No se puede previsualizar: ' + e.message;
      ta.classList.add('con-error');
      $('plantillaMarcadores').innerHTML =
        '<span class="falta">' + esc(e.message) + '</span>';
      return;
    }
    ta.classList.remove('con-error');
    pintarMarcadores(texto, caja.textContent);
  }

  /** Una cotizacion de ejemplo que funcione en ese hotel. */
  function ejemploDe(hotel) {
    var hab = (CRUDO.habitaciones || []).filter(function (h) {
      return h.hotel === hotel && h.activo;
    })[0];
    var temp = (CRUDO.temporadas || []).filter(function (t) { return t.hotel === hotel; })[0];
    var ci = temp ? temp.fecha_inicio : '2026-09-20';
    var co = Motor.Fechas.sumarDias(ci, 3);
    return {
      hotel: hotel, checkin: ci, checkout: co, promos: [], extras: [],
      lineas: [{ cod_hab: hab ? hab.cod_hab : '', cantidad: 1,
                 adultos: hab ? Math.max(1, Number(hab.ocup_min_fisica) || 1) : 2,
                 edades: [] }]
    };
  }

  /**
   * Las llaves usadas y, sobre todo, las que el motor NO sabe resolver: una
   * llave mal escrita se imprime literal en el mensaje del cliente.
   */
  function pintarMarcadores(texto, salida) {
    var usadas = (texto.match(/\{\{(\w+)\}\}/g) || [])
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    var sinResolver = Motor.marcadoresNoResueltos(salida);

    var h = [];
    if (sinResolver.length) {
      h.push('<span class="falta">Sin resolver: ' + esc(sinResolver.join(', ')) +
             ' — saldrían así en el mensaje.</span><br>');
    }
    h.push('Disponibles: ' + Motor.MARCADORES.map(function (m) {
      return '<code>{{' + m + '}}</code>';
    }).join(' '));
    if (usadas.length) {
      h.push('<br>En uso: ' + usadas.length + ' de ' + Motor.MARCADORES.length + '.');
    }
    $('plantillaMarcadores').innerHTML = h.join('');
  }

  function alEditarPlantilla() {
    var hotel = $('filtroHotel').value;
    var quien = $('filtroTemp').value;
    if (!hotel) return;

    var fila = filaPlantilla();
    if (!fila) {
      // Recien ahora se crea el juego propio: hasta que no se edita, la
      // asesora sigue usando el del hotel y no hay fila que mantener.
      fila = { hotel: hotel, asesor: quien, plantilla: '' };
      CRUDO.plantillas.push(fila);
    }
    fila.plantilla = $('plantillaTexto').value;
    delete $('plantillaTexto').dataset.heredada;

    guardarBorrador();
    revalidar();
    pintarPrevia();
    pintarLateral();
    pintarEstado();
    pintarPips();
  }

  // ==========================================================================
  // PUBLICAR
  // ==========================================================================
  function abrirPublicar() {
    var cambiados = archivosCambiados();
    if (!cambiados.length) return;

    $('listaArchivos').innerHTML = cambiados.map(function (t) {
      var n = Array.isArray(CRUDO[t]) ? CRUDO[t].length + ' filas' : 'configuración';
      return '<li><span>datos/' + esc(t) + '.json</span>' +
             '<span class="adm-archivo-det">' + n + '</span></li>';
    }).join('');
    $('modalPublicar').classList.remove('oculto');
  }

  function descargar() {
    var cambiados = archivosCambiados();
    cambiados.forEach(function (t, i) {
      // Uno por uno y espaciados: los navegadores bloquean varias descargas
      // seguidas si llegan todas en el mismo instante.
      setTimeout(function () {
        bajarArchivo(t + '.json', JSON.stringify(CRUDO[t], null, 2) + '\n');
      }, i * 350);
    });
    $('modalPublicar').classList.add('oculto');
    aviso(cambiados.length === 1 ? 'Archivo descargado'
                                 : cambiados.length + ' archivos descargados', 'exito');
  }

  function bajarArchivo(nombre, texto) {
    var blob = new Blob([texto], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ==========================================================================
  var avisoTimer = null;
  function aviso(msg, tipo) {
    var a = $('aviso');
    a.textContent = msg;
    a.className = 'aviso visible' + (tipo ? ' ' + tipo : '');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { a.className = 'aviso'; }, 2600);
  }

  iniciar();
})();
