/**
 * COTIZADOR HESPERIA - motor.js
 * Motor de calculo y render. Una sola implementacion del calculo: ningun otro
 * archivo puede reproducir estas reglas.
 *
 * No depende del DOM ni de ninguna API externa. Se mantiene en ES5 a proposito:
 * es el archivo que menos debe cambiar, y asi corre igual en los arneses de
 * Node, en el navegador y en cualquier celular viejo.
 */
var Motor = (function () {
  'use strict';

  // ==========================================================================
  // FECHAS - solo strings ISO. Un unico punto toca Date (sumarDias).
  // ==========================================================================
  var F = {
    esISO: function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); },

    sumarDias: function (iso, n) {
      var p = iso.split('-');
      var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    },

    diffDias: function (a, b) {
      var pa = a.split('-'), pb = b.split('-');
      var da = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]);
      var db = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
      return Math.round((db - da) / 86400000);
    },

    // 1 = lunes ... 7 = domingo
    diaSemana: function (iso) {
      var p = iso.split('-');
      var g = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
      return g === 0 ? 7 : g;
    },

    // Noches de la estadia: [checkin, checkout). El dia de salida NO es noche.
    noches: function (ci, co) {
      var out = [], c = ci, guard = 0;
      while (c < co && guard++ < 400) { out.push(c); c = F.sumarDias(c, 1); }
      return out;
    },

    fmtCorto: function (iso) {
      var p = iso.split('-');
      return p[2] + '/' + p[1] + '/' + p[0].slice(2);
    },

    fmtLargo: function (iso) {
      var p = iso.split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    },

    /** Respeta la columna formato_fecha del hotel. */
    fmt: function (iso, formato) {
      return String(formato).indexOf('yyyy') !== -1 ? F.fmtLargo(iso) : F.fmtCorto(iso);
    },

    enRango: function (iso, ini, fin) { return iso >= ini && iso <= fin; }
  };

  // ==========================================================================
  // UTILIDADES
  // ==========================================================================
  function r2(n) { return Math.round(n * 100) / 100; }

  /**
   * Todos los montos que ve el cliente son enteros redondeados HACIA ARRIBA.
   * El epsilon evita que la basura de coma flotante (170.00000000000003)
   * empuje un valor exacto al entero siguiente.
   */
  function techo(n) { return Math.ceil(r2(n) - 1e-9); }

  function fmtMoney(cat, n) {
    return String(techo(n));
  }

  function pad2(n) { return ('0' + n).slice(-2); }

  function rangosDe(cat, hotel) { return (cat.politica && cat.politica[hotel]) || []; }

  function rangoPorCod(cat, hotel, cod) {
    var rs = rangosDe(cat, hotel);
    for (var i = 0; i < rs.length; i++) if (rs[i].cod === cod) return rs[i];
    return null;
  }

  function rangoPorEdad(cat, hotel, edad) {
    var rs = rangosDe(cat, hotel);
    for (var i = 0; i < rs.length; i++) {
      if (edad >= rs[i].edadMin && edad <= rs[i].edadMax) return rs[i];
    }
    return null;
  }

  /** "5", "5 y 8", "5, 8 y 12" */
  function unirY(lista) {
    if (lista.length <= 1) return lista.join('');
    return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
  }

  /** "8 años" / "1 año" / "5 y 8 años" */
  function textoEdades(edades) {
    if (!edades || !edades.length) return '';
    var unidad = (edades.length === 1 && edades[0] === 1) ? ' a\u00F1o' : ' a\u00F1os';
    return unirY(edades.map(String)) + unidad;
  }

  // ==========================================================================
  // DISPONIBILIDAD (stop sales)
  // ==========================================================================
  /**
   * Un cierre de venta cubre NOCHES, no dias calendario: el rango [inicio, fin]
   * se compara contra cada noche de la estadia. Quien sale la manana del primer
   * dia cerrado no ocupa esa noche y por lo tanto no se ve afectado.
   */
  function stopSaleDe(cat, hotel, codHab, noche) {
    var lista = cat.stopSales || [];
    for (var i = 0; i < lista.length; i++) {
      var s = lista[i];
      if (s.hotel !== hotel) continue;
      if (s.codHab !== 'TODAS' && s.codHab !== codHab) continue;
      if (!F.enRango(noche, s.inicio, s.fin)) continue;
      return s;
    }
    return null;
  }

  // ==========================================================================
  // RESOLUCION DE TARIFA POR NOCHE
  // ==========================================================================
  function temporadaDe(cat, hotel, noche) {
    var mejor = null;
    for (var i = 0; i < cat.temporadas.length; i++) {
      var t = cat.temporadas[i];
      if (t.hotel !== hotel) continue;
      if (!F.enRango(noche, t.inicio, t.fin)) continue;
      if (!mejor || t.prioridad > mejor.prioridad) mejor = t;
    }
    return mejor;
  }

  function promoDe(cat, hotel, codHab, noche, nNoches, promosSel) {
    if (!promosSel || !promosSel.length) return null;
    var mejor = null;
    for (var i = 0; i < cat.promociones.length; i++) {
      var p = cat.promociones[i];
      if (p.hotel !== hotel) continue;
      if (promosSel.indexOf(p.cod) === -1) continue;
      if (p.codHab !== 'TODAS' && p.codHab !== codHab) continue;
      if (!F.enRango(noche, p.inicio, p.fin)) continue;
      if (p.minNoches && nNoches < p.minNoches) continue;
      if (p.diasSemana.length && p.diasSemana.indexOf(F.diaSemana(noche)) === -1) continue;
      if (!mejor || p.prioridad > mejor.prioridad) mejor = p;
    }
    return mejor;
  }

  /**
   * Tarifa que cubre a `ocupacion` huespedes, y a cuantos cubre.
   *
   * Con una fila por ocupacion se elige la mayor que no la supere: si la
   * habitacion admite mas gente que la ultima tarifa cargada, el resto se
   * cobra como personas adicionales. Si la ocupacion queda por DEBAJO de la
   * menor tarifa cargada no se inventa un precio: la Deluxe Twin de Valencia
   * solo tiene tarifa para dos, y venderla a uno es una decision comercial que
   * nadie tomo.
   */
  function tarifaPorPax(t, ocupacion) {
    var elegida = null;
    for (var i = 0; i < t.paxOrdenados.length; i++) {
      if (t.paxOrdenados[i] <= ocupacion) elegida = t.paxOrdenados[i];
    }
    return elegida;
  }

  /** Lo que paga un huesped adicional de esa edad. null si no paga. */
  function adicionalDe(cat, hotel, codHab, edad) {
    var lista = (cat.adicionales || {})[hotel + '|' + codHab] ||
                (cat.adicionales || {})[hotel + '|TODAS'] || [];
    for (var i = 0; i < lista.length; i++) {
      if (edad >= lista[i].edadMin && edad <= lista[i].edadMax) return lista[i];
    }
    return null;
  }

  function tarifaNoche(cat, hotel, codHab, noche, nNoches, promosSel, ocupacion) {
    // La disponibilidad se revisa ANTES que el precio: si no hay cupo, el
    // precio es irrelevante y el mensaje debe hablar de cupo, no de tarifas.
    var ss = stopSaleDe(cat, hotel, codHab, noche);
    if (ss) {
      return {
        error: 'Sin cupo la noche del ' + F.fmtCorto(noche) +
               (ss.motivo ? ' (' + ss.motivo + ')' : '') + '.',
        sinCupo: true, noche: noche, motivo: ss.motivo || ''
      };
    }

    var temp = temporadaDe(cat, hotel, noche);
    var base = null, paxCubiertos = null;
    if (temp) {
      var t = cat.tarifas[hotel + '|' + codHab + '|' + temp.cod];
      if (t) {
        if (t.tarifa !== null) {
          base = t.tarifa;                       // tarifa unica
        } else if (t.paxOrdenados.length) {
          paxCubiertos = tarifaPorPax(t, ocupacion);
          if (paxCubiertos === null) {
            return {
              error: 'no tiene tarifa para ' + ocupacion +
                     (ocupacion === 1 ? ' huesped' : ' huespedes') +
                     ' el ' + F.fmtCorto(noche) + '.'
            };
          }
          base = t.porPax[paxCubiertos];
        }
      }
    }
    var promo = promoDe(cat, hotel, codHab, noche, nNoches, promosSel);
    var final = base, origen = temp ? temp.nombre : null;

    if (promo) {
      if (promo.tipo === 'SUSTITUYE') {
        final = promo.valor;
      } else if (base === null) {
        return { error: 'Sin tarifa base para aplicar la promocion en ' + F.fmtCorto(noche) };
      } else if (promo.tipo === 'DESCUENTO_PCT') {
        final = r2(base * (1 - promo.valor / 100));
      } else if (promo.tipo === 'DESCUENTO_MONTO') {
        final = Math.max(0, r2(base - promo.valor));
      }
      origen = promo.nombre;
    }

    if (final === null) {
      return {
        error: 'Sin tarifa cargada para ' + F.fmtCorto(noche) +
               (temp ? ' (temporada ' + temp.nombre + ')' : ' (sin temporada definida)')
      };
    }
    return {
      fecha: noche, tarifaBase: base, tarifaFinal: final, paxCubiertos: paxCubiertos,
      temporada: temp ? temp.cod : null, temporadaNombre: temp ? temp.nombre : null,
      promo: promo ? promo.cod : null, promoNombre: promo ? promo.nombre : null,
      origen: origen
    };
  }

  // ==========================================================================
  // MENORES: de edades reales a rangos de la politica del hotel
  // ==========================================================================
  /**
   * Acepta dos formas de entrada y devuelve siempre lo mismo:
   *   linea.edades  = [5, 8, 12]      <- forma actual, la que usa la SPA
   *   linea.menores = { NIN: 2 }      <- forma vieja, sin edades individuales
   *
   * Salida: [{ cod, cant, rango, edades: [..] }] ordenada por rango.orden.
   */
  function resolverMenores(cat, hotel, linea, errores, etq) {
    var porCod = {};
    var orden = [];

    function acumular(cod, rango, edad) {
      if (!porCod[cod]) {
        porCod[cod] = { cod: cod, cant: 0, rango: rango, edades: [] };
        orden.push(porCod[cod]);
      }
      porCod[cod].cant++;
      if (edad !== null) porCod[cod].edades.push(edad);
    }

    if (linea.edades && linea.edades.length) {
      linea.edades.forEach(function (raw) {
        var edad = Number(raw);
        if (raw === '' || raw === null || raw === undefined || isNaN(edad)) {
          errores.push(etq + ': hay un menor sin edad indicada.');
          return;
        }
        if (edad !== Math.floor(edad) || edad < 0) {
          errores.push(etq + ': edad invalida "' + raw + '".');
          return;
        }
        if (edad > 17) {
          errores.push(etq + ': ' + edad + ' a\u00F1os es un adulto. ' +
                       'Cuentelo en el campo Adultos.');
          return;
        }
        var rg = rangoPorEdad(cat, hotel, edad);
        if (!rg) {
          errores.push(etq + ': la edad ' + edad + ' no cae en ningun rango de ' +
                       'la politica de ' + hotel + '.');
          return;
        }
        acumular(rg.cod, rg, edad);
      });
    } else {
      var menores = linea.menores || {};
      Object.keys(menores).forEach(function (cod) {
        var cant = Number(menores[cod]) || 0;
        if (cant <= 0) return;
        var rg = rangoPorCod(cat, hotel, cod);
        if (!rg) {
          errores.push('Rango de edad no valido para ' + hotel + ': ' + cod);
          return;
        }
        for (var i = 0; i < cant; i++) acumular(cod, rg, null);
      });
    }

    orden.forEach(function (g) {
      g.edades.sort(function (a, b) { return a - b; });
    });
    orden.sort(function (a, b) { return a.rango.orden - b.rango.orden; });
    return orden;
  }

  // ==========================================================================
  // CALCULO PRINCIPAL
  // ==========================================================================
  /**
   * req = {
   *   hotel: 'HBK', checkin: 'YYYY-MM-DD', checkout: 'YYYY-MM-DD',
   *   promos: ['COD_PROMO'],
   *   lineas: [{ cod_hab:'BAS_DBL', cantidad:1, adultos:2, edades:[5, 12] }]
   * }
   */
  function calcular(cat, req) {
    var res = {
      ok: false, errores: [], advertencias: [], sinCupo: [],
      extras: [], totalExtras: 0,
      hotel: req.hotel, checkin: req.checkin, checkout: req.checkout,
      lineas: [], subtotal: 0, cargos: 0, total: 0,
      promosAplicadas: [], cargosResumen: [], totalHabitaciones: 0
    };

    // --- Validaciones estructurales -----------------------------------------
    var hotel = cat.hoteles[req.hotel];
    if (!hotel) { res.errores.push('Hotel no valido: ' + req.hotel); return res; }
    if (!F.esISO(req.checkin) || !F.esISO(req.checkout)) {
      res.errores.push('Fechas invalidas. Use formato YYYY-MM-DD.'); return res;
    }
    if (req.checkout <= req.checkin) {
      res.errores.push('La fecha de salida debe ser posterior a la de entrada.'); return res;
    }
    if (!req.lineas || !req.lineas.length) {
      res.errores.push('Debe agregar al menos una habitacion.'); return res;
    }

    var porHabitacion = hotel.modoTarifa === 'POR_HABITACION';

    var noches = F.noches(req.checkin, req.checkout);
    res.noches = noches;
    res.nNoches = noches.length;
    res.nDias = noches.length + 1;
    if (res.nNoches > 60) res.advertencias.push('Estadia de ' + res.nNoches + ' noches: verifique las fechas.');

    var promosSel = req.promos || [];
    var promoUso = {};

    // --- Lineas --------------------------------------------------------------
    for (var li = 0; li < req.lineas.length; li++) {
      var L = req.lineas[li];
      var hab = cat.habitaciones[req.hotel + '|' + L.cod_hab];
      if (!hab) { res.errores.push('Habitacion no valida: ' + L.cod_hab); continue; }

      var cantidad = Number(L.cantidad) || 1;
      var adultos = Number(L.adultos) || 0;
      var etq = hab.nombre + (cantidad > 1 ? ' (x' + cantidad + ')' : '');

      var detMenores = resolverMenores(cat, req.hotel, L, res.errores, etq);

      // Ocupacion y pax que pagan
      var ocupacion = adultos, paxPagos = adultos, huespedesQuePagan = adultos;
      detMenores.forEach(function (m) {
        if (m.rango.cuentaOcupacion) ocupacion += m.cant;
        paxPagos += m.rango.factor * m.cant;
        if (m.rango.factor > 0) huespedesQuePagan += m.cant;
      });

      // Validaciones de ocupacion
      if (adultos < 1) res.errores.push(etq + ': debe haber al menos 1 adulto.');
      if (ocupacion > hab.ocupMaxTotal) {
        res.errores.push(etq + ': ' + ocupacion + ' huespedes exceden la ocupacion maxima de ' +
                         hab.ocupMaxTotal + '.');
      }
      if (adultos > hab.ocupMaxAdultos) {
        res.errores.push(etq + ': ' + adultos + ' adultos exceden el maximo de ' + hab.ocupMaxAdultos + '.');
      }
      if (ocupacion < hab.ocupMinFisica) {
        res.errores.push(etq + ': requiere al menos ' + hab.ocupMinFisica + ' huespedes.');
      }

      // Pax efectivo + suplemento single.
      // En modo POR_HABITACION la tarifa no depende de la ocupacion, asi que
      // no hay pax facturables ni suplemento que aplicar.
      var paxEfectivo = paxPagos;
      if (hab.paxMinCobrados !== null && paxEfectivo < hab.paxMinCobrados) {
        paxEfectivo = hab.paxMinCobrados;
      }
      var aplicoSingle = !porHabitacion && hab.permiteSingle && paxEfectivo < 2;
      var suplemento = aplicoSingle ? hab.suplementoSingle : 0;
      if (!porHabitacion && !hab.permiteSingle && paxEfectivo < 2) {
        res.advertencias.push(etq + ': ocupacion menor a 2 pax facturables sin suplemento configurado.');
      }

      // Lo que paga cada ocupante si le toca ser "persona adicional". Los
      // adultos se tratan como mayores; los menores, por su edad real.
      var montosAdic = [];
      for (var ad = 0; ad < adultos; ad++) {
        montosAdic.push(adicionalDe(cat, req.hotel, L.cod_hab, 18));
      }
      (L.edades || []).forEach(function (e) {
        var rg = rangoPorEdad(cat, req.hotel, Number(e));
        if (rg && !rg.cuentaOcupacion) return;   // quien no ocupa, no es adicional
        montosAdic.push(adicionalDe(cat, req.hotel, L.cod_hab, Number(e)));
      });
      // Los adicionales se cobran de menor a mayor: si sobra una plaza y en la
      // habitacion hay un nino y un adulto, el adicional es el nino. La tarifa
      // base cubre a los demas y el cliente paga lo menos posible.
      montosAdic.sort(function (a, b) {
        return (a ? a.monto : 0) - (b ? b.monto : 0);
      });

      // Costo noche a noche
      var detalleNoches = [], subLinea = 0, errLinea = false, adicTotales = [];
      for (var n = 0; n < noches.length; n++) {
        var tn = tarifaNoche(cat, req.hotel, L.cod_hab, noches[n], noches.length,
                             promosSel, ocupacion);
        if (tn.error) {
          res.errores.push(tn.sinCupo ? hab.nombre + ': ' + tn.error
                                      : hab.nombre + ' - ' + tn.error);
          if (tn.sinCupo) {
            res.sinCupo.push({ hab: hab.nombre, codHab: L.cod_hab,
                               noche: tn.noche, motivo: tn.motivo });
          }
          errLinea = true; break;
        }

        // Huespedes por encima de lo que cubre la tarifa
        var adicNoche = 0, adicDet = [];
        if (tn.paxCubiertos !== null && ocupacion > tn.paxCubiertos) {
          var sobran = ocupacion - tn.paxCubiertos;
          for (var q = 0; q < sobran && q < montosAdic.length; q++) {
            if (!montosAdic[q]) continue;
            adicNoche += montosAdic[q].monto;
            adicDet.push(montosAdic[q]);
          }
        }
        if (adicDet.length) adicTotales = adicDet;

        var neto = porHabitacion
          ? tn.tarifaFinal + adicNoche
          : r2(tn.tarifaFinal * paxEfectivo + suplemento);
        var costo = techo(neto);
        detalleNoches.push({
          fecha: tn.fecha, tarifa: tn.tarifaFinal, tarifaBase: tn.tarifaBase,
          temporada: tn.temporadaNombre, promo: tn.promo, promoNombre: tn.promoNombre,
          paxCubiertos: tn.paxCubiertos, adicionales: adicNoche,
          neto: techo(neto), costo: costo
        });
        subLinea += costo;
        if (tn.promo) promoUso[tn.promo] = (promoUso[tn.promo] || 0) + 1;
      }
      if (errLinea) continue;

      // Cargos de fecha fija (aplican si la fecha es una noche de la estadia)
      var cargosLinea = 0, cargosDet = [];
      for (var c = 0; c < noches.length; c++) {
        var cg = cat.cargos[req.hotel + '|' + noches[c]];
        if (!cg) continue;
        var monto = adultos * cg.ADULTO;
        detMenores.forEach(function (m) { monto += m.cant * (cg[m.rango.categoriaCargo] || 0); });
        monto = techo(monto);
        if (monto <= 0) continue;
        cargosLinea += monto;
        cargosDet.push({ fecha: noches[c], nombre: cg.nombre, monto: monto });
      }

      // Tramos con costo homogeneo (para el texto)
      var tramos = [];
      detalleNoches.forEach(function (d) {
        var ult = tramos[tramos.length - 1];
        if (ult && ult.costo === d.costo && ult.tarifa === d.tarifa) {
          ult.hasta = d.fecha; ult.n++;
        } else {
          tramos.push({ desde: d.fecha, hasta: d.fecha, costo: d.costo,
                        neto: d.neto, tarifa: d.tarifa, n: 1 });
        }
      });
      var uniforme = tramos.length === 1 ? tramos[0].costo : null;

      res.lineas.push({
        n: res.lineas.length + 1,
        cod_hab: L.cod_hab, nombre: hab.nombre, categoria: hab.categoria,
        ocupacionTipo: hab.ocupacion, atributo: hab.atributo,
        cantidad: cantidad, adultos: adultos, menores: detMenores,
        edades: detMenores.reduce(function (acc, m) { return acc.concat(m.edades); }, [])
                          .sort(function (a, b) { return a - b; }),
        ocupacion: ocupacion, paxPagos: r2(paxPagos), paxEfectivo: r2(paxEfectivo),
        huespedesQuePagan: huespedesQuePagan,
        aplicoSingle: aplicoSingle, suplemento: suplemento,
        detalleNoches: detalleNoches, tramos: tramos, costoUniforme: uniforme,
        adicionales: adicTotales,
        subtotalUnidad: subLinea,
        subtotalLinea: subLinea * cantidad,
        cargosUnidad: cargosLinea,
        cargosLinea: cargosLinea * cantidad,
        cargosDetalle: cargosDet
      });

      res.totalHabitaciones += cantidad;
    }

    if (res.errores.length) return res;

    res.lineas.forEach(function (l) {
      res.subtotal += l.subtotalLinea;
      res.cargos += l.cargosLinea;
    });

    // --- Servicios adicionales contratados -----------------------------------
    // Se cobran sobre TODA la cotizacion, no por habitacion: quien pide early
    // check-in lo pide para su grupo, no para una de las dos habitaciones que
    // reservo. Por eso el pax base es la suma de todas las lineas.
    var extrasSel = req.extras || [];
    if (extrasSel.length) {
      var paxConFactor = 0, paxTotal = 0;
      res.lineas.forEach(function (l) {
        paxConFactor += l.paxPagos * l.cantidad;
        paxTotal += l.ocupacion * l.cantidad;
      });

      (cat.extras[req.hotel] || []).forEach(function (x) {
        if (extrasSel.indexOf(x.cod) === -1) return;
        var pax = x.aplicaFactorNinos ? paxConFactor : paxTotal;
        var veces = (x.tipo === 'POR_PERSONA_DIA') ? res.nNoches : 1;
        var monto = techo(x.monto * pax * veces);
        if (monto <= 0) return;
        res.extras.push({
          cod: x.cod, nombre: x.nombre, detalle: x.detalle, tipo: x.tipo,
          montoUnitario: x.monto, pax: r2(pax), veces: veces, monto: monto
        });
        res.totalExtras += monto;
      });

      // Un extra pedido que el hotel no ofrece no puede desaparecer en
      // silencio: la asesora lo marco y espera verlo cobrado.
      extrasSel.forEach(function (cod) {
        var existe = (cat.extras[req.hotel] || []).some(function (x) { return x.cod === cod; });
        if (!existe) {
          res.advertencias.push('El servicio "' + cod + '" no esta disponible en este hotel.');
        }
      });
    }

    res.total = res.subtotal + res.cargos + res.totalExtras;

    // Resumen de promos y cargos
    Object.keys(promoUso).forEach(function (cod) {
      var p = null;
      cat.promociones.forEach(function (x) { if (x.cod === cod && x.hotel === req.hotel) p = x; });
      res.promosAplicadas.push({
        cod: cod, nombre: p ? p.nombre : cod,
        mensaje: p ? (p.mensaje || '') : '',
        noches: promoUso[cod]
      });
    });

    var agrup = {};
    res.lineas.forEach(function (l) {
      l.cargosDetalle.forEach(function (cd) {
        var key = cd.fecha + '|' + cd.nombre;
        agrup[key] = (agrup[key] || 0) + cd.monto * l.cantidad;
      });
    });
    Object.keys(agrup).sort().forEach(function (k) {
      var p = k.split('|');
      res.cargosResumen.push({ fecha: p[0], nombre: p[1], monto: agrup[k] });
    });

    res.ok = true;
    return res;
  }

  // ==========================================================================
  // RENDER DEL TEXTO PARA WHATSAPP
  // ==========================================================================
  /** "2 adultos + 2 ninos (5 y 8 anos)" */
  function ocupantesInline(cat, linea) {
    var partes = [];
    partes.push(linea.adultos + (linea.adultos === 1 ? ' adulto' : ' adultos'));
    linea.menores.forEach(function (m) {
      var etiqueta = m.cant === 1 ? m.rango.sing : m.rango.plur;
      var det = m.edades.length ? textoEdades(m.edades) : m.rango.rango;
      partes.push(m.cant + ' ' + etiqueta + ' (' + det + ')');
    });
    return partes.join(' + ');
  }

  /** "Adultos: 2" / "Ninos: 5 y 8 anos" */
  function ocupantesLineas(cat, linea) {
    var out = ['Adultos: ' + linea.adultos];
    var edades = linea.edades || [];
    if (edades.length) {
      out.push('Ni\u00F1os: ' + textoEdades(edades));
    } else if (linea.menores.length) {
      out.push('Ni\u00F1os: ' + linea.menores.map(function (m) {
        return m.cant + ' (' + m.rango.rango + ')';
      }).join(', '));
    } else {
      out.push('Ni\u00F1os:');
    }
    return out.join('\n');
  }

  function textoOcupantes(cat, res, linea) {
    var h = cat.hoteles[res.hotel];
    return (h && h.formatoOcupantes === 'LINEAS')
      ? ocupantesLineas(cat, linea)
      : ocupantesInline(cat, linea);
  }

  function bloqueHabitaciones(cat, res) {
    var h = cat.hoteles[res.hotel];

    var bloques = res.lineas.map(function (l) {
      var out = [];
      var titulo = l.cantidad === 1
        ? '1 HABITACI\u00D3N ' + l.nombre.toUpperCase()
        : l.cantidad + ' HABITACIONES ' + l.nombre.toUpperCase();
      out.push('\uD83D\uDECF *' + titulo + '*');
      out.push(textoOcupantes(cat, res, l));

      var sufijo = l.cantidad > 1 ? ' c/u' : '';

      if (l.costoUniforme !== null) {
        out.push(lineaPrecio(cat, l.tramos[0], l, sufijo));
      } else {
        out.push('Tarifa por temporada:');
        l.tramos.forEach(function (t) {
          var rango = t.n === 1
            ? F.fmt(t.desde, h.formatoFecha)
            : F.fmt(t.desde, h.formatoFecha) + ' - ' + F.fmt(t.hasta, h.formatoFecha);
          out.push('  \u2022 ' + rango + ' (' + t.n + (t.n === 1 ? ' noche' : ' noches') +
                   '): $' + fmtMoney(cat, t.costo) + sufijo);
        });
        out.push('Subtotal habitaci\u00F3n: $' + fmtMoney(cat, l.subtotalLinea));
      }
      return out.join('\n');
    });
    return bloques.join('\n\n');
  }

  /**
   * El renglon de precio por noche.
   *
   * Toda tarifa cargada es el precio final que paga el cliente. No hay
   * impuestos que sumar ni que mostrar por separado, en ningun hotel: si
   * alguna vez hay que facturar un impuesto aparte, es una decision comercial
   * que se toma antes de tocar este archivo.
   *
   * El suplemento de habitacion individual va incluido en el monto y NO se
   * menciona: la asesora manda el precio, no el desglose interno.
   */
  function lineaPrecio(cat, tramo, linea, sufijo) {
    var txt = 'Total, por noche: $' + fmtMoney(cat, tramo.costo) + sufijo;

    // Con personas adicionales el monto por si solo no se explica: quien
    // recibe la cotizacion tiene que poder reconstruir de donde sale.
    if (linea.adicionales && linea.adicionales.length) {
      var porEtiqueta = {};
      linea.adicionales.forEach(function (a) {
        var k = a.etiqueta + '|' + a.monto;
        porEtiqueta[k] = (porEtiqueta[k] || 0) + 1;
      });
      var partes = Object.keys(porEtiqueta).map(function (k) {
        var p = k.split('|'), cant = porEtiqueta[k];
        return cant + ' ' + p[0] + (cant > 1 ? 's' : '') + ' a $' + fmtMoney(cat, Number(p[1]));
      });
      txt += '\n(incluye ' + partes.join(' y ') + ' por noche)';
    }
    // El "p/p" solo se muestra si multiplicar de vuelta da exactamente el
    // total Y ese total se armo cobrandole lo mismo a cada huesped.
    //
    // Con pax_min_cobrados puede pasar que paxEfectivo coincida con la
    // ocupacion por casualidad: 2 adultos + 1 nino al 50% son 2,5 pax que el
    // minimo sube a 3, y 3 es justo la cantidad de huespedes. La cuenta cierra,
    // pero imprimir "70$ p/p" le dice al cliente que el nino paga tarifa
    // completa, justo debajo del renglon que dice que paga la mitad.
    var mostrarPP = !linea.aplicoSingle &&
                    linea.paxEfectivo === linea.paxPagos &&
                    linea.paxEfectivo === linea.ocupacion &&
                    linea.paxEfectivo > 1 &&
                    tramo.tarifa === Math.floor(tramo.tarifa) &&
                    tramo.tarifa * linea.paxEfectivo === tramo.costo;
    if (mostrarPP) txt += '  (' + fmtMoney(cat, tramo.tarifa) + '$ p/p)';
    return txt;
  }

  function bloqueCargos(cat, res) {
    if (!res.cargosResumen.length) return '';
    var h = cat.hoteles[res.hotel];
    var out = ['', '\uD83C\uDF7D *CARGOS ESPECIALES INCLUIDOS EN EL TOTAL:*'];
    res.cargosResumen.forEach(function (c) {
      out.push('* ' + c.nombre + ' (' + F.fmt(c.fecha, h.formatoFecha) + '): $' +
               fmtMoney(cat, c.monto));
    });
    return out.join('\n');
  }

  /**
   * Los servicios adicionales del hotel.
   *
   * Lo contratado va arriba, con su monto, porque ya esta dentro del total y
   * el cliente tiene que poder reconstruirlo. Lo demas se sigue ofreciendo
   * como opcional, que es como aparecia antes de que se pudieran cobrar.
   */
  function bloqueExtras(cat, res) {
    var lista = (cat.extras && cat.extras[res.hotel]) || [];
    if (!lista.length) return '';

    var contratados = res.extras || [];
    var codsSel = contratados.map(function (e) { return e.cod; });
    var sueltos = lista.filter(function (x) { return codsSel.indexOf(x.cod) === -1; });

    var out = [];
    if (contratados.length) {
      out.push('');
      out.push('\uD83D\uDD05 *SERVICIOS ADICIONALES INCLUIDOS EN EL TOTAL:*');
      contratados.forEach(function (e) {
        var det = e.detalle ? ': ' + e.detalle : '';
        out.push('\u2705 ' + e.nombre + det + ' \u2014 $' + fmtMoney(cat, e.monto));
      });
    }
    if (sueltos.length) {
      out.push('');
      out.push('\uD83D\uDD05 *SERVICIOS ADICIONALES: (Opcionales)*');
      sueltos.forEach(function (x) {
        var porQue = (x.tipo === 'POR_PERSONA_DIA') ? ' por persona, por d\u00EDa' : ' por persona';
        out.push(x.nombre + ': $' + fmtMoney(cat, x.monto) + porQue +
                 (x.detalle ? ': ' + x.detalle : ''));
      });
    }
    return out.join('\n');
  }

  function bloquePromo(cat, res) {
    if (!res.promosAplicadas.length) return '';
    var out = [''];
    res.promosAplicadas.forEach(function (p) {
      out.push('\u2705 *PROMOCI\u00D3N APLICADA:* ' + p.nombre +
               ' (' + p.noches + (p.noches === 1 ? ' noche' : ' noches') + ')');
      if (p.mensaje) out.push('_' + p.mensaje + '_');
    });
    return out.join('\n');
  }

  function render(cat, res, datos) {
    if (!res.ok) throw new Error('No se puede renderizar una cotizacion con errores.');
    var h = cat.hoteles[res.hotel];
    var plantilla = cat.plantillas[res.hotel];
    if (!plantilla) throw new Error('Sin plantilla configurada para el hotel ' + res.hotel);
    var ff = h.formatoFecha;

    var map = {
      HOTEL_NOMBRE: h.nombre,
      EMOJIS: h.emojis,
      ASESOR_INICIALES: (datos && datos.asesorIniciales) || '',
      CLIENTE: (datos && datos.cliente) || '',
      HORA_IN: h.horaIn,
      HORA_OUT: h.horaOut,
      FECHA_IN: F.fmt(res.checkin, ff),
      FECHA_OUT: F.fmt(res.checkout, ff),
      BLOQUE_HABITACIONES: bloqueHabitaciones(cat, res),
      BLOQUE_CARGOS: bloqueCargos(cat, res),
      BLOQUE_EXTRAS: bloqueExtras(cat, res),
      BLOQUE_PROMO: bloquePromo(cat, res),
      TOTAL: fmtMoney(cat, res.total),
      SUBTOTAL: fmtMoney(cat, res.subtotal),
      DIAS: pad2(res.nDias),
      NOCHES: pad2(res.nNoches),
      DIAS_N: String(res.nDias),
      NOCHES_N: String(res.nNoches),
      PALABRA_NOCHES: res.nNoches === 1 ? 'NOCHE' : 'NOCHES',
      PALABRA_DIAS: res.nDias === 1 ? 'D\u00CDA' : 'D\u00CDAS',
      DEPOSITO: fmtMoney(cat, h.deposito),
      LABEL_DEPOSITO: h.labelDeposito,
      HORA_LATE: h.horaLate,
      MENSAJE_CASHEA: (cat.config && cat.config.MENSAJE_CASHEA) || ''
    };

    var texto = plantilla.replace(/\{\{(\w+)\}\}/g, function (m, clave) {
      return map.hasOwnProperty(clave) ? map[clave] : m;
    });

    // Limpieza: max 2 saltos consecutivos, sin espacios al final de linea
    texto = texto.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return texto;
  }

  function marcadoresNoResueltos(texto) {
    var m = texto.match(/\{\{\w+\}\}/g);
    return m ? m.filter(function (v, i, a) { return a.indexOf(v) === i; }) : [];
  }

  /** Marcadores que render() sabe resolver. Lo usa el validador. */
  var MARCADORES = ['HOTEL_NOMBRE','EMOJIS','ASESOR_INICIALES','CLIENTE','HORA_IN','HORA_OUT',
    'FECHA_IN','FECHA_OUT','BLOQUE_HABITACIONES','BLOQUE_CARGOS','BLOQUE_EXTRAS','BLOQUE_PROMO',
    'TOTAL','SUBTOTAL','DIAS','NOCHES','DIAS_N','NOCHES_N','PALABRA_NOCHES','PALABRA_DIAS',
    'DEPOSITO','LABEL_DEPOSITO','HORA_LATE','MENSAJE_CASHEA'];

  return {
    Fechas: F,
    calcular: calcular,
    render: render,
    fmtMoney: fmtMoney,
    rangosDe: rangosDe,
    rangoPorEdad: rangoPorEdad,
    textoEdades: textoEdades,
    MARCADORES: MARCADORES,
    marcadoresNoResueltos: marcadoresNoResueltos,
    _interno: {
      tarifaNoche: tarifaNoche, temporadaDe: temporadaDe, promoDe: promoDe,
      stopSaleDe: stopSaleDe, resolverMenores: resolverMenores, r2: r2, techo: techo
    }
  };
})();
