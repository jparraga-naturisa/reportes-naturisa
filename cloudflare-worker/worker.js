const GATEWAY = 'https://gateway.naturisa.com.ec'

const ALLOWED_ORIGINS = [
  'https://jparraga-naturisa.github.io',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
]

function getCors(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Max-Age':       '86400'
  }
}

function corsResponse(body, status, request, extra) {
  const cors = getCors(request.headers.get('Origin') || '')
  return new Response(body, { status, headers: { ...cors, 'Content-Type': 'application/json', ...(extra || {}) } })
}

// ── Caché de feeding por mes ───────────────────────────────────────────────

const FEEDING_PATH = '/bff/mobile/feedcontrol/balanceado/api/report/feeding_general'
const CACHE_TTL    = 60 * 60 * 24 * 365
const DATE_FIELDS  = ['initDate','startDate','period','date','periodStart','weekStart','monthStart']

function pad(n) { return String(n).padStart(2, '0') }
function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate() }

function feedCacheKey(pathname, searchParams, iD, eD) {
  const sp = new URLSearchParams(searchParams)
  sp.delete('initDate'); sp.delete('endDate')
  const sorted = [...sp.entries()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  return `feed:${pathname}:${new URLSearchParams(sorted)}:${iD}:${eD}`
}

async function fetchFeedRows(request, pathname, searchParams, iD, eD) {
  const sp = new URLSearchParams(searchParams)
  sp.set('initDate', iD); sp.set('endDate', eD)
  const res = await fetch(GATEWAY + pathname + '?' + sp, { method: 'GET', headers: request.headers })
  if (!res.ok) return { ok: false, rows: [], envelope: {} }
  const json = await res.json()
  return { ok: true, rows: json.data || [], envelope: json }
}

function rowMonth(row) {
  const df = DATE_FIELDS.find(f => row[f])
  const m  = df ? String(row[df]).match(/^(\d{4})-(\d{2})/) : null
  return m ? { y: parseInt(m[1]), m: parseInt(m[2]) } : null
}

async function handleFeedingCached(request, url, env, ctx) {
  const initDate = url.searchParams.get('initDate') || ''
  const endDate  = url.searchParams.get('endDate')  || ''

  const now      = new Date()
  const curYear  = now.getUTCFullYear()
  const curMonth = now.getUTCMonth() + 1

  const endParts = endDate.match(/^(\d{4})-(\d{2})/)
  const endYear  = endParts ? parseInt(endParts[1]) : curYear
  const endMon   = endParts ? parseInt(endParts[2]) : curMonth

  // Rango completamente en el pasado → caché total
  if (endYear < curYear || (endYear === curYear && endMon < curMonth)) {
    const ck     = feedCacheKey(url.pathname, url.searchParams, initDate, endDate)
    const cached = await env.data.get(ck)
    if (cached !== null) {
      return corsResponse(JSON.stringify({ data: JSON.parse(cached) }), 200, request, { 'X-Cache': 'HIT' })
    }
    const { ok, rows, envelope } = await fetchFeedRows(request, url.pathname, url.searchParams, initDate, endDate)
    if (!ok) return null // fallback al proxy normal
    if (rows.length) ctx.waitUntil(env.data.put(ck, JSON.stringify(rows), { expirationTtl: CACHE_TTL }))
    return corsResponse(JSON.stringify({ ...envelope, data: rows }), 200, request, { 'X-Cache': 'MISS' })
  }

  // Rango incluye mes actual:
  // - Meses pasados: buscar en KV primero
  // - Si hay HIT: fetch solo mes actual (1 llamada pequeña)
  // - Si hay MISS: fetch rango completo (1 llamada igual que antes) + guardar meses pasados en KV async

  const pastEnd = curMonth > 1
    ? `${curYear}-${pad(curMonth - 1)}-${pad(lastDay(curYear, curMonth - 1))}`
    : null
  const ckPast = pastEnd ? feedCacheKey(url.pathname, url.searchParams, initDate, pastEnd) : null

  if (ckPast) {
    const cached = await env.data.get(ckPast)
    if (cached !== null) {
      // HIT: solo fetch mes actual
      const curStart = `${curYear}-${pad(curMonth)}-01`
      const curEnd   = `${curYear}-${pad(curMonth)}-${pad(lastDay(curYear, curMonth))}`
      const { rows: curRows, envelope } = await fetchFeedRows(request, url.pathname, url.searchParams, curStart, curEnd)
      const allRows = [...JSON.parse(cached), ...curRows]
      return corsResponse(JSON.stringify({ ...envelope, data: allRows }), 200, request,
        { 'X-Cache': 'HIT', 'X-Cache-Rows': String(allRows.length) })
    }
  }

  // MISS: fetch rango completo — misma cantidad de llamadas que antes
  const { ok, rows: allRows, envelope } = await fetchFeedRows(request, url.pathname, url.searchParams, initDate, endDate)
  if (!ok) return null

  // Guardar meses pasados en KV de forma asíncrona (no bloquea la respuesta)
  if (ckPast) {
    const pastRows = allRows.filter(row => {
      const d = rowMonth(row)
      return d && (d.y < curYear || (d.y === curYear && d.m < curMonth))
    })
    if (pastRows.length) {
      ctx.waitUntil(env.data.put(ckPast, JSON.stringify(pastRows), { expirationTtl: CACHE_TTL }))
    }
  }

  return corsResponse(JSON.stringify({ ...envelope, data: allRows }), 200, request,
    { 'X-Cache': 'MISS', 'X-Cache-Rows': String(allRows.length) })
}

// ── Tablas propias en D1 (compartidas entre todos los dashboards) ─────────
// Todas las columnas y claves JSON de estos endpoints estan en espanol.
//
// GET  /db/sucursales        -> lista todas las sucursales {id, codigo, nombre}
// POST /db/sucursales        -> upsert de una sucursal, body {id, codigo, nombre}

async function handleDbSucursales(request, env) {
  if (request.method === 'GET') {
    const { results } = await env.db.prepare('SELECT id, codigo, nombre, Cluster AS cluster FROM sucursales ORDER BY nombre').all()
    return corsResponse(JSON.stringify({ data: results }), 200, request)
  }
  if (request.method === 'POST') {
    const body = await request.json()
    if (!body || !body.id || !body.codigo || !body.nombre) {
      return corsResponse('{"error":"faltan campos: id, codigo, nombre"}', 400, request)
    }
    await env.db.prepare('INSERT OR REPLACE INTO sucursales (id, codigo, nombre) VALUES (?, ?, ?)')
      .bind(body.id, body.codigo, body.nombre).run()
    return corsResponse('{"ok":true}', 200, request)
  }
  return corsResponse('{"error":"method not allowed"}', 405, request)
}

// GET  /db/piscinas                 -> lista piscinas, opcional ?idSucursal=<id>
// POST /db/piscinas/sync            -> upsert masivo, body {piscinas: [{idPiscina, nombre, codigoPiscina, tamano, idSucursal, tipo, estado}, ...]}

async function handleDbPiscinas(request, url, env) {
  if (request.method === 'GET') {
    const idSucursal = url.searchParams.get('idSucursal')
    const stmt = idSucursal
      ? env.db.prepare('SELECT id_piscina, nombre, codigo_piscina, tamano, id_sucursal, tipo, estado, actualizado_en FROM piscinas WHERE id_sucursal = ? ORDER BY nombre').bind(idSucursal)
      : env.db.prepare('SELECT id_piscina, nombre, codigo_piscina, tamano, id_sucursal, tipo, estado, actualizado_en FROM piscinas ORDER BY nombre')
    const { results } = await stmt.all()
    return corsResponse(JSON.stringify({ data: results }), 200, request)
  }
  return corsResponse('{"error":"method not allowed"}', 405, request)
}

// Ecuador no tiene horario de verano, siempre UTC-5
function ecuadorNowISO() {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000)
  return d.toISOString().replace('Z', '-05:00')
}

async function handleDbPiscinasSync(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const body = await request.json()
  const piscinas = Array.isArray(body?.piscinas) ? body.piscinas : []
  if (!piscinas.length) return corsResponse('{"error":"body.piscinas vacio"}', 400, request)

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO piscinas (id_piscina, nombre, codigo_piscina, tamano, id_sucursal, tipo, estado, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_piscina) DO UPDATE SET
       nombre = excluded.nombre, codigo_piscina = excluded.codigo_piscina, tamano = excluded.tamano,
       id_sucursal = excluded.id_sucursal, tipo = excluded.tipo, estado = excluded.estado,
       actualizado_en = excluded.actualizado_en`
  )
  const batch = piscinas
    .filter(p => p && p.idPiscina)
    .map(p => stmt.bind(p.idPiscina, p.nombre || '', p.codigoPiscina || null, p.tamano ?? null, p.idSucursal ?? null, p.tipo || null, p.estado || null, now))
  await env.db.batch(batch)
  return corsResponse(JSON.stringify({ ok: true, count: batch.length }), 200, request)
}

// GET  /db/ciclos                   -> lista ciclos, opcional ?idSucursal=<id>&estado=PRODUCCION|COSECHADO
// POST /db/ciclos/sync              -> upsert masivo, body {ciclos: [{idCiclo, idSucursal, codigoSucursal, nombrePiscina, numeroCiclo, codigoCiclo, usoCiclo, fechaSiembra, tamanoPiscina, estado, diasCiclo, diasSecos, diasProduccion, fechaInicio, fechaCosecha}, ...]}

async function handleDbCiclos(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idSucursal = url.searchParams.get('idSucursal')
  const estado = url.searchParams.get('estado')
  const cols = 'id_ciclo, id_sucursal, codigo_sucursal, nombre_piscina, numero_ciclo, codigo_ciclo, uso_ciclo, fecha_siembra, tamano_piscina, estado, dias_ciclo, dias_secos, dias_produccion, fecha_inicio, fecha_cosecha, actualizado_en'
  const conds = []
  const binds = []
  if (idSucursal) { conds.push('id_sucursal = ?'); binds.push(idSucursal) }
  if (estado) { conds.push('estado = ?'); binds.push(estado) }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : ''
  const stmt = env.db.prepare(`SELECT ${cols} FROM ciclos${where} ORDER BY fecha_siembra DESC`).bind(...binds)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbCiclosSync(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const body = await request.json()
  const ciclos = Array.isArray(body?.ciclos) ? body.ciclos : []
  if (!ciclos.length) return corsResponse('{"error":"body.ciclos vacio"}', 400, request)

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO ciclos (id_ciclo, id_sucursal, codigo_sucursal, nombre_piscina, numero_ciclo, codigo_ciclo, uso_ciclo, fecha_siembra, tamano_piscina, estado, dias_ciclo, dias_secos, dias_produccion, fecha_inicio, fecha_cosecha, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_ciclo) DO UPDATE SET
       id_sucursal = excluded.id_sucursal, codigo_sucursal = excluded.codigo_sucursal,
       nombre_piscina = excluded.nombre_piscina, numero_ciclo = excluded.numero_ciclo, codigo_ciclo = excluded.codigo_ciclo,
       uso_ciclo = excluded.uso_ciclo, fecha_siembra = excluded.fecha_siembra, tamano_piscina = excluded.tamano_piscina,
       estado = excluded.estado, dias_ciclo = excluded.dias_ciclo, dias_secos = excluded.dias_secos,
       dias_produccion = excluded.dias_produccion, fecha_inicio = excluded.fecha_inicio,
       fecha_cosecha = excluded.fecha_cosecha, actualizado_en = excluded.actualizado_en`
  )
  const batch = ciclos
    .filter(c => c && c.idCiclo)
    .map(c => stmt.bind(c.idCiclo, c.idSucursal ?? null, c.codigoSucursal || null, c.nombrePiscina || null,
      c.numeroCiclo ?? null, c.codigoCiclo || null, c.usoCiclo || null, c.fechaSiembra || null,
      c.tamanoPiscina ?? null, c.estado || null, c.diasCiclo ?? null, c.diasSecos ?? null, c.diasProduccion ?? null,
      c.fechaInicio || null, c.fechaCosecha || null, now))
  await env.db.batch(batch)
  return corsResponse(JSON.stringify({ ok: true, count: batch.length }), 200, request)
}

