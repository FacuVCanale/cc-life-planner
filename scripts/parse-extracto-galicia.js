#!/usr/bin/env node
// cc-life-planner — parseo de extractos (resúmenes de cuenta) de Banco Galicia.
//
// Uso:  node scripts/parse-extracto-galicia.js <archivo.pdf|.txt>
//         [--desde YYYY-MM-DD] [--hasta YYYY-MM-DD] [--json] [--out <path>]
//         [--pdftotext <path>] [--no-gate]
//
// Convierte el PDF del resumen (Caja de Ahorro en pesos o dólares) en movimientos
// estructurados y clasificados por rubro. Los totales que emite son los que alimentan
// el presupuesto: se calculan acá, versionados y reproducibles con un comando.
//
// GATE DE VERIFICACIÓN (lo que prueba que el parseo no perdió ni duplicó filas):
//   1. Encadenado de saldos: saldo[i-1] + monto[i] == saldo[i] para TODO movimiento.
//   2. Saldo final calculado == saldo final declarado (línea `Total` y encabezado `Saldos`).
//   3. Suma de créditos / débitos == totales declarados en la línea `Total`.
// Si algo no cierra, el script FALLA (exit 1) diciendo qué movimiento rompe. No redondea
// la diferencia ni la saltea en silencio. `--no-gate` sólo existe para depurar un extracto
// nuevo cuyo formato todavía no entendemos; nunca para "hacerlo pasar".
//
// La aritmética es en CENTAVOS enteros: nada de floats en la verificación.
//
// Salida: sin `--json`, tabla humana (totales por rubro, por día, no clasificados).
//         con `--json`, el objeto completo (ver buildResult).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Reglas de clasificación por rubro — editables, se aplican EN ORDEN (primera que matchea gana).
//
// `re` se prueba contra el "subject" del movimiento: el nombre del comercio (primera línea de
// continuación) para COMPRA DEBITO, y la descripción para el resto.
// `sign` (opcional) restringe la regla a créditos o débitos — la misma leyenda
// ("TRANSFERENCIA DE TERCEROS") es ingreso si entra y transferencia si sale.
//
// Rubros válidos: super, restaurante, cafe, salidas, ropa, transporte, alojamiento,
// conectividad, ingreso, rendimiento, transferencia, otro.
// Lo que no matchea NO se adivina: cae en `otro` y se lista aparte para clasificar a mano.
// ---------------------------------------------------------------------------
const RUBROS = [
  'super', 'restaurante', 'cafe', 'salidas', 'ropa', 'transporte',
  'alojamiento', 'conectividad', 'ingreso', 'rendimiento', 'transferencia', 'otro',
];

