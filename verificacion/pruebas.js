/**
 * COTIZADOR HESPERIA - pruebas.js
 * Suite de pruebas funcionales sobre las tarifas cargadas.
 *
 * Era 05_Pruebas.gs y corria dentro del Sheet. Ahora corre en Node contra los
 * archivos de datos/ reales, que son la misma fuente que consume la aplicacion:
 * desaparece la brecha entre "las pruebas del arnes" y "las pruebas de verdad"
 * que obligaba a validar cada cambio dos veces.
 *
 * IMPORTANTE: los valores esperados estan atados a las tarifas de datos/.
 * Si cambian las tarifas, hay que actualizarlos.
 */

// ============================================================================
// ARNES
// ============================================================================
function _T() {
  return {
    resultados: [],
    _caso: '',
    caso: function (n) { this._caso = n; return this; },
    ok: function (cond, desc, detalle) {
      this.resultados.push({ caso: this._caso, desc: desc, pass: !!cond, detalle: detalle || '' });
    },
    eq: function (actual, esperado, desc) {
      var pass = (typeof actual === 'number' && typeof esperado === 'number')
        ? Math.abs(actual - esperado) < 0.005
        : actual === esperado;
      this.resultados.push({
        caso: this._caso, desc: desc, pass: pass,
        detalle: pass ? '' : 'esperado=' + esperado + ' obtenido=' + actual
      });
    },
    contiene: function (texto, sub, desc) {
      var pass = String(texto).indexOf(sub) !== -1;
      this.resultados.push({
        caso: this._caso, desc: desc, pass: pass,
        detalle: pass ? '' : 'no se encontro: "' + sub + '"'
      });
    },
    noContiene: function (texto, sub, desc) {
      var pass = String(texto).indexOf(sub) === -1;
      this.resultados.push({
        caso: this._caso, desc: desc, pass: pass,
        detalle: pass ? '' : 'no deberia aparecer: "' + sub + '"'
      });
    }
  };
}

function req_(hotel, ci, co, lineas, promos) {
  return { hotel: hotel, checkin: ci, checkout: co, lineas: lineas, promos: promos || [] };
}

/** edades = arreglo de edades reales, una por menor. */
function lin_(cod, adultos, edades, cantidad) {
  return { cod_hab: cod, adultos: adultos, edades: edades || [], cantidad: cantidad || 1 };
}

/** Copia del catalogo con cierres de venta inyectados (no toca la hoja). */
function conStopSales_(cat, filas) {
  var c = JSON.parse(JSON.stringify(cat));
  c.stopSales = filas;
  return c;
}

/**
 * Copia del catalogo con atributos cambiados en una habitacion.
 *
 * Hoy ninguna habitacion del catalogo real usa pax_min_cobrados ni
 * ocup_min_fisica mayor que 1, pero el motor los soporta y la gerencia puede
 * volver a cargarlos en cualquier momento. Inyectarlos aqui mantiene esas
 * reglas cubiertas sin atarlas a un dato que hoy no existe.
 */
/**
 * Copia del catalogo con promociones inyectadas.
 *
 * Las promos reales tienen vigencia, y una vigencia se vence o la mueve una
 * asesora desde la administracion. Atar la aritmetica de un tipo de promocion
 * a la ventana de una promo real es firmar que la suite se pondra en rojo el
 * dia que el negocio cambie de campana. Lo que se prueba aqui son las reglas
 * del motor; que la fila real este bien cargada lo dice el validador.
 */
function conPromos_(cat, filas) {
  var c = JSON.parse(JSON.stringify(cat));
  c.promociones = c.promociones.concat(filas);
  return c;
}

/** Fila MENOR_GRATIS ya normalizada, como la deja catalogo.js. */
function menorGratis_(hotel, cambios) {
  var p = {
    hotel: hotel, cod: 'NINO_GRATIS_T', nombre: 'Nino gratis de prueba',
    inicio: '2026-01-01', fin: '2027-12-31', codHab: 'TODAS',
    tipo: 'MENOR_GRATIS', valor: 1, minNoches: 0,
    rangoMenor: 'NIN', minAdultos: 2,
    diasSemana: [], diasSemanaCrudo: '', mensaje: '', prioridad: 500
  };
  Object.keys(cambios || {}).forEach(function (k) { p[k] = cambios[k]; });
  return p;
}

function conHab_(cat, clave, cambios) {
  var c = JSON.parse(JSON.stringify(cat));
  Object.keys(cambios).forEach(function (k) { c.habitaciones[clave][k] = cambios[k]; });
  return c;
}

/**
 * Una copia del catalogo con una plantilla de mentira bajo unas iniciales que
 * no existen.
 *
 * Los marcadores se prueban asi y no sobre una plantilla real: las de
 * plantillas.json las puede reescribir cualquier asesora desde la
 * administracion, y una prueba no puede tener como premisa un dato que se
 * cambia sin tocar codigo.
 */
function conPlantilla_(cat, hotel, quien, texto) {
  var c = JSON.parse(JSON.stringify(cat));
  c.plantillas[hotel + '|' + quien] = texto;
  return c;
}