// POST /db/ciclos/manual  -> corrige a mano los dias de UN ciclo puntual que AP1 no expone en
// sus reportes (settledPools/NurseryYield/pool_production). Solo actualiza los campos enviados,
// sin tocar el resto de la fila. body: {idCiclo, diasSecos?, diasProduccion?, diasCiclo?, fechaInicio?, fechaCosecha?}
// GET  /db/orden-control?ordenControl=<orden>   -> busca a que ciclo pertenece una orden
// GET  /db/orden-control?idCiclo=<id>           -> busca la orden de un ciclo
// POST /db/orden-control/sync                   -> upsert masivo, body {filas: [{idCiclo, ordenControl, idSucursal, codigoSucursal, nombrePiscina, numeroCiclo}, ...]}

async function handleDbOrdenControl(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const ordenControl = url.searchParams.get('ordenControl')
  const idCiclo = url.searchParams.get('idCiclo')
  const conds = []
  const binds = []
  if (ordenControl) { conds.push('orden_control = ?'); binds.push(ordenControl) }
  if (idCiclo) { conds.push('id_ciclo = ?'); binds.push(idCiclo) }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : ''
  const stmt = env.db.prepare(`SELECT * FROM orden_control${where} ORDER BY codigo_sucursal, nombre_piscina`).bind(...binds)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbOrdenControlSync(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const body = await request.json()
  const filas = Array.isArray(body?.filas) ? body.filas : []
  if (!filas.length) return corsResponse('{"error":"body.filas vacio"}', 400, request)

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO orden_control (orden_control, id_ciclo, id_sucursal, codigo_sucursal, nombre_piscina, numero_ciclo, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(orden_control) DO UPDATE SET
       id_ciclo = excluded.id_ciclo, id_sucursal = excluded.id_sucursal, codigo_sucursal = excluded.codigo_sucursal,
       nombre_piscina = excluded.nombre_piscina, numero_ciclo = excluded.numero_ciclo, actualizado_en = excluded.actualizado_en`
  )
  const batch = filas.filter(f => f.ordenControl && f.idCiclo).map(f =>
    stmt.bind(f.ordenControl, f.idCiclo, f.idSucursal ?? null, f.codigoSucursal || null, f.nombrePiscina || null, f.numeroCiclo ?? null, now))
  if (batch.length) await env.db.batch(batch)
  return corsResponse(JSON.stringify({ ok: true, count: batch.length }), 200, request)
}

// Trae la orden de control (controlOrderDocument) ciclo por ciclo via el endpoint
// individual /cycles/{id} - mucho mas liviano (~4KB) que el bulk /cycles (168MB+ ignora
// paginacion). Solo pide los ciclos desde CICLOS_DESDE que aun no tengan orden asignada.
async function refrescarOrdenControl(env) {
  const token = await ap1Login(env)
  const { results: faltantes } = await env.db.prepare(`
    SELECT id_ciclo, id_sucursal, codigo_sucursal, nombre_piscina, numero_ciclo
    FROM ciclos
    WHERE fecha_siembra >= '${CICLOS_DESDE}'
      AND id_ciclo NOT IN (SELECT id_ciclo FROM orden_control)
  `).all()
  if (!faltantes.length) return 0

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO orden_control (orden_control, id_ciclo, id_sucursal, codigo_sucursal, nombre_piscina, numero_ciclo, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(orden_control) DO UPDATE SET
       id_ciclo = excluded.id_ciclo, id_sucursal = excluded.id_sucursal, codigo_sucursal = excluded.codigo_sucursal,
       nombre_piscina = excluded.nombre_piscina, numero_ciclo = excluded.numero_ciclo, actualizado_en = excluded.actualizado_en`
  )

  let totalFilas = 0
  const CONCURRENCIA = 12
  for (let i = 0; i < faltantes.length; i += CONCURRENCIA) {
    const lote = faltantes.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(c =>
      fetch(`${API_BASE}/cycles/${c.id_ciclo}?IncludeEquipmentResumes=false&IncludeCycleUsage=false`,
        { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } })
        .then(r => r.ok ? r.json() : null).catch(() => null)
    ))
    const batch = []
    resultados.forEach((json, idx) => {
      const c = lote[idx]
      const orden = String(json?.data?.controlOrderDocument || '').trim()
      if (!orden) return
      batch.push(stmt.bind(orden, c.id_ciclo, c.id_sucursal, c.codigo_sucursal, c.nombre_piscina, c.numero_ciclo, now))
    })
    if (batch.length) { await env.db.batch(batch); totalFilas += batch.length }
  }
  return totalFilas
}

// ── Consumo de balanceado (AP1 feeding_general por piscina/dia) ────────────
// GET  /db/consumo-balanceado?idPiscina=<id>&idCiclo=<id>   -> lista consumo diario
// POST /db/consumo-balanceado/sync                          -> upsert masivo

async function handleDbConsumoBalanceado(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idPiscina = url.searchParams.get('idPiscina')
  const idCiclo = url.searchParams.get('idCiclo')
  const conds = []
  const binds = []
  if (idPiscina) { conds.push('id_piscina = ?'); binds.push(idPiscina) }
  if (idCiclo) { conds.push('id_ciclo = ?'); binds.push(idCiclo) }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : ''
  const stmt = env.db.prepare(`SELECT * FROM consumo_balanceado${where} ORDER BY id_piscina, fecha`).bind(...binds)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbConsumoBalanceadoSync(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const body = await request.json()
  const filas = Array.isArray(body?.filas) ? body.filas : []
  if (!filas.length) return corsResponse('{"error":"body.filas vacio"}', 400, request)

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO consumo_balanceado (id_piscina, fecha, id_producto, nombre_producto, id_ciclo, codigo_ciclo, nombre_piscina, sacos, kilogramos, kg_ha_dia, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_piscina, fecha, id_producto) DO UPDATE SET
       nombre_producto = excluded.nombre_producto, id_ciclo = excluded.id_ciclo, codigo_ciclo = excluded.codigo_ciclo,
       nombre_piscina = excluded.nombre_piscina,
       sacos = excluded.sacos, kilogramos = excluded.kilogramos, kg_ha_dia = excluded.kg_ha_dia,
       actualizado_en = excluded.actualizado_en`
  )
  const batch = filas.filter(f => f.idPiscina && f.fecha && f.idProducto != null).map(f =>
    stmt.bind(f.idPiscina, f.fecha, f.idProducto, f.nombreProducto || null, f.idCiclo ?? null, f.codigoCiclo || null,
      f.nombrePiscina || null, f.sacos ?? null, f.kilogramos ?? null, f.kgHaDia ?? null, now))
  if (batch.length) await env.db.batch(batch)
  return corsResponse(JSON.stringify({ ok: true, count: batch.length }), 200, request)
}

// Refresca consumo_balanceado desde AP1 (endpoint consumptions, da cycleCode directo).
// Solo trae una ventana reciente (por defecto ultimos 30 dias) para no repetir todo
// el historico en cada corrida del cron.
async function refrescarConsumoBalanceado(env, diasAtras = 30) {
  const subsidiarios = await env.db.prepare('SELECT id, codigo FROM sucursales').all().then(r => r.results)
  const { results: ciclos } = await env.db.prepare('SELECT id_ciclo, codigo_ciclo FROM ciclos WHERE codigo_ciclo IS NOT NULL').all()
  const idCicloByCodigo = new Map(ciclos.map(c => [c.codigo_ciclo, c.id_ciclo]))

  const { results: piscinas } = await env.db.prepare('SELECT id_piscina, codigo_piscina, nombre, id_sucursal FROM piscinas').all()
  const piscinaByCodePool = new Map(piscinas.map(p => [p.codigo_piscina, p]))

  const token = await ap1Login(env)
  const hoy = ecuadorNowISO().slice(0, 10)
  const desde = new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10)

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO consumo_balanceado (id_piscina, fecha, id_producto, nombre_producto, id_ciclo, codigo_ciclo, nombre_piscina, sacos, kilogramos, kg_ha_dia, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_piscina, fecha, id_producto) DO UPDATE SET
       nombre_producto = excluded.nombre_producto, id_ciclo = excluded.id_ciclo, codigo_ciclo = excluded.codigo_ciclo,
       nombre_piscina = excluded.nombre_piscina,
       sacos = excluded.sacos, kilogramos = excluded.kilogramos, kg_ha_dia = excluded.kg_ha_dia,
       actualizado_en = excluded.actualizado_en`
  )

  let totalFilas = 0
  const CONCURRENCIA = 10
  for (let i = 0; i < subsidiarios.length; i += CONCURRENCIA) {
    const lote = subsidiarios.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(s => {
      const url = new URL(GATEWAY + '/bff/mobile/feedcontrol/balanceado/api/report/consumptions')
      url.searchParams.set('initDate', desde)
      url.searchParams.set('endDate', hoy)
      url.searchParams.set('PageSize', '50000')
      url.searchParams.set('subsidiaryIds', s.id)
      return fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } })
        .then(r => r.ok ? r.json() : null).catch(() => null)
    }))
    const batch = []
    resultados.forEach(json => {
      for (const r of (json?.data || [])) {
        if (!r.poolId || !r.assignedDate || r.productId == null) continue
        const idCiclo = idCicloByCodigo.get(r.cycleCode) ?? null
        const piscina = piscinaByCodePool.get(r.poolCode)
        batch.push(stmt.bind(r.poolId, r.assignedDate.slice(0, 10), r.productId, r.productName || null,
          idCiclo, r.cycleCode || null,
          piscina?.nombre || null, r.sacks ?? null, r.kilograms ?? null, r.kgHaDay ?? null, now))
      }
    })
    if (batch.length) { await env.db.batch(batch); totalFilas += batch.length }
  }
  return totalFilas
}