const REGLAS = [
  // --- movimientos propios del banco -------------------------------------------------
  { rubro: 'rendimiento', re: /^RENDIMIENTO\b/i },

  // --- plata que entra ---------------------------------------------------------------
  { rubro: 'ingreso', re: /^DEP\.?EFVO/i },
  { rubro: 'ingreso', re: /^CREDITO TRANSFERENCIA/i },
  { rubro: 'ingreso', re: /^TRANSFERENCIA DE TERCEROS/i, sign: 'credito' },

  // --- plata que se mueve (no es gasto) ----------------------------------------------
  { rubro: 'transferencia', re: /^TRANSFERENCIA DE TERCEROS/i, sign: 'debito' },
  { rubro: 'transferencia', re: /^TRANSFERENCIA A TERCEROS/i },
  { rubro: 'transferencia', re: /^TRANSFERENCIA DE CUENTA/i },
  { rubro: 'transferencia', re: /^PAGO CON TRANSFERENCIA/i },

  // --- comercios ---------------------------------------------------------------------
  { rubro: 'super', re: /albert\s*heijn/i },

  { rubro: 'restaurante', re: /fabel\s*friet/i },
  { rubro: 'restaurante', re: /fox\s*bros/i },
  { rubro: 'restaurante', re: /uber\s*\*\s*eats/i },
  { rubro: 'restaurante', re: /picerija/i },
  { rubro: 'restaurante', re: /molo\s*gelateria/i },
  { rubro: 'restaurante', re: /poklisar\s*ice\s*cream/i },

  { rubro: 'cafe', re: /koffiesalon/i },

  { rubro: 'salidas', re: /fonatana\s*pub/i },

  { rubro: 'ropa', re: /\bzara\b/i },
  { rubro: 'ropa', re: /h&m/i },
  { rubro: 'ropa', re: /primark/i },

  { rubro: 'conectividad', re: /mobimatter/i },

  // --- Balcanes (cadenas identificables por nombre) -----------------------------------
  // Konzum (BiH/Croacia), VOLI (Montenegro), AMKO KOMERC (Montenegro) son cadenas de
  // supermercado; "sladoled" y "gelateria" son heladerías. Clasificados por el nombre
  // del comercio, no por confirmación del usuario.
  { rubro: 'super', re: /konzum/i },
  { rubro: 'super', re: /\bvoli\b/i },
  { rubro: 'super', re: /amko\s*komerc/i },
  { rubro: 'restaurante', re: /sladoled/i },
  { rubro: 'restaurante', re: /galateria|gelateria/i },
  { rubro: 'cafe', re: /cafe\s*bar/i },
  { rubro: 'ropa', re: /pull\s*&?\s*bear/i },
  // Uber a secas (el de viajes) — la regla de UBER * EATS va antes y gana.
  { rubro: 'transporte', re: /\bubr\*|\buber\b/i },

  // --- comercios del tramo Amsterdam + Balcanes (ago-2026) ----------------------------
  // FOBS B.V.: KVK 88496899, "exploitatie van restaurants", Amsterdam.
  { rubro: 'restaurante', re: /\bfobs\b/i },
  { rubro: 'restaurante', re: /bistro/i },
  { rubro: 'restaurante', re: /\brijo\b/i },
  { rubro: 'restaurante', re: /la\s*catedral/i },
  { rubro: 'restaurante', re: /eataly/i },
  { rubro: 'restaurante', re: /bananito/i },
  { rubro: 'restaurante', re: /davanti/i },
  { rubro: 'restaurante', re: /intvending/i },      // maquina de snacks
  { rubro: 'salidas', re: /\blounge\b/i },            // lounge de aeropuerto
  // Kiosco croata (Tisak) y comercio local de Montenegro: compra de almacen.
  { rubro: 'super', re: /tisak/i },
  { rubro: 'super', re: /belo\s*krug/i },
];

// Líneas de continuación que NO son el nombre del comercio (metadata bancaria).
const CONT_RUIDO = [
  /^\d{6,}$/,              // nro de tarjeta / CUIT / CBU
  /^(VARIOS|LINK|COELSA)$/i,
];

// Encabezados / pies repetidos por página y bloque legal.
const RUIDO_LINEA = [
  /^Resumen de Caja de Ahorro/i,
  /^Fecha\s+Descripci/i,
  /^\d{14,}P?$/,           // id del documento, ej. 20260818042222309P
  /Página\s+\d+\/\d+/i,
  /^Movimientos$/i,
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {
    file: null, desde: null, hasta: null, json: false, out: null,
    pdftotext: '/opt/homebrew/bin/pdftotext', gate: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--desde') out.desde = argv[++i];
    else if (a === '--hasta') out.hasta = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--pdftotext') out.pdftotext = argv[++i];
    else if (a === '--no-gate') out.gate = false;
    else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
    else if (a.startsWith('-')) die(`flag desconocida: ${a}`);
    else if (!out.file) out.file = a;
    else die(`argumento inesperado: ${a}`);
  }
  if (!out.file) { usage(); process.exit(2); }
  for (const k of ['desde', 'hasta']) {
    if (out[k] && !/^\d{4}-\d{2}-\d{2}$/.test(out[k])) die(`--${k} debe ser YYYY-MM-DD (recibí "${out[k]}")`);
  }
  return out;
}

function usage() {
  process.stderr.write(
    'Uso: node scripts/parse-extracto-galicia.js <archivo.pdf|.txt> ' +
    '[--desde YYYY-MM-DD] [--hasta YYYY-MM-DD] [--json] [--out <path>] ' +
    '[--pdftotext <path>] [--no-gate]\n');
}

