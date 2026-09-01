/**
 * COTIZADOR HESPERIA - 05_Pruebas.gs
 * Suite de pruebas funcionales sobre las tarifas cargadas.
 *
 * USO: menu Cotizador > Ejecutar pruebas funcionales
 *      (o ejecutar ejecutarPruebas() desde el editor y ver el Registro)
 *
 * IMPORTANTE: los valores esperados estan atados a las tarifas de
 * cargarDatosDemo_(). Si cambian las tarifas, hay que actualizarlos.
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
 * Copia del catalogo con WTC activo y una tarifa, para ejercitar el modo
 * POR_HABITACION + IVA sin depender de que el hotel ya este publicado.
 */
function conWTC_(cat, tarifa) {
  var c = JSON.parse(JSON.stringify(cat));
  c.hoteles.WTC = {
    codigo: 'WTC', nombre: 'HOTEL HESPERIA WTC VALENCIA', emojis: '\uD83C\uDFE8',
    horaIn: '3:00 PM', horaOut: '12:00 PM', formatoFecha: 'dd/MM/yyyy',
    modoTarifa: 'POR_HABITACION', ivaPct: 16, formatoOcupantes: 'LINEAS',
    deposito: 0, labelDeposito: 'Dep\u00F3sito', earlyPP: 0, latePP: 0,
    horaLate: '2:00 PM', vipDia: 0
  };
  ['ALTA_26', 'BAJA_26', 'NAV_26', 'FIN_26'].forEach(function (t) {
    c.tarifas['WTC|DLX_KING|' + t] = { tarifa: tarifa, ninoOverride: null };
  });
  return c;
}

// ============================================================================
// SUITE
// ============================================================================
function ejecutarPruebas() {
  var cat = getCatalogo(true);
  var M = MOTOR();
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
  r = M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2, [7])]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.lineas[0].paxPagos, 2.5, 'Solo 2,5 pax pagarian');
  t.eq(r.lineas[0].paxEfectivo, 3, 'Forzado al minimo de 3 pax');
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

  // ---- T15. parseDias_ tolerante ------------------------------------------
  t.caso('T15 parseDias_');
  t.eq(parseDias_('5,6').join('-'), '5-6', 'Texto con coma');
  t.eq(parseDias_(5.6).join('-'), '5-6', 'Numero corrompido por Sheets');
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
  t.ok(!M.calcular(cat, req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2)])).ok,
       'Rechaza 2 huespedes en una cuadruple (ocup_min_fisica 3)');
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
  t.eq(r.lineas[0].paxEfectivo, 3, 'pax_min_cobrados los sube a 3');
  t.eq(r.lineas[0].ocupacion, 3, 'Y la ocupacion tambien es 3, por casualidad');
  t.noContiene(txt, 'p/p', 'Con minimo facturable NO se muestra el precio por persona');
  t.contiene(txt, 'Total, por noche: $210', 'Solo el monto');

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

  // ---- T24. Hotel de ciudad: POR_HABITACION + IVA -------------------------
  t.caso('T24 Hotel de ciudad con IVA');
  var catW = conWTC_(cat, 100);
  r = M.calcular(catW, req_('WTC', '2026-08-22', '2026-08-25', [lin_('DLX_KING', 1)]));
  t.ok(r.ok, 'Calculo sin errores', (r.errores || []).join('; '));
  t.eq(r.nNoches, 3, '3 noches');
  t.eq(r.lineas[0].aplicoSingle, false, 'POR_HABITACION no aplica suplemento single');
  t.eq(r.lineas[0].detalleNoches[0].neto, 100, 'Neto 100 por habitacion');
  t.eq(r.lineas[0].costoUniforme, 116, '100 + 16% de IVA');
  t.eq(r.total, 348, 'Total 348 (replica el ejemplo enviado)');

  r2 = M.calcular(catW, req_('WTC', '2026-08-22', '2026-08-25', [lin_('DLX_KING', 2)]));
  t.eq(r2.total, 348, 'Con 2 adultos cuesta lo mismo: la tarifa es por habitacion');

  txt = M.render(catW, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.eq(M.marcadoresNoResueltos(txt).length, 0, 'Sin marcadores pendientes');
  t.contiene(txt, 'CHECK IN 3:00 PM: 22/08/2026', 'Fecha en formato dd/MM/yyyy');
  t.contiene(txt, 'Precio por noche $100 + IVA= $116', 'Renglon de precio con IVA');
  t.contiene(txt, 'Adultos: 1', 'Ocupantes en renglones separados');
  t.contiene(txt, 'Niños:', 'Renglon de ninos aunque este vacio');
  t.contiene(txt, '*TOTAL: $348 (3 NOCHES)*', 'Total con la palabra en plural');

  r = M.calcular(catW, req_('WTC', '2026-08-22', '2026-08-23', [lin_('DLX_KING', 1, [8])]));
  txt = M.render(catW, r, { asesorIniciales: 'MZ', cliente: 'Prueba' });
  t.contiene(txt, 'Niños: 8 años', 'Las edades tambien salen en el formato de renglones');
  t.contiene(txt, '(1 NOCHE)', 'Singular con una sola noche');

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
  t.eq(cat.hoteles.WTC, undefined, 'WTC no aparece: esta inactivo hasta cargar tarifas');
  t.eq(cat.hoteles.HMC, undefined, 'HMC no aparece: esta inactivo hasta cargar tarifas');

  // ---- T26. El validador no reporta errores -------------------------------
  t.caso('T26 Validador');
  var hallazgos = validarCatalogoCore_();
  var errores = hallazgos.filter(function (h) { return h[0] === 'ERROR'; });
  t.eq(errores.length, 0, 'El catalogo cargado no tiene errores',
       errores.map(function (h) { return h[2] + ': ' + h[3]; }).join(' | '));

  escribirResultados_(t.resultados);
  return t.resultados;
}

// ============================================================================
// CICLO COMPLETO DE REGISTRO (escribe una fila real: borrarla despues)
// ============================================================================
function pruebaRegistro() {
  var out = apiRegistrarCotizacion({
    cliente: 'PRUEBA - borrar',
    asesorIniciales: 'MZ',
    req: req_('HBK', '2026-09-01', '2026-09-03', [lin_('BAS_QUA', 2, [6, 8])])
  });
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// ============================================================================
// SALIDA
// ============================================================================
function escribirResultados_(resultados) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Pruebas');
  if (!sh) sh = ss.insertSheet('Pruebas');
  sh.clear();

  sh.getRange(1, 1, 1, 4).setValues([['resultado', 'caso', 'aserción', 'detalle']])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  sh.setFrozenRows(1);

  var filas = resultados.map(function (r) {
    return [r.pass ? 'OK' : 'FALLA', r.caso, r.desc, r.detalle];
  });
  sh.getRange(2, 1, filas.length, 4).setValues(filas);
  sh.getRange(2, 1, filas.length, 1).setBackgrounds(filas.map(function (f) {
    return [f[0] === 'OK' ? '#d9ead3' : '#f4cccc'];
  }));
  sh.autoResizeColumns(1, 4);

  var fallan = resultados.filter(function (r) { return !r.pass; }).length;
  ss.setActiveSheet(sh);
  SpreadsheetApp.getUi().alert(
    'Pruebas funcionales',
    (resultados.length - fallan) + ' de ' + resultados.length + ' aserciones pasan.' +
    (fallan ? '\n\nHay ' + fallan + ' falla(s). Revise la hoja "Pruebas".'
            : '\n\nTodo en verde.'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