// ============================================================================
// SUITE
// ============================================================================
function ejecutarPruebas(cat, M, Validador, Catalogo) {
  var parseDias_ = Catalogo._interno.parseDias;
  var F = M.Fechas;
  var t = _T();
  var r, r2, txt;

  // ---- G1. Fechas y formato de moneda -------------------------------------
  t.caso('G1 Fechas y moneda');
  t.eq(F.sumarDias('2026-02-28', 1), '2026-03-01', 'Fin de mes (2026 no bisiesto)');
  t.eq(F.sumarDias('2024-02-28', 1), '2024-02-29', 'Ano bisiesto');
  t.eq(F.sumarDias('2026-12-31', 1), '2027-01-01', 'Cambio de ano');
  t.eq(F.diffDias('2026-05-07', '2026-05-09'), 2, 'Diferencia de dias');
  t.eq(F.noches('2026-05-07', '2026-05-09').length, 2, 'El dia de check-out NO es noche');
  t.eq(F.noches('2026-05-07', '2026-05-09')[0], '2026-05-07', 'Primera noche = check-in');
  t.eq(F.noches('2026-05-07', '2026-05-09')[1], '2026-05-08', 'Ultima noche = vispera del check-out');
  t.eq(F.fmtCorto('2026-05-07'), '07/05/26', 'Formato dd/MM/yy');
  t.eq(F.fmtLargo('2026-05-07'), '07/05/2026', 'Formato dd/MM/yyyy');
  t.eq(F.fmt('2026-05-07', 'dd/MM/yyyy'), '07/05/2026', 'F.fmt respeta formato_fecha');
  t.eq(F.fmt('2026-05-07', 'dd/MM/yy'), '07/05/26', 'F.fmt corto por defecto');
  t.eq(F.diaSemana('2026-08-17'), 1, 'Lunes = 1');
  t.eq(F.diaSemana('2026-08-23'), 7, 'Domingo = 7');

  // ---- G2. Redondeo: siempre entero y siempre hacia arriba ----------------
  t.caso('G2 Redondeo hacia arriba');
  t.eq(M.fmtMoney(cat, 212.5), '213', '212,50 sube a 213');
  t.eq(M.fmtMoney(cat, 157.5), '158', '157,50 sube a 158');
  t.eq(M.fmtMoney(cat, 170.01), '171', 'Un centimo ya sube al entero siguiente');
  t.eq(M.fmtMoney(cat, 340), '340', 'Un entero exacto no se infla');
  t.eq(M.fmtMoney(cat, 0), '0', 'Cero se mantiene');
  t.eq(M._interno.techo(170.0000000001), 170, 'La basura de coma flotante no suma un dolar');

  // ---- T01. Caso base: 2 adultos ------------------------------------------
  t.caso('T01 Base 2 adultos');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 2)]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.nNoches, 2, '2 noches');
  t.eq(r.nDias, 3, '3 dias');
  t.eq(r.lineas[0].costoUniforme, 170, 'Costo por noche = 85 x 2 pax (temporada alta)');
  t.eq(r.total, 340, 'Total 340');
  t.eq(r.lineas[0].aplicoSingle, false, 'Sin suplemento single');

  // ---- T02. Single: 1 adulto ----------------------------------------------
  t.caso('T02 Single 1 adulto');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 1)]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.lineas[0].aplicoSingle, true, 'Aplica suplemento');
  t.eq(r.lineas[0].costoUniforme, 115, '85 + 30 de suplemento');
  t.eq(r.total, 230, 'Total 230');

  // ---- T03. Adulto + infante ----------------------------------------------
  t.caso('T03 Adulto + infante de 2 anos');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 1, [2])]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.lineas[0].ocupacion, 2, 'El infante cuenta en la ocupacion');
  t.eq(r.lineas[0].paxPagos, 1, 'El infante no paga');
  t.eq(r.lineas[0].menores[0].cod, 'INF', 'La edad 2 cae en el rango INF');
  t.eq(r.lineas[0].aplicoSingle, true, 'Aplica suplemento');
  t.eq(r.total, 230, 'Total 230');

  // ---- T04. Adulto + nino al 50% (redondeo hacia arriba) ------------------
  t.caso('T04 Adulto + nino de 7 anos');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 1, [7])]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.lineas[0].menores[0].cod, 'NIN', 'La edad 7 cae en el rango 5-9');
  t.eq(r.lineas[0].paxPagos, 1.5, 'pax = 1 + 0.5');
  t.eq(r.lineas[0].aplicoSingle, true, 'pax < 2 -> aplica suplemento');
  t.eq(r.lineas[0].costoUniforme, 158, '85 x 1,5 + 30 = 157,50 -> 158');
  t.eq(r.total, 316, 'Total 316 (no 315: cada noche sube por separado)');

  // ---- T05. Adulto + nino que paga completo -------------------------------
  t.caso('T05 Adulto + nino de 12 anos');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 1, [12])]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.lineas[0].menores[0].cod, 'MAY', 'La edad 12 cae en el rango 10-17');
  t.eq(r.lineas[0].paxPagos, 2, 'pax = 2');
  t.eq(r.lineas[0].aplicoSingle, false, 'pax = 2 -> NO aplica suplemento');
  t.eq(r.total, 340, 'Total 340');

  // ---- T06. Cruce de temporadas con prioridad -----------------------------
  t.caso('T06 Cruce de temporadas');
  r = M.calcular(cat, req_('HBK', '2026-12-19', '2026-12-23', [lin_('BAS_DBL', 2)]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.nNoches, 4, '4 noches');
  t.eq(r.lineas[0].detalleNoches[0].tarifa, 70, 'Noche 19/12 en temporada baja');
  t.eq(r.lineas[0].detalleNoches[1].tarifa, 70, 'Noche 20/12 en temporada baja');
  t.eq(r.lineas[0].detalleNoches[2].tarifa, 95, 'Noche 21/12 en Navidad (prioridad 50)');
  t.eq(r.lineas[0].detalleNoches[3].tarifa, 95, 'Noche 22/12 en Navidad');
  t.eq(r.lineas[0].costoUniforme, null, 'No hay costo uniforme');
  t.eq(r.lineas[0].tramos.length, 2, '2 tramos de tarifa');
  t.eq(r.total, 660, 'Total 140 + 140 + 190 + 190');

  // ---- T07. Promocion para Residentes, cobertura parcial ------------------
  t.caso('T07 Promocion Residentes parcial');
  r = M.calcular(cat, req_('HIM', '2026-09-14', '2026-09-17',
                           [lin_('DLX_VMON', 2)], ['PRO_RESIDENTES']));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.nNoches, 3, '3 noches');
  t.eq(r.lineas[0].detalleNoches[0].tarifa, 65, 'Noche 14/09 con promo (70 - 5)');
  t.eq(r.lineas[0].detalleNoches[1].tarifa, 65, 'Noche 15/09 con promo');
  t.eq(r.lineas[0].detalleNoches[2].tarifa, 55, 'Noche 16/09 fuera de vigencia y ya en baja');
  t.eq(r.promosAplicadas.length, 1, 'Una promo aplicada');
  t.eq(r.promosAplicadas[0].noches, 2, 'La promo cubrio 2 de las 3 noches');
  t.eq(r.total, 370, 'Total 130 + 130 + 110');

  // ---- T08. La promo no aplica si no se selecciona -------------------------
  t.caso('T08 Sin promo seleccionada');
  r = M.calcular(cat, req_('HIM', '2026-09-14', '2026-09-17', [lin_('DLX_VMON', 2)]));
  t.eq(r.promosAplicadas.length, 0, 'La promo no se aplica sin seleccionarla');
  t.eq(r.total, 390, 'Total a tarifa de temporada: 140 + 140 + 110');

  // ---- T09. Descuento por monto sobre un nino al 50% ----------------------
  // Decision de negocio: el descuento se resta de la tarifa POR PERSONA, asi
  // que un nino que paga el 50% recibe la mitad del descuento.
  t.caso('T09 Descuento de monto con nino al 50%');
  r = M.calcular(cat, req_('HPA', '2026-09-01', '2026-09-02',
                           [lin_('HOL_GARD', 1, [7])], ['PRO_RESIDENTES']));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.lineas[0].detalleNoches[0].tarifa, 60, 'Tarifa 65 - 5 de descuento');
  t.eq(r.lineas[0].paxPagos, 1.5, 'pax = 1 + 0,5');
  t.eq(r.total, 110, '60 x 1,5 = 90, + 20 de suplemento single');

  // ---- T09b. MENOR_GRATIS: un menor deja de pagar pero sigue ocupando ------
  // El tipo existe porque los otros tres no podian expresarlo: SUSTITUYE,
  // DESCUENTO_PCT y DESCUENTO_MONTO operan sobre la tarifa POR PERSONA, y "un
  // nino gratis" no cambia la tarifa: quita un pax facturable. Cargada como
  // SUSTITUYE 35, esta misma reserva cotizaba 35 x 2,5 = 87,50 la noche.
  t.caso('T09b MENOR_GRATIS base');
  var catNG = conPromos_(cat, [menorGratis_('HBK')]);
  r = M.calcular(catNG, req_('HBK', '2026-09-20', '2026-09-23',
                             [lin_('BAS_TPL', 2, [6])]));
  t.eq(r.total, 525, 'Sin seleccionarla: 70 x 2,5 x 3 noches');
  r = M.calcular(catNG, req_('HBK', '2026-09-20', '2026-09-23',
                             [lin_('BAS_TPL', 2, [6])], ['NINO_GRATIS_T']));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.lineas[0].detalleNoches[0].tarifa, 70, 'La tarifa por persona NO cambia');
  t.eq(r.lineas[0].detalleNoches[0].neto, 140, 'La noche cobra 2 pax en vez de 2,5');
  t.eq(r.total, 420, 'Total 140 x 3 noches');
  t.eq(r.lineas[0].ocupacion, 3, 'El nino sigue contando en la ocupacion');
  t.eq(r.promosAplicadas.length, 1, 'La promo se reporta aplicada');
  t.eq(r.promosAplicadas[0].noches, 3, 'En las 3 noches');
  txt = M.render(catNG, r, 'MZ');
  t.contiene(txt, '2 adultos + 1 ni\u00F1o (6 a\u00F1os)',
             'El mensaje sigue declarando al nino que no paga');

  // ---- T09c. Cuando no aplica, no aplica y no lo dice ---------------------
  // Y sobre todo: no compite. Si una MENOR_GRATIS inaplicable ganara por
  // prioridad, taparia una promo de tarifa que si aplica y el cliente perderia
  // un descuento al que tiene derecho.
  t.caso('T09c MENOR_GRATIS que no aplica');
  r = M.calcular(catNG, req_('HBK', '2026-09-20', '2026-09-23',
                             [lin_('BAS_TPL', 2)], ['NINO_GRATIS_T']));
  t.eq(r.promosAplicadas.length, 0, 'Sin menores no se aplica ni se anuncia');
  t.eq(r.total, 420, 'Y el total es el de dos adultos, no uno rebajado');

  r = M.calcular(catNG, req_('HBK', '2026-09-20', '2026-09-23',
                             [lin_('BAS_TPL', 1, [6])], ['NINO_GRATIS_T']));
  t.eq(r.promosAplicadas.length, 0, 'Con 1 adulto no llega al minimo de 2');
  t.eq(r.total, 315, 'Total 70 x 1,5 x 3');

  r = M.calcular(catNG, req_('HBK', '2026-09-20', '2026-09-23',
                             [lin_('BAS_TPL', 2, [12])], ['NINO_GRATIS_T']));
  t.eq(r.promosAplicadas.length, 0, 'Un nino de 12 esta en MAY, no en NIN');
  t.eq(r.total, 630, 'Total 70 x 3 pax x 3');

  // Un solo menor gratis, aunque haya dos elegibles.
  r = M.calcular(catNG, req_('HBK', '2026-09-20', '2026-09-23',
                             [lin_('BAS_QUA', 2, [6, 7])], ['NINO_GRATIS_T']));
  t.eq(r.lineas[0].detalleNoches[0].neto, 175, 'De 3 pax quedan 2,5: solo uno gratis');
  t.eq(r.lineas[0].ocupacion, 4, 'Los dos ninos siguen ocupando');

  // No tapa una promo de tarifa que si aplica: aqui MENOR_GRATIS no es
  // candidata -no hay menores- y gana Residentes con prioridad mucho menor.
  t.caso('T09d MENOR_GRATIS no tapa a otra promo');
  r = M.calcular(conPromos_(cat, [menorGratis_('HIM')]),
                 req_('HIM', '2026-09-14', '2026-09-15', [lin_('DLX_VMON', 2)],
                      ['NINO_GRATIS_T', 'PRO_RESIDENTES']));
  t.eq(r.promosAplicadas.length, 1, 'Se aplica una sola promocion');
  t.eq(r.promosAplicadas[0].cod, 'PRO_RESIDENTES', 'Y es la que si podia aplicarse');
  t.eq(r.total, 130, 'Tarifa 70 - 5, por 2 pax');

  // ---- T09e. El rango lo pone el hotel, no el codigo ----------------------
  // NIN es 5-9 en Morrocoy y 5-10 en Margarita. La fila de la promocion nombra
  // el rango; las edades son de la politica de cada hotel. Es lo que permite
  // que la misma campana sirva en los tres hoteles de playa sin repetir edades.
  t.caso('T09e MENOR_GRATIS toma las edades de la politica');
  r = M.calcular(conPromos_(cat, [menorGratis_('HIM')]),
                 req_('HIM', '2026-09-21', '2026-09-23',
                      [lin_('DLX_VMON', 2, [10])], ['NINO_GRATIS_T']));
  t.eq(r.promosAplicadas.length, 1, 'En Margarita un nino de 10 entra en NIN');
  t.eq(r.lineas[0].detalleNoches[0].neto, 110, 'Cobra 2 pax de 55');
  r = M.calcular(catNG, req_('HBK', '2026-09-20', '2026-09-22',
                             [lin_('BAS_TPL', 2, [10])], ['NINO_GRATIS_T']));
  t.eq(r.promosAplicadas.length, 0, 'En Morrocoy el mismo nino de 10 ya es MAY');

  // ---- T09f. Vigencia parcial y piso de pax facturables -------------------
  t.caso('T09f MENOR_GRATIS parcial y minimo facturable');
  r = M.calcular(conPromos_(cat, [menorGratis_('HBK', { fin: '2026-09-21' })]),
                 req_('HBK', '2026-09-20', '2026-09-23',
                      [lin_('BAS_TPL', 2, [6])], ['NINO_GRATIS_T']));
  t.eq(r.promosAplicadas[0].noches, 2, 'Cubre 2 de las 3 noches');
  t.eq(r.total, 455, 'Dos noches a 140 y una a 175');

  // Un piso de facturacion se come el regalo antes que cobrar por debajo de el.
  // Hoy ninguna habitacion carga pax_min_cobrados, pero el motor lo soporta.
  var catPiso = conPromos_(conHab_(cat, 'HBK|BAS_TPL', { paxMinCobrados: 2.5 }),
                           [menorGratis_('HBK')]);
  r = M.calcular(catPiso, req_('HBK', '2026-09-20', '2026-09-21',
                               [lin_('BAS_TPL', 2, [6])], ['NINO_GRATIS_T']));
  t.eq(r.lineas[0].detalleNoches[0].neto, 175,
       'Con minimo 2,5 el descuento no baja de ahi');

  // ---- T10. Cena de Navidad ------------------------------------------------
  t.caso('T10 Cena de Navidad');
  r = M.calcular(cat, req_('HBK', '2026-12-23', '2026-12-26', [lin_('BAS_DBL', 2)]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.subtotal, 570, 'Hospedaje 95 x 2 pax x 3 noches');
  t.eq(r.cargos, 240, 'Cena de Navidad 120 x 2 adultos');
  t.eq(r.total, 810, 'Total 810');
  t.eq(r.cargosResumen.length, 1, 'Un cargo especial');

  // ---- T11. El cargo no aplica si esa fecha es el dia de salida -----------
  t.caso('T11 Cargo excluido en check-out');
  r = M.calcular(cat, req_('HBK', '2026-12-21', '2026-12-24', [lin_('BAS_DBL', 2)]));
  t.eq(r.cargos, 0, 'Sale el 24 al mediodia: no paga cena de Navidad');
  t.eq(r.total, 570, 'Solo hospedaje');

  // ---- T12. Multiples habitaciones ----------------------------------------
  t.caso('T12 Multiples habitaciones');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [
    lin_('BAS_DBL', 2, [], 2),
    lin_('BAS_TPL', 2, [7])
  ]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.totalHabitaciones, 3, '3 habitaciones en total');
  t.eq(r.lineas[0].subtotalLinea, 680, '2 dobles: 170 x 2 noches x 2 hab');
  t.eq(r.lineas[1].paxPagos, 2.5, 'Triple: 2 adultos + nino al 50%');
  t.eq(r.lineas[1].costoUniforme, 213, 'Triple: 85 x 2,5 = 212,50 -> 213');
  t.eq(r.total, 1106, 'Total 680 + 426');

  // ---- T13. Minimo facturable (pax_min_cobrados) --------------------------
  t.caso('T13 Minimo facturable');
  // El catalogo real ya no carga pax_min_cobrados: las cuadruples de Morrocoy
  // lo tenian en 3 y quedo vacio. Se prueban las dos situaciones, porque la
  // regla sigue viva en el motor.
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2, [7])]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.lineas[0].paxPagos, 2.5, 'Solo 2,5 pax pagan');
  t.eq(r.lineas[0].paxEfectivo, 2.5, 'Sin minimo cargado, se cobran los 2,5');
  t.eq(r.lineas[0].costoUniforme, 213, '85 x 2,5 = 212,5, redondeado hacia arriba');
  t.eq(r.total, 426, 'Total 426');

  var catMin = conHab_(cat, 'HBK|BAS_QUA', { paxMinCobrados: 3 });
  r = M.calcular(catMin, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2, [7])]));
  t.eq(r.lineas[0].paxEfectivo, 3, 'Con el minimo cargado, sube a 3 pax');
  t.eq(r.lineas[0].costoUniforme, 255, '85 x 3');
  t.eq(r.total, 510, 'Total 510');

  // ---- T14. Politicas de nino distintas por hotel -------------------------
  t.caso('T14 Politica por hotel');
  t.eq(M.rangoPorEdad(cat, 'HBK', 9).factor, 0.5, 'HBK: 9 anos paga 50%');
  t.eq(M.rangoPorEdad(cat, 'HBK', 10).factor, 1, 'HBK: 10 anos paga tarifa completa');
  t.eq(M.rangoPorEdad(cat, 'HIM', 10).factor, 0.5, 'HIM: 10 anos paga 50%');
  t.eq(M.rangoPorEdad(cat, 'HIM', 11).factor, 1, 'HIM: 11 anos paga tarifa completa');
  t.eq(M.rangoPorEdad(cat, 'HBK', 3).factor, 0, 'HBK: infante no paga');
  t.eq(M.rangoPorEdad(cat, 'HBK', 18), null, '18 anos no cae en ningun rango de menor');

  // ---- T15. parseDias tolerante -------------------------------------------
  // Nadie reformatea ya los datos, pero quien edite el catalogo a mano sigue
  // pudiendo escribir cualquiera de estas formas.
  t.caso('T15 parseDias');
  t.eq(parseDias_('5,6').join('-'), '5-6', 'Texto con coma');
  t.eq(parseDias_(5.6).join('-'), '5-6', 'Numero sin comillas');
  t.eq(parseDias_('5;6').join('-'), '5-6', 'Punto y coma');
  t.eq(parseDias_(' 5 , 6 ').join('-'), '5-6', 'Con espacios');
  t.eq(parseDias_('').length, 0, 'Vacio = todos los dias');
  t.eq(parseDias_(null).length, 0, 'Null');
  t.eq(parseDias_('0,8,3').join('-'), '3', 'Descarta fuera de rango');
  t.eq(parseDias_(3).join('-'), '3', 'Numero entero simple');

  // ---- T16. Edades: entrada y errores --------------------------------------
  t.caso('T16 Edades de los menores');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_TPL', 2, [''])]));
  t.ok(!r.ok, 'Rechaza un menor sin edad indicada');
  t.contiene(r.errores.join(' | '), 'sin edad indicada', 'El error dice que falta la edad');

  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_TPL', 2, [19])]));
  t.ok(!r.ok, 'Rechaza una edad de 19 anos');
  t.contiene(r.errores.join(' | '), 'es un adulto', 'El error explica que es un adulto');

  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2, [3, 7])]));
  t.ok(r.ok, 'Acepta dos menores de rangos distintos', (r.errores || []).join('; '));
  t.eq(r.lineas[0].menores.length, 2, 'Dos grupos de menores');
  t.eq(r.lineas[0].edades.join(','), '3,7', 'Las edades quedan registradas y ordenadas');

  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 1, [6, 8])]));
  t.ok(r.ok, 'Dos menores del mismo rango se agrupan', (r.errores || []).join('; '));
  t.eq(r.lineas[0].menores.length, 1, 'Un solo grupo');
  t.eq(r.lineas[0].menores[0].cant, 2, 'Con dos menores adentro');
  t.eq(r.lineas[0].menores[0].edades.join(','), '6,8', 'Y con las dos edades');

  // La forma vieja (conteos por rango) tiene que seguir dando el mismo numero,
  // porque hay cotizaciones registradas con ese formato.
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03',
                           [{ cod_hab: 'BAS_DBL', adultos: 1, menores: { NIN: 1 }, cantidad: 1 }]));
  t.ok(r.ok, 'La forma vieja (menores por rango) sigue funcionando', (r.errores || []).join('; '));
  t.eq(r.total, 316, 'Y da el mismo total que con edades');

  // ---- T17. Validaciones que deben bloquear -------------------------------
  t.caso('T17 Validaciones');
  t.ok(!M.calcular(cat, req_('HBK', '2026-09-05', '2026-09-03', [lin_('BAS_DBL', 2)])).ok,
       'Rechaza salida anterior a la entrada');
  t.ok(!M.calcular(cat, req_('HBK', '2026-09-03', '2026-09-03', [lin_('BAS_DBL', 2)])).ok,
       'Rechaza estadia de 0 noches');
  t.ok(!M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 3)])).ok,
       'Rechaza 3 adultos en una doble');
  t.ok(!M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 2, [2])])).ok,
       'Rechaza 3 huespedes en una doble (el infante ocupa)');
  t.ok(M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2)])).ok,
       'Acepta 2 huespedes en una cuadruple: ocup_min_fisica quedo en 1');
  t.ok(!M.calcular(conHab_(cat, 'HBK|BAS_QUA', { ocupMinFisica: 3 }),
                   req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2)])).ok,
       'Con ocup_min_fisica 3 si rechaza 2 huespedes');
  t.ok(!M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 0, [7])])).ok,
       'Rechaza habitacion sin adultos');
  t.ok(!M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('NO_EXISTE', 2)])).ok,
       'Rechaza codigo de habitacion inexistente');
  t.ok(!M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [])).ok,
       'Rechaza cotizacion sin habitaciones');

  // ---- T18. Hueco de tarifa: error explicito con la fecha -----------------
  t.caso('T18 Hueco de tarifa');
  r = M.calcular(cat, req_('HBK', '2027-06-01', '2027-06-03', [lin_('BAS_DBL', 2)]));
  t.ok(!r.ok, 'Fuera del horizonte cargado -> error');
  t.contiene(r.errores.join(' '), 'Sin tarifa', 'El error menciona la falta de tarifa');
  t.contiene(r.errores.join(' '), '01/06/27', 'El error indica la fecha exacta');

  // ---- T19. Stop sales -----------------------------------------------------
  t.caso('T19 Stop sales');
  var catSS = conStopSales_(cat, [
    { hotel: 'HBK', codHab: 'TODAS', inicio: '2026-09-02', fin: '2026-09-03',
      motivo: 'Mantenimiento de piscina' }
  ]);
  r = M.calcular(catSS, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 2)]));
  t.ok(!r.ok, 'Una noche cerrada bloquea la cotizacion');
  t.contiene(r.errores.join(' '), 'Sin cupo', 'El error habla de cupo, no de tarifas');
  t.contiene(r.errores.join(' '), '02/09/26', 'El error indica la noche exacta');
  t.contiene(r.errores.join(' '), 'Mantenimiento de piscina', 'El error incluye el motivo');

  r = M.calcular(catSS, req_('HBK', '2026-09-01', '2026-09-02', [lin_('BAS_DBL', 2)]));
  t.ok(r.ok, 'Salir la manana del primer dia cerrado NO se ve afectado',
       (r.errores || []).join('; '));
  t.eq(r.total, 170, 'Cobra la unica noche libre');

  r = M.calcular(catSS, req_('HBK', '2026-09-04', '2026-09-06', [lin_('BAS_DBL', 2)]));
  t.ok(r.ok, 'Despues del cierre vuelve a haber cupo', (r.errores || []).join('; '));

  var catSSHab = conStopSales_(cat, [
    { hotel: 'HBK', codHab: 'BAS_DBL', inicio: '2026-09-01', fin: '2026-09-02', motivo: '' }
  ]);
  t.ok(!M.calcular(catSSHab, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 2)])).ok,
       'El cierre por habitacion bloquea esa categoria');
  t.ok(M.calcular(catSSHab, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_TPL', 2)])).ok,
       'Las otras categorias del hotel siguen disponibles');
  t.ok(M.calcular(catSSHab, req_('HIM', '2026-09-01', '2026-09-03', [lin_('DLX_VMON', 2)])).ok,
       'El cierre no se contagia a otro hotel');

  // ---- T20. Render de WhatsApp --------------------------------------------
  t.caso('T20 Render WhatsApp');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 2)]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.eq(M.marcadoresNoResueltos(txt).length, 0, 'Sin marcadores {{}} pendientes');
  t.contiene(txt, 'HOTEL HESPERIA MORROCOY', 'Titulo del hotel');
  t.contiene(txt, '*MZ*', 'Iniciales de la asesora');
  t.contiene(txt, 'CHECK IN 3:00 PM: 01/09/26', 'Linea de check-in');
  t.contiene(txt, 'CHECK OUT 12:00 PM: 03/09/26', 'Linea de check-out');
  t.contiene(txt, 'ESTÁNDAR BÁSICA', 'Nombre de la habitacion');
  t.contiene(txt, '2 adultos', 'Ocupantes');
  t.contiene(txt, 'Total, por noche: $170  (85$ p/p)', 'Tarifa por noche con p/p');
  t.contiene(txt, '*TOTAL: $340', 'Linea de total');
  t.contiene(txt, '*Reservemos!*', 'Cierre de la plantilla');
  t.ok(!/\n{3,}/.test(txt), 'Sin bloques de 3+ saltos de linea');

  // ---- T20b. La fecha de la cotizacion la pone quien llama ----------------
  t.caso('T20b Fecha de cotizacion');
  var catFC = conPlantilla_(cat, 'HBK', 'ZZ',
    'F[{{FECHA_COTIZACION}}] {{BLOQUE_HABITACIONES}} {{TOTAL}}');
  r = M.calcular(catFC, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 2)]));
  txt = M.render(catFC, r, { asesorIniciales: 'ZZ', fechaCotizacion: '2026-09-11' });
  t.contiene(txt, 'F[11/09/26]', 'Sale con el formato de fecha del hotel');

  txt = M.render(catFC, r, { asesorIniciales: 'ZZ' });
  t.eq(M.marcadoresNoResueltos(txt).length, 0, 'Sin fecha el marcador se resuelve igual');
  t.contiene(txt, 'F[]', 'Y queda vacio en vez de imprimir una fecha inventada');

  var lanzo = false;
  try {
    M.render(catFC, r, { asesorIniciales: 'ZZ', fechaCotizacion: '11/09/2026' });
  } catch (e) { lanzo = true; }
  t.ok(lanzo, 'Una fecha fuera de ISO rompe en vez de imprimir cualquier cosa');

  // ---- T21. El suplemento single ya no se explica en el mensaje -----------
  t.caso('T21 Suplemento single sin texto');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 1)]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.noContiene(txt, 'suplemento', 'No menciona el suplemento');
  t.noContiene(txt, 'habitación individual', 'No menciona la habitacion individual');
  t.contiene(txt, 'Total, por noche: $115', 'Solo aparece el monto, con el suplemento adentro');
  t.noContiene(txt, 'p/p', 'Con suplemento no se muestra el precio por persona');

  // ---- T21b. El p/p no puede contradecir la politica de ninos -------------
  t.caso('T21b Precio por persona');
  r = M.calcular(cat, req_('HBK', '2026-09-19', '2026-09-21', [lin_('BAS_QUA', 2, [5])]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.eq(r.lineas[0].paxPagos, 2.5, 'Pagan 2,5 pax');
  t.eq(r.lineas[0].ocupacion, 3, 'Pero la habitacion la ocupan 3 personas');
  t.noContiene(txt, 'p/p', 'Con un menor a mitad de precio NO se muestra el p/p');
  t.contiene(txt, 'Total, por noche: $175', 'Solo el monto: 70 x 2,5');

  var catMin2 = conHab_(cat, 'HBK|BAS_QUA', { paxMinCobrados: 3 });
  r = M.calcular(catMin2, req_('HBK', '2026-09-19', '2026-09-21', [lin_('BAS_QUA', 2, [5])]));
  txt = M.render(catMin2, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.eq(r.lineas[0].paxEfectivo, 3, 'Con minimo facturable sube a 3');
  t.noContiene(txt, 'p/p', 'Con minimo facturable tampoco se muestra el p/p');
  t.contiene(txt, 'Total, por noche: $210', 'Solo el monto: 70 x 3');

  r = M.calcular(cat, req_('HBK', '2026-09-19', '2026-09-21', [lin_('BAS_QUA', 3)]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.contiene(txt, '(70$ p/p)', 'Con 3 adultos si se muestra: todos pagan lo mismo');

  // ---- T22. Edades reales en el mensaje -----------------------------------
  t.caso('T22 Edades en el mensaje');
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2, [6, 8])]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.contiene(txt, '2 adultos + 2 niños (6 y 8 años)', 'Dos menores del mismo rango');

  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2, [3, 12])]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.contiene(txt, '1 niño (12 años)', 'El mayor se nombra con su edad');
  t.contiene(txt, '1 infante (3 años)', 'El infante tambien');
  t.noContiene(txt, '0-4 años', 'Ya no se imprime la etiqueta del rango');

  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_TPL', 2, [1])]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.contiene(txt, '(1 año)', 'Singular correcto para un menor de 1 ano');

  t.eq(M.textoEdades([5]), '5 años', 'textoEdades: uno');
  t.eq(M.textoEdades([5, 8]), '5 y 8 años', 'textoEdades: dos');
  t.eq(M.textoEdades([5, 8, 12]), '5, 8 y 12 años', 'textoEdades: tres');

  // ---- T23. Render de casos complejos -------------------------------------
  t.caso('T23 Render casos complejos');
  r = M.calcular(cat, req_('HIM', '2026-09-14', '2026-09-17',
                           [lin_('DLX_VMON', 2)], ['PRO_RESIDENTES']));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.contiene(txt, 'Tarifa por temporada:', 'Muestra desglose cuando la tarifa varia');
  t.contiene(txt, '14/09/26', 'Incluye la primera noche');
  t.contiene(txt, 'PROMOCIÓN APLICADA', 'Muestra la promo aplicada');
  t.contiene(txt, 'Promoción para Residentes', 'Con su nombre');
  t.contiene(txt, 'previa presentación del RIF', 'Y con el renglon de la promo');
  t.contiene(txt, '(2 noches)', 'Indica cuantas noches cubrio');

  r = M.calcular(cat, req_('HBK', '2026-12-23', '2026-12-26', [lin_('BAS_DBL', 2, [], 2)]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.contiene(txt, '2 HABITACIONES', 'Pluraliza habitaciones');
  t.contiene(txt, 'c/u', 'Indica precio por unidad');
  t.contiene(txt, 'CARGOS ESPECIALES', 'Muestra el bloque de cargos');
  t.contiene(txt, 'Cena de Navidad', 'Detalla el cargo');

  // ---- T24. Hotel de ciudad: tarifa por ocupacion -------------------------
  // Sin impuestos: la tarifa cargada es el precio final, igual que en playa.
  // Y el precio depende de cuantos duerman en la habitacion.
  t.caso('T24 Hotel de ciudad');
  r = M.calcular(cat, req_('WTC', '2026-08-22', '2026-08-25', [lin_('DLX_KING', 1)]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.nNoches, 3, '3 noches');
  t.eq(r.lineas[0].aplicoSingle, false, 'POR_HABITACION no aplica suplemento single');
  t.eq(r.lineas[0].costoUniforme, 180, 'Deluxe King con 1 huesped: 180');
  t.eq(r.total, 540, 'Total 540');

  r2 = M.calcular(cat, req_('WTC', '2026-08-22', '2026-08-25', [lin_('DLX_KING', 2)]));
  t.eq(r2.lineas[0].costoUniforme, 200, 'Deluxe King con 2 huespedes: 200');
  t.eq(r2.total, 600, 'Total 600: la ocupacion cambia el precio');

  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.eq(M.marcadoresNoResueltos(txt).length, 0, 'Sin marcadores pendientes');
  t.contiene(txt, 'CHECK IN 3:00 PM: 22/08/2026', 'Fecha en formato dd/MM/yyyy');
  t.contiene(txt, 'Total, por noche: $180', 'Renglon de precio sin desglose');
  t.noContiene(txt, 'IVA', 'El mensaje no menciona impuestos en ningun hotel');
  t.contiene(txt, 'Adultos: 1', 'Ocupantes en renglones separados');
  t.contiene(txt, 'Ni\u00F1os:', 'Renglon de ninos aunque este vacio');
  t.contiene(txt, '*TOTAL: $540 (3 NOCHES)*', 'Total con la palabra en plural');

  r = M.calcular(cat, req_('WTC', '2026-08-22', '2026-08-23', [lin_('DLX_KING', 1, [8])]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.contiene(txt, 'Ni\u00F1os: 8 a\u00F1os', 'Las edades tambien salen en el formato de renglones');
  t.contiene(txt, '(1 NOCHE)', 'Singular con una sola noche');

  // ---- T24b. El resto del tarifario de ciudad -----------------------------
  t.caso('T24b Tarifario de ciudad');
  [['WTC', 'DLX_TWIN',  2, [], 200], ['WTC', 'DLX_TPL',   3, [], 240],
   ['WTC', 'JR_SUITE',  1, [], 200], ['WTC', 'JR_SUITE',  2, [], 220],
   ['WTC', 'SUITE_EXE', 1, [], 330], ['WTC', 'SUITE_EXE', 2, [], 350],
   ['WTC', 'SUITE_FLY', 4, [], 320],
   ['HMC', 'DLX_KING',  1, [], 138], ['HMC', 'DLX_KING',  2, [], 144],
   ['HMC', 'DLX_TWIN',  2, [], 144],
   ['HMC', 'SUITE',     1, [], 166], ['HMC', 'SUITE',     2, [], 166]
  ].forEach(function (c) {
    var rr = M.calcular(cat, req_(c[0], '2026-09-01', '2026-09-02',
                                  [lin_(c[1], c[2], c[3])]));
    t.ok(rr.ok, c[0] + ' ' + c[1] + ' x' + c[2] + ': calcula', (rr.errores || []).join('; '));
    if (rr.ok) t.eq(rr.total, c[4], c[0] + ' ' + c[1] + ' con ' + c[2] + ' huesped(es)');
  });

  // ---- T24c. Ocupaciones que no se venden ---------------------------------
  // La Twin de Valencia solo tiene tarifa para dos y la Triple para tres. No
  // se inventa un precio: se bloquea con un mensaje claro.
  t.caso('T24c Ocupaciones bloqueadas');
  t.ok(!M.calcular(cat, req_('WTC', '2026-09-01', '2026-09-02', [lin_('DLX_TWIN', 1)])).ok,
       'La Deluxe Twin no se vende a 1 huesped');
  t.ok(!M.calcular(cat, req_('WTC', '2026-09-01', '2026-09-02', [lin_('DLX_TPL', 2)])).ok,
       'La Deluxe Triple no se vende a 2 huespedes');
  t.ok(!M.calcular(cat, req_('HMC', '2026-09-01', '2026-09-02', [lin_('DLX_TWIN', 1)])).ok,
       'La Twin de Maracay tampoco se vende a 1');

  // ---- T24d. Personas adicionales -----------------------------------------
  t.caso('T24d Personas adicionales');
  r = M.calcular(cat, req_('HMC', '2026-09-01', '2026-09-02', [lin_('DLX_KING', 3)]));
  t.ok(r.ok, 'Tres adultos en la King de Maracay', (r.errores || []).join('; '));
  t.eq(r.total, 164, '144 + 20 del tercer adulto');

  r = M.calcular(cat, req_('HMC', '2026-09-01', '2026-09-02', [lin_('DLX_KING', 2, [5])]));
  t.eq(r.total, 154, '144 + 10 del nino de 5 anos');

  r = M.calcular(cat, req_('HMC', '2026-09-01', '2026-09-02', [lin_('DLX_TWIN', 2, [5, 7])]));
  t.eq(r.total, 164, '144 + dos ninos a 10');

  r = M.calcular(cat, req_('HMC', '2026-09-01', '2026-09-02', [lin_('DLX_TWIN', 4)]));
  t.eq(r.total, 184, '144 + dos adultos a 20');

  // Con una plaza de sobra y ocupantes de distinto precio, el adicional es el
  // mas barato: la tarifa base cubre a los demas.
  r = M.calcular(cat, req_('HMC', '2026-09-01', '2026-09-02', [lin_('DLX_KING', 2, [12])]));
  t.eq(r.total, 164, 'Un menor de 12 paga como adulto: 144 + 20');

  r = M.calcular(cat, req_('WTC', '2026-09-01', '2026-09-02', [lin_('SUITE_FLY', 5)]));
  t.eq(r.total, 340, 'La quinta persona en la Family Suite: 320 + 20');

  r = M.calcular(cat, req_('HMC', '2026-09-01', '2026-09-03', [lin_('DLX_KING', 2, [5])]));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.eq(r.total, 308, 'El adicional se cobra por noche, no por estadia');
  t.contiene(txt, 'incluye 1 ni\u00F1o adicional a $10', 'El mensaje explica el adicional');

  // ---- T24e. Los cortes de edad de Maracay --------------------------------
  // Maracay usa rangos propios: 0-2 sin cargo, 3-9 a mitad, 10-17 completo.
  t.caso('T24e Edades de Maracay');
  t.eq(M.rangoPorEdad(cat, 'HMC', 3).cod, 'NIN', 'A los 3 anos ya es nino en Maracay');
  t.eq(M.rangoPorEdad(cat, 'HMC', 2).cod, 'INF', 'A los 2 sigue siendo infante');
  t.eq(M.rangoPorEdad(cat, 'HMC', 10).cod, 'MAY', 'A los 10 pasa a mayor');
  t.eq(M.rangoPorEdad(cat, 'HBK', 3).cod, 'INF', 'En Morrocoy los cortes no cambiaron');
  t.eq(M.rangoPorEdad(cat, 'HBK', 9).cod, 'NIN', 'En Morrocoy a los 9 todavia es nino');
  t.eq(M.rangoPorEdad(cat, 'HMC', 9).cod, 'NIN', 'En Maracay a los 9 tambien');

  // ---- T24f. Un cierre de venta se distingue de un error de datos ---------
  // La asesora tiene que saber si el problema es que no hay habitaciones o si
  // le falta cargar algo: son dos conversaciones distintas con el cliente.
  t.caso('T24f Sin cupo');
  var catCerrado = conStopSales_(cat, [
    { hotel: 'HBK', codHab: 'TODAS', inicio: '2026-09-10', fin: '2026-09-12',
      motivo: 'Hotel lleno por convención' }
  ]);
  r = M.calcular(catCerrado, req_('HBK', '2026-09-09', '2026-09-12',
                                  [lin_('BAS_DBL', 2)]));
  t.ok(!r.ok, 'La cotizacion se bloquea');
  t.eq(r.sinCupo.length, 1, 'El cierre se reporta aparte de los errores');
  t.eq(r.sinCupo[0].motivo, 'Hotel lleno por convención', 'Con su motivo');
  t.eq(r.sinCupo[0].noche, '2026-09-10', 'Y la primera noche afectada');

  // Salir la manana del primer dia cerrado no ocupa esa noche
  r = M.calcular(catCerrado, req_('HBK', '2026-09-08', '2026-09-10',
                                  [lin_('BAS_DBL', 2)]));
  t.ok(r.ok, 'Quien sale el 10 no ocupa la noche del 10', (r.errores || []).join('; '));
  t.eq(r.sinCupo.length, 0, 'Y no se reporta ningun cierre');

  // Un cierre de una sola habitacion deja libres las demas
  var catHab = conStopSales_(cat, [
    { hotel: 'HBK', codHab: 'BAS_DBL', inicio: '2026-09-10', fin: '2026-09-11',
      motivo: 'Mantenimiento' }
  ]);
  t.ok(!M.calcular(catHab, req_('HBK', '2026-09-10', '2026-09-11',
                                [lin_('BAS_DBL', 2)])).ok,
       'La habitacion cerrada no se vende');
  t.ok(M.calcular(catHab, req_('HBK', '2026-09-10', '2026-09-11',
                               [lin_('BAS_TPL', 2)])).ok,
       'Las demas del mismo hotel siguen disponibles');

  // Sin cupo gana sobre el precio: si no hay habitacion, la tarifa da igual
  var catSinTarifa = conStopSales_(cat, [
    { hotel: 'HBK', codHab: 'TODAS', inicio: '2027-06-01', fin: '2027-06-02',
      motivo: 'Cerrado' }
  ]);
  r = M.calcular(catSinTarifa, req_('HBK', '2027-06-01', '2027-06-02',
                                    [lin_('BAS_DBL', 2)]));
  t.eq(r.sinCupo.length, 1, 'Fuera del horizonte, el mensaje habla de cupo y no de tarifas');

  // ---- T24g. Servicios adicionales cobrables ------------------------------
  // Early check-in y late check-out se cobran por persona, una vez por
  // estadia, y los menores pagan segun el factor de la politica de ninos.
  t.caso('T24g Servicios adicionales');
  var reqExtra = function (extras, adultos, edades, noches, cod) {
    var q = req_('HBK', '2026-09-01', noches || '2026-09-03',
                 [lin_(cod || 'BAS_DBL', adultos, edades)]);
    q.extras = extras;
    return q;
  };

  r = M.calcular(cat, reqExtra([], 2));
  var baseSinExtras = r.total;
  t.eq(r.extras.length, 0, 'Sin marcar nada, no hay extras');
  t.eq(r.totalExtras, 0, 'Ni monto de extras');

  r = M.calcular(cat, reqExtra(['EARLY'], 2));
  t.eq(r.extras.length, 1, 'Early check-in marcado');
  t.eq(r.extras[0].monto, 40, '2 personas x $20');
  t.eq(r.total, baseSinExtras + 40, 'Y entra en el total');

  // Una vez por estadia: dos noches o cinco cuestan lo mismo
  r = M.calcular(cat, reqExtra(['EARLY'], 2, [], '2026-09-06'));
  t.eq(r.extras[0].monto, 40, 'El early no se multiplica por las noches');

  r = M.calcular(cat, reqExtra(['EARLY', 'LATE'], 2));
  t.eq(r.extras.length, 2, 'Los dos a la vez');
  t.eq(r.totalExtras, 110, '2 x 20 mas 2 x 35');
  t.eq(r.total, baseSinExtras + 110, 'Total con los dos');

  // Los menores pagan segun su factor: en Morrocoy un nino de 7 va al 50%
  r = M.calcular(cat, reqExtra(['EARLY'], 2, [7], null, 'BAS_QUA'));
  t.ok(r.ok, 'Cuadruple con 2 adultos y un nino', (r.errores || []).join('; '));
  t.eq(r.lineas[0].paxPagos, 2.5, 'El nino cuenta como medio pax');
  t.eq(r.extras[0].monto, 50, '2,5 pax x $20: el nino paga la mitad');

  // Un infante no paga nada
  r = M.calcular(cat, reqExtra(['EARLY'], 2, [1], null, 'BAS_QUA'));
  t.eq(r.extras[0].monto, 40, 'El infante no suma al early check-in');

  // El brazalete VIP es por dia, no por estadia
  r = M.calcular(cat, reqExtra(['VIP'], 2));
  t.eq(r.extras[0].monto, 140, '2 personas x $35 x 2 noches');
  t.eq(r.extras[0].tipo, 'POR_PERSONA_DIA', 'Y se marca como cobro por dia');

  // Varias habitaciones: el servicio se cobra a todo el grupo
  var qMulti = req_('HBK', '2026-09-01', '2026-09-03',
                    [lin_('BAS_DBL', 2), lin_('BAS_TPL', 3)]);
  qMulti.extras = ['EARLY'];
  r = M.calcular(cat, qMulti);
  t.eq(r.extras[0].monto, 100, '5 personas de dos habitaciones x $20');

  // Y la cantidad de habitaciones iguales tambien cuenta
  var qCant = req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_DBL', 2, [], 3)]);
  qCant.extras = ['EARLY'];
  r = M.calcular(cat, qCant);
  t.eq(r.extras[0].monto, 120, '3 habitaciones dobles son 6 personas x $20');

  // El mensaje distingue lo contratado de lo que sigue en oferta
  r = M.calcular(cat, reqExtra(['EARLY'], 2));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.eq(M.marcadoresNoResueltos(txt).length, 0, 'Sin marcadores pendientes');
  t.contiene(txt, 'SERVICIOS ADICIONALES INCLUIDOS EN EL TOTAL', 'Lo contratado va aparte');
  t.contiene(txt, 'EARLY CHECK IN', 'Con su nombre');
  t.contiene(txt, '$40', 'Y su monto');
  t.contiene(txt, '(Opcionales)', 'Lo no contratado se sigue ofreciendo');
  t.contiene(txt, 'LATE CHECK OUT', 'Como el late check-out');

  // Sin nada marcado, el mensaje se ve como siempre se vio
  r = M.calcular(cat, reqExtra([], 2));
  txt = M.render(cat, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.noContiene(txt, 'INCLUIDOS EN EL TOTAL', 'Sin extras no aparece la seccion de cobrados');
  t.contiene(txt, '(Opcionales)', 'Pero si la oferta');

  // Los hoteles de ciudad no ofrecen ninguno
  var qCiudad = req_('WTC', '2026-09-01', '2026-09-03', [lin_('DLX_KING', 2)]);
  qCiudad.extras = ['EARLY'];
  r = M.calcular(cat, qCiudad);
  t.eq(r.totalExtras, 0, 'Valencia no cobra extras');
  t.ok(r.advertencias.join(' ').indexOf('EARLY') !== -1,
       'Y avisa que ese servicio no existe aqui', r.advertencias.join(' | '));

  // ---- T25. Cobertura de hoteles activos -----------------------------------
  t.caso('T25 Cobertura de hoteles');
  [['HBK', 'BAS_DBL'], ['HIM', 'DLX_VMON'], ['HPA', 'HOL_GARD']].forEach(function (par) {
    var rr = M.calcular(cat, req_(par[0], '2026-09-01', '2026-09-03', [lin_(par[1], 2)]));
    t.ok(rr.ok, par[0] + ': calcula sin errores', (rr.errores || []).join('; '));
    if (!rr.ok) return;
    var tt = M.render(cat, rr, { asesorIniciales: 'MZ', cliente: 'Prueba' });
    t.eq(M.marcadoresNoResueltos(tt).length, 0, par[0] + ': plantilla completa');
    t.ok(tt.length > 200, par[0] + ': texto con contenido');
  });
  // Los dos hoteles de ciudad ya estan activos y con tarifas propias.
  [['WTC', 'DLX_KING'], ['HMC', 'DLX_KING']].forEach(function (par) {
    t.ok(!!cat.hoteles[par[0]], par[0] + ' esta activo en el catalogo');
    var rr = M.calcular(cat, req_(par[0], '2026-09-01', '2026-09-03', [lin_(par[1], 2)]));
    t.ok(rr.ok, par[0] + ': calcula sin errores', (rr.errores || []).join('; '));
    if (!rr.ok) return;
    var tt = M.render(cat, rr, { asesorIniciales: 'MZ', cliente: 'Prueba' });
    t.eq(M.marcadoresNoResueltos(tt).length, 0, par[0] + ': plantilla completa');
    t.noContiene(tt, 'IVA', par[0] + ': sin mencion de impuestos');
  });

  // ---- T25b. Toda plantilla cargada tiene que renderizar -------------------
  // Recorre plantillas.json tal como este, sin nombrar a ninguna asesora: el
  // dia que entre una nueva con juego propio, esta prueba ya la cubre.
  t.caso('T25b Plantillas de todas las asesoras');
  var ejemploHab = { HBK: 'BAS_DBL', HIM: 'DLX_VMON', HPA: 'HOL_GARD',
                     WTC: 'DLX_KING', HMC: 'DLX_KING' };
  Object.keys(cat.plantillas).forEach(function (clave) {
    var partes = clave.split('|');
    var hotel = partes[0], quien = partes[1] || 'MZ';
    var hab = ejemploHab[hotel];
    if (!hab) { t.ok(false, clave + ': hotel sin habitacion de ejemplo'); return; }
    var rr = M.calcular(cat, req_(hotel, '2026-09-01', '2026-09-03', [lin_(hab, 2)]));
    if (!rr.ok) { t.ok(false, clave + ': el ejemplo no calcula',
                       (rr.errores || []).join('; ')); return; }
    var tt = M.render(cat, rr, { asesorIniciales: quien, cliente: 'Prueba',
                                 fechaCotizacion: '2026-09-11' });
    t.eq(M.marcadoresNoResueltos(tt).length, 0, clave + ': sin marcadores pendientes');
    t.noContiene(tt, 'IVA', clave + ': sin mencion de impuestos');
    t.ok(tt.length > 200, clave + ': texto con contenido');
  });

  // ---- T26. El validador no reporta errores -------------------------------
  t.caso('T26 Validador');
  var hallazgos = Validador.validar(cat, M, '2026-09-01');
  var errores = hallazgos.filter(function (h) { return h[0] === 'ERROR'; });
  t.eq(errores.length, 0, 'El catalogo cargado no tiene errores',
       errores.map(function (h) { return h[2] + ': ' + h[3]; }).join(' | '));

  return t.resultados;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ejecutarPruebas: ejecutarPruebas, req_: req_, lin_: lin_,
                     conStopSales_: conStopSales_, conHab_: conHab_,
                     conPromos_: conPromos_, menorGratis_: menorGratis_ };
}