function die(msg) {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Montos: formato AR "1.234,56" / "-12,34"  ->  centavos enteros
// ---------------------------------------------------------------------------
const RE_MONTO = /-?\d{1,3}(?:\.\d{3})*,\d{2}/;
const RE_MONTO_FULL = new RegExp(`^${RE_MONTO.source}$`);

function aCentavos(s) {
  const neg = s.trim().startsWith('-');
  const limpio = s.replace(/[^\d]/g, '');
  const n = parseInt(limpio, 10);
  if (!Number.isFinite(n)) throw new Error(`monto ilegible: "${s}"`);
  return neg ? -n : n;
}

function fmt(cents) {
  const neg = cents < 0;
  const s = String(Math.abs(cents)).padStart(3, '0');
  const ent = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${ent},${s.slice(-2)}`;
}

const pesos = (c) => c / 100;

// ---------------------------------------------------------------------------
// Texto del PDF
// ---------------------------------------------------------------------------
function leerTexto(file, pdftotextBin) {
  if (!fs.existsSync(file)) die(`no existe el archivo: ${file}`);
  if (/\.txt$/i.test(file)) return fs.readFileSync(file, 'utf8');
  // -layout preserva las columnas; el ancho de columna varía entre páginas,
  // por eso el parser NO usa posiciones fijas (ver parseMovimientos).
  try {
    return execFileSync(pdftotextBin, ['-layout', file, '-'], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    die(`falló pdftotext (${pdftotextBin}): ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Encabezado
// ---------------------------------------------------------------------------
function parseEncabezado(lines) {
  const h = {
    tipo: null, numero: null, cbu: null, moneda: null,
    periodo_desde: null, periodo_hasta: null,
    saldo_inicial_declarado: null, saldo_final_declarado: null,
  };
  const finHdr = lines.findIndex((l) => /^\s*Movimientos\s*$/i.test(l));
  const hdr = lines.slice(0, finHdr > 0 ? finHdr : lines.length);

  for (const raw of hdr) {
    const l = raw.trim();
    let m;
    if (!h.tipo && (m = l.match(/^Resumen de (Caja de Ahorro en .+?)\s*$/i))) h.tipo = m[1];
    if (!h.numero && (m = l.match(/^N°\s*(.+)$/))) h.numero = m[1].trim();
    if (!h.cbu && /^\d{22}$/.test(l)) h.cbu = l;
    if ((m = l.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/))) {
      h.periodo_desde = isoDesdeDDMMYYYY(m[1]);
      h.periodo_hasta = isoDesdeDDMMYYYY(m[2]);
      const saldo = l.match(new RegExp(`(USD|\\$)\\s?(${RE_MONTO.source})\\s*$`));
      if (saldo) { h.saldo_final_declarado = aCentavos(saldo[2]); h.moneda = saldo[1] === '$' ? 'ARS' : 'USD'; }
    }
    // Saldo inicial: el primer monto suelto del bloque "Saldos".
    if (h.saldo_inicial_declarado === null &&
        (m = l.match(new RegExp(`^(USD|\\$)\\s?(${RE_MONTO.source})$`)))) {
      h.saldo_inicial_declarado = aCentavos(m[2]);
      if (!h.moneda) h.moneda = m[1] === '$' ? 'ARS' : 'USD';
    }
  }
  if (!h.moneda && h.tipo) h.moneda = /dolar/i.test(h.tipo) ? 'USD' : 'ARS';
  return h;
}

function isoDesdeDDMMYYYY(s) {
  const [d, m, y] = s.split('/');
  return `${y}-${m}-${d}`;
}

function isoDesdeDDMMAA(s) {
  const [d, m, y] = s.split('/');
  return `20${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Movimientos
//
// Una fila arranca con `DD/MM/AA <descripción> [origen] [monto] <saldo>` y sigue con N
// líneas de continuación indentadas. Los DOS últimos números de la línea son (monto, saldo):
// el ancho de las columnas cambia entre páginas, así que no se parsea por posición, y el
// signo del monto distingue débito de crédito. El `Origen` de 4 caracteres (0105, 0HPB) se
// desprende del final de la descripción y nunca se confunde con un monto (no tiene coma).
// ---------------------------------------------------------------------------
const RE_FILA = new RegExp(
  `^\\s*(\\d{2}/\\d{2}/\\d{2})\\s+(.+?)\\s+(${RE_MONTO.source})\\s+(${RE_MONTO.source})\\s*$`);

function parseMovimientos(lines) {
  const movs = [];
  let dentro = false;
  let totalLine = null;
  let actual = null;

  const cerrar = () => { if (actual) { movs.push(finalizar(actual)); actual = null; } };

  for (const raw of lines) {
    const l = raw.replace(/\s+$/, '');
    const t = l.trim();

    if (!dentro) { if (/^Movimientos$/i.test(t)) dentro = true; continue; }
    if (/^Total\b/i.test(t)) { cerrar(); totalLine = t; break; } // lo que sigue es legal
    if (!t) continue;
    if (RUIDO_LINEA.some((re) => re.test(t))) continue;

    const m = l.match(RE_FILA);
    if (m) {
      cerrar();
      let desc = m[2].trim();
      let origen = null;
      const o = desc.match(/\s+([0-9][0-9A-Z]{3})$/);
      if (o) { origen = o[1]; desc = desc.slice(0, o.index).trim(); }
      actual = {
        fecha: isoDesdeDDMMAA(m[1]),
        descripcion: desc,
        origen,
        monto_cents: aCentavos(m[3]),
        saldo_cents: aCentavos(m[4]),
        detalle: [],
      };
      continue;
    }
    if (actual && !CONT_RUIDO.some((re) => re.test(t))) actual.detalle.push(t);
  }
  cerrar();

  return { movimientos: movs, totales_declarados: parseTotalLine(totalLine) };
}

function finalizar(mv) {
  const tipo = mv.monto_cents < 0 ? 'debito' : 'credito';
  const comercio = /^COMPRA DEBITO/i.test(mv.descripcion) && mv.detalle.length
    ? mv.detalle[0] : null;
  const subject = comercio || mv.descripcion;
  return {
    fecha: mv.fecha,
    descripcion: mv.descripcion,
    origen: mv.origen,
    comercio,
    subject,
    tipo,
    monto: pesos(mv.monto_cents),
    saldo: pesos(mv.saldo_cents),
    monto_cents: mv.monto_cents,
    saldo_cents: mv.saldo_cents,
    rubro: clasificar(subject, tipo),
    detalle: mv.detalle,
  };
}

function clasificar(subject, tipo) {
  for (const r of REGLAS) {
    if (r.sign && r.sign !== tipo) continue;
    if (r.re.test(subject)) return r.rubro;
  }
  return 'otro';
}

// `Total    USD 3.271,26    -USD 1.635,45    USD 1.635,81`
function parseTotalLine(line) {
  if (!line) return null;
  const re = new RegExp(`-?(?:USD|\\$)\\s?(${RE_MONTO.source})`, 'g');
  const nums = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    nums.push(aCentavos((m[0].trim().startsWith('-') ? '-' : '') + m[1]));
  }
  if (nums.length < 3) return null;
  return { creditos: nums[0], debitos: nums[1], saldo_final: nums[2] };
}

// ---------------------------------------------------------------------------
// GATE
// ---------------------------------------------------------------------------
function verificar(movs, decl, hdr) {
  const errores = [];
  if (!movs.length) errores.push('no se parseó ningún movimiento (¿cambió el formato del PDF?)');

  // 1. Encadenado. El saldo inicial sale del primer movimiento y se contrasta con el encabezado.
  const saldoInicial = movs.length ? movs[0].saldo_cents - movs[0].monto_cents : 0;
  let saldo = saldoInicial;
  for (let i = 0; i < movs.length; i++) {
    const mv = movs[i];
    const esperado = saldo + mv.monto_cents;
    if (esperado !== mv.saldo_cents) {
      errores.push(
        `encadenado roto en el movimiento #${i + 1} (${mv.fecha} · ${mv.subject}): ` +
        `saldo previo ${fmt(saldo)} + monto ${fmt(mv.monto_cents)} = ${fmt(esperado)}, ` +
        `pero el extracto dice ${fmt(mv.saldo_cents)} (dif ${fmt(mv.saldo_cents - esperado)})`);
    }
    saldo = mv.saldo_cents; // seguimos con el saldo del extracto para no propagar el error
  }

  if (hdr.saldo_inicial_declarado !== null && hdr.saldo_inicial_declarado !== saldoInicial) {
    errores.push(
      `saldo inicial: el encabezado declara ${fmt(hdr.saldo_inicial_declarado)} y de los ` +
      `movimientos sale ${fmt(saldoInicial)}`);
  }

  // 2 y 3. Contra los totales declarados en la línea `Total`.
  const creditos = movs.filter((m) => m.monto_cents > 0).reduce((a, m) => a + m.monto_cents, 0);
  const debitos = movs.filter((m) => m.monto_cents < 0).reduce((a, m) => a + m.monto_cents, 0);
  const finalCalc = movs.length ? movs[movs.length - 1].saldo_cents : saldoInicial;

  if (decl) {
    if (decl.creditos !== creditos) {
      errores.push(`créditos: declarado ${fmt(decl.creditos)} vs calculado ${fmt(creditos)}`);
    }
    if (decl.debitos !== debitos) {
      errores.push(`débitos: declarado ${fmt(decl.debitos)} vs calculado ${fmt(debitos)}`);
    }
    if (decl.saldo_final !== finalCalc) {
      errores.push(`saldo final (línea Total): declarado ${fmt(decl.saldo_final)} vs calculado ${fmt(finalCalc)}`);
    }
  } else {
    errores.push('no se encontró la línea `Total` del extracto: sin ella no hay contra-chequeo');
  }
  if (hdr.saldo_final_declarado !== null && hdr.saldo_final_declarado !== finalCalc) {
    errores.push(
      `saldo final (encabezado): declarado ${fmt(hdr.saldo_final_declarado)} vs calculado ${fmt(finalCalc)}`);
  }

  return {
    ok: errores.length === 0,
    errores,
    movimientos: movs.length,
    saldo_inicial: pesos(saldoInicial),
    saldo_final_calculado: pesos(finalCalc),
    saldo_final_declarado: decl ? pesos(decl.saldo_final) : null,
    total_creditos: pesos(creditos),
    total_debitos: pesos(debitos),
    total_creditos_declarado: decl ? pesos(decl.creditos) : null,
    total_debitos_declarado: decl ? pesos(decl.debitos) : null,
  };
}