// ── Consumo de insumos (Excel SAP subido en consumos-insumos.html) ─────────
// GET  /db/consumo-insumos?idCiclo=<id>&ordenControl=<orden>  -> lista consumo
// POST /db/consumo-insumos/sync                                -> upsert masivo

async function handleDbConsumoInsumos(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idCiclo = url.searchParams.get('idCiclo')
  const ordenControl = url.searchParams.get('ordenControl')
  const conds = []
  const binds = []
  if (idCiclo) { conds.push('id_ciclo = ?'); binds.push(idCiclo) }
  if (ordenControl) { conds.push('orden_control = ?'); binds.push(ordenControl) }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : ''
  const stmt = env.db.prepare(`SELECT * FROM consumo_insumos${where} ORDER BY fecha`).bind(...binds)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbConsumoInsumosSync(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const body = await request.json()
  const filas = Array.isArray(body?.filas) ? body.filas : []
  if (!filas.length) return corsResponse('{"error":"body.filas vacio"}', 400, request)

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO consumo_insumos (clave, orden_control, id_ciclo, documento_material, posicion_doc, codigo_material,
       descripcion, cantidad, importe, almacen, unidad, fecha, tipo_movimiento, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET
       orden_control = excluded.orden_control, id_ciclo = excluded.id_ciclo,
       documento_material = excluded.documento_material, posicion_doc = excluded.posicion_doc,
       codigo_material = excluded.codigo_material, descripcion = excluded.descripcion,
       cantidad = excluded.cantidad, importe = excluded.importe, almacen = excluded.almacen,
       unidad = excluded.unidad, fecha = excluded.fecha, tipo_movimiento = excluded.tipo_movimiento,
       actualizado_en = excluded.actualizado_en`
  )
  const batch = filas.filter(f => f.clave).map(f =>
    stmt.bind(f.clave, f.ordenControl || null, f.idCiclo ?? null, f.documentoMaterial || null, f.posicionDoc || null,
      f.codigoMaterial || null, f.descripcion || null, f.cantidad ?? null, f.importe ?? null, f.almacen || null,
      f.unidad || null, f.fecha || null, f.tipoMovimiento || null, now))
  if (batch.length) await env.db.batch(batch)
  return corsResponse(JSON.stringify({ ok: true, count: batch.length }), 200, request)
}

async function handleDbCiclosManual(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const c = await request.json()
  if (!c?.idCiclo) return corsResponse('{"error":"falta idCiclo"}', 400, request)

  const campos = []
  const valores = []
  if (c.diasSecos !== undefined) { campos.push('dias_secos = ?'); valores.push(c.diasSecos) }
  if (c.diasProduccion !== undefined) { campos.push('dias_produccion = ?'); valores.push(c.diasProduccion) }
  if (c.diasCiclo !== undefined) { campos.push('dias_ciclo = ?'); valores.push(c.diasCiclo) }
  if (c.fechaInicio !== undefined) { campos.push('fecha_inicio = ?'); valores.push(c.fechaInicio) }
  if (c.fechaCosecha !== undefined) { campos.push('fecha_cosecha = ?'); valores.push(c.fechaCosecha) }
  if (!campos.length) return corsResponse('{"error":"no se envio ningun campo para actualizar"}', 400, request)

  // dias_manual=1 le dice al refresco automatico que NO pise estos campos con
  // lo que traiga AP1 (que para este ciclo puntual viene vacio de todas formas).
  campos.push('dias_manual = 1')
  campos.push('actualizado_en = ?')
  valores.push(ecuadorNowISO())
  valores.push(c.idCiclo)

  const res = await env.db.prepare(`UPDATE ciclos SET ${campos.join(', ')} WHERE id_ciclo = ?`).bind(...valores).run()
  if (!res.meta.changes) return corsResponse('{"error":"no existe ese id_ciclo"}', 404, request)
  return corsResponse('{"ok":true}', 200, request)
}

// GET  /db/historia-ciclo?idCiclo=<id>   -> historia semanal de un ciclo (o de varios si se repite el param)
// POST /db/historia-ciclo/sync           -> upsert masivo, body {filas: [{idCiclo, semana, inicioSemana, finSemana, diasProduccion, peso, pesoEstimadoRegresion, crecimientoUltimaSemana, crecimiento2Semanas, crecimiento4Semanas, crecimientoDesdeInicio, supervivencia, biomasaActual, biomasaSemana, animalesPorM2, biomasaCosechada, alimentoSemana, alimentoAcumulado, alimentoHaDia, fca, fcaBruto, fcaSemana, estM2, factorAlimento}, ...]}

async function handleDbHistoriaCiclo(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idCiclos = url.searchParams.getAll('idCiclo')
  if (!idCiclos.length) return corsResponse('{"error":"falta ?idCiclo="}', 400, request)
  const placeholders = idCiclos.map(() => '?').join(',')
  const stmt = env.db.prepare(
    `SELECT * FROM historia_ciclo WHERE id_ciclo IN (${placeholders}) ORDER BY id_ciclo, semana`
  ).bind(...idCiclos)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbHistoriaCicloSync(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const body = await request.json()
  const filas = Array.isArray(body?.filas) ? body.filas : []
  if (!filas.length) return corsResponse('{"error":"body.filas vacio"}', 400, request)

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO historia_ciclo (id_ciclo, semana, inicio_semana, fin_semana, dias_produccion, peso,
       peso_estimado_regresion, crecimiento_ultima_semana, crecimiento_2_semanas, crecimiento_4_semanas, crecimiento_desde_inicio,
       supervivencia, biomasa_actual, biomasa_semana, animales_por_m2, biomasa_cosechada,
       alimento_semana, alimento_acumulado, alimento_ha_dia, fca, fca_bruto, fca_semana,
       est_m2, factor_alimento, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_ciclo, semana) DO UPDATE SET
       inicio_semana = excluded.inicio_semana, fin_semana = excluded.fin_semana,
       dias_produccion = excluded.dias_produccion, peso = excluded.peso,
       peso_estimado_regresion = excluded.peso_estimado_regresion,
       crecimiento_ultima_semana = excluded.crecimiento_ultima_semana, crecimiento_2_semanas = excluded.crecimiento_2_semanas,
       crecimiento_4_semanas = excluded.crecimiento_4_semanas, crecimiento_desde_inicio = excluded.crecimiento_desde_inicio,
       supervivencia = excluded.supervivencia, biomasa_actual = excluded.biomasa_actual, biomasa_semana = excluded.biomasa_semana,
       animales_por_m2 = excluded.animales_por_m2,
       biomasa_cosechada = excluded.biomasa_cosechada, alimento_semana = excluded.alimento_semana,
       alimento_acumulado = excluded.alimento_acumulado,
       alimento_ha_dia = excluded.alimento_ha_dia,
       fca = excluded.fca, fca_bruto = excluded.fca_bruto, fca_semana = excluded.fca_semana,
       est_m2 = excluded.est_m2, factor_alimento = excluded.factor_alimento, actualizado_en = excluded.actualizado_en`
  )
  const batch = filas
    .filter(r => r && r.idCiclo && r.semana !== undefined && r.semana !== null)
    .map(r => stmt.bind(r.idCiclo, r.semana, r.inicioSemana || null, r.finSemana || null,
      r.diasProduccion ?? null, r.peso ?? null, r.pesoEstimadoRegresion ?? null,
      r.crecimientoUltimaSemana ?? null, r.crecimiento2Semanas ?? null, r.crecimiento4Semanas ?? null, r.crecimientoDesdeInicio ?? null,
      r.supervivencia ?? null, r.biomasaActual ?? null, r.biomasaSemana ?? null, r.animalesPorM2 ?? null,
      r.biomasaCosechada ?? null, r.alimentoSemana ?? null, r.alimentoAcumulado ?? null,
      r.alimentoHaDia ?? null, r.fca ?? null, r.fcaBruto ?? null, r.fcaSemana ?? null,
      r.estM2 ?? null, r.factorAlimento ?? null, now))
  await env.db.batch(batch)
  return corsResponse(JSON.stringify({ ok: true, count: batch.length }), 200, request)
}

// ── Calibracion de alimento (a, b, R2) por piscina ─────────────────────────
// Replica proyeccion-alimento.html: fa = a * peso^b, ajustado por regresion lineal
// sobre ln(peso) vs ln(densidad/alimento_ha_dia), solo semanas completas (semana>0,
// duracion de semana >= 6 dias o sin fechas) de ciclos COSECHADOS, min 15 puntos por piscina.
//
// GET  /db/calibracion-alimento             -> lista calibraciones por piscina
// POST /db/calibracion-alimento/recalcular  -> recalcula todo desde ciclos + historia_ciclo (ya en D1)

const CALIBRACION_MIN_PUNTOS = 15
// Coeficiente estandar (escenario Normal) de simulador-ap1.html, usado cuando una
// piscina no tiene suficiente historico propio para calcular su propia regresion.
const COEF_ESTANDAR = { a: 0.805280, b: -0.5355 }
const CALIBRACION_WHERE = `
  c.estado = 'COSECHADO'
  AND h.semana > 0
  AND h.peso > 0 AND h.animales_por_m2 > 0 AND h.alimento_ha_dia > 0
  AND (h.inicio_semana IS NULL OR h.fin_semana IS NULL
       OR (julianday(h.fin_semana) - julianday(h.inicio_semana)) <= 0
       OR (julianday(h.fin_semana) - julianday(h.inicio_semana)) >= 6)
`

function calcRegresion(row) {
  const n = row.n
  if (!n || n < CALIBRACION_MIN_PUNTOS) return null
  const { sx, sy, sxy, sxx, syy } = row
  const den = n * sxx - sx * sx
  if (!den) return null
  const b = (n * sxy - sx * sy) / den
  const lnA = (sy - b * sx) / n
  const denR2 = (n * sxx - sx * sx) * (n * syy - sy * sy)
  const r2 = denR2 > 0 ? ((n * sxy - sx * sy) ** 2) / denR2 : null
  return { a: Math.exp(lnA), b, r2 }
}

async function handleDbCalibracion(request, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const { results } = await env.db.prepare(
    'SELECT codigo_sucursal, nombre_piscina, n_ciclos, n_semanas, coeficiente_a, coeficiente_b, r_cuadrado, tipo_calculo, actualizado_en FROM calibracion_alimento ORDER BY codigo_sucursal, nombre_piscina'
  ).all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

// GET /db/plan-cosecha -> plan de cosechas/raleos por ciclo (sincronizado desde AP1 cada 6h)
async function handleDbPlanCosecha(request, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const { results } = await env.db.prepare(
    'SELECT id_ciclo, instructions, biomasa_actual_lb, current_week, one_week, two_week, three_week, four_week, five_week, six_week, actualizado_en FROM plan_cosecha'
  ).all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function recalcularCalibracion(env) {
  const porPiscina = await env.db.prepare(`
    SELECT c.codigo_sucursal AS codigoSucursal, c.nombre_piscina AS nombrePiscina,
      COUNT(DISTINCT h.id_ciclo) AS nCiclos, COUNT(*) AS n,
      SUM(LN(h.peso)) AS sx,
      SUM(LN(h.animales_por_m2 / h.alimento_ha_dia)) AS sy,
      SUM(LN(h.peso) * LN(h.animales_por_m2 / h.alimento_ha_dia)) AS sxy,
      SUM(LN(h.peso) * LN(h.peso)) AS sxx,
      SUM(LN(h.animales_por_m2 / h.alimento_ha_dia) * LN(h.animales_por_m2 / h.alimento_ha_dia)) AS syy
    FROM historia_ciclo h JOIN ciclos c ON c.id_ciclo = h.id_ciclo
    WHERE ${CALIBRACION_WHERE}
    GROUP BY c.codigo_sucursal, c.nombre_piscina
  `).all()

  const now = ecuadorNowISO()
  const filas = []

  for (const row of porPiscina.results) {
    const reg = calcRegresion(row)
    const tipoCalculo = reg ? 'CALCULADO' : 'ESTANDAR'
    const valores = reg || { a: COEF_ESTANDAR.a, b: COEF_ESTANDAR.b, r2: null }
    filas.push({ codigoSucursal: row.codigoSucursal, nombrePiscina: row.nombrePiscina,
      nCiclos: row.nCiclos, nSemanas: row.n, tipoCalculo, ...valores })
  }

  await env.db.prepare('DELETE FROM calibracion_alimento').run()
  const stmt = env.db.prepare(
    `INSERT INTO calibracion_alimento (codigo_sucursal, nombre_piscina, n_ciclos, n_semanas, coeficiente_a, coeficiente_b, r_cuadrado, tipo_calculo, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const batch = filas.map(f => stmt.bind(f.codigoSucursal, f.nombrePiscina, f.nCiclos, f.nSemanas, f.a, f.b, f.r2, f.tipoCalculo, now))
  if (batch.length) await env.db.batch(batch)

  return filas.length
}

async function handleDbCalibracionRecalcular(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const count = await recalcularCalibracion(env)
  return corsResponse(JSON.stringify({ ok: true, count }), 200, request)
}

// ── Clima (coordenadas + pronostico) ───────────────────────────────────────
// GET  /db/coordenadas               -> lista coordenadas por sucursal
// GET  /db/clima                     -> pronostico, opcional ?idSucursal=<id>
// POST /db/clima/refrescar           -> trae coordenadas de AP1 (si faltan) y pronostico de Open-Meteo

async function handleDbCoordenadasPiscina(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idSucursal = url.searchParams.get('idSucursal')
  const stmt = idSucursal
    ? env.db.prepare('SELECT id_piscina, id_sucursal, codigo_sucursal, nombre_piscina, latitud, longitud, actualizado_en FROM coordenadas_piscina WHERE id_sucursal = ? ORDER BY nombre_piscina').bind(idSucursal)
    : env.db.prepare('SELECT id_piscina, id_sucursal, codigo_sucursal, nombre_piscina, latitud, longitud, actualizado_en FROM coordenadas_piscina ORDER BY codigo_sucursal, nombre_piscina')
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

// Siempre 4 filas por fecha (hora IN 00:00/06:00/12:00/18:00). Sin ?hora= trae las 4;
// con ?hora=06:00 (u otra) filtra a esa franja especifica.
async function handleDbClima(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idSucursal = url.searchParams.get('idSucursal')
  const hora = url.searchParams.get('hora')
  const conds = []
  const binds = []
  if (idSucursal) { conds.push('id_sucursal = ?'); binds.push(idSucursal) }
  if (hora) { conds.push('hora = ?'); binds.push(hora) }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : ''
  const stmt = env.db.prepare(`SELECT * FROM clima${where} ORDER BY id_sucursal, fecha, hora`).bind(...binds)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function coordenadasPorSucursal(env) {
  // La coordenada de cada sucursal se calcula como el centro (promedio) de sus
  // piscinas - no se guarda una coordenada de sucursal por separado.
  const { results } = await env.db.prepare(
    'SELECT id_sucursal, AVG(latitud) AS latitud, AVG(longitud) AS longitud FROM coordenadas_piscina WHERE id_sucursal IS NOT NULL GROUP BY id_sucursal'
  ).all()
  return results
}

// ── INAMHI (fuente oficial de Ecuador) ─────────────────────────────────────
// Solo publica el pronostico oficial del dia actual, por 26 localidades
// (cabeceras provinciales). Cada sucursal se empareja con la localidad INAMHI
// mas cercana (distancia euclidiana simple, suficiente a esta escala).
const INAMHI_URL = 'https://inamhi.gob.ec/api_pronos/forecast/daily_forecast/list_by_date_now/'
const INAMHI_URL_LOCALIDAD = 'https://inamhi.gob.ec/api_pronos/forecast/daily_forecast/list_by_locality_from_date/'
const INAMHI_HORA_POR_PERIODO = { 'Madrugada': '00:00', 'Mañana': '06:00', 'Tarde': '12:00', 'Noche': '18:00' }

function localidadMasCercana(lat, lon, localidades) {
  let mejor = null, mejorDist = Infinity
  for (const loc of localidades) {
    const d = (loc.latitude - lat) ** 2 + (loc.longitude - lon) ** 2
    if (d < mejorDist) { mejorDist = d; mejor = loc }
  }
  return mejor
}

// INAMHI solo da hoy + mañana (2 dias) por localidad, via list_by_locality_from_date.
// Cada sucursal se empareja primero con su localidad INAMHI mas cercana (usando el
// listado de list_by_date_now, que trae fk_locality_id + lat/lon de las 26 localidades),
// y luego se pide el detalle de esa localidad puntual (que si trae 2 dias).
async function refrescarClimaInamhi(env) {
  const coords = await coordenadasPorSucursal(env)
  if (!coords.length) return 0

  const res = await fetch(INAMHI_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) return 0
  const localidades = await res.json()
  if (!Array.isArray(localidades) || !localidades.length) return 0

  const now = ecuadorNowISO()
  const hoy = ecuadorNowISO().slice(0, 10)
  const stmtFranja = env.db.prepare(
    `INSERT INTO clima (id_sucursal, fecha, hora, temp_min_inamhi, temp_max_inamhi, uv_inamhi, lluvia_inamhi, condicion_inamhi, icono_inamhi, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_sucursal, fecha, hora) DO UPDATE SET
       temp_min_inamhi = excluded.temp_min_inamhi, temp_max_inamhi = excluded.temp_max_inamhi,
       uv_inamhi = excluded.uv_inamhi, lluvia_inamhi = excluded.lluvia_inamhi,
       condicion_inamhi = excluded.condicion_inamhi, icono_inamhi = excluded.icono_inamhi, actualizado_en = excluded.actualizado_en`
  )

  // Empareja cada sucursal con su localidad INAMHI mas cercana (sin duplicar llamadas
  // si varias sucursales caen en la misma localidad).
  const localidadPorSucursal = new Map()
  for (const c of coords) {
    const loc = localidadMasCercana(c.latitud, c.longitud, localidades)
    if (loc) localidadPorSucursal.set(c.id_sucursal, loc.fk_locality_id)
  }
  const localityIds = [...new Set(localidadPorSucursal.values())]

  const detallePorLocalidad = new Map()
  const CONCURRENCIA = 10
  for (let i = 0; i < localityIds.length; i += CONCURRENCIA) {
    const lote = localityIds.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(id =>
      fetch(`${INAMHI_URL_LOCALIDAD}?date=${hoy}&locality_id=${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        .then(r => r.ok ? r.json() : null).catch(() => null)
    ))
    resultados.forEach((json, idx) => { if (Array.isArray(json)) detallePorLocalidad.set(lote[idx], json) })
  }

  const batch = []
  for (const [idSucursal, localityId] of localidadPorSucursal) {
    const dias = detallePorLocalidad.get(localityId)
    if (!dias) continue
    for (const dia of dias) {
      const uv = typeof dia.uv_radiation === 'object' ? dia.uv_radiation?.uv_index : dia.uv_radiation
      for (const p of (dia.period_weather_conditions || [])) {
        const hora = INAMHI_HORA_POR_PERIODO[p.fk_period_id_display]
        if (!hora) continue
        const cond = p.fk_weather_id_display || {}
        batch.push(stmtFranja.bind(idSucursal, dia.date, hora, dia.min_temperature ?? null, dia.max_temperature ?? null,
          uv ?? null, dia.rain ? 1 : 0, cond.description || null, cond.icon_url || null, now))
      }
    }
  }
  if (batch.length) await env.db.batch(batch)
  return batch.length
}

async function handleDbClimaInamhi(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  try {
    const n = await refrescarClimaInamhi(env)
    return corsResponse(JSON.stringify({ ok: true, filas: n }), 200, request)
  } catch (e) {
    return corsResponse(JSON.stringify({ error: String(e) }), 500, request)
  }
}

// Pronostico (Open-Meteo forecast): 7 dias hacia adelante, cambia hasta que llega la fecha.
async function refrescarClima(env) {
  const coords = await coordenadasPorSucursal(env)
  if (!coords.length) return 0

  const now = ecuadorNowISO()
  // El dato diario (temp_min/max, etc.) se repite en las 4 filas horarias de esa
  // fecha - no existe una fila de resumen diario aparte (hora='').
  const stmt = env.db.prepare(
    `INSERT INTO clima (id_sucursal, fecha, hora, temp_min_meteo, temp_max_meteo, precipitacion_meteo,
       prob_lluvia_meteo, viento_meteo, uv_meteo, humedad_meteo, presion_meteo, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_sucursal, fecha, hora) DO UPDATE SET
       temp_min_meteo = excluded.temp_min_meteo, temp_max_meteo = excluded.temp_max_meteo,
       precipitacion_meteo = excluded.precipitacion_meteo, prob_lluvia_meteo = excluded.prob_lluvia_meteo,
       viento_meteo = excluded.viento_meteo, uv_meteo = excluded.uv_meteo,
       humedad_meteo = excluded.humedad_meteo, presion_meteo = excluded.presion_meteo,
       actualizado_en = excluded.actualizado_en`
  )

  let totalFilas = 0
  const CONCURRENCIA = 10
  for (let i = 0; i < coords.length; i += CONCURRENCIA) {
    const lote = coords.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(c => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.latitud}&longitude=${c.longitud}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,` +
        `windspeed_10m_max,uv_index_max,relative_humidity_2m_max,surface_pressure_mean` +
        `&timezone=America/Guayaquil&forecast_days=16`
      return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)
    }))
    const batch = []
    resultados.forEach((json, idx) => {
      const idSucursal = lote[idx].id_sucursal
      const d = json?.daily
      if (!d?.time) return
      d.time.forEach((fecha, i2) => {
        for (const hora of HORAS_CLIMA) {
          batch.push(stmt.bind(idSucursal, fecha, hora, d.temperature_2m_min?.[i2] ?? null, d.temperature_2m_max?.[i2] ?? null,
            d.precipitation_sum?.[i2] ?? null, d.precipitation_probability_max?.[i2] ?? null,
            d.windspeed_10m_max?.[i2] ?? null, d.uv_index_max?.[i2] ?? null,
            d.relative_humidity_2m_max?.[i2] ?? null, d.surface_pressure_mean?.[i2] ?? null, now))
        }
      })
    })
    if (batch.length) { await env.db.batch(batch); totalFilas += batch.length }
  }
  return totalFilas
}

// Real/observado (Open-Meteo archive-api, ERA5). startDate/endDate en formato YYYY-MM-DD.
// Pisa el valor de pronostico ya guardado para esas fechas con el dato observado real
// (mas confiable), en las mismas columnas *_meteo.
async function refrescarClimaReal(env, startDate, endDate) {
  const coords = await coordenadasPorSucursal(env)
  if (!coords.length) return 0

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO clima (id_sucursal, fecha, hora, temp_min_meteo, temp_max_meteo, precipitacion_meteo, viento_meteo, humedad_meteo, presion_meteo, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_sucursal, fecha, hora) DO UPDATE SET
       temp_min_meteo = excluded.temp_min_meteo, temp_max_meteo = excluded.temp_max_meteo,
       precipitacion_meteo = excluded.precipitacion_meteo, viento_meteo = excluded.viento_meteo,
       humedad_meteo = excluded.humedad_meteo, presion_meteo = excluded.presion_meteo,
       actualizado_en = excluded.actualizado_en`
  )

  let totalFilas = 0
  const CONCURRENCIA = 6
  for (let i = 0; i < coords.length; i += CONCURRENCIA) {
    const lote = coords.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(c => {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${c.latitud}&longitude=${c.longitud}` +
        `&start_date=${startDate}&end_date=${endDate}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,relative_humidity_2m_max,surface_pressure_mean` +
        `&timezone=America/Guayaquil`
      return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)
    }))
    const batch = []
    resultados.forEach((json, idx) => {
      const idSucursal = lote[idx].id_sucursal
      const d = json?.daily
      if (!d?.time) return
      d.time.forEach((fecha, i2) => {
        // Open-Meteo devuelve null en dias muy recientes que aun no tienen dato observado -
        // se omite la fila para no pisar el pronostico con un real vacio.
        if (d.temperature_2m_max?.[i2] == null && d.temperature_2m_min?.[i2] == null) return
        for (const hora of HORAS_CLIMA) {
          batch.push(stmt.bind(idSucursal, fecha, hora, d.temperature_2m_min?.[i2] ?? null, d.temperature_2m_max?.[i2] ?? null,
            d.precipitation_sum?.[i2] ?? null, d.windspeed_10m_max?.[i2] ?? null,
            d.relative_humidity_2m_max?.[i2] ?? null, d.surface_pressure_mean?.[i2] ?? null, now))
        }
      })
    })
    if (batch.length) { await env.db.batch(batch); totalFilas += batch.length }
  }
  return totalFilas
}

const HORAS_CLIMA = ['00:00', '06:00', '12:00', '18:00']

// Pronostico horario (Open-Meteo forecast), solo en las 4 horas de HORAS_CLIMA.
async function refrescarClimaHoraria(env) {
  const coords = await coordenadasPorSucursal(env)
  if (!coords.length) return 0

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO clima (id_sucursal, fecha, hora, temp_c_meteo, precipitacion_meteo,
       viento_meteo, uv_meteo, humedad_meteo, presion_meteo, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_sucursal, fecha, hora) DO UPDATE SET
       temp_c_meteo = excluded.temp_c_meteo, precipitacion_meteo = excluded.precipitacion_meteo,
       viento_meteo = excluded.viento_meteo, uv_meteo = excluded.uv_meteo,
       humedad_meteo = excluded.humedad_meteo, presion_meteo = excluded.presion_meteo,
       actualizado_en = excluded.actualizado_en`
  )

  let totalFilas = 0
  const CONCURRENCIA = 10
  for (let i = 0; i < coords.length; i += CONCURRENCIA) {
    const lote = coords.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(c => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.latitud}&longitude=${c.longitud}` +
        `&hourly=temperature_2m,precipitation,windspeed_10m,uv_index,relativehumidity_2m,surface_pressure` +
        `&timezone=America/Guayaquil&forecast_days=16`
      return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)
    }))
    const batch = []
    resultados.forEach((json, idx) => {
      const idSucursal = lote[idx].id_sucursal
      const h = json?.hourly
      if (!h?.time) return
      h.time.forEach((timestamp, i2) => {
        const [fecha, hora] = timestamp.split('T')
        if (!HORAS_CLIMA.includes(hora)) return
        batch.push(stmt.bind(idSucursal, fecha, hora, h.temperature_2m?.[i2] ?? null, h.precipitation?.[i2] ?? null,
          h.windspeed_10m?.[i2] ?? null, h.uv_index?.[i2] ?? null, h.relativehumidity_2m?.[i2] ?? null,
          h.surface_pressure?.[i2] ?? null, now))
      })
    })
    if (batch.length) { await env.db.batch(batch); totalFilas += batch.length }
  }
  return totalFilas
}

// Real/observado horario (Open-Meteo archive-api), solo en las 4 horas de HORAS_CLIMA.
async function refrescarClimaHorariaReal(env, startDate, endDate) {
  const coords = await coordenadasPorSucursal(env)
  if (!coords.length) return 0

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO clima (id_sucursal, fecha, hora, temp_c_meteo, precipitacion_meteo, viento_meteo, humedad_meteo, presion_meteo, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_sucursal, fecha, hora) DO UPDATE SET
       temp_c_meteo = excluded.temp_c_meteo, precipitacion_meteo = excluded.precipitacion_meteo,
       viento_meteo = excluded.viento_meteo, humedad_meteo = excluded.humedad_meteo,
       presion_meteo = excluded.presion_meteo, actualizado_en = excluded.actualizado_en`
  )

  let totalFilas = 0
  const CONCURRENCIA = 6
  for (let i = 0; i < coords.length; i += CONCURRENCIA) {
    const lote = coords.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(c => {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${c.latitud}&longitude=${c.longitud}` +
        `&start_date=${startDate}&end_date=${endDate}` +
        `&hourly=temperature_2m,precipitation,windspeed_10m,relativehumidity_2m,surface_pressure` +
        `&timezone=America/Guayaquil`
      return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)
    }))
    const batch = []
    resultados.forEach((json, idx) => {
      const idSucursal = lote[idx].id_sucursal
      const h = json?.hourly
      if (!h?.time) return
      h.time.forEach((timestamp, i2) => {
        const [fecha, hora] = timestamp.split('T')
        if (!HORAS_CLIMA.includes(hora)) return
        if (h.temperature_2m?.[i2] == null) return
        batch.push(stmt.bind(idSucursal, fecha, hora, h.temperature_2m?.[i2] ?? null, h.precipitation?.[i2] ?? null,
          h.windspeed_10m?.[i2] ?? null, h.relativehumidity_2m?.[i2] ?? null, h.surface_pressure?.[i2] ?? null, now))
      })
    })
    if (batch.length) { await env.db.batch(batch); totalFilas += batch.length }
  }
  return totalFilas
}

async function handleDbClimaHorariaReal(request, url, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const startDate = url.searchParams.get('desde') || '2025-01-01'
  const endDate = url.searchParams.get('hasta') || ecuadorNowISO().slice(0, 10)
  try {
    const n = await refrescarClimaHorariaReal(env, startDate, endDate)
    return corsResponse(JSON.stringify({ ok: true, desde: startDate, hasta: endDate, filas: n }), 200, request)
  } catch (e) {
    return corsResponse(JSON.stringify({ error: String(e) }), 500, request)
  }
}

// ── Marea (Open-Meteo Marine API, un solo endpoint sirve historico y pronostico) ──
// GET  /db/marea?idSucursal=&fecha=&hora=   -> lista marea
// POST /db/marea/refrescar?desde=&hasta=    -> trae/actualiza marea para ese rango (default: 2025-01-01 a hoy+16d)

// Solo sucursales costeras con acceso directo al estero/mar abierto - el resto son
// fincas tierra adentro donde el modelo marino de Open-Meteo no tiene cobertura
// (siempre devuelve NULL). Pesjoya(2), Rio Nilo(12), Inducam(15), Golfomar(17),
// Bonanza(19), Roblemar(20).
const SUCURSALES_MAREA = [2, 12, 15, 17, 19, 20]

async function refrescarMarea(env, startDate, endDate) {
  const todasLasCoords = await coordenadasPorSucursal(env)
  const coords = todasLasCoords.filter(c => SUCURSALES_MAREA.includes(c.id_sucursal))
  if (!coords.length) return 0

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO marea (id_sucursal, fecha, hora, altura_marea_m, altura_ola_m, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_sucursal, fecha, hora) DO UPDATE SET
       altura_marea_m = excluded.altura_marea_m, altura_ola_m = excluded.altura_ola_m,
       actualizado_en = excluded.actualizado_en`
  )

  let totalFilas = 0
  const CONCURRENCIA = 8
  for (let i = 0; i < coords.length; i += CONCURRENCIA) {
    const lote = coords.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(c => {
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${c.latitud}&longitude=${c.longitud}` +
        `&hourly=sea_level_height_msl,wave_height&start_date=${startDate}&end_date=${endDate}&timezone=America/Guayaquil`
      return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)
    }))
    const batch = []
    resultados.forEach((json, idx) => {
      const idSucursal = lote[idx].id_sucursal
      const h = json?.hourly
      if (!h?.time) return
      h.time.forEach((timestamp, i2) => {
        const [fecha, hora] = timestamp.split('T')
        batch.push(stmt.bind(idSucursal, fecha, hora, h.sea_level_height_msl?.[i2] ?? null, h.wave_height?.[i2] ?? null, now))
      })
    })
    if (batch.length) { await env.db.batch(batch); totalFilas += batch.length }
  }
  return totalFilas
}

async function handleDbMarea(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idSucursal = url.searchParams.get('idSucursal')
  const fecha = url.searchParams.get('fecha')
  const hora = url.searchParams.get('hora')
  const conds = []
  const binds = []
  if (idSucursal) { conds.push('id_sucursal = ?'); binds.push(idSucursal) }
  if (fecha) { conds.push('fecha = ?'); binds.push(fecha) }
  if (hora) { conds.push('hora = ?'); binds.push(hora) }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : ''
  const stmt = env.db.prepare(`SELECT * FROM marea${where} ORDER BY id_sucursal, fecha, hora`).bind(...binds)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbMareaRefrescar(request, url, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const hoy = ecuadorNowISO().slice(0, 10)
  const en15dias = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  const startDate = url.searchParams.get('desde') || '2025-01-01'
  const endDate = url.searchParams.get('hasta') || en15dias
  try {
    const n = await refrescarMarea(env, startDate, endDate)
    return corsResponse(JSON.stringify({ ok: true, desde: startDate, hasta: endDate, filas: n }), 200, request)
  } catch (e) {
    return corsResponse(JSON.stringify({ error: String(e) }), 500, request)
  }
}

// Detecta maximos/minimos locales en la serie horaria de altura_marea_m (via
// LAG/LEAD de SQLite) y marca cada fila de marea con 'ALTA'/'BAJA' en tipo_pico
// (NULL en las demas horas). La hora del pico es la propia columna hora de esa
// fila - no hace falta una tabla ni columna aparte. Se recalcula completo cada vez.
async function recalcularMareaExtremos(env) {
  const { results } = await env.db.prepare(`
    WITH serie AS (
      SELECT id_sucursal, fecha, hora, altura_marea_m,
        LAG(altura_marea_m) OVER (PARTITION BY id_sucursal ORDER BY fecha, hora) AS prev,
        LEAD(altura_marea_m) OVER (PARTITION BY id_sucursal ORDER BY fecha, hora) AS next
      FROM marea
      WHERE altura_marea_m IS NOT NULL
    )
    SELECT id_sucursal, fecha, hora,
      CASE WHEN altura_marea_m > prev AND altura_marea_m > next THEN 'ALTA'
           WHEN altura_marea_m < prev AND altura_marea_m < next THEN 'BAJA' END AS tipo
    FROM serie
    WHERE prev IS NOT NULL AND next IS NOT NULL
      AND ((altura_marea_m > prev AND altura_marea_m > next) OR (altura_marea_m < prev AND altura_marea_m < next))
  `).all()

  await env.db.prepare('UPDATE marea SET tipo_pico = NULL').run()
  const stmt = env.db.prepare(
    `UPDATE marea SET tipo_pico = ? WHERE id_sucursal = ? AND fecha = ? AND hora = ?`
  )
  const CHUNK = 500
  let total = 0
  for (let i = 0; i < results.length; i += CHUNK) {
    const lote = results.slice(i, i + CHUNK)
    await env.db.batch(lote.map(r => stmt.bind(r.tipo, r.id_sucursal, r.fecha, r.hora)))
    total += lote.length
  }
  return total
}

async function handleDbMareaExtremos(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idSucursal = url.searchParams.get('idSucursal')
  const stmt = idSucursal
    ? env.db.prepare('SELECT * FROM marea WHERE id_sucursal = ? AND tipo_pico IS NOT NULL ORDER BY fecha, hora').bind(idSucursal)
    : env.db.prepare('SELECT * FROM marea WHERE tipo_pico IS NOT NULL ORDER BY id_sucursal, fecha, hora')
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbMareaExtremosRecalcular(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  try {
    const n = await recalcularMareaExtremos(env)
    return corsResponse(JSON.stringify({ ok: true, count: n }), 200, request)
  } catch (e) {
    return corsResponse(JSON.stringify({ error: String(e) }), 500, request)
  }
}

async function handleDbClimaReal(request, url, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const startDate = url.searchParams.get('desde') || '2025-01-01'
  const endDate = url.searchParams.get('hasta') || ecuadorNowISO().slice(0, 10)
  try {
    const n = await refrescarClimaReal(env, startDate, endDate)
    return corsResponse(JSON.stringify({ ok: true, desde: startDate, hasta: endDate, filas: n }), 200, request)
  } catch (e) {
    return corsResponse(JSON.stringify({ error: String(e) }), 500, request)
  }
}

async function handleDbClimaRefrescar(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  try {
    const nClima = await refrescarClima(env)
    const nHoraria = await refrescarClimaHoraria(env)
    return corsResponse(JSON.stringify({ ok: true, filasClima: nClima, filasHoraria: nHoraria }), 200, request)
  } catch (e) {
    return corsResponse(JSON.stringify({ error: String(e) }), 500, request)
  }
}

// ── Refresco automatico desde AP1 (cron) ───────────────────────────────────
// Requiere los secrets AP1_USER y AP1_PASS (wrangler secret put AP1_USER / AP1_PASS).
// Cron liviano (cada 6h, ~110 requests): sucursales + piscinas + ciclos.
// Cron pesado (diario, ~1 request por ciclo activo o recien cosechado): historia_ciclo + calibracion.

const AUTH_URL = GATEWAY + '/bff/web/ap1/security/api/auth'
const CODE_APP = '55ab9cb4-c887-4f42-98ec-b90470be6613'
const API_BASE = GATEWAY + '/bff/web/ap1/backoffice/api'
const CICLOS_DESDE = '2025-01-01'

async function ap1Login(env) {
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ userName: env.AP1_USER, password: env.AP1_PASS, codeApplication: CODE_APP, includeUserInfo: true })
  })
  const json = await res.json()
  if (json.code !== 200 || !json.data?.token) throw new Error('Login AP1 fallo: ' + JSON.stringify(json).slice(0, 200))
  return json.data.token
}

async function ap1Get(token, path, params) {
  const url = new URL(API_BASE + '/' + path)
  for (const [k, v] of (params || [])) url.searchParams.append(k, v)
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } })
  if (!res.ok) return null
  return res.json()
}

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return { year: date.getUTCFullYear(), week }
}

async function refrescarSucursales(token, env) {
  const json = await ap1Get(token, 'subsidiaries', [['pageSize', '100']])
  const rows = json?.data?.data || json?.data || []
  const stmt = env.db.prepare(
    `INSERT INTO sucursales (id, codigo, nombre) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET codigo = excluded.codigo, nombre = excluded.nombre`
  )
  const batch = rows.filter(r => r.idSubsidiary).map(r => stmt.bind(r.idSubsidiary, r.codeSubsidiary, r.name))
  if (batch.length) await env.db.batch(batch)
  return rows.map(r => ({ id: r.idSubsidiary, codigo: r.codeSubsidiary, nombre: r.name }))
}

async function refrescarPiscinas(token, env, subsidiarios) {
  const params = subsidiarios.map(s => ['subsidiaryIds', s.id])
  params.push(['pageSize', '5000'], ['status', 'ACTIVO'], ['status', 'INACTIVO'], ['status', 'MANTENIMIENTO'])
  const json = await ap1Get(token, 'pools', params)
  const rows = json?.data?.data || []
  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO piscinas (id_piscina, nombre, codigo_piscina, tamano, id_sucursal, tipo, estado, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_piscina) DO UPDATE SET
       nombre = excluded.nombre, codigo_piscina = excluded.codigo_piscina, tamano = excluded.tamano,
       id_sucursal = excluded.id_sucursal, tipo = excluded.tipo, estado = excluded.estado, actualizado_en = excluded.actualizado_en`
  )
  const batch = rows.filter(p => p.idPool).map(p =>
    stmt.bind(p.idPool, p.name || '', p.codePool || null, p.size ?? null, p.subsidiaryId ?? null, p.type || null, p.status || null, now))
  if (batch.length) await env.db.batch(batch)

  // Coordenadas por piscina, vienen en la misma respuesta de /pools - sin llamada extra.
  const codigoBySubId = new Map(subsidiarios.map(s => [s.id, s.codigo]))
  const stmtCoord = env.db.prepare(
    `INSERT INTO coordenadas_piscina (id_piscina, id_sucursal, codigo_sucursal, nombre_piscina, latitud, longitud, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_piscina) DO UPDATE SET
       id_sucursal = excluded.id_sucursal, codigo_sucursal = excluded.codigo_sucursal,
       nombre_piscina = excluded.nombre_piscina, latitud = excluded.latitud, longitud = excluded.longitud,
       actualizado_en = excluded.actualizado_en`
  )
  const batchCoord = []
  for (const p of rows) {
    const coords = p.coordinates?.coordinates
    if (!p.idPool || !Array.isArray(coords) || coords.length < 2) continue
    const [lat, lon] = coords
    if (!lat || !lon) continue
    batchCoord.push(stmtCoord.bind(p.idPool, p.subsidiaryId ?? null, codigoBySubId.get(p.subsidiaryId) || null, p.name || '', lat, lon, now))
  }
  if (batchCoord.length) await env.db.batch(batchCoord)

  return rows.length
}

async function refrescarCiclos(token, env, subsidiarios) {
  const hoy = ecuadorNowISO().slice(0, 10)
  const { year: cutOffYear, week: cutOffWeek } = isoWeek(new Date())

  const porCycleId = new Map()
  const ppByCycleId = new Map()
  const spByCycleId = new Map()
  const nyByCycleId = new Map()
  const statusMap = new Map()

  for (const sub of subsidiarios) {
    const [siembra, pp, nav, sp, ny] = await Promise.all([
      ap1Get(token, 'cycle_sowing_report', [['subsidiaryIds', sub.id], ['startDate', CICLOS_DESDE], ['endDate', hoy]]),
      ap1Get(token, 'report_production/pool_production', [['subsidiaryIds', sub.id], ['cutOffYear', cutOffYear], ['cutOffWeek', cutOffWeek]]),
      ap1Get(token, 'cycles/cycles_navigation', [['subsidiaryId', sub.id], ['includePools', 'true'], ['activeFilter', 'false']]),
      ap1Get(token, 'report_harvest/settledPools', [['subsidiaryIds', sub.id], ['startDate', CICLOS_DESDE], ['endDate', hoy], ['PageSize', '5000']]),
      ap1Get(token, 'report_harvest/NurseryYield', [['subsidiaryIds', sub.id], ['startDate', CICLOS_DESDE], ['endDate', hoy], ['PageSize', '1000']]),
    ])

    for (const r of (siembra?.data || [])) {
      if (!r.cycleId) continue
      const existing = porCycleId.get(r.cycleId)
      if (!existing) {
        porCycleId.set(r.cycleId, {
          cycleId: r.cycleId, subsidiaryCode: (r.subsidiaryCode || '').toUpperCase(),
          poolName: String(r.poolName || '').trim(), cycleNumber: r.cycleNumber,
          cycleCode: r.cycleCode, cycleUsage: r.cycleUsage, dateSowing: r.dateSowing, poolSize: r.poolSize,
        })
      } else if (r.dateSowing && (!existing.dateSowing || r.dateSowing < existing.dateSowing)) {
        existing.dateSowing = r.dateSowing
      }
    }
    for (const r of (pp?.data || [])) { if (r.idCycle) ppByCycleId.set(r.idCycle, r) }
    for (const r of (sp?.data || [])) { if (r.cycleId) spByCycleId.set(r.cycleId, r) }
    // NurseryYield a veces devuelve el array directo, a veces envuelto en {data: [...]}.
    const nyRows = Array.isArray(ny) ? ny : (ny?.data || [])
    for (const r of nyRows) { if (r.cycleId) nyByCycleId.set(r.cycleId, r) }
    for (const poolRow of (nav?.data || [])) {
      for (const det of (poolRow.detail || [])) {
        if (det.idCycle && det.status) statusMap.set(det.idCycle, det.status)
      }
    }
  }

  // cycle_sowing_report no siempre devuelve TODOS los ciclos historicos (parece tener
  // ventana propia) - si un ciclo aparece en settledPools/NurseryYield/pool_production
  // pero no en la siembra de esta corrida, se agrega igual para no perder sus dias.
  for (const [cycleId, r] of [...spByCycleId, ...nyByCycleId, ...ppByCycleId]) {
    if (porCycleId.has(cycleId)) continue
    porCycleId.set(cycleId, {
      cycleId,
      subsidiaryCode: (r.subsidiaryCode || '').toUpperCase(),
      poolName: String(r.poolName || '').trim(),
      cycleNumber: r.cycleNumber ?? null,
      cycleCode: r.cycleCode || null,
      cycleUsage: r.cycleUsage || null,
      dateSowing: null,
      poolSize: r.poolSize ?? null,
    })
  }

  const idSucursalByCode = new Map(subsidiarios.map(s => [s.codigo, s.id]))
  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO ciclos (id_ciclo, id_sucursal, codigo_sucursal, nombre_piscina, numero_ciclo, codigo_ciclo, uso_ciclo, fecha_siembra, tamano_piscina, estado, dias_ciclo, dias_secos, dias_produccion, fecha_inicio, fecha_cosecha, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_ciclo) DO UPDATE SET
       id_sucursal = excluded.id_sucursal, codigo_sucursal = excluded.codigo_sucursal,
       nombre_piscina = excluded.nombre_piscina, numero_ciclo = excluded.numero_ciclo, codigo_ciclo = excluded.codigo_ciclo,
       uso_ciclo = excluded.uso_ciclo, fecha_siembra = excluded.fecha_siembra, tamano_piscina = excluded.tamano_piscina,
       estado = excluded.estado,
       dias_ciclo = CASE WHEN dias_manual = 1 THEN dias_ciclo ELSE excluded.dias_ciclo END,
       dias_secos = CASE WHEN dias_manual = 1 THEN dias_secos ELSE excluded.dias_secos END,
       dias_produccion = CASE WHEN dias_manual = 1 THEN dias_produccion ELSE excluded.dias_produccion END,
       fecha_inicio = CASE WHEN dias_manual = 1 THEN fecha_inicio ELSE excluded.fecha_inicio END,
       fecha_cosecha = CASE WHEN dias_manual = 1 THEN fecha_cosecha ELSE excluded.fecha_cosecha END,
       actualizado_en = excluded.actualizado_en`
  )
  const batch = []
  for (const c of porCycleId.values()) {
    const pp = ppByCycleId.get(c.cycleId)
    const sp = spByCycleId.get(c.cycleId)
    const ny = nyByCycleId.get(c.cycleId)
    const estado = statusMap.get(c.cycleId) || (pp ? 'PRODUCCION' : 'COSECHADO')
    // settledPools (cosechados) tiene prioridad, NurseryYield como respaldo, y
    // pool_production para los activos - igual que en la carga manual original.
    const diasCiclo = sp?.daysCycle ?? ny?.daysCycle ?? pp?.daysCycle ?? null
    const diasSecos = sp?.daysDry ?? ny?.daysDry ?? pp?.daysDry ?? null
    const diasProduccion = sp?.daysProduction ?? ny?.daysProduction ?? pp?.daysProduction ?? null
    const fechaCosecha = sp?.endHarvest ?? ny?.endHarvestDate ?? null
    const fechaInicio = pp?.sowingDate || c.dateSowing || null
    batch.push(stmt.bind(c.cycleId, idSucursalByCode.get(c.subsidiaryCode) ?? null, c.subsidiaryCode, c.poolName,
      c.cycleNumber ?? null, c.cycleCode || null, c.cycleUsage || null, c.dateSowing || null, c.poolSize ?? null,
      estado, diasCiclo, diasSecos, diasProduccion, fechaInicio, fechaCosecha, now))
  }
  if (batch.length) await env.db.batch(batch)
  return batch.length
}

async function refrescarHistoriaCiclo(env) {
  const { results: idsActivosYNuevos } = await env.db.prepare(`
    SELECT id_ciclo FROM ciclos WHERE estado = 'PRODUCCION'
    UNION
    SELECT c.id_ciclo FROM ciclos c
    WHERE c.estado = 'COSECHADO'
      AND NOT EXISTS (SELECT 1 FROM historia_ciclo h WHERE h.id_ciclo = c.id_ciclo)
  `).all()

  const token = await ap1Login({ AP1_USER: env.AP1_USER, AP1_PASS: env.AP1_PASS })
  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO historia_ciclo (id_ciclo, semana, inicio_semana, fin_semana, dias_produccion, peso,
       peso_estimado_regresion, crecimiento_ultima_semana, crecimiento_2_semanas, crecimiento_4_semanas, crecimiento_desde_inicio,
       supervivencia, biomasa_actual, biomasa_semana, animales_por_m2, biomasa_cosechada,
       alimento_semana, alimento_acumulado, alimento_ha_dia, fca, fca_bruto, fca_semana,
       est_m2, factor_alimento, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_ciclo, semana) DO UPDATE SET
       inicio_semana = excluded.inicio_semana, fin_semana = excluded.fin_semana,
       dias_produccion = excluded.dias_produccion, peso = excluded.peso,
       peso_estimado_regresion = excluded.peso_estimado_regresion,
       crecimiento_ultima_semana = excluded.crecimiento_ultima_semana, crecimiento_2_semanas = excluded.crecimiento_2_semanas,
       crecimiento_4_semanas = excluded.crecimiento_4_semanas, crecimiento_desde_inicio = excluded.crecimiento_desde_inicio,
       supervivencia = excluded.supervivencia, biomasa_actual = excluded.biomasa_actual, biomasa_semana = excluded.biomasa_semana,
       animales_por_m2 = excluded.animales_por_m2, biomasa_cosechada = excluded.biomasa_cosechada,
       alimento_semana = excluded.alimento_semana, alimento_acumulado = excluded.alimento_acumulado,
       alimento_ha_dia = excluded.alimento_ha_dia, fca = excluded.fca, fca_bruto = excluded.fca_bruto,
       fca_semana = excluded.fca_semana, est_m2 = excluded.est_m2, factor_alimento = excluded.factor_alimento,
       actualizado_en = excluded.actualizado_en`
  )

  let totalFilas = 0
  const CONCURRENCIA = 12
  const ids = idsActivosYNuevos.map(r => r.id_ciclo)
  for (let i = 0; i < ids.length; i += CONCURRENCIA) {
    const lote = ids.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(id => ap1Get(token, `cycle_histories/production/${id}`).catch(() => null)))
    const batch = []
    resultados.forEach((json, idx) => {
      const cycleId = lote[idx]
      for (const r of (json?.data || [])) {
        if (r.weekOfYear === undefined || r.weekOfYear === null) continue
        batch.push(stmt.bind(cycleId, r.weekOfYear, r.startOfWeek || null, r.endOfWeek || null,
          r.productionDays ?? null, r.weight ?? null, r.estimatedWeightByRegresion ?? null,
          r.growthlastWeeks ?? null, r.growth2Weeks ?? null, r.growth4Weeks ?? null, r.growthFromTheBeginning ?? null,
          r.survival ?? null, r.biomassActual ?? null, r.biomassWeek ?? null, r.totalActualAnimalsPerSquareMeter ?? null,
          r.biomassHarvested ?? null, r.totalFeedWeek ?? null, r.totalAccumulateFeed ?? null,
          r.totalFeedWeekPerHectareDay ?? null, r.fca ?? null, r.fcaGross ?? null, r.fcaWeek ?? null,
          r.estM2 ?? null, r.feedFactor ?? null, now))
      }
    })
    if (batch.length) { await env.db.batch(batch); totalFilas += batch.length }
  }
  return { ciclos: ids.length, filas: totalFilas }
}

// harvest_programs/report: UNA sola llamada global (sin subsidiaryIds) que trae el plan de
// cosechas/raleos de todos los ciclos que ya tienen uno armado - "instructions" (texto libre, ej.
// "RALEAR 2S 40/50 4,0M2, COSECHAR 4S 30/40") y los buckets de biomasa (lb) por semana que el plan
// ya calculo (currentWeek..sixWeek). Las piscinas sin plan armado todavia (ej. precrias) no
// aparecen aqui - proyeccion-alimento.html las sigue proyectando, solo que sin acotar horizonte.
async function refrescarPlanCosecha(token, env) {
  const json = await ap1Get(token, 'harvest_programs/report', [['PageSize', '1000']])
  const rows = json?.data?.report || []
  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO plan_cosecha (id_ciclo, instructions, biomasa_actual_lb, current_week, one_week, two_week, three_week, four_week, five_week, six_week, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id_ciclo) DO UPDATE SET
       instructions = excluded.instructions, biomasa_actual_lb = excluded.biomasa_actual_lb,
       current_week = excluded.current_week, one_week = excluded.one_week, two_week = excluded.two_week,
       three_week = excluded.three_week, four_week = excluded.four_week, five_week = excluded.five_week,
       six_week = excluded.six_week, actualizado_en = excluded.actualizado_en`
  )
  const batch = rows.filter(r => r.cycleId).map(r => stmt.bind(
    r.cycleId, r.instructions || null, r.estimatedTotalBiomassPounds ?? null,
    r.currentWeek ?? null, r.oneWeek ?? null, r.twoWeek ?? null, r.threeWeek ?? null,
    r.fourWeek ?? null, r.fiveWeek ?? null, r.sixWeek ?? null, now))
  if (batch.length) await env.db.batch(batch)
  return batch.length
}

// Sucursales que se excluyen del refresco automatico de piscinas/ciclos (ej. NC =
// Coaque NC, migrada a CO - sus datos viejos se borraron a mano y no deben volver).
const SUCURSALES_EXCLUIDAS = ['NC']

async function refrescoLiviano(env) {
  const token = await ap1Login(env)
  const todasLasSubsidiarias = await refrescarSucursales(token, env)
  const subsidiarios = todasLasSubsidiarias.filter(s => !SUCURSALES_EXCLUIDAS.includes(s.codigo))
  const nPiscinas = await refrescarPiscinas(token, env, subsidiarios)
  const nCiclos = await refrescarCiclos(token, env, subsidiarios)
  const nPlan = await refrescarPlanCosecha(token, env)
  const nClima = await refrescarClima(env)
  const nHoraria = await refrescarClimaHoraria(env)
  // Real/observado tiene unos dias de retraso en la fuente - se reintentan los ultimos
  // 10 dias en cada corrida para ir llenando lo que ya este disponible.
  const hace10dias = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10)
  const hoy = ecuadorNowISO().slice(0, 10)
  const nClimaReal = await refrescarClimaReal(env, hace10dias, hoy).catch(() => 0)
  const nHorariaReal = await refrescarClimaHorariaReal(env, hace10dias, hoy).catch(() => 0)
  const nInamhi = await refrescarClimaInamhi(env).catch(() => 0)
  const nBalanceado = await refrescarConsumoBalanceado(env).catch(() => 0)
  const en15dias = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  const nMarea = await refrescarMarea(env, hace10dias, en15dias).catch(() => 0)
  const nMareaExtremos = await recalcularMareaExtremos(env).catch(() => 0)
  return { subsidiarios: subsidiarios.length, piscinas: nPiscinas, ciclos: nCiclos, planCosecha: nPlan,
    filasClima: nClima, filasHoraria: nHoraria, filasClimaReal: nClimaReal, filasHorariaReal: nHorariaReal,
    filasInamhi: nInamhi, filasBalanceado: nBalanceado, filasMarea: nMarea, filasMareaExtremos: nMareaExtremos }
}

async function refrescoPesado(env) {
  const historia = await refrescarHistoriaCiclo(env)
  const calibracion = await recalcularCalibracion(env)
  const ordenControl = await refrescarOrdenControl(env).catch(() => 0)
  return { ...historia, calibracion, ordenControl }
}

// ── Handler principal ──────────────────────────────────────────────────────

export default {
  async scheduled(event, env, ctx) {
    // Cron liviano cada 6h: "0 */6 * * *". Cron pesado diario: "0 7 * * *" (2am Ecuador).
    if (event.cron === '0 7 * * *') {
      ctx.waitUntil(refrescoPesado(env).catch(e => console.error('refrescoPesado error:', e)))
    } else {
      ctx.waitUntil(refrescoLiviano(env).catch(e => console.error('refrescoLiviano error:', e)))
    }
  },

  async fetch(request, env, ctx) {
    const url    = new URL(request.url)
    const origin = request.headers.get('Origin') || ''

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCors(origin) })
    }

    // Las rutas /db/* que ESCRIBEN (sync, recalcular, refrescar-*) requieren la API key propia
    // (header X-Api-Key) - corren desde scripts/servidores propios, nunca desde un navegador, asi
    // que la key puede vivir ahi sin quedar expuesta. Las rutas de solo LECTURA (GET) se dejan
    // abiertas a proposito: las consumen dashboards estaticos en el navegador (GitHub Pages) donde
    // cualquier valor incrustado en el HTML/JS quedaria visible en DevTools de todos modos - meterle
    // una key ahi no protege nada real, solo da una falsa sensacion de seguridad.
    if (url.pathname.startsWith('/db/') && request.method !== 'GET') {
      const key = request.headers.get('X-Api-Key') || ''
      if (!env.DB_API_KEY || key !== env.DB_API_KEY) {
        return corsResponse('{"error":"no autorizado"}', 401, request)
      }
    }

    if (url.pathname === '/db/refrescar-liviano' && env.db && request.method === 'POST') {
      try {
        const r = await refrescoLiviano(env)
        return corsResponse(JSON.stringify({ ok: true, ...r }), 200, request)
      } catch (e) {
        return corsResponse(JSON.stringify({ error: String(e) }), 500, request)
      }
    }

    if (url.pathname === '/db/refrescar-pesado' && env.db && request.method === 'POST') {
      try {
        const r = await refrescoPesado(env)
        return corsResponse(JSON.stringify({ ok: true, ...r }), 200, request)
      } catch (e) {
        return corsResponse(JSON.stringify({ error: String(e) }), 500, request)
      }
    }

    if (url.pathname === '/db/sucursales' && env.db) {
      return handleDbSucursales(request, env)
    }

    if (url.pathname === '/db/piscinas' && env.db) {
      return handleDbPiscinas(request, url, env)
    }

    if (url.pathname === '/db/piscinas/sync' && env.db) {
      return handleDbPiscinasSync(request, env)
    }

    if (url.pathname === '/db/ciclos' && env.db) {
      return handleDbCiclos(request, url, env)
    }

    if (url.pathname === '/db/ciclos/sync' && env.db) {
      return handleDbCiclosSync(request, env)
    }

    if (url.pathname === '/db/ciclos/manual' && env.db) {
      return handleDbCiclosManual(request, env)
    }

    if (url.pathname === '/db/orden-control' && env.db) {
      return handleDbOrdenControl(request, url, env)
    }

    if (url.pathname === '/db/orden-control/sync' && env.db) {
      return handleDbOrdenControlSync(request, env)
    }

    if (url.pathname === '/db/consumo-balanceado' && env.db) {
      return handleDbConsumoBalanceado(request, url, env)
    }

    if (url.pathname === '/db/consumo-balanceado/sync' && env.db) {
      return handleDbConsumoBalanceadoSync(request, env)
    }

    if (url.pathname === '/db/consumo-insumos' && env.db) {
      return handleDbConsumoInsumos(request, url, env)
    }

    if (url.pathname === '/db/consumo-insumos/sync' && env.db) {
      return handleDbConsumoInsumosSync(request, env)
    }

    if (url.pathname === '/db/historia-ciclo' && env.db) {
      return handleDbHistoriaCiclo(request, url, env)
    }

    if (url.pathname === '/db/historia-ciclo/sync' && env.db) {
      return handleDbHistoriaCicloSync(request, env)
    }

    if (url.pathname === '/db/calibracion-alimento' && env.db) {
      return handleDbCalibracion(request, env)
    }

    if (url.pathname === '/db/plan-cosecha' && env.db) {
      return handleDbPlanCosecha(request, env)
    }

    if (url.pathname === '/db/calibracion-alimento/recalcular' && env.db) {
      return handleDbCalibracionRecalcular(request, env)
    }

    if (url.pathname === '/db/coordenadas-piscina' && env.db) {
      return handleDbCoordenadasPiscina(request, url, env)
    }

    if (url.pathname === '/db/clima' && env.db) {
      return handleDbClima(request, url, env)
    }

    if (url.pathname === '/db/clima/refrescar' && env.db) {
      return handleDbClimaRefrescar(request, env)
    }

    if (url.pathname === '/db/clima/inamhi' && env.db) {
      return handleDbClimaInamhi(request, env)
    }

    if (url.pathname === '/db/marea' && env.db) {
      return handleDbMarea(request, url, env)
    }

    if (url.pathname === '/db/marea/refrescar' && env.db) {
      return handleDbMareaRefrescar(request, url, env)
    }

    if (url.pathname === '/db/marea-extremos' && env.db) {
      return handleDbMareaExtremos(request, url, env)
    }

    if (url.pathname === '/db/marea-extremos/recalcular' && env.db) {
      return handleDbMareaExtremosRecalcular(request, env)
    }

    if (url.pathname === '/db/clima/horaria/real' && env.db) {
      return handleDbClimaHorariaReal(request, url, env)
    }

    if (url.pathname === '/db/clima/real' && env.db) {
      return handleDbClimaReal(request, url, env)
    }

    if (url.pathname.startsWith('/kv/')) {
      const key = url.pathname.replace('/kv/', '')
      // "hc:<cycleId>" = cache compartido de un ciclo ya COSECHADO (historia-ciclo-masivo.html) -
      // una clave por ciclo, nunca un blob unico, para que dos usuarios guardando ciclos distintos
      // al mismo tiempo no se pisen entre si.
      // "hc-index:<subCode>" = lista de piscinas/ciclos vistos alguna vez en esa sucursal (sin las
      // filas semanales, solo poolName/cycleNumber/cycleId/estado) - permite llenar los filtros de
      // Piscinas/Ciclos al instante sin esperar a "Generar reporte".
      const esCicloCosechado = /^hc:\d+$/.test(key)
      const esIndice = /^hc-index:[A-Z0-9]+$/.test(key)
      if (!esCicloCosechado && !esIndice && !['excel','ciclos','cambios','cambios-dev','cambios-config','cambios-config-dev'].includes(key)) {
        return corsResponse('{"error":"key no permitida"}', 400, request)
      }
      if (request.method === 'GET') {
        const val = await env.data.get(key)
        return corsResponse(val || (esCicloCosechado ? 'null' : '[]'), 200, request)
      }
      if (request.method === 'POST') {
        const body = await request.text()
        // Los ciclos cosechados no vencen (nunca cambian) - las demas keys mantienen su comportamiento sin TTL.
        await env.data.put(key, body, esCicloCosechado ? { expirationTtl: 60 * 60 * 24 * 365 * 5 } : undefined)
        return corsResponse('{"ok":true}', 200, request)
      }
      return corsResponse('{"error":"method not allowed"}', 405, request)
    }

    // Feeding mensual con caché (si falla, cae al proxy normal)
    if (request.method === 'GET' && url.pathname === FEEDING_PATH &&
        url.searchParams.get('timeGranularity') === 'month' && env.data) {
      try {
        const cached = await handleFeedingCached(request, url, env, ctx)
        if (cached) return cached
      } catch(e) {
        console.error('handleFeedingCached error:', e)
      }
    }

    // Proxy transparente
    const target = GATEWAY + url.pathname + url.search
    const cors   = getCors(origin)
    try {
      const res = await fetch(target, {
        method:  request.method,
        headers: request.headers,
        body:    ['GET','HEAD'].includes(request.method) ? undefined : request.body
      })
      const out = new Response(res.body, res)
      Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v))
      return out
    } catch(e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors }
      })
    }
  }
}