// ---------------------------------------------------------------------------
// Agregados
// ---------------------------------------------------------------------------
function agregados(movs) {
  const porRubro = {};
  for (const r of RUBROS) porRubro[r] = { movimientos: 0, credito: 0, debito: 0, neto: 0 };
  const porDia = {};
  const sinClasificar = new Map();

  for (const mv of movs) {
    const r = porRubro[mv.rubro] || (porRubro[mv.rubro] = { movimientos: 0, credito: 0, debito: 0, neto: 0 });
    r.movimientos++;
    if (mv.monto_cents > 0) r.credito += mv.monto_cents; else r.debito += mv.monto_cents;
    r.neto += mv.monto_cents;

    const d = porDia[mv.fecha] || (porDia[mv.fecha] = { movimientos: 0, credito: 0, debito: 0, neto: 0 });
    d.movimientos++;
    if (mv.monto_cents > 0) d.credito += mv.monto_cents; else d.debito += mv.monto_cents;
    d.neto += mv.monto_cents;

    if (mv.rubro === 'otro') {
      const k = mv.subject;
      const e = sinClasificar.get(k) || { subject: k, movimientos: 0, total_cents: 0 };
      e.movimientos++; e.total_cents += mv.monto_cents;
      sinClasificar.set(k, e);
    }
  }

  const centsAPesos = (o) => {
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (!v.movimientos) continue;
      out[k] = { movimientos: v.movimientos, credito: pesos(v.credito), debito: pesos(v.debito), neto: pesos(v.neto) };
    }
    return out;
  };

  return {
    por_rubro: centsAPesos(porRubro),
    por_dia: centsAPesos(porDia),
    no_clasificados: [...sinClasificar.values()]
      .sort((a, b) => a.total_cents - b.total_cents)
      .map((e) => ({ subject: e.subject, movimientos: e.movimientos, total: pesos(e.total_cents) })),
  };
}

// ---------------------------------------------------------------------------
// Salida humana
// ---------------------------------------------------------------------------
function tabla(filas, cols) {
  const anchos = cols.map((c, i) => Math.max(c.h.length, ...filas.map((f) => String(f[i]).length)));
  const linea = (celdas) => celdas
    .map((c, i) => (cols[i].r ? String(c).padStart(anchos[i]) : String(c).padEnd(anchos[i])))
    .join('  ').replace(/\s+$/, '');
  const out = [linea(cols.map((c) => c.h)), anchos.map((a) => '-'.repeat(a)).join('  ')];
  for (const f of filas) out.push(linea(f));
  return out.join('\n');
}

function imprimirHumano(res) {
  const cur = res.cuenta.moneda === 'ARS' ? '$' : 'USD';
  const L = [];
  L.push(`${res.cuenta.tipo || 'Cuenta'} ${res.cuenta.numero || ''}`.trim());
  L.push(`Período del extracto: ${res.periodo.desde} → ${res.periodo.hasta} · moneda ${res.cuenta.moneda}`);
  L.push(`Filtro aplicado:      ${res.filtro.desde || '(inicio)'} → ${res.filtro.hasta || '(fin)'} · ` +
         `${res.movimientos.length}/${res.verificacion.movimientos} movimientos`);
  L.push('');
  const v = res.verificacion;
  L.push(`GATE encadenado: OK · ${v.movimientos} movimientos · saldo ${cur} ${fmt(Math.round(v.saldo_inicial * 100))} → ` +
         `${cur} ${fmt(Math.round(v.saldo_final_calculado * 100))} (declarado ${cur} ${fmt(Math.round(v.saldo_final_declarado * 100))})`);
  L.push('');

  const gasto = Object.entries(res.totales.por_rubro)
    .reduce((a, [, x]) => a + (x.debito < 0 ? -x.debito : 0), 0);
  L.push('TOTALES POR RUBRO');
  const filasR = Object.entries(res.totales.por_rubro)
    .sort((a, b) => a[1].neto - b[1].neto)
    .map(([r, x]) => [
      r, x.movimientos,
      fmt(Math.round(x.credito * 100)),
      fmt(Math.round(x.debito * 100)),
      fmt(Math.round(x.neto * 100)),
      gasto > 0 && x.debito < 0 ? `${(100 * -x.debito / gasto).toFixed(1)}%` : '',
    ]);
  L.push(tabla(filasR, [
    { h: 'rubro' }, { h: 'movs', r: 1 }, { h: `crédito ${cur}`, r: 1 },
    { h: `débito ${cur}`, r: 1 }, { h: `neto ${cur}`, r: 1 }, { h: '% gasto', r: 1 },
  ]));
  L.push('');
  L.push(`Gasto total (débitos) en el filtro: ${cur} ${fmt(Math.round(gasto * 100))}`);
  L.push('');

  L.push('TOTALES POR DÍA');
  const filasD = Object.entries(res.totales.por_dia).sort()
    .map(([d, x]) => [d, x.movimientos, fmt(Math.round(x.credito * 100)),
      fmt(Math.round(x.debito * 100)), fmt(Math.round(x.neto * 100))]);
  L.push(tabla(filasD, [
    { h: 'fecha' }, { h: 'movs', r: 1 }, { h: `crédito ${cur}`, r: 1 },
    { h: `débito ${cur}`, r: 1 }, { h: `neto ${cur}`, r: 1 },
  ]));
  L.push('');

  L.push(`NO CLASIFICADOS (rubro "otro") — ${res.totales.no_clasificados.length} comercios/leyendas`);
  if (!res.totales.no_clasificados.length) L.push('  (ninguno)');
  else {
    L.push(tabla(res.totales.no_clasificados.map((e) => [e.subject, e.movimientos, fmt(Math.round(e.total * 100))]),
      [{ h: 'comercio / leyenda' }, { h: 'movs', r: 1 }, { h: `total ${cur}`, r: 1 }]));
    L.push('');
    L.push('  Agregá una regla en REGLAS (tope de scripts/parse-extracto-galicia.js) para clasificarlos.');
  }
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv);
  const texto = leerTexto(args.file, args.pdftotext);
  const lines = texto.split(/\r?\n/);

  const hdr = parseEncabezado(lines);
  const { movimientos, totales_declarados } = parseMovimientos(lines);

  const ver = verificar(movimientos, totales_declarados, hdr);
  if (!ver.ok) {
    process.stderr.write('\nGATE DE VERIFICACIÓN FALLÓ — el parseo NO es confiable:\n');
    for (const e of ver.errores) process.stderr.write(`  • ${e}\n`);
    process.stderr.write(
      `\n(${movimientos.length} movimientos parseados de ${path.basename(args.file)}. ` +
      'Los totales NO se emiten: un número que no cierra no se publica.)\n');
    if (args.gate) process.exit(1);
    process.stderr.write('--no-gate: sigo igual, los totales de abajo son SOSPECHOSOS.\n\n');
  }

  const filtrados = movimientos.filter((m) =>
    (!args.desde || m.fecha >= args.desde) && (!args.hasta || m.fecha <= args.hasta));

  const res = {
    archivo: path.resolve(args.file),
    generado_en: new Date().toISOString(),
    cuenta: { tipo: hdr.tipo, numero: hdr.numero, cbu: hdr.cbu, moneda: hdr.moneda },
    periodo: { desde: hdr.periodo_desde, hasta: hdr.periodo_hasta },
    filtro: { desde: args.desde, hasta: args.hasta },
    verificacion: ver,
    totales: agregados(filtrados),
    movimientos: filtrados.map((m) => {
      const { monto_cents, saldo_cents, ...rest } = m;
      return rest;
    }),
  };

  const salida = args.json ? JSON.stringify(res, null, 2) + '\n' : imprimirHumano(res);
  if (args.out) { fs.writeFileSync(args.out, salida); process.stderr.write(`escrito: ${args.out}\n`); }
  else process.stdout.write(salida);
}

main();
