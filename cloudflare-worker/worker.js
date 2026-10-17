import { connect } from 'cloudflare:sockets'

const GATEWAY = 'https://gateway.naturisa.com.ec'

const ALLOWED_ORIGINS = [
  'https://jparraga-naturisa.github.io',
  'null', // file:// protocol
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3006',
  'http://localhost:3007',
  'http://localhost:3008',
  'http://localhost:3009',
  'http://localhost:3010',
  'http://localhost:9100',
]

function getCors(origin) {
  const allowed = (!origin || origin === 'null' || ALLOWED_ORIGINS.includes(origin)) ? '*' : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Api-Key',
    'Access-Control-Max-Age':       '86400'
  }
}

function corsResponse(body, status, request, extra) {
  const cors = getCors(request.headers.get('Origin') || '')
  return new Response(body, { status, headers: { ...cors, 'Content-Type': 'application/json', ...(extra || {}) } })
}

// â”€â”€ CachÃ© de feeding por mes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // Rango completamente en el pasado â†’ cachÃ© total
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
  // - Si hay HIT: fetch solo mes actual (1 llamada pequeÃ±a)
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

  // MISS: fetch rango completo â€” misma cantidad de llamadas que antes
  const { ok, rows: allRows, envelope } = await fetchFeedRows(request, url.pathname, url.searchParams, initDate, endDate)
  if (!ok) return null

  // Guardar meses pasados en KV de forma asÃ­ncrona (no bloquea la respuesta)
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

// â”€â”€ Reporte diario piscinas (app movil) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Replica reporte_diario.py: pivotea feeding_general por PSC/Metrica/Sacos y
// marca alerta cuando Saldo Tolva > 0 pero no hubo Cargado ni Sobrante Tolva.
// GET /db/reporte-diario?fecha=YYYY-MM-DD&subsidiaryId=<id>  (fecha default: hoy en Ecuador;
// subsidiaryId es repetible, si se omite trae todas las sucursales)

const REPORTE_SUBSIDIARY_IDS = [13,28,29,30,19,6,8,7,11,14,17,16,15,5,4,18,21,3,10,9,1,33,2,12,20,10033]
const REPORTE_BUSINESS_TYPES = ['WallIncome','WallBalance','HopperBalance','Remaining','Loaded','VoleoConsumption']
const REPORTE_NOMBRES = {
  Loaded: 'Cargado Tolva', VoleoConsumption: 'Consumo Voleo', WallIncome: 'Ingreso a Muro',
  WallBalance: 'Saldo Muro', HopperBalance: 'Saldo Tolva', Remaining: 'Sobrante Tolva',
}
const REPORTE_COLUMNAS_ORDEN = ['Ingreso a Muro', 'Saldo Muro', 'Cargado Tolva', 'Sobrante Tolva', 'Saldo Tolva']

function reporteConstruirTabla(registros) {
  const porPsc = new Map()
  for (const rec of registros) {
    const psc = rec.groupValue || ''
    const metrica = REPORTE_NOMBRES[rec.businessType] || rec.businessType || ''
    const sacos = rec.sacks || 0
    if (!porPsc.has(psc)) porPsc.set(psc, { PSC: psc })
    const fila = porPsc.get(psc)
    fila[metrica] = (fila[metrica] || 0) + sacos
  }
  const filas = [...porPsc.values()].sort((a, b) => a.PSC.localeCompare(b.PSC))
  for (const fila of filas) {
    for (const col of REPORTE_COLUMNAS_ORDEN) {
      if (fila[col] === undefined) fila[col] = 0
    }
  }
  return filas
}

function reporteDetectarAlertas(filas) {
  return filas.filter(f => (f['Saldo Tolva'] || 0) > 0 && !f['Cargado Tolva'] && !f['Sobrante Tolva'])
}

async function handleDbReporteDiario(request, url) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const fecha = url.searchParams.get('fecha') || ecuadorNowISO().slice(0, 10)
  const subsidiaryIds = url.searchParams.getAll('subsidiaryId')
  const idsAUsar = subsidiaryIds.length ? subsidiaryIds : REPORTE_SUBSIDIARY_IDS

  const sp = new URLSearchParams()
  for (const id of idsAUsar) sp.append('subsidiaryIds', id)
  for (const bt of REPORTE_BUSINESS_TYPES) sp.append('businessTypes', bt)
  sp.set('initDate', fecha); sp.set('endDate', fecha)
  sp.set('timeGranularity', 'day'); sp.set('valueOptions', 'kg'); sp.set('groupBy', 'pool'); sp.set('PageSize', '1000')

  const res = await fetch(GATEWAY + FEEDING_PATH + '?' + sp, { method: 'GET', headers: request.headers })
  if (!res.ok) return corsResponse(JSON.stringify({ error: 'gateway respondio ' + res.status }), res.status, request)
  const json = await res.json()
  const registros = json.data || []

  const filas = reporteConstruirTabla(registros)
  const alertas = reporteDetectarAlertas(filas)
  return corsResponse(JSON.stringify({ fecha, filas, alertas, totalPiscinas: filas.length, totalAlertas: alertas.length }), 200, request)
}

// â”€â”€ Alerta de cosecha Pre-Final sin Final (app movil) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Entre la cosecha Pre-Final y la Final no puede pasar mas de 7 dias. Este
// endpoint busca ciclos con una cosecha tipo PRE-FINAL registrada que aun no
// tengan una cosecha FINAL, y devuelve cuantos dias pasaron desde el Pre-Final.
// GET /db/alertas-cosecha?subsidiaryId=<id>&dias=<ventana>  (dias default: 45)

const HARVESTS_PATH = '/bff/web/ap1/backoffice/api/report_harvest/HarvestsByDate'

async function handleDbAlertasCosecha(request, url) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const subsidiaryIds = url.searchParams.getAll('subsidiaryId')
  const idsAUsar = subsidiaryIds.length ? subsidiaryIds : REPORTE_SUBSIDIARY_IDS
  const diasVentana = parseInt(url.searchParams.get('dias') || '45', 10)

  const hoy = ecuadorNowISO().slice(0, 10)
  const desde = new Date(Date.now() - diasVentana * 86400000).toISOString().slice(0, 10)

  const sp = new URLSearchParams()
  for (const id of idsAUsar) sp.append('subsidiaryIds', id)
  sp.set('startDate', desde); sp.set('endDate', hoy)

  const res = await fetch(GATEWAY + HARVESTS_PATH + '?' + sp, { method: 'GET', headers: request.headers })
  if (!res.ok) return corsResponse(JSON.stringify({ error: 'gateway respondio ' + res.status }), res.status, request)
  const json = await res.json()
  const registros = json.data || []

  const porCiclo = new Map()
  for (const r of registros) {
    if (!r.cycleId) continue
    let info = porCiclo.get(r.cycleId)
    if (!info) {
      info = { cycleId: r.cycleId, cycleCode: r.cycleCode, subsidiary: r.subsidiary, subsidiaryCode: r.subsidiaryCode,
        poolName: r.poolName, customerName: r.customerName, tieneFinal: false, fechaPreFinal: null }
      porCiclo.set(r.cycleId, info)
    }
    if (r.harvestType === 'FINAL') info.tieneFinal = true
    if (r.harvestType === 'PRE-FINAL') {
      if (!info.fechaPreFinal || r.endHarvest > info.fechaPreFinal) info.fechaPreFinal = r.endHarvest
    }
  }

  // Diferencia en dias calendario (Ecuador), no en horas/milisegundos, para evitar
  // que el desfase de zona horaria del campo endHarvest (sin offset explicito) sume
  // un dia de mas o de menos segun la hora en que corra este endpoint.
  const hoyMsUTC = Date.parse(hoy + 'T00:00:00Z')
  const alertas = [...porCiclo.values()]
    .filter(c => c.fechaPreFinal && !c.tieneFinal)
    .map(c => {
      const fechaPreFinal = c.fechaPreFinal.slice(0, 10)
      return {
        cycleCode: c.cycleCode, subsidiary: c.subsidiary, subsidiaryCode: c.subsidiaryCode,
        poolName: c.poolName, customerName: c.customerName, fechaPreFinal,
        diasTranscurridos: Math.round((hoyMsUTC - Date.parse(fechaPreFinal + 'T00:00:00Z')) / 86400000),
      }
    })
    .sort((a, b) => b.diasTranscurridos - a.diasTranscurridos)

  return corsResponse(JSON.stringify({ alertas, total: alertas.length }), 200, request)
}

// ── Alerta de siembra de larva (app movil) ──────────────────────────────────
// Un lote de larva tiene una hora de despacho; a partir de ahi hay un margen
// de 12 horas para sembrarlo. Este endpoint busca lotes en estado DISPONIBLE
// (aun no sembrados) y devuelve cuantas horas pasaron desde el despacho.
// GET /db/alertas-siembra?subsidiaryId=<id>

const LOTS_PATH = '/bff/web/ap1/backoffice/api/lots'

async function handleDbAlertasSiembra(request, url) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const subsidiaryIds = url.searchParams.getAll('subsidiaryId')
  const idsAUsar = subsidiaryIds.length ? subsidiaryIds : REPORTE_SUBSIDIARY_IDS

  const sp = new URLSearchParams()
  for (const id of idsAUsar) sp.append('subsidiaryIds', id)
  sp.set('includeCodes', 'true')
  sp.set('orderBy', 'dispatchDate')
  sp.set('status', 'DISPONIBLE')

  const res = await fetch(GATEWAY + LOTS_PATH + '?' + sp, { method: 'GET', headers: request.headers })
  if (!res.ok) return corsResponse(JSON.stringify({ error: 'gateway respondio ' + res.status }), res.status, request)
  const json = await res.json()
  const registros = json.data?.data || []

  // dispatchDate viene sin offset (hora local Ecuador tal cual la ve el usuario en AP1).
  // Se compara contra "ahora" tambien en hora Ecuador, ambos parseados con el mismo
  // truco (forzando 'Z') para que la resta de horas de calendario sea correcta.
  const ecuadorAhoraMs = Date.now() - 5 * 60 * 60 * 1000
  const alertas = registros
    .map(r => ({
      lotCode: r.lotCode, cycleCode: r.cycleCode, subsidiaryId: r.destinationSubsidiaryId,
      dispatchDate: r.dispatchDate,
      horasTranscurridas: Math.floor((ecuadorAhoraMs - Date.parse(r.dispatchDate + 'Z')) / 3600000),
    }))
    .sort((a, b) => b.horasTranscurridas - a.horasTranscurridas)

  return corsResponse(JSON.stringify({ alertas, total: alertas.length }), 200, request)
}

// ── Alerta de liquidacion con cosecha aun activa (app movil) ────────────────
// Si en las guias de un lote que sigue en estado COSECHANDO ya aparece una
// guia con evento "Liquidado", es una alerta: se liquido antes de terminar
// de cosechar. Devuelve cuantas horas pasaron desde esa ultima liquidacion.
// GET /db/alertas-liquidacion (trae siempre todas las sucursales, ver nota abajo)

const CYCLE_HARVESTS_PATH = '/bff/web/ap1/backoffice/api/cycle_harvests'
const CYCLE_HARVEST_GUIDES_PATH = '/bff/web/ap1/backoffice/api/cycle_harvest_guides'
const CONCURRENCIA_LIQUIDACION = 8

async function handleDbAlertasLiquidacion(request, url) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)

  // El filtro subsidiaryIds de AP1 no funciona en este endpoint (siempre trae
  // todo), asi que se pide una sola vez y el codigo de sucursal se saca del
  // prefijo del propio lotCode (igual formato que cycleCode: "RN-0014-0040-02").
  const sp = new URLSearchParams()
  sp.set('subsidiaryIds', REPORTE_SUBSIDIARY_IDS[0])
  sp.set('status', 'COSECHANDO')
  sp.set('orderBy', 'idCycleHarvest')
  const resCosechando = await fetch(GATEWAY + CYCLE_HARVESTS_PATH + '?' + sp, { method: 'GET', headers: request.headers })
  if (!resCosechando.ok) return corsResponse(JSON.stringify({ error: 'gateway respondio ' + resCosechando.status }), resCosechando.status, request)
  const jsonCosechando = await resCosechando.json()
  const vistos = new Set()
  const cosechando = []
  for (const r of (jsonCosechando.data || [])) {
    if (vistos.has(r.idCycleHarvest)) continue
    vistos.add(r.idCycleHarvest)
    cosechando.push({ idCycleHarvest: r.idCycleHarvest, lotCode: r.lotCode, subsidiaryCode: (r.lotCode || '').split('-')[0] })
  }

  // Para cada ciclo cosechando, revisar sus guias y buscar la ultima "Liquidado".
  const ecuadorAhoraMs = Date.now() - 5 * 60 * 60 * 1000
  const alertas = []
  for (let i = 0; i < cosechando.length; i += CONCURRENCIA_LIQUIDACION) {
    const lote = cosechando.slice(i, i + CONCURRENCIA_LIQUIDACION)
    const resultados = await Promise.all(lote.map(c => {
      const sp = new URLSearchParams()
      sp.set('cycleHarvestId', c.idCycleHarvest)
      for (const st of ['ACTIVO', 'PENDIENTE', 'LIQUIDADA', 'LIQUIDADO']) sp.append('status', st)
      sp.set('includeCatalogueEventType', 'true')
      sp.set('orderBy', 'date asc')
      sp.set('pageSize', '1000')
      return fetch(GATEWAY + CYCLE_HARVEST_GUIDES_PATH + '?' + sp, { method: 'GET', headers: request.headers })
        .then(r => r.ok ? r.json() : null).catch(() => null)
        .then(json => ({ c, json }))
    }))
    for (const { c, json } of resultados) {
      const guias = json?.data?.data || []
      const liquidadas = guias.filter(g => g.catalogueEventTypeValue === 'Liquidado')
      if (!liquidadas.length) continue
      const ultima = liquidadas.reduce((a, b) => (a.date > b.date ? a : b))
      alertas.push({
        lotCode: c.lotCode, subsidiaryCode: c.subsidiaryCode, fechaLiquidacion: ultima.date,
        horasTranscurridas: Math.floor((ecuadorAhoraMs - Date.parse(ultima.date + 'Z')) / 3600000),
      })
    }
  }

  alertas.sort((a, b) => b.horasTranscurridas - a.horasTranscurridas)
  return corsResponse(JSON.stringify({ alertas, total: alertas.length }), 200, request)
}

// ── Inventario de laboratorios: stock SAP vs stock del lab (app movil) ──────
// Mismo calculo que inventario-laboratorios/reporte_inventario.py, pero con el
// stock SAP (libre utilizacion) consultado en vivo al portal de requisiciones.
// GET /db/inventario-laboratorios
//
// El catalogo de items del portal pesa ~12MB y no se puede filtrar ni paginar
// (PageNumber se ignora), asi que se guarda en KV una version compacta 1x/dia.
// Todo el stock de los L*09 esta en items de tipo 18 y 1 (~420); se consultan
// esos mas los codigos que tenga el lab en su bodega.

const PORTAL_API = '/bff/web/portal/backoffice/api'
const LAB_API = '/bff/web/lab/backoffice/api'
const INV_LAB_CATALOGO_KEY = 'inv-lab-catalogo-v1'
const INV_LAB_TIPOS_ITEM = [18, 1]
const INV_LAB_LABORATORIOS = [
  { subsidiaryId: 23, nombre: 'Larviquest 1', almacen: 'L109', warehouseId: 466 },
  { subsidiaryId: 24, nombre: 'Larviquest 2', almacen: 'L209', warehouseId: 476 },
  { subsidiaryId: 25, nombre: 'Larviquest 3', almacen: 'L309', warehouseId: 486 },
  { subsidiaryId: 26, nombre: 'Larviquest 4', almacen: 'L409', warehouseId: 496 },
]
// Unidad SAP -> unidad del lab (g / ml). El API del lab reporta stockAvailable/
// unsyncQuantity ya en g/ml aunque el catalogo diga Kg/L; para mostrar todo en
// unidad SAP se divide por este mismo factor (aSapUnidad).
const INV_FACTOR_UM = { KG: 1000, KGS: 1000, G: 1, GR: 1, L: 1000, LT: 1000, ML: 1, GAL: 3785.41, GLN: 3785.41 }
const INV_UM_SAP_DISPLAY = { KG: 'Kg', KGS: 'Kg', G: 'g', GR: 'g', L: 'L', LT: 'L', ML: 'mL', GAL: 'Gal', GLN: 'Gal' }

function aSapUnidad(valorEnGramosOMl, um) {
  return valorEnGramosOMl / (INV_FACTOR_UM[um] || 1)
}

// { codeSap: { ids: [idItem, ...], nombre, unidad, itemTypeId } }
// Un mismo codeSap puede tener varios idItem en el catalogo (duplicados/variantes);
// hay que sumar el stock de todos, no solo del primero, o el saldo SAP queda incompleto.
async function invLabCatalogo(request, env) {
  const cached = env.data ? await env.data.get(INV_LAB_CATALOGO_KEY, 'json') : null
  if (cached) return cached
  const res = await fetch(GATEWAY + PORTAL_API + '/item?companyId=3&PageSize=50000', { headers: request.headers })
  if (!res.ok) throw Object.assign(new Error('catalogo de items respondio ' + res.status), { status: res.status })
  const items = (await res.json()).data?.data || []
  const catalogo = {}
  for (const i of items) {
    const cod = String(i.codeSap || '').trim()
    if (!cod) continue
    if (!catalogo[cod]) {
      catalogo[cod] = { ids: [i.idItem], nombre: i.name || '', unidad: String(i.baseUnitMsrAb || '').trim().toUpperCase(), itemTypeId: i.itemTypeId }
    } else {
      catalogo[cod].ids.push(i.idItem)
    }
  }
  if (env.data) await env.data.put(INV_LAB_CATALOGO_KEY, JSON.stringify(catalogo), { expirationTtl: 60 * 60 * 24 })
  return catalogo
}

async function invLabRegistrosDeCiclo(request, subsidiaryId, ciclo) {
  const h = { headers: request.headers }
  const registros = []
  for (let page = 1; ; page++) {
    const res = await fetch(GATEWAY + LAB_API + '/warehouse_production?subsidiaryId=' + subsidiaryId + '&cycleId=' + ciclo.id +
      '&date=' + ciclo.fechaInicio + '&includeItem=true&includeWarehouseOrigin=true&PageSize=100&PageNumber=' + page, h)
    if (!res.ok) throw Object.assign(new Error('bodega lab respondio ' + res.status), { status: res.status })
    const j = await res.json()
    const inner = Array.isArray(j) ? j : j.data
    const filas = Array.isArray(inner) ? inner : (inner?.data || [])
    registros.push(...filas)
    const totalPages = Array.isArray(inner) ? 1 : (inner?.totalPages || 1)
    if (page >= totalPages || !filas.length) break
  }
  return registros
}

// Al cosechar un ciclo y arrancar uno nuevo, el ciclo nuevo puede tardar en
// tener registros de bodega aunque todavia queden consumos/saldos pendientes
// del ciclo recien cosechado. Si el ciclo mas reciente no trae registros, se
// sigue usando el anterior que si tenga, para no mostrar diferencias falsas.
async function invLabRegistros(request, subsidiaryId) {
  const h = { headers: request.headers }
  const resC = await fetch(GATEWAY + LAB_API + '/cycle?PageNumber=1&PageSize=1000&OrderBy=code+desc&subsidiaryId=' +
    subsidiaryId + '&includeLaboratory=true&includeLarvalStage=true', h)
  if (!resC.ok) throw Object.assign(new Error('ciclos lab respondio ' + resC.status), { status: resC.status })
  const jc = await resC.json()
  const ciclos = Array.isArray(jc) ? jc : Array.isArray(jc.data) ? jc.data : (jc.data?.data || [])
  if (!ciclos.length) return { ciclo: null, registros: [] }

  let ultimoCiclo = null
  for (const c of ciclos.slice(0, 3)) {
    const ciclo = { id: c.id || c.cycleId || c.idCycle, codigo: c.code || '', fechaInicio: String(c.sowingDate || c.dryDate || '').split('T')[0] }
    const registros = await invLabRegistrosDeCiclo(request, subsidiaryId, ciclo)
    if (registros.length) return { ciclo, registros }
    if (!ultimoCiclo) ultimoCiclo = ciclo
  }
  return { ciclo: ultimoCiclo, registros: [] }
}

async function invLabStockSap(request, lab, catalogo, codigos) {
  const body = []
  for (const cod of codigos) {
    for (const id of catalogo[cod].ids) body.push({ itemId: id, warehouseId: lab.warehouseId, warehouseCode: lab.almacen })
  }
  const res = await fetch(GATEWAY + PORTAL_API + '/item/stock', {
    method: 'POST',
    headers: { Authorization: request.headers.get('Authorization') || '', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw Object.assign(new Error('stock SAP respondio ' + res.status), { status: res.status })
  const porId = {}
  for (const z of (await res.json()).data || []) porId[z.itemId] = (porId[z.itemId] || 0) + (z.quantity || 0)
  // Se deja en la unidad nativa de SAP (Kg, L, etc.), sin convertir a g/ml.
  // Se suma el stock de todos los idItem que comparten el mismo codeSap.
  const stock = {}
  for (const cod of codigos) {
    const total = catalogo[cod].ids.reduce((acc, id) => acc + (porId[id] || 0), 0)
    stock[cod] = Math.round(total * 10000) / 10000
  }
  return stock
}

async function invLabLaboratorio(request, lab, catalogo, codigosBase) {
  const { ciclo, registros } = await invLabRegistros(request, lab.subsidiaryId)
  const labPorCodigo = {}
  for (const rec of registros) {
    const cod = String(rec.item?.codeSap || '').trim()
    if (cod) labPorCodigo[cod] = rec
  }
  const codigos = [...new Set([...codigosBase, ...Object.keys(labPorCodigo).filter(c => catalogo[c])])]
  const stock = await invLabStockSap(request, lab, catalogo, codigos)

  const r2 = v => Math.round(v * 1000) / 1000
  const filas = []
  for (const cod of codigos) {
    const rec = labPorCodigo[cod]
    const sap = stock[cod] || 0
    if (!rec && !sap) continue
    const umSap = catalogo[cod].unidad
    const stockLab = aSapUnidad(rec?.stockAvailable || 0, umSap)
    const noEnviados = aSapUnidad(rec?.unsyncQuantity || 0, umSap)
    filas.push({
      material: cod,
      descripcion: rec?.item?.name || catalogo[cod].nombre,
      unidad: INV_UM_SAP_DISPLAY[umSap] || umSap,
      stockSap: r2(sap), stockLab: r2(stockLab), consumosNoEnviados: r2(noEnviados),
      diferencia: r2(sap - stockLab - noEnviados),
    })
  }
  // Materiales del lab que no existen en el catalogo SAP: stock SAP estimado, sin diferencia
  for (const [cod, rec] of Object.entries(labPorCodigo)) {
    if (catalogo[cod]) continue
    const umApi = String(rec.item?.baseUnitMsrAb || '').toUpperCase()
    const stockLab = aSapUnidad(rec.stockAvailable || 0, umApi)
    const noEnviados = aSapUnidad(rec.unsyncQuantity || 0, umApi)
    filas.push({
      material: cod, descripcion: rec.item?.name || '', unidad: INV_UM_SAP_DISPLAY[umApi] || umApi,
      stockSap: r2(stockLab + noEnviados), stockLab: r2(stockLab), consumosNoEnviados: r2(noEnviados), diferencia: 0,
    })
  }
  filas.sort((a, b) => a.material.localeCompare(b.material))
  return {
    subsidiaryId: lab.subsidiaryId, nombre: lab.nombre, almacen: lab.almacen,
    ciclo: ciclo?.codigo || null, sinProduccion: !ciclo || !registros.length,
    conDiferencia: filas.filter(f => f.diferencia !== 0).length, filas,
  }
}

function invNumero(v) {
  const r = Math.round((v || 0) * 1000) / 1000
  const [entero, dec] = Math.abs(r).toFixed(3).split('.')
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const texto = dec === '000' ? conMiles : `${conMiles}.${dec}`
  return r < 0 ? `-${texto}` : texto
}

function invTablaHtmlLaboratorio(lab) {
  const abrev = lab.nombre.replace('Larviquest ', 'LQ')
  const TD = 'padding:10px 14px; border:1px solid #ddd; font-size:14px; font-weight:bold;'
  const TDR = TD + ' text-align:right;'
  const TDC = TD + ' text-align:center;'

  if (lab.sinProduccion) {
    return `
    <div style="margin-bottom:28px;">
      <div style="background:#2F2F2F; padding:12px 18px; border-radius:4px 4px 0 0; text-align:center;">
        <b style="color:#FFFFFF; font-size:17px; letter-spacing:1px;">${abrev}</b>
      </div>
      <div style="border:1px solid #ddd; border-top:none; padding:16px; background:#FAFAFA; border-radius:0 0 4px 4px; text-align:center;">
        <p style="margin:0; font-size:14px; font-weight:bold; color:#888; font-style:italic;">
          Ciclo en fase de secado — sin producción activa
        </p>
      </div>
    </div>`
  }

  let totalSap = 0, totalLab = 0, totalNoEnv = 0, totalDif = 0
  const filas = lab.filas.map((f, i) => {
    totalSap += f.stockSap; totalLab += f.stockLab; totalNoEnv += f.consumosNoEnviados; totalDif += f.diferencia
    const bg = i % 2 === 0 ? '#F0F4F8' : '#FFFFFF'
    const tdDif = f.diferencia !== 0 ? TD + ' color:#C00000;' : TD
    return `
        <tr style="background:${bg};">
            <td style="${TD}">${f.material}</td>
            <td style="${TD} white-space:nowrap;">${f.descripcion}</td>
            <td style="${TDC}">${f.unidad}</td>
            <td style="${TDR}">${invNumero(f.stockSap)}</td>
            <td style="${TDR}">${invNumero(f.stockLab)}</td>
            <td style="${TDR}">${invNumero(f.consumosNoEnviados)}</td>
            <td style="${tdDif} text-align:right;">${invNumero(f.diferencia)}</td>
        </tr>`
  }).join('')

  const TT = 'padding:11px 14px; border:1px solid #163a5f; font-size:15px; font-weight:bold; text-align:right; background:#1F4E79; color:#FFFFFF;'
  const totalRow = `
        <tr>
            <td style="${TT} text-align:center; min-width:110px;">TOTAL</td>
            <td style="${TT} min-width:320px;"></td>
            <td style="${TT} min-width:55px;"></td>
            <td style="${TT} min-width:110px;">${invNumero(totalSap)}</td>
            <td style="${TT} min-width:140px;">${invNumero(totalLab)}</td>
            <td style="${TT} min-width:160px;">${invNumero(totalNoEnv)}</td>
            <td style="${TT} min-width:110px; color:#FFD700;">${invNumero(totalDif)}</td>
        </tr>`

  const TH = 'padding:11px 14px; border:1px solid #1a5c9e; font-size:14px; text-align:center;'
  return `
    <div style="margin-bottom:32px;">
      <div style="background:#1F4E79; padding:14px 18px; border-radius:4px 4px 0 0; text-align:center;">
        <b style="color:#FFFFFF; font-size:18px; letter-spacing:2px;">${abrev}</b>
      </div>
      <table style="width:100%; border-collapse:collapse; border:1px solid #ddd; border-top:none; table-layout:fixed;">
        <colgroup>
          <col style="width:11%;"><col style="width:33%;"><col style="width:5%;">
          <col style="width:12%;"><col style="width:14%;"><col style="width:14%;"><col style="width:11%;">
        </colgroup>
        <thead>
          <tr style="background:#2E75B6; color:#FFFFFF;">
            <th style="${TH}">Material</th>
            <th style="${TH}">Descripción del material</th>
            <th style="${TH}">UM</th>
            <th style="${TH}">Stock SAP</th>
            <th style="${TH}">Stock Laboratorio</th>
            <th style="${TH}">Consumos no Enviados</th>
            <th style="${TH}">Diferencias</th>
          </tr>
        </thead>
        <tbody>${filas}${totalRow}</tbody>
      </table>
    </div>`
}

function invConstruirInformeHtml(laboratorios, fecha) {
  const tablas = laboratorios.map(invTablaHtmlLaboratorio).join('')
  return `
<div style="font-family:Arial, sans-serif; width:100%;">
  <div style="background:#1a1a2e; padding:22px 24px; border-radius:6px 6px 0 0; margin-bottom:24px; text-align:center;">
    <h2 style="color:#FFFFFF; margin:0; font-size:20px; font-weight:bold; letter-spacing:2px;">
      CONTROL DE BODEGAS DE PRODUCCION LABORATORIOS
    </h2>
    <p style="color:#8AB8D8; margin:8px 0 0; font-size:14px; font-weight:bold;">Fecha: ${fecha}</p>
  </div>
  ${tablas}
</div>`
}

async function invSmtpLeerRespuesta(reader, bufRef) {
  const decoder = new TextDecoder()
  while (true) {
    const nl = bufRef.value.indexOf('\r\n')
    if (nl === -1) {
      const { value, done } = await reader.read()
      if (done) return null
      bufRef.value += decoder.decode(value, { stream: true })
      continue
    }
    const linea = bufRef.value.slice(0, nl)
    bufRef.value = bufRef.value.slice(nl + 2)
    if (/^\d{3}-/.test(linea)) continue
    return linea
  }
}

// Office 365 (smtp.office365.com:587) exige STARTTLS: se conecta en claro,
// se sube a TLS a mitad de la conversacion con socket.startTls().
async function invEnviarCorreoSmtp(env, destinatarios, asunto, html) {
  const usuario = env.CORREO_EMPRESA_USER
  const clave = env.CORREO_EMPRESA_PASS
  if (!usuario || !clave) throw new Error('SMTP no configurado (faltan secrets CORREO_EMPRESA_USER/CORREO_EMPRESA_PASS)')

  let socket = connect({ hostname: 'smtp.office365.com', port: 587 }, { secureTransport: 'starttls' })
  let writer = socket.writable.getWriter()
  let reader = socket.readable.getReader()
  const bufRef = { value: '' }
  const enc = (s) => new TextEncoder().encode(s)
  const leer = () => invSmtpLeerRespuesta(reader, bufRef)
  const comando = async (texto, prefijoEsperado) => {
    await writer.write(enc(texto + '\r\n'))
    const resp = await leer()
    if (prefijoEsperado && (!resp || !prefijoEsperado.some(p => resp.startsWith(p)))) {
      throw new Error(`SMTP error en "${texto.split(' ')[0]}": ${resp}`)
    }
    return resp
  }

  try {
    await leer() // 220 saludo
    await comando('EHLO naturisa.app', ['250'])
    await comando('STARTTLS', ['220'])

    socket = socket.startTls()
    writer = socket.writable.getWriter()
    reader = socket.readable.getReader()
    bufRef.value = ''

    await comando('EHLO naturisa.app', ['250'])
    await comando('AUTH LOGIN', ['334'])
    await comando(btoa(usuario), ['334'])
    await comando(btoa(clave), ['235'])
    await comando(`MAIL FROM:<${usuario}>`, ['250'])
    for (const d of destinatarios) await comando(`RCPT TO:<${d}>`, ['250', '251'])
    await comando('DATA', ['354'])
    const cuerpoStuffed = html.replace(/\r?\n\./g, '\n..')
    const mensaje =
      `From: Naturisa <${usuario}>\r\n` +
      `To: ${destinatarios.join(', ')}\r\n` +
      `Subject: ${asunto}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\n` +
      `\r\n${cuerpoStuffed}\r\n.`
    await comando(mensaje, ['250'])
    await writer.write(enc('QUIT\r\n'))
  } finally {
    try { await writer.close() } catch {}
  }
}

async function handleDbInventarioLaboratorios(request, env) {
  if (request.method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}))
      const destinatarios = Array.isArray(body.destinatarios)
        ? body.destinatarios.map(d => String(d).trim()).filter(Boolean)
        : []
      if (!destinatarios.length) return corsResponse('{"error":"faltan destinatarios"}', 400, request)

      const catalogo = await invLabCatalogo(request, env)
      const codigosBase = Object.keys(catalogo).filter(c => INV_LAB_TIPOS_ITEM.includes(catalogo[c].itemTypeId))
      const laboratorios = await Promise.all(INV_LAB_LABORATORIOS.map(lab => invLabLaboratorio(request, lab, catalogo, codigosBase)))
      const fecha = ecuadorNowISO().slice(0, 10)
      const html = invConstruirInformeHtml(laboratorios, fecha)
      await invEnviarCorreoSmtp(env, destinatarios, `Control de Bodegas de Produccion Laboratorios — ${fecha}`, html)
      return corsResponse('{"ok":true}', 200, request)
    } catch (e) {
      const status = e.status === 401 ? 401 : 502
      return corsResponse(JSON.stringify({ error: String(e.message || e) }), status, request)
    }
  }
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  try {
    const catalogo = await invLabCatalogo(request, env)
    const codigosBase = Object.keys(catalogo).filter(c => INV_LAB_TIPOS_ITEM.includes(catalogo[c].itemTypeId))
    const laboratorios = await Promise.all(INV_LAB_LABORATORIOS.map(lab => invLabLaboratorio(request, lab, catalogo, codigosBase)))
    return corsResponse(JSON.stringify({ laboratorios, generado: new Date().toISOString() }), 200, request)
  } catch (e) {
    const status = e.status === 401 ? 401 : 502
    return corsResponse(JSON.stringify({ error: String(e.message || e) }), status, request)
  }
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
    const conPoligono = url.searchParams.get('poligono') === '1'
    const cols = conPoligono
      ? 'id_piscina, nombre, codigo_piscina, tamano, id_sucursal, tipo, estado, poligono, actualizado_en'
      : 'id_piscina, nombre, codigo_piscina, tamano, id_sucursal, tipo, estado, actualizado_en'
    const stmt = idSucursal
      ? env.db.prepare(`SELECT ${cols} FROM piscinas WHERE id_sucursal = ? ORDER BY nombre`).bind(idSucursal)
      : env.db.prepare(`SELECT ${cols} FROM piscinas ORDER BY nombre`)
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

// â”€â”€ Consumo de balanceado (AP1 feeding_general por piscina/dia) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Consumo de insumos (Excel SAP subido en consumos-insumos.html) â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET  /db/consumo-insumos?idCiclo=<id>&ordenControl=<orden>  -> lista consumo
// POST /db/consumo-insumos/sync                                -> upsert masivo

async function handleDbConsumoInsumos(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idCiclo     = url.searchParams.get('idCiclo')
  const ordenControl = url.searchParams.get('ordenControl')
  const anio        = url.searchParams.get('anio')
  const conds = []
  const binds = []
  if (idCiclo)      { conds.push('id_ciclo = ?');          binds.push(idCiclo) }
  if (ordenControl) { conds.push('orden_control = ?');      binds.push(ordenControl) }
  if (anio)         { conds.push("strftime('%Y', fecha) = ?"); binds.push(String(anio)) }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : ''
  const stmt = env.db.prepare(`SELECT * FROM consumo_insumos${where} ORDER BY fecha`).bind(...binds)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

// ── Ha manuales históricas (D1: tabla ha_manual) ─────────────────────────────
// GET  /db/ha-manual            -> {data:[{camp_code,mes,ha},...]}
// POST /db/ha-manual/sync       -> upsert masivo, body {filas:[{camp_code,mes,ha},...]}
// Reemplaza el _HA_SEED/localStorage de la web con D1 como fuente única.

async function handleDbHaManual(request, env) {
  await env.db.prepare(
    `CREATE TABLE IF NOT EXISTS ha_manual (camp_code TEXT NOT NULL, mes TEXT NOT NULL, ha REAL NOT NULL, PRIMARY KEY (camp_code, mes))`
  ).run()
  if (request.method === 'GET') {
    const { results } = await env.db.prepare('SELECT camp_code, mes, ha FROM ha_manual ORDER BY mes, camp_code').all()
    return corsResponse(JSON.stringify({ data: results }), 200, request)
  }
  if (request.method === 'POST') {
    const body = await request.json()
    const filas = Array.isArray(body?.filas) ? body.filas : []
    if (!filas.length) return corsResponse('{"error":"body.filas vacio"}', 400, request)
    const stmt = env.db.prepare(
      `INSERT INTO ha_manual (camp_code, mes, ha) VALUES (?, ?, ?) ON CONFLICT(camp_code, mes) DO UPDATE SET ha = excluded.ha`
    )
    await env.db.batch(filas.map(f => stmt.bind(f.camp_code, f.mes, f.ha)))
    return corsResponse(JSON.stringify({ ok: true, n: filas.length }), 200, request)
  }
  return corsResponse('{"error":"method not allowed"}', 405, request)
}

// GET /db/tendencias?anio=2026&idSucursal=13
// Devuelve consumo agrupado por mes con costo, ha, costoHaDia (÷30).
// Misma lógica que la web (Tendencias tab): Ha manual para meses históricos, Ha de ciclos para resto.
async function handleDbTendencias(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const anio       = url.searchParams.get('anio') || String(new Date().getFullYear())
  const idSucursal = url.searchParams.get('idSucursal')
  const todos      = url.searchParams.get('todos') === '1'  // devuelve datos por sucursal

  // Mes actual en formato "YYYY-MM" (Ecuador = UTC-5)
  const nowEC   = new Date(Date.now() - 5 * 3600 * 1000)
  const curMes  = nowEC.toISOString().slice(0, 7)

  // 1. Ciclos para obtener tamano_piscina, nombre_piscina y código (para mapear a HA_SEED)
  const cicloWhere = idSucursal ? 'WHERE id_sucursal = ?' : ''
  const cicloBinds = idSucursal ? [idSucursal] : []
  const { results: cicloRows } = await env.db
    .prepare(`SELECT id_ciclo, nombre_piscina, tamano_piscina, id_sucursal, codigo_ciclo FROM ciclos ${cicloWhere}`)
    .bind(...cicloBinds).all()

  // Mapa id_ciclo → { pool, ha, subId, campCode }
  // campCode = prefijo del codigo_ciclo antes del primer "-" (ej. "A1" de "A1-2026-001")
  const cicloInfo = {}
  cicloRows.forEach(c => {
    if (!c.id_ciclo) return
    const campCode = (c.codigo_ciclo || '').split('-')[0] || ''
    cicloInfo[c.id_ciclo] = {
      pool:     c.nombre_piscina || String(c.id_ciclo),
      ha:       parseFloat(c.tamano_piscina) || 0,
      subId:    String(c.id_sucursal),
      campCode,
    }
  })

  // Si filtramos por sucursal, id_ciclo válidos
  const cicloSubSet = idSucursal
    ? new Set(cicloRows.filter(c => String(c.id_sucursal) === String(idSucursal)).map(c => c.id_ciclo))
    : null

  // 2. Consumos del año — igual que la web: tipo_movimiento 261 menos anulaciones 262
  const { results: allConsumos } = await env.db
    .prepare(`SELECT id_ciclo, importe, fecha, tipo_movimiento, orden_control, codigo_material, almacen, cantidad FROM consumo_insumos WHERE strftime('%Y', fecha) = ? ORDER BY fecha`)
    .bind(String(anio)).all()

  const canceladas = {}
  allConsumos.forEach(r => {
    if (String(r.tipo_movimiento || '').trim() === '262') {
      const k = (r.orden_control||'') + '||' + (r.codigo_material||'') + '||' + (r.almacen||'') + '||' + Math.abs(parseFloat(r.cantidad)||0).toFixed(4)
      canceladas[k] = (canceladas[k] || 0) + 1
    }
  })
  const consumos = allConsumos.filter(r => {
    if (String(r.tipo_movimiento || '').trim() !== '261') return false
    const k = (r.orden_control||'') + '||' + (r.codigo_material||'') + '||' + (r.almacen||'') + '||' + Math.abs(parseFloat(r.cantidad)||0).toFixed(4)
    if (canceladas[k] > 0) { canceladas[k]--; return false }
    return true
  })

  // 3. Ha histórica de D1 (tabla historial_ha — fuente única para web y app)
  const haHistWhere = idSucursal ? 'WHERE id_sucursal = ? AND anio = ?' : 'WHERE anio = ?'
  const haHistBinds = idSucursal ? [idSucursal, parseInt(anio)] : [parseInt(anio)]
  const { results: haHistRows } = await env.db
    .prepare(`SELECT id_sucursal, mes, ha FROM historial_ha ${haHistWhere}`)
    .bind(...haHistBinds).all()
  // haByMes: para cuando filtramos por sucursal, simple { mes(1-12): ha }
  // haBySubMes: para todos los campamentos { "subId-mes": ha }
  const haByMes = {}
  const haBySubMes = {}
  haHistRows.forEach(r => {
    haByMes[r.mes] = r.ha
    haBySubMes[String(r.id_sucursal) + '-' + r.mes] = r.ha
  })

  // 4. Agrupar consumos por mes (y por sucursal si todos=1)
  const meses = {}
  consumos.forEach(r => {
    const info = cicloInfo[r.id_ciclo]
    if (!info) return
    if (cicloSubSet && !cicloSubSet.has(r.id_ciclo)) return
    const mes = (r.fecha || '').slice(0, 7)
    if (!mes || mes.length < 7) return
    const key = todos ? info.subId + '|' + mes : mes
    if (!meses[key]) meses[key] = { mes, subId: info.subId, costo: 0, pools: {}, subIds: new Set() }
    meses[key].costo += r.importe || 0
    meses[key].pools[info.pool] = { ha: info.ha, subId: info.subId }
    meses[key].subIds.add(info.subId)
  })

  // 5. Calcular Ha y $/Ha/día
  const data = Object.values(meses).sort((a, b) => {
    const ka = (todos ? a.subId + '|' : '') + a.mes
    const kb = (todos ? b.subId + '|' : '') + b.mes
    return ka.localeCompare(kb)
  }).map(v => {
    const mo = parseInt(v.mes.split('-')[1])
    let ha
    if (v.mes < curMes) {
      if (idSucursal) {
        ha = haByMes[mo] || 0
      } else if (todos) {
        ha = haBySubMes[v.subId + '-' + mo] || 0
        if (!ha) ha = Object.values(v.pools).reduce((s, p) => s + p.ha, 0)
      } else {
        let total = 0
        v.subIds.forEach(sid => { total += haBySubMes[sid + '-' + mo] || 0 })
        ha = total || Object.values(v.pools).reduce((s, p) => s + p.ha, 0)
      }
    } else {
      ha = Object.values(v.pools).reduce((s, p) => s + p.ha, 0)
    }
    const row = { mes: v.mes, costo: v.costo, ha, costoHaDia: ha > 0 ? v.costo / (ha * 30) : 0 }
    if (todos) row.id_sucursal = parseInt(v.subId) || v.subId
    return row
  })

  return corsResponse(JSON.stringify({ data }), 200, request)
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

// â”€â”€ Consumo de combustible (Excel SAP subido en consumos-combustible.html) â”€
// GET  /db/consumo-combustible?anio=<yyyy>&ordenControl=<orden>&centroCosto=<cc>  -> lista consumo
// POST /db/consumo-combustible/sync                                                -> upsert masivo

async function handleDbConsumoCombustible(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const anio         = url.searchParams.get('anio')
  const ordenControl = url.searchParams.get('ordenControl')
  const centroCosto  = url.searchParams.get('centroCosto')
  const conds = []
  const binds = []
  if (anio)         { conds.push("strftime('%Y', fecha) = ?"); binds.push(String(anio)) }
  if (ordenControl) { conds.push('orden_control = ?');          binds.push(ordenControl) }
  if (centroCosto)  { conds.push('centro_costo = ?');           binds.push(centroCosto) }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : ''
  const stmt = env.db.prepare(`SELECT * FROM consumo_combustible${where} ORDER BY fecha`).bind(...binds)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbConsumoCombustibleSync(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const body = await request.json()
  const filas    = Array.isArray(body?.filas) ? body.filas : []
  const eliminar = Array.isArray(body?.eliminar) ? body.eliminar.filter(Boolean) : []
  if (!filas.length && !eliminar.length) return corsResponse('{"error":"body.filas/eliminar vacio"}', 400, request)

  const now = ecuadorNowISO()
  const batch = []

  if (eliminar.length) {
    // Depura pares consumo/anulacion (201/261 <-> 202/262) que ya se hubieran guardado antes:
    // solo deben persistir movimientos de consumo puro, sin su anulacion correspondiente.
    // D1 limita los parametros por consulta (100) - se trocea el IN(...) para no excederlo.
    const DEL_CHUNK = 100
    for (let i = 0; i < eliminar.length; i += DEL_CHUNK) {
      const trozo = eliminar.slice(i, i + DEL_CHUNK)
      const placeholders = trozo.map(() => '?').join(',')
      batch.push(env.db.prepare(`DELETE FROM consumo_combustible WHERE clave IN (${placeholders})`).bind(...trozo))
    }
  }

  if (filas.length) {
    const stmt = env.db.prepare(
      `INSERT INTO consumo_combustible (clave, centro_costo, descripcion, almacen, fecha, cantidad, unidad,
         importe, documento_material, clase_movimiento, posicion_doc, usuario, texto_cabecera, orden_control,
         actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(clave) DO UPDATE SET
         centro_costo = excluded.centro_costo, descripcion = excluded.descripcion, almacen = excluded.almacen,
         fecha = excluded.fecha, cantidad = excluded.cantidad, unidad = excluded.unidad, importe = excluded.importe,
         documento_material = excluded.documento_material, clase_movimiento = excluded.clase_movimiento,
         posicion_doc = excluded.posicion_doc, usuario = excluded.usuario, texto_cabecera = excluded.texto_cabecera,
         orden_control = excluded.orden_control, actualizado_en = excluded.actualizado_en`
    )
    filas.filter(f => f.clave).forEach(f =>
      batch.push(stmt.bind(f.clave, f.centroCosto || null, f.descripcion || null, f.almacen || null, f.fecha || null,
        f.cantidad ?? null, f.unidad || null, f.importe ?? null, f.documentoMaterial || null,
        f.claseMovimiento || null, f.posicionDoc || null, f.usuario || null, f.textoCabecera || null,
        f.ordenControl || null, now)))
  }

  if (batch.length) await env.db.batch(batch)
  return corsResponse(JSON.stringify({ ok: true, count: filas.length, deleted: eliminar.length }), 200, request)
}

// GET /db/centro-costo -> lista completa de centros de costo (Data Maestra, cacheada en D1)
async function handleDbCentroCosto(request, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const { results } = await env.db.prepare('SELECT * FROM centro_costo ORDER BY codigo').all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

// GET  /db/centro-costo-reparto -> [{codigo, sucursales: "19,20,21", usuario, actualizado_en}]
// POST /db/centro-costo-reparto -> body {codigo, sucursales: [ids], usuario}; lista vacia = se borra
// Campamentos entre los que se reparte (segun sus Ha) el costo de un centro de costo.
async function handleDbCentroCostoReparto(request, env) {
  if (request.method === 'GET') {
    const { results } = await env.db.prepare('SELECT * FROM centro_costo_reparto ORDER BY codigo').all()
    return corsResponse(JSON.stringify({ data: results }), 200, request)
  }
  if (request.method === 'POST') {
    const body = await request.json().catch(() => null)
    const codigo = String(body?.codigo || '').trim()
    if (!codigo) return corsResponse('{"error":"falta codigo"}', 400, request)
    const ids = (Array.isArray(body.sucursales) ? body.sucursales : [])
      .map(x => parseInt(x, 10)).filter(x => Number.isFinite(x))
    if (!ids.length) {
      await env.db.prepare('DELETE FROM centro_costo_reparto WHERE codigo = ?').bind(codigo).run()
      return corsResponse('{"ok":true,"borrado":true}', 200, request)
    }
    await env.db.prepare(
      `INSERT INTO centro_costo_reparto (codigo, sucursales, usuario, actualizado_en) VALUES (?, ?, ?, ?)
       ON CONFLICT(codigo) DO UPDATE SET sucursales = excluded.sucursales, usuario = excluded.usuario,
         actualizado_en = excluded.actualizado_en`
    ).bind(codigo, [...new Set(ids)].join(','), String(body.usuario || '') || null, ecuadorNowISO()).run()
    return corsResponse('{"ok":true}', 200, request)
  }
  return corsResponse('{"error":"method not allowed"}', 405, request)
}

// GET  /db/centro-costo-estructura       -> estructura de centros de costo (KS13)
// POST /db/centro-costo-estructura/sync  -> body {filas: [...], reemplazar: bool}
//      reemplazar=true (primer lote) borra la tabla antes de insertar; los siguientes lotes agregan.
async function handleDbCentroCostoEstructura(request, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const { results } = await env.db.prepare('SELECT * FROM centro_costo_estructura ORDER BY codigo').all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}
async function handleDbCentroCostoEstructuraSync(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const body = await request.json().catch(() => null)
  const filas = Array.isArray(body?.filas) ? body.filas.filter(f => f && f.codigo) : []
  const now = ecuadorNowISO()
  const batch = []
  if (body?.reemplazar) batch.push(env.db.prepare('DELETE FROM centro_costo_estructura'))
  const stmt = env.db.prepare(
    `INSERT OR REPLACE INTO centro_costo_estructura (codigo, nombre, sociedad, area, zona, cluster, grupo, finca,
       operacion, grupo_ceco, campamentos, bloqueado, registrado, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const t = v => (v === undefined || v === null || v === '') ? null : String(v)
  filas.forEach(f => batch.push(stmt.bind(String(f.codigo), t(f.nombre), t(f.sociedad), t(f.area), t(f.zona), t(f.cluster),
    t(f.grupo), t(f.finca), t(f.operacion), t(f.grupoCeco), t(f.campamentos), f.bloqueado ? 1 : 0, t(f.registrado), now)))
  if (batch.length) await env.db.batch(batch)
  return corsResponse(JSON.stringify({ ok: true, filas: filas.length }), 200, request)
}

// GET  /db/combustible-tipo-equipo -> [{nombre, tipo, usuario, actualizado_en}]
// POST /db/combustible-tipo-equipo -> body {nombre, tipo, usuario}; tipo vacio = se borra (vuelve al de la estructura)
async function handleDbCombustibleTipoEquipo(request, env) {
  if (request.method === 'GET') {
    const { results } = await env.db.prepare('SELECT * FROM combustible_tipo_equipo ORDER BY nombre').all()
    return corsResponse(JSON.stringify({ data: results }), 200, request)
  }
  if (request.method === 'POST') {
    const body = await request.json().catch(() => null)
    const nombre = String(body?.nombre || '').trim()
    const tipo = String(body?.tipo || '').trim()
    if (!nombre) return corsResponse('{"error":"falta nombre"}', 400, request)
    if (!tipo) {
      await env.db.prepare('DELETE FROM combustible_tipo_equipo WHERE nombre = ?').bind(nombre).run()
      return corsResponse('{"ok":true,"borrado":true}', 200, request)
    }
    await env.db.prepare(
      `INSERT INTO combustible_tipo_equipo (nombre, tipo, usuario, actualizado_en) VALUES (?, ?, ?, ?)
       ON CONFLICT(nombre) DO UPDATE SET tipo = excluded.tipo, usuario = excluded.usuario, actualizado_en = excluded.actualizado_en`
    ).bind(nombre, tipo, String(body.usuario || '') || null, ecuadorNowISO()).run()
    return corsResponse('{"ok":true}', 200, request)
  }
  return corsResponse('{"error":"method not allowed"}', 405, request)
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

// â”€â”€ Calibracion de alimento (a, b, R2) por piscina â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Clima (coordenadas + pronostico) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// GET /db/balanceado-tipos -> catalogo de productos de balanceado (INICIADOR/ENGORDE)
async function handleDbBalanceadoTipos(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const { results } = await env.db.prepare('SELECT * FROM balanceado_tipos ORDER BY tipo, nombre_producto').all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

// GET /db/muelles -> coordenadas de los muelles (embarcaderos)
async function handleDbMuelles(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const { results } = await env.db.prepare('SELECT * FROM muelles ORDER BY nombre').all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

// GET /db/tiempo-recorrido-muelles -> tiempo estimado entre cada par de muelles
// (gabarra cargada con balanceado), opcional ?origen=X&destino=Y (en cualquier orden)
async function handleDbTiempoRecorridoMuelles(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const origen = url.searchParams.get('origen')
  const destino = url.searchParams.get('destino')
  let stmt
  if (origen && destino) {
    stmt = env.db.prepare(
      'SELECT * FROM tiempo_recorrido_muelles WHERE (origen = ? AND destino = ?) OR (origen = ? AND destino = ?)'
    ).bind(origen, destino, destino, origen)
  } else {
    stmt = env.db.prepare('SELECT * FROM tiempo_recorrido_muelles ORDER BY origen, destino')
  }
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

// â”€â”€ INAMHI (fuente oficial de Ecuador) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Solo publica el pronostico oficial del dia actual, por 26 localidades
// (cabeceras provinciales). Cada sucursal se empareja con la localidad INAMHI
// mas cercana (distancia euclidiana simple, suficiente a esta escala).
const INAMHI_URL = 'https://inamhi.gob.ec/api_pronos/forecast/daily_forecast/list_by_date_now/'
const INAMHI_URL_LOCALIDAD = 'https://inamhi.gob.ec/api_pronos/forecast/daily_forecast/list_by_locality_from_date/'
const INAMHI_HORA_POR_PERIODO = { 'Madrugada': '00:00', 'MaÃ±ana': '06:00', 'Tarde': '12:00', 'Noche': '18:00' }

function localidadMasCercana(lat, lon, localidades) {
  let mejor = null, mejorDist = Infinity
  for (const loc of localidades) {
    const d = (loc.latitude - lat) ** 2 + (loc.longitude - lon) ** 2
    if (d < mejorDist) { mejorDist = d; mejor = loc }
  }
  return mejor
}

// INAMHI solo da hoy + maÃ±ana (2 dias) por localidad, via list_by_locality_from_date.
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

// â”€â”€ Marea (Open-Meteo Marine API, un solo endpoint sirve historico y pronostico) â”€â”€
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

// â”€â”€ Marea por muelle (Open-Meteo Marine API) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GET  /db/marea-muelle?muelle=&fecha=&hora=      -> lista marea por muelle
// POST /db/marea-muelle/refrescar?desde=&hasta=   -> trae/actualiza marea para ese rango
// A diferencia de `marea` (por sucursal), esta usa las coordenadas propias de
// cada muelle (tabla `muelles`) - asi Cargill, Brisas, etc. tambien tienen marea,
// no solo las 6 sucursales costeras.
async function refrescarMareaMuelle(env, startDate, endDate) {
  const { results: muelles } = await env.db.prepare('SELECT nombre, latitud, longitud FROM muelles').all()
  if (!muelles.length) return 0

  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO marea_muelle (muelle, fecha, hora, altura_marea_m, altura_ola_m, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(muelle, fecha, hora) DO UPDATE SET
       altura_marea_m = excluded.altura_marea_m, altura_ola_m = excluded.altura_ola_m,
       actualizado_en = excluded.actualizado_en`
  )

  let totalFilas = 0
  const CONCURRENCIA = 8
  for (let i = 0; i < muelles.length; i += CONCURRENCIA) {
    const lote = muelles.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(m => {
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${m.latitud}&longitude=${m.longitud}` +
        `&hourly=sea_level_height_msl,wave_height&start_date=${startDate}&end_date=${endDate}&timezone=America/Guayaquil`
      return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)
    }))
    const batch = []
    resultados.forEach((json, idx) => {
      const muelle = lote[idx].nombre
      const h = json?.hourly
      if (!h?.time) return
      h.time.forEach((timestamp, i2) => {
        const [fecha, hora] = timestamp.split('T')
        batch.push(stmt.bind(muelle, fecha, hora, h.sea_level_height_msl?.[i2] ?? null, h.wave_height?.[i2] ?? null, now))
      })
    })
    const CHUNK = 3000
    for (let j = 0; j < batch.length; j += CHUNK) {
      await env.db.batch(batch.slice(j, j + CHUNK))
      totalFilas += Math.min(CHUNK, batch.length - j)
    }
  }
  return totalFilas
}

async function handleDbMareaMuelle(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const muelle = url.searchParams.get('muelle')
  const fecha = url.searchParams.get('fecha')
  const hora = url.searchParams.get('hora')
  const conds = []
  const binds = []
  if (muelle) { conds.push('muelle = ?'); binds.push(muelle) }
  if (fecha) { conds.push('fecha = ?'); binds.push(fecha) }
  if (hora) { conds.push('hora = ?'); binds.push(hora) }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : ''
  const stmt = env.db.prepare(`SELECT * FROM marea_muelle${where} ORDER BY muelle, fecha, hora`).bind(...binds)
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbMareaMuelleRefrescar(request, url, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const hoy = ecuadorNowISO().slice(0, 10)
  const en15dias = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  const startDate = url.searchParams.get('desde') || '2025-01-01'
  const endDate = url.searchParams.get('hasta') || en15dias
  try {
    const n = await refrescarMareaMuelle(env, startDate, endDate)
    return corsResponse(JSON.stringify({ ok: true, desde: startDate, hasta: endDate, filas: n }), 200, request)
  } catch (e) {
    return corsResponse(JSON.stringify({ error: String(e) }), 500, request)
  }
}

async function recalcularMareaMuelleExtremos(env) {
  const { results } = await env.db.prepare(`
    WITH serie AS (
      SELECT muelle, fecha, hora, altura_marea_m,
        LAG(altura_marea_m) OVER (PARTITION BY muelle ORDER BY fecha, hora) AS prev,
        LEAD(altura_marea_m) OVER (PARTITION BY muelle ORDER BY fecha, hora) AS next
      FROM marea_muelle
      WHERE altura_marea_m IS NOT NULL
    )
    SELECT muelle, fecha, hora,
      CASE WHEN altura_marea_m > prev AND altura_marea_m > next THEN 'ALTA'
           WHEN altura_marea_m < prev AND altura_marea_m < next THEN 'BAJA' END AS tipo
    FROM serie
    WHERE prev IS NOT NULL AND next IS NOT NULL
      AND ((altura_marea_m > prev AND altura_marea_m > next) OR (altura_marea_m < prev AND altura_marea_m < next))
  `).all()

  await env.db.prepare('UPDATE marea_muelle SET tipo_pico = NULL').run()
  const stmt = env.db.prepare(
    `UPDATE marea_muelle SET tipo_pico = ? WHERE muelle = ? AND fecha = ? AND hora = ?`
  )
  const CHUNK = 500
  let total = 0
  for (let i = 0; i < results.length; i += CHUNK) {
    const lote = results.slice(i, i + CHUNK)
    await env.db.batch(lote.map(r => stmt.bind(r.tipo, r.muelle, r.fecha, r.hora)))
    total += lote.length
  }
  return total
}

async function handleDbMareaMuelleExtremos(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const muelle = url.searchParams.get('muelle')
  const stmt = muelle
    ? env.db.prepare('SELECT * FROM marea_muelle WHERE muelle = ? AND tipo_pico IS NOT NULL ORDER BY fecha, hora').bind(muelle)
    : env.db.prepare('SELECT * FROM marea_muelle WHERE tipo_pico IS NOT NULL ORDER BY muelle, fecha, hora')
  const { results } = await stmt.all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbMareaMuelleExtremosRecalcular(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  try {
    const n = await recalcularMareaMuelleExtremos(env)
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

// â”€â”€ Refresco automatico desde AP1 (cron) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        // Agregar ciclos en seco (pre-cría) de piscinas activas que no aparecen en cycle_sowing_report
        if (det.idCycle && !porCycleId.has(det.idCycle) && (poolRow.status === 'ACTIVO' || det.status === 'SECA')) {
          const subCod  = (sub.codigo || '').toUpperCase()
          const poolOrd = String(poolRow.poolOrder || '').padStart(4, '0')
          const cycNum  = String(det.cycleNumber || '').padStart(4, '0')
          const cycleCode = (subCod && poolOrd && cycNum) ? `${subCod}-${poolOrd}-${cycNum}` : null
          porCycleId.set(det.idCycle, {
            cycleId: det.idCycle,
            subsidiaryCode: subCod,
            poolName: String(poolRow.poolName || poolRow.name || '').trim(),
            cycleNumber: det.cycleNumber ?? null,
            cycleCode,
            cycleUsage: det.cycleUsage || null,
            dateSowing: null,
            poolSize: poolRow.poolSize ?? null,
          })
        }
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
  const LOTE = 500
  for (let i = 0; i < batch.length; i += LOTE) {
    await env.db.batch(batch.slice(i, i + LOTE))
  }
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

// â”€â”€ PolÃ­gonos del mapa (AP1 /maps/layers por sucursal) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Guarda las coordenadas del polÃ­gono de cada piscina en la columna `poligono`
// de la tabla piscinas, como JSON [[lat,lng], ...].
// Se refresca en el cron liviano cada 6h junto con piscinas/ciclos.

// â”€â”€ Historial de Ha por sucursal (ingreso manual desde consumos-combustible) â”€
// GET  /db/historial-ha?anio=2026              -> filas del aÃ±o
// POST /db/historial-ha/sync                   -> upsert masivo desde _manualHa

async function handleDbHistorialHa(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const anio = url.searchParams.get('anio')
  const where = anio ? 'WHERE anio = ?' : ''
  const binds = anio ? [parseInt(anio)] : []
  const { results } = await env.db.prepare(
    `SELECT codigo_sucursal, id_sucursal, anio, mes, ha, actualizado_en FROM historial_ha ${where} ORDER BY anio, mes, codigo_sucursal`
  ).bind(...binds).all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

async function handleDbHistorialHaSync(request, env) {
  if (request.method !== 'POST') return corsResponse('{"error":"method not allowed"}', 405, request)
  const url = new URL(request.url)
  const overwrite = url.searchParams.get('overwrite') === '1'
  const body = await request.json()
  const filas = Array.isArray(body?.filas) ? body.filas : []
  if (!filas.length) return corsResponse('{"error":"body.filas vacio"}', 400, request)
  const now = ecuadorNowISO()
  const conflict = overwrite
    ? `ON CONFLICT(codigo_sucursal, anio, mes) DO UPDATE SET id_sucursal = excluded.id_sucursal, ha = excluded.ha, actualizado_en = excluded.actualizado_en`
    : `ON CONFLICT(codigo_sucursal, anio, mes) DO NOTHING`
  const stmt = env.db.prepare(
    `INSERT INTO historial_ha (codigo_sucursal, id_sucursal, anio, mes, ha, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?) ${conflict}`
  )
  const batch = filas.filter(f => f.codigoSucursal && f.anio && f.mes).map(f =>
    stmt.bind(f.codigoSucursal, f.idSucursal ?? null, f.anio, f.mes, f.ha, now))
  if (batch.length) await env.db.batch(batch)
  return corsResponse(JSON.stringify({ ok: true, count: batch.length }), 200, request)
}

// Actualiza Ha del mes actual desde piscinas activas. Se llama en cada cron liviano (6h).
// Meses pasados ya tienen su valor fijo (DO NOTHING los protege en el sync del frontend).
// Al cambiar de mes, el nuevo mes empieza a escribirse y el anterior queda congelado.
async function snapshotHaMensual(env) {
  const nowD = new Date(Date.now() - 5 * 60 * 60 * 1000) // Ecuador UTC-5
  const anio = nowD.getUTCFullYear()
  const mes  = nowD.getUTCMonth() + 1
  const { results } = await env.db.prepare(
    `SELECT p.id_sucursal, s.codigo AS codigo_sucursal, SUM(p.tamano) AS ha
     FROM piscinas p
     JOIN sucursales s ON s.id = p.id_sucursal
     WHERE p.tamano IS NOT NULL AND p.tamano > 0 AND p.id_sucursal IS NOT NULL
       AND p.estado = 'ACTIVO'
     GROUP BY p.id_sucursal, s.codigo`
  ).all()
  if (!results.length) return 0
  const nowISO = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO historial_ha (codigo_sucursal, id_sucursal, anio, mes, ha, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(codigo_sucursal, anio, mes) DO UPDATE SET ha = excluded.ha, actualizado_en = excluded.actualizado_en`
  )
  const batch = results.filter(r => r.ha > 0).map(r =>
    stmt.bind(r.codigo_sucursal, r.id_sucursal, anio, mes, r.ha, nowISO))
  if (batch.length) await env.db.batch(batch)
  return batch.length
}

async function refrescarPoligonos(token, env, subsidiarios) {
  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `UPDATE piscinas SET poligono = ?, actualizado_en = ? WHERE codigo_piscina = ?`
  )
  // Una sola peticiÃ³n con todos los SubsidiaryIds (igual que el frontend)
  const qs = subsidiarios.map(s => `SubsidiaryIds=${s.id}`).join('&')
    + '&StageIds=1&StageIds=2&StageIds=3&StageIds=4&StageIds=5'
    + '&UsageIds=9&UsageIds=8&UsageIds=7'
    + '&MinProductionDays=0&MaxProductionDays=1000&MinWeightGrams=0&MaxWeightGrams=10000'
  const json = await fetch(`${API_BASE}/maps/layers?${qs}`, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  }).then(r => r.ok ? r.json() : null).catch(() => null)

  const batch = []
  for (const layer of (json?.data || [])) {
    const coords = layer?.polygon?.coordinates
    if (!layer.poolCode || !Array.isArray(coords) || coords.length < 3) continue
    batch.push(stmt.bind(JSON.stringify(coords), now, layer.poolCode))
  }
  if (batch.length) await env.db.batch(batch)
  return batch.length
}

// â”€â”€ Endpoint GET /db/layers â€” devuelve piscinas con polÃ­gono + ciclo activo â”€
// Une piscinas (poligono) con el ciclo activo/mÃ¡s reciente de cada una.
// ?idSucursal=<id>  filtra por sucursal
async function handleDbLayers(request, url, env) {
  if (request.method !== 'GET') return corsResponse('{"error":"method not allowed"}', 405, request)
  const idSucursal = url.searchParams.get('idSucursal')
  const where = idSucursal ? 'WHERE p.id_sucursal = ?' : ''
  const binds = idSucursal ? [idSucursal] : []
  // Para cada piscina toma el ciclo mÃ¡s reciente (fecha_siembra DESC).
  // Incluye piscinas sin ciclo (LEFT JOIN) con NULLs en los campos del ciclo.
  const { results } = await env.db.prepare(`
    SELECT
      p.codigo_piscina  AS poolCode,
      p.tamano          AS size,
      p.poligono        AS poligono,
      p.id_sucursal     AS idSucursal,
      c.codigo_ciclo    AS cycleCode,
      c.uso_ciclo       AS type,
      c.estado          AS status,
      c.dias_ciclo      AS diasCiclo,
      c.dias_secos      AS diasSecos,
      c.dias_produccion AS diasProduccion,
      c.fecha_inicio    AS fechaInicio,
      c.id_ciclo        AS idCiclo
    FROM piscinas p
    LEFT JOIN ciclos c ON c.nombre_piscina = p.nombre
      AND c.id_sucursal = p.id_sucursal
      AND c.id_ciclo = (
        SELECT id_ciclo FROM ciclos c2
        WHERE c2.nombre_piscina = p.nombre AND c2.id_sucursal = p.id_sucursal
        ORDER BY fecha_siembra DESC LIMIT 1
      )
    ${where}
    ORDER BY p.codigo_piscina
  `).bind(...binds).all()
  return corsResponse(JSON.stringify({ data: results }), 200, request)
}

// Sucursales que se excluyen del refresco automatico de piscinas/ciclos (ej. NC =
// Coaque NC, migrada a CO - sus datos viejos se borraron a mano y no deben volver).
const SUCURSALES_EXCLUIDAS = ['NC']

// â”€â”€ Centros de costo (Data Maestra) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Cada orden de control (endpoint control_order) trae su costCenter asociado -
// se invierte ese mapa para saber, por centro de costo, que orden(es) le pertenecen.
async function fetchOrdenesControlPorCC(token) {
  const url = new URL(GATEWAY + '/bff/web/datamaestra/backoffice/api/general/control_order')
  url.searchParams.append('status', 'ACTIVO')
  url.searchParams.append('PageSize', '20000')
  url.searchParams.append('orderBy', 'companyCodeSap asc')
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } })
  if (!res.ok) return {}
  const json = await res.json()
  const rows = (json?.data && json.data.data) ? json.data.data : (json?.data || [])
  const porCC = {}
  rows.forEach(oc => {
    const ord = String(oc.code || '').trim()
    const cc  = String(oc.costCenter || '').trim()
    if (!ord || !cc) return
    if (!porCC[cc]) porCC[cc] = []
    porCC[cc].push(ord)
  })
  return porCC
}

async function refrescarCentrosCosto(token, env) {
  // ACTIVOS e INACTIVOS (la API toma un solo status por consulta, asi que van dos):
  // hay consumos de combustible cargados a centros de costo que ya se inactivaron, y sin
  // ellos esos consumos quedan sin sucursal en los dashboards. Si un codigo viniera en
  // ambas listas, gana el ACTIVO.
  async function traer(status) {
    const url = new URL(GATEWAY + '/bff/web/datamaestra/backoffice/api/structure/cost_centers')
    url.searchParams.append('status', status)
    url.searchParams.append('PageSize', '5000')
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } })
    if (!res.ok) return null
    const json = await res.json()
    return json?.data || []
  }
  const activos = await traer('ACTIVO')
  if (!activos) return 0
  const inactivos = (await traer('INACTIVO').catch(() => null)) || []
  const vistos = new Set(activos.map(cc => String(cc.code)))
  const rows = activos.concat(inactivos.filter(cc => cc.code && !vistos.has(String(cc.code))))
  const ordenesPorCC = await fetchOrdenesControlPorCC(token).catch(() => ({}))
  const now = ecuadorNowISO()
  const stmt = env.db.prepare(
    `INSERT INTO centro_costo (codigo, nombre, codigo_sucursal, id_compania, orden_control, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(codigo) DO UPDATE SET
       nombre = excluded.nombre, codigo_sucursal = excluded.codigo_sucursal,
       id_compania = excluded.id_compania, orden_control = excluded.orden_control,
       actualizado_en = excluded.actualizado_en`
  )
  const batch = rows.filter(cc => cc.code).map(cc => {
    const ordenes = ordenesPorCC[String(cc.code)] || []
    return stmt.bind(String(cc.code), cc.name || null, cc.subsidiariesCode || cc.prefix || null, cc.companyId ?? null,
      ordenes.length ? ordenes.join(',') : null, now)
  })
  if (batch.length) await env.db.batch(batch)
  return batch.length
}

async function refrescoLiviano(env) {
  const token = await ap1Login(env)
  const todasLasSubsidiarias = await refrescarSucursales(token, env)
  const subsidiarios = todasLasSubsidiarias.filter(s => !SUCURSALES_EXCLUIDAS.includes(s.codigo))
  const nPiscinas = await refrescarPiscinas(token, env, subsidiarios)
  const nPoligonos = await refrescarPoligonos(token, env, subsidiarios).catch(() => 0)
  await snapshotHaMensual(env).catch(() => 0) // actualiza Ha activas del mes actual
  const nCiclos = await refrescarCiclos(token, env, subsidiarios)
  const nPlan = await refrescarPlanCosecha(token, env)
  const nCentrosCosto = await refrescarCentrosCosto(token, env).catch(() => 0)
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
  return { subsidiarios: subsidiarios.length, piscinas: nPiscinas, poligonos: nPoligonos, ciclos: nCiclos, planCosecha: nPlan,
    centrosCosto: nCentrosCosto,
    filasClima: nClima, filasHoraria: nHoraria, filasClimaReal: nClimaReal, filasHorariaReal: nHorariaReal,
    filasInamhi: nInamhi, filasBalanceado: nBalanceado, filasMarea: nMarea, filasMareaExtremos: nMareaExtremos }
}

function esUltimoDiaMes() {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000) // Ecuador UTC-5
  const manana = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  return manana.getUTCDate() === 1
}

async function refrescoPesado(env) {
  const historia = await refrescarHistoriaCiclo(env)
  const calibracion = await recalcularCalibracion(env)
  const ordenControl = await refrescarOrdenControl(env).catch(() => 0)
  return { ...historia, calibracion, ordenControl }
}

// â”€â”€ Control de Cambios â€“ D1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CAMBIOS_COLS = ['id','fechaReporte','sucursal','area','modulo','descripcion','extras','causa','prioridad','solicitante','estado','fechaResolucion','creadoEn','departamentos','deptDone','deptDoneDates']
const JSON_COLS    = new Set(['extras','departamentos','deptDone','deptDoneDates'])

function rowToRecord(row) {
  const rec = { ...row }
  JSON_COLS.forEach(c => { if (rec[c] != null) try { rec[c] = JSON.parse(rec[c]) } catch(_) {} })
  return rec
}

function recordToRow(rec) {
  const row = { ...rec }
  JSON_COLS.forEach(c => { if (row[c] != null && typeof row[c] !== 'string') row[c] = JSON.stringify(row[c]) })
  return row
}

async function sendCambioEmail(env, { record, solicitanteEmail, destinatarios }) {
  if (!env.RESEND_API_KEY) return
  // Sin dominio verificado en Resend, solo se puede enviar al correo de la cuenta
  const to = ['parragajonathan965@gmail.com']

  const moduloLabel = {
    consumo:'Consumo', planificacion:'Planificación', peso:'Peso',
    cosecha:'Cosecha', siembras:'Siembras y Transferencias',
    sobrevivencia:'Sobrevivencia', poblaciones:'Poblaciones'
  }[record.modulo] || record.modulo || '–'

  // Extraer primera línea del detalle como título de acción
  const detalleLines = (record.detalle || '').split('\n').filter(Boolean)
  const accionLine   = detalleLines[0] || ''
  const detalleResto = detalleLines.slice(1).join('\n')

  const esProduccion = record.area === 'Producción'
  const subjectLabel = esProduccion
    ? `[${record.area} - ${moduloLabel}] ${record.sucursal || ''} ${record.piscina ? '· ' + record.piscina : ''}`
    : `[Corrección #${record.id}] ${record.descripcion || record.area}`

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
      <div style="background:#1a3a5c;padding:18px 24px;border-radius:8px 8px 0 0">
        <div style="color:#94a3b8;font-size:12px;margin-bottom:4px">Solicitud #${record.id} · ${record.fechaReporte}</div>
        <h2 style="color:#fff;margin:0;font-size:17px">${record.area} — ${moduloLabel}</h2>
        ${record.sucursal ? `<div style="color:#cbd5e1;font-size:13px;margin-top:4px">${record.sucursal}${record.piscina ? ' · ' + record.piscina : ''}</div>` : ''}
      </div>
      <div style="background:#f8fafc;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
        <p style="margin:0 0 16px;font-size:14px">Buen día estimados, por favor su ayuda con la siguiente corrección:</p>

        ${accionLine ? `<div style="background:#e8f4ff;border-left:4px solid #1a3a5c;padding:10px 14px;margin-bottom:14px;border-radius:0 6px 6px 0;font-size:14px;font-weight:600">${accionLine}</div>` : ''}

        ${detalleResto ? `<div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:12px 14px;margin-bottom:16px;border-radius:0 6px 6px 0;font-size:13px;white-space:pre-wrap;line-height:1.6">${detalleResto}</div>` : ''}

        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#64748b">
          <tr><td style="padding:5px 0;width:130px">Área</td><td style="padding:5px 0;color:#1e293b">${record.area || '–'}</td></tr>
          <tr><td style="padding:5px 0">Módulo</td><td style="padding:5px 0;color:#1e293b">${moduloLabel}</td></tr>
          <tr><td style="padding:5px 0">Sucursal</td><td style="padding:5px 0;color:#1e293b">${record.sucursal || '–'}</td></tr>
          ${record.piscina ? `<tr><td style="padding:5px 0">Piscina</td><td style="padding:5px 0;color:#1e293b">${record.piscina}</td></tr>` : ''}
          <tr><td style="padding:5px 0">Solicitante</td><td style="padding:5px 0;font-weight:600;color:#1e293b">${record.solicitante || '–'}</td></tr>
          ${!esProduccion && record.descripcion ? `<tr><td style="padding:5px 0">Descripción</td><td style="padding:5px 0;color:#1e293b">${record.descripcion}</td></tr>` : ''}
          ${record.causa ? `<tr><td style="padding:5px 0">Causa</td><td style="padding:5px 0;color:#1e293b">${record.causa}</td></tr>` : ''}
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">Generado automáticamente por Control de Cambios Naturisa.</p>
      </div>
    </div>`

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Control de Cambios Naturisa <onboarding@resend.dev>',
      to,
      subject: subjectLabel,
      html
    })
  })
  const resendJson = await resendRes.json().catch(() => ({}))
  console.log('[email] status:', resendRes.status, 'to:', to, 'body:', JSON.stringify(resendJson))
}

async function handleCambiosD1(request, url, env) {
  const path = url.pathname

  // â”€â”€ /d1/cambios-config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (path === '/d1/cambios-config') {
    if (request.method === 'GET') {
      const row = await env.db.prepare('SELECT value FROM cambios_config WHERE key=?').bind('main').first()
      return corsResponse(row ? row.value : '{}', 200, request)
    }
    if (request.method === 'POST') {
      const body = await request.text()
      await env.db.prepare('INSERT OR REPLACE INTO cambios_config (key,value) VALUES (?,?)').bind('main', body).run()
      return corsResponse('{"ok":true}', 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/cambios-usuarios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (path === '/d1/cambios-usuarios') {
    if (request.method === 'GET') {
      const { results } = await env.db.prepare('SELECT id,username,password,role FROM cambios_usuarios ORDER BY id').all()
      return corsResponse(JSON.stringify(results || []), 200, request)
    }
    if (request.method === 'POST') {
      // Recibe array completo; sincroniza por id (upsert)
      const users = await request.json()
      if (!Array.isArray(users)) return corsResponse('{"error":"se esperaba array"}', 400, request)
      const stmts = users.map(u =>
        env.db.prepare('INSERT OR REPLACE INTO cambios_usuarios (id,username,password,role,email) VALUES (?,?,?,?,?)')
          .bind(u.id, u.username, u.password, u.role || 'user', u.email || null)
      )
      // Eliminar los que ya no estÃ¡n
      const ids = users.map(u => u.id).filter(Boolean)
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',')
        stmts.push(env.db.prepare(`DELETE FROM cambios_usuarios WHERE id NOT IN (${placeholders})`).bind(...ids))
      }
      await env.db.batch(stmts)
      return corsResponse('{"ok":true}', 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/cambios (registros) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (path === '/d1/cambios') {
    if (request.method === 'GET') {
      const anio = url.searchParams.get('anio')
      const mes  = url.searchParams.get('mes')
      let q = 'SELECT * FROM cambios_registros'
      const binds = []
      const wheres = []
      if (anio) { wheres.push("substr(fechaReporte,1,4)=?"); binds.push(anio) }
      if (mes)  { wheres.push("substr(fechaReporte,6,2)=?"); binds.push(String(mes).padStart(2,'0')) }
      if (wheres.length) q += ' WHERE ' + wheres.join(' AND ')
      q += ' ORDER BY id'
      const { results } = await env.db.prepare(q).bind(...binds).all()
      return corsResponse(JSON.stringify((results || []).map(rowToRecord)), 200, request)
    }
    if (request.method === 'POST') {
      // Recibe array completo; sincroniza todos los registros por id
      const records = await request.json()
      if (!Array.isArray(records)) return corsResponse('{"error":"se esperaba array"}', 400, request)
      if (!records.length) {
        await env.db.prepare('DELETE FROM cambios_registros').run()
        return corsResponse('{"ok":true}', 200, request)
      }
      const stmts = records.map(r => {
        const row = recordToRow(r)
        return env.db.prepare(
          `INSERT OR REPLACE INTO cambios_registros
           (id,fechaReporte,sucursal,area,modulo,descripcion,extras,causa,prioridad,solicitante,estado,fechaResolucion,creadoEn,departamentos,deptDone,deptDoneDates)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          row.id||null, row.fechaReporte||null, row.sucursal||null, row.area||null,
          row.modulo||null, row.descripcion||null, row.extras||'{}', row.causa||null,
          row.prioridad||null, row.solicitante||null, row.estado||'Abierto',
          row.fechaResolucion||null, row.creadoEn||null,
          row.departamentos||'[]', row.deptDone||'{}', row.deptDoneDates||'{}'
        )
      })
      // Borrar registros que ya no existen en el array enviado
      const ids = records.map(r => r.id).filter(Boolean)
      const placeholders = ids.map(() => '?').join(',')
      stmts.push(env.db.prepare(`DELETE FROM cambios_registros WHERE id NOT IN (${placeholders})`).bind(...ids))
      await env.db.batch(stmts)
      return corsResponse('{"ok":true}', 200, request)
    }
    return corsResponse('{“error”:”method not allowed”}', 405, request)
  }

  // ── /d1/cambios/email – enviar notificación de nuevo registro ────────────
  if (path === '/d1/cambios/email' && request.method === 'POST') {
    const { recordId, solicitanteEmail } = await request.json()
    const row = await env.db.prepare('SELECT * FROM cambios_registros WHERE id=?').bind(recordId).first()
    if (!row) return corsResponse('{“error”:”registro no encontrado”}', 404, request)
    const record = rowToRecord(row)
    const { results: notifs } = await env.db.prepare('SELECT email FROM cambios_notificaciones WHERE activo=1').all()
    const destinatarios = notifs.map(n => n.email).filter(Boolean)
    await sendCambioEmail(env, { record, solicitanteEmail, destinatarios })
    return corsResponse('{“ok”:true}', 200, request)
  }

  // ── /d1/cambios-notificaciones ────────────────────────────────────────────
  if (path === '/d1/cambios-notificaciones') {
    if (request.method === 'GET') {
      const { results } = await env.db.prepare('SELECT * FROM cambios_notificaciones ORDER BY id').all()
      return corsResponse(JSON.stringify(results || []), 200, request)
    }
    if (request.method === 'POST') {
      const { nombre, email, activo } = await request.json()
      await env.db.prepare('INSERT OR REPLACE INTO cambios_notificaciones (nombre,email,activo) VALUES (?,?,?)').bind(nombre, email, activo ?? 1).run()
      return corsResponse('{“ok”:true}', 200, request)
    }
    if (request.method === 'DELETE') {
      const { id } = await request.json()
      await env.db.prepare('DELETE FROM cambios_notificaciones WHERE id=?').bind(id).run()
      return corsResponse('{“ok”:true}', 200, request)
    }
    return corsResponse('{“error”:”method not allowed”}', 405, request)
  }

  // ── /d1/cambios-emails (mapeo usuario AP1 → correo) ──────────────────────
  if (path === '/d1/cambios-emails') {
    if (request.method === 'GET') {
      const soloVinculados = url.searchParams.get('vinculados') === '1'
      const sql = soloVinculados
        ? 'SELECT username, email, vinculado FROM cambios_emails WHERE vinculado=1 ORDER BY username'
        : 'SELECT username, email, vinculado FROM cambios_emails ORDER BY username'
      const { results } = await env.db.prepare(sql).all()
      return corsResponse(JSON.stringify({emails: results || []}), 200, request)
    }
    if (request.method === 'POST') {
      const { username, email, vinculado } = await request.json()
      await env.db.prepare('INSERT OR REPLACE INTO cambios_emails (username,email,vinculado) VALUES (?,?,?)').bind(username, email, vinculado ? 1 : 0).run()
      return corsResponse('{“ok”:true}', 200, request)
    }
    if (request.method === 'DELETE') {
      const { username } = await request.json()
      await env.db.prepare('DELETE FROM cambios_emails WHERE username=?').bind(username).run()
      return corsResponse('{“ok”:true}', 200, request)
    }
    return corsResponse('{“error”:”method not allowed”}', 405, request)
  }

  return corsResponse('{“error”:”ruta no encontrada”}', 404, request)
}

// ── Activos Fijos – D1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handleActivosFijos(request, url, env) {
  const path = url.pathname
  const now = new Date().toISOString()

  // â”€â”€ /d1/activos-fijos â”€â”€ listado con filtros
  if (path === '/d1/activos-fijos') {
    if (request.method === 'GET') {
      const finca = url.searchParams.get('finca')
      const clase = url.searchParams.get('clase')
      const descripcion = url.searchParams.get('descripcion')
      const q     = url.searchParams.get('q')
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10), 2000)
      const offset = parseInt(url.searchParams.get('offset') || '0', 10)
      const wheres = []
      const binds = []
      if (finca) { wheres.push('finca = ?'); binds.push(finca) }
      if (clase) { wheres.push('clase = ?'); binds.push(clase) }
      if (descripcion) { wheres.push('descripcion = ?'); binds.push(descripcion) }
      if (q) {
        wheres.push('(CAST(activo AS TEXT) LIKE ? OR descripcion LIKE ? OR serie LIKE ? OR emplazamiento LIKE ?)')
        const like = `%${q}%`
        binds.push(like, like, like, like)
      }
      let sql = 'SELECT * FROM activos_fijos'
      if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ')
      sql += ' ORDER BY activo LIMIT ? OFFSET ?'
      binds.push(limit, offset)
      const { results } = await env.db.prepare(sql).bind(...binds).all()
      return corsResponse(JSON.stringify(results || []), 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/activos-fijos/resumen â”€â”€ agregados para KPIs y árbol de fincas
  if (path === '/d1/activos-fijos/resumen') {
    if (request.method === 'GET') {
      const finca = url.searchParams.get('finca')
      const clase = url.searchParams.get('clase')
      const wheres = []
      const binds = []
      if (finca) { wheres.push('finca = ?'); binds.push(finca) }
      if (clase) { wheres.push('clase = ?'); binds.push(clase) }
      const fWhere = wheres.length ? ' WHERE ' + wheres.join(' AND ') : ''
      const total = await env.db.prepare(`SELECT COUNT(*) AS n FROM activos_fijos${fWhere}`).bind(...binds).first()
      // el árbol de fincas siempre es global (no se filtra), para poder navegar entre fincas
      const { results: porFinca } = await env.db.prepare(
        'SELECT finca, COUNT(*) AS n FROM activos_fijos GROUP BY finca ORDER BY n DESC'
      ).all()
      // porClase se acota solo por finca (nunca por clase, ese es justamente el filtro que se está eligiendo)
      const cWheres = finca ? ' WHERE finca = ?' : ''
      const cBinds = finca ? [finca] : []
      const { results: porClase } = await env.db.prepare(
        `SELECT clase, COUNT(*) AS n FROM activos_fijos${cWheres} GROUP BY clase ORDER BY n DESC`
      ).bind(...cBinds).all()
      const { results: porEstado } = await env.db.prepare(
        `SELECT estado, COUNT(*) AS n FROM activos_fijos${fWhere} GROUP BY estado`
      ).bind(...binds).all()
      // porDescripcion solo tiene sentido cuando ya se eligió una clase (y opcionalmente una finca)
      let porDescripcion = []
      if (clase) {
        const r = await env.db.prepare(
          `SELECT descripcion, COUNT(*) AS n FROM activos_fijos${fWhere} GROUP BY descripcion ORDER BY n DESC`
        ).bind(...binds).all()
        porDescripcion = r.results || []
      }
      return corsResponse(JSON.stringify({
        total: total ? total.n : 0, porFinca: porFinca || [], porClase: porClase || [],
        porEstado: porEstado || [], porDescripcion
      }), 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/activos-fijos/detalle?activo=NNN â”€â”€ ficha + historial
  if (path === '/d1/activos-fijos/detalle') {
    if (request.method === 'GET') {
      const activo = url.searchParams.get('activo')
      if (!activo) return corsResponse('{"error":"falta parametro activo"}', 400, request)
      const ficha = await env.db.prepare('SELECT * FROM activos_fijos WHERE activo = ?').bind(activo).first()
      if (!ficha) return corsResponse('{"error":"activo no encontrado"}', 404, request)
      const { results: movimientos } = await env.db.prepare(
        'SELECT * FROM activos_movimientos WHERE activo = ? ORDER BY fecha DESC LIMIT 50'
      ).bind(activo).all()
      const { results: ordenes } = await env.db.prepare(
        'SELECT * FROM activos_ordenes WHERE activo = ? ORDER BY fecha_apertura DESC LIMIT 50'
      ).bind(activo).all()
      return corsResponse(JSON.stringify({ ficha, movimientos: movimientos || [], ordenes: ordenes || [] }), 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/activos-fijos/import â”€â”€ carga masiva desde el Excel de SAP (upsert por "activo")
  if (path === '/d1/activos-fijos/import') {
    if (request.method === 'POST') {
      const rows = await request.json()
      if (!Array.isArray(rows)) return corsResponse('{"error":"se esperaba array"}', 400, request)
      if (!rows.length) return corsResponse('{"ok":true,"importados":0}', 200, request)
      const stmts = rows.filter(r => r && r.activo != null).map(r =>
        env.db.prepare(
          `INSERT INTO activos_fijos (activo, clase, clase_codigo, descripcion, denominacion, finca, emplazamiento, marca, serie, fecha_capitalizacion, fecha_baja, estado, actualizado_en)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(activo) DO UPDATE SET
             clase=excluded.clase, clase_codigo=excluded.clase_codigo, descripcion=excluded.descripcion,
             denominacion=excluded.denominacion, finca=excluded.finca,
             emplazamiento=excluded.emplazamiento, marca=excluded.marca, serie=excluded.serie,
             fecha_capitalizacion=excluded.fecha_capitalizacion, fecha_baja=excluded.fecha_baja,
             estado=CASE WHEN excluded.fecha_baja IS NOT NULL THEN 'baja' ELSE activos_fijos.estado END,
             actualizado_en=excluded.actualizado_en`
        ).bind(
          r.activo, r.clase || null, r.clase_codigo || null, r.descripcion || null, r.denominacion || null, r.finca || null,
          r.emplazamiento || null, r.marca || null, r.serie || null,
          r.fecha_capitalizacion || null, r.fecha_baja || null, r.fecha_baja ? 'baja' : 'operativo', now
        )
      )
      // D1 batch admite hasta ~1000 sentencias; el cliente ya manda en trozos de 300-500
      await env.db.batch(stmts)
      return corsResponse(JSON.stringify({ ok: true, importados: stmts.length }), 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/activos-fijos/editar â”€â”€ edición manual de la ficha (custodio, ubicación, marca, serie, estado, horómetro, fecha de baja)
  if (path === '/d1/activos-fijos/editar') {
    if (request.method === 'POST') {
      const b = await request.json()
      if (!b || b.activo == null) return corsResponse('{"error":"falta activo"}', 400, request)
      const EDITABLES = ['marca', 'serie', 'custodio_actual', 'ubicacion_actual', 'estado', 'horometro_actual', 'fecha_baja', 'descripcion', 'denominacion']
      const sets = []
      const binds = []
      for (const campo of EDITABLES) {
        if (Object.prototype.hasOwnProperty.call(b, campo)) {
          sets.push(`${campo} = ?`)
          binds.push(b[campo] === '' ? null : b[campo])
        }
      }
      if (!sets.length) return corsResponse('{"error":"nada que actualizar"}', 400, request)
      sets.push('actualizado_en = ?')
      binds.push(now, b.activo)
      await env.db.prepare(`UPDATE activos_fijos SET ${sets.join(', ')} WHERE activo = ?`).bind(...binds).run()
      return corsResponse('{"ok":true}', 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/activos-fijos/ordenes â”€â”€ listado global de órdenes (para la pestaña Mantenimiento)
  if (path === '/d1/activos-fijos/ordenes') {
    if (request.method === 'GET') {
      const estado = url.searchParams.get('estado')
      let sql = `SELECT o.*, a.descripcion, a.emplazamiento, a.finca
                 FROM activos_ordenes o JOIN activos_fijos a ON a.activo = o.activo`
      const binds = []
      if (estado) { sql += ' WHERE o.estado = ?'; binds.push(estado) }
      sql += ' ORDER BY o.fecha_apertura DESC LIMIT 200'
      const { results } = await env.db.prepare(sql).bind(...binds).all()
      return corsResponse(JSON.stringify(results || []), 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/activos-fijos/movimientos â”€â”€ listado global de transferencias (para la pestaña Movimientos)
  if (path === '/d1/activos-fijos/movimientos') {
    if (request.method === 'GET') {
      const { results } = await env.db.prepare(
        `SELECT m.*, a.descripcion, a.finca
         FROM activos_movimientos m JOIN activos_fijos a ON a.activo = m.activo
         ORDER BY m.fecha DESC LIMIT 200`
      ).all()
      return corsResponse(JSON.stringify(results || []), 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/activos-fijos/movimiento â”€â”€ registra transferencia y actualiza la ficha
  if (path === '/d1/activos-fijos/movimiento') {
    if (request.method === 'POST') {
      const m = await request.json()
      if (!m || m.activo == null) return corsResponse('{"error":"falta activo"}', 400, request)
      const fecha = m.fecha || now
      await env.db.batch([
        env.db.prepare(
          `INSERT INTO activos_movimientos
           (activo, ubicacion_origen, ubicacion_destino, custodio_origen, custodio_destino, horometro, observaciones, usuario, fecha)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(m.activo, m.ubicacion_origen || null, m.ubicacion_destino || null, m.custodio_origen || null,
               m.custodio_destino || null, m.horometro ?? null, m.observaciones || null, m.usuario || null, fecha),
        env.db.prepare(
          `UPDATE activos_fijos SET ubicacion_actual = ?, custodio_actual = ?,
             horometro_actual = COALESCE(?, horometro_actual), actualizado_en = ? WHERE activo = ?`
        ).bind(m.ubicacion_destino || null, m.custodio_destino || null, m.horometro ?? null, now, m.activo)
      ])
      return corsResponse('{"ok":true}', 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  // â”€â”€ /d1/activos-fijos/orden â”€â”€ abre o cierra una orden de mantenimiento
  if (path === '/d1/activos-fijos/orden') {
    if (request.method === 'POST') {
      const o = await request.json()
      if (!o || o.activo == null) return corsResponse('{"error":"falta activo"}', 400, request)
      if (o.id) {
        // cierre de orden existente
        await env.db.batch([
          env.db.prepare(
            `UPDATE activos_ordenes SET estado='CERRADA', horometro_cierre=?, costo=?, fecha_cierre=? WHERE id=?`
          ).bind(o.horometro_cierre ?? null, o.costo ?? 0, o.fecha_cierre || now, o.id),
          env.db.prepare(
            `UPDATE activos_fijos SET estado='operativo', horometro_actual = COALESCE(?, horometro_actual), actualizado_en=? WHERE activo=?`
          ).bind(o.horometro_cierre ?? null, now, o.activo)
        ])
        return corsResponse('{"ok":true,"accion":"cerrada"}', 200, request)
      }
      // apertura de orden nueva
      const estadoActivo = o.tipo === 'preventivo' ? 'taller' : 'espera_repuesto'
      const res = await env.db.batch([
        env.db.prepare(
          `INSERT INTO activos_ordenes (activo, tipo, descripcion, horometro_apertura, estado, tecnico, fecha_apertura)
           VALUES (?,?,?,?, 'ABIERTA', ?, ?)`
        ).bind(o.activo, o.tipo || 'correctivo', o.descripcion || null, o.horometro_apertura ?? null, o.tecnico || null, o.fecha_apertura || now),
        env.db.prepare(`UPDATE activos_fijos SET estado=?, actualizado_en=? WHERE activo=?`).bind(o.estado || estadoActivo, now, o.activo)
      ])
      return corsResponse(JSON.stringify({ ok: true, accion: 'abierta', id: res[0]?.meta?.last_row_id }), 200, request)
    }
    return corsResponse('{"error":"method not allowed"}', 405, request)
  }

  return corsResponse('{"error":"ruta no encontrada"}', 404, request)
}

// â”€â”€ Handler principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// ── Email handler – Control de Cambios ────────────────────────────────────
// Formato esperado en el cuerpo del correo:
//   AREA: Bodega
//   MODULO: Inventario
//   SUCURSAL: A1
//   SOLICITANTE: Juan Pérez
//   CAUSA: texto opcional
// El asunto del correo se usa como descripción del cambio.

async function handleEmailCambio(message, env) {
  // Leer el cuerpo del email como texto plano
  const raw = await new Response(message.raw).text().catch(() => '')

  // Extraer la parte del cuerpo (después de las cabeceras MIME)
  const bodyMatch = raw.match(/\r?\n\r?\n([\s\S]+)/)
  const body = bodyMatch ? bodyMatch[1] : raw

  function campo(nombre) {
    const m = body.match(new RegExp(`^${nombre}\\s*:\\s*(.+)`, 'mi'))
    return m ? m[1].trim() : ''
  }

  const area        = campo('AREA') || campo('ÁREA')
  const modulo      = campo('MODULO') || campo('MÓDULO')
  const sucursal    = campo('SUCURSAL')
  const solicitante = campo('SOLICITANTE') || message.from || ''
  const causa       = campo('CAUSA')

  // El asunto es la descripción
  const descripcion = (message.headers?.get('subject') || '').replace(/^(Re|Fwd):\s*/i, '').trim()

  if (!area || !descripcion) {
    // Email inválido — reenviar a bandeja de rechazo sin crashear
    await message.forward('jparraga@naturisa.com.ec')
    return
  }

  // Obtener el próximo id
  const lastRow = await env.db.prepare('SELECT MAX(id) as maxId FROM cambios_registros').first()
  const nextId  = ((lastRow?.maxId) || 0) + 1

  const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })

  await env.db.prepare(
    `INSERT INTO cambios_registros
     (id,fechaReporte,sucursal,area,modulo,descripcion,extras,causa,prioridad,solicitante,estado,fechaResolucion,creadoEn,departamentos,deptDone,deptDoneDates)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    nextId, fecha, sucursal, area, modulo, descripcion,
    '{}', causa, 'Media', solicitante,
    'Abierto', null, new Date().toISOString(),
    '[]', '{}', '{}'
  ).run()

  // Confirmar al remitente
  await message.reply(
    `Tu solicitud fue registrada con el #${nextId}.\n\nDetalle:\n- Área: ${area}\n- Módulo: ${modulo}\n- Sucursal: ${sucursal}\n- Descripción: ${descripcion}\n\nGracias.`
  ).catch(() => {})
}

// ── Control de Usuarios (AP1 Balanceado) – D1 + API de Seguridad ─────────────
// Pantalla control-usuarios/control-usuarios.html. Dos perfiles:
//  - solicitante: ve los usuarios de AP1 Balanceado de SUS campamentos (sucursales que tiene
//    asignadas en AP1) y pide altas, bajas y cambios.
//  - admin (tabla usuarios_admins): ve todos los campamentos, aprueba/rechaza y marca EJECUTADA
//    despues de hacer el cambio a mano en AP1 Seguridad.
// El login pasa por aqui: se valida contra AP1, las sucursales del usuario se leen con la cuenta de
// servicio y se entrega una sesion firmada (HMAC). Asi el campamento no lo decide el navegador, a
// diferencia de las demas rutas /d1/* que son abiertas.
// Secret de firma: USUARIOS_SESSION_KEY (si no existe se usa DB_API_KEY).

const SEC_BASE = GATEWAY + '/bff/web/security/backoffice/api'
// Catalogos de Departamento y Cargo (los ids que trae cada usuario en departmentId / departmentPositionId)
const PORTAL_BASE = GATEWAY + '/bff/web/portal/backoffice/api'
// Maestro de empleados de RRHH: cargo real de nomina (en AP1 la mayoria de usuarios no tiene cargo).
// Solo se usan cargo, centro de costo, area, fecha de ingreso; el registro trae datos sensibles
// (sueldo, cargas familiares) que nunca salen del worker.
const RRHH_BASE = GATEWAY + '/bff/web/rrhh/backoffice/api'
// Data Maestra → Logística → Transportistas (freight_transporter, filtra por identification)
const DM_LOGISTICA_BASE = GATEWAY + '/bff/web/datamaestra/backoffice/api/logistic'
const DM_ESTRUCTURA_BASE = GATEWAY + '/bff/web/datamaestra/backoffice/api/structure'
const _MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'o', 'a', 'en', 'por', 'para', 'con'])
function tituloEs(txt) {
  return String(txt || '').toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i > 0 && _MINUSCULAS.has(w)) ? w : (/^((jr|aq1|tic|siso|sig)\.?|([a-z]\.)+)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}
const APP_BALANCEADO = 3
const SESION_HORAS = 12
const TIPOS_SOLICITUD = ['ALTA', 'BAJA', 'CAMBIO']

let _usrTablas = false
async function asegurarTablasUsuarios(env) {
  if (_usrTablas) return
  await env.db.batch([
    env.db.prepare(`CREATE TABLE IF NOT EXISTS usuarios_solicitudes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'PENDIENTE',
      subsidiary_id INTEGER NOT NULL, subsidiary_nombre TEXT, user_id INTEGER, user_nombre TEXT,
      user_identificacion TEXT, datos TEXT, motivo TEXT, solicitante TEXT NOT NULL, solicitante_nombre TEXT,
      creado_en TEXT NOT NULL, resuelto_por TEXT, resuelto_en TEXT, comentario_admin TEXT)`),
    env.db.prepare(`CREATE TABLE IF NOT EXISTS usuarios_admins (username TEXT PRIMARY KEY, agregado_por TEXT, creado_en TEXT)`),
    // Configuracion de la pantalla (ej. correos que reciben el aviso de transportistas para Data Maestra)
    env.db.prepare(`CREATE TABLE IF NOT EXISTS usuarios_config (clave TEXT PRIMARY KEY, valor TEXT, actualizado_por TEXT, actualizado_en TEXT)`),
    // Primer admin solo si la tabla esta vacia (si no, quitarlo seria imposible: volveria en cada arranque)
    env.db.prepare(`INSERT INTO usuarios_admins (username, agregado_por, creado_en)
      SELECT 'jparraga', 'sistema', datetime('now') WHERE NOT EXISTS (SELECT 1 FROM usuarios_admins)`)
  ])
  // Columnas agregadas despues de crear la tabla: quien aprobo (resuelto_por se pisa al marcar EJECUTADA)
  const { results: cols } = await env.db.prepare('PRAGMA table_info(usuarios_solicitudes)').all()
  const tiene = new Set(cols.map(c => c.name))
  for (const c of ['aprobado_por', 'aprobado_nombre', 'aprobado_en', 'creado_usuario', 'datamaestra_por', 'datamaestra_nombre', 'datamaestra_en', 'correo_dm_estado']) {
    if (!tiene.has(c)) await env.db.prepare(`ALTER TABLE usuarios_solicitudes ADD COLUMN ${c} TEXT`).run()
  }
  _usrTablas = true
}

// Sesion: base64url(JSON) + "." + base64url(HMAC-SHA256)
const _enc = new TextEncoder()
function b64urlBytes(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function deB64urlBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}
async function llaveSesionUsuarios(env) {
  const secreto = env.USUARIOS_SESSION_KEY || env.DB_API_KEY
  if (!secreto) throw new Error('falta el secret USUARIOS_SESSION_KEY')
  return crypto.subtle.importKey('raw', _enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}
async function crearSesionUsuarios(env, payload) {
  const p = b64urlBytes(_enc.encode(JSON.stringify(payload)))
  const firma = await crypto.subtle.sign('HMAC', await llaveSesionUsuarios(env), _enc.encode(p))
  return p + '.' + b64urlBytes(new Uint8Array(firma))
}
async function leerSesionUsuarios(request, env) {
  const h = request.headers.get('Authorization') || ''
  const [p, f] = (h.startsWith('Bearer ') ? h.slice(7) : '').split('.')
  if (!p || !f) return null
  let ok = false
  try { ok = await crypto.subtle.verify('HMAC', await llaveSesionUsuarios(env), deB64urlBytes(f), _enc.encode(p)) } catch { return null }
  if (!ok) return null
  const s = JSON.parse(new TextDecoder().decode(deB64urlBytes(p)))
  if (!s.exp || s.exp < Date.now()) return null
  // El rol admin se consulta en cada request: quitar a alguien de la tabla surte efecto de inmediato
  s.adm = !!(await env.db.prepare('SELECT 1 FROM usuarios_admins WHERE username = ?').bind(s.u).first())
  return s
}

// Lecturas a la API de Seguridad con la cuenta de servicio (token cacheado por isolate)
let _secToken = null, _secTokenExp = 0
async function secGet(env, path, base = SEC_BASE) {
  for (let intento = 0; intento < 2; intento++) {
    if (!_secToken || Date.now() > _secTokenExp) {
      _secToken = await ap1Login(env)
      _secTokenExp = Date.now() + 30 * 60 * 1000
    }
    const res = await fetch(base + '/' + path, { headers: { Authorization: 'Bearer ' + _secToken, Accept: 'application/json' } })
    if (res.status === 401 && intento === 0) { _secToken = null; continue }
    if (!res.ok) throw new Error(`seguridad ${path.split('?')[0]}: HTTP ${res.status}`)
    const j = await res.json()
    return j.data?.data ?? j.data ?? []
  }
}

// Catalogo completo (usuarios, roles de AP1 Balanceado por usuario, sucursales), 5 min en memoria
let _catUsr = null, _catUsrEn = 0
// Cargo de RRHH -> cargo del catalogo de Seguridad (desplegable "Cargo" de AP1).
// Primero por nombre igual (sin mayusculas, tildes ni puntos); si no, por esta tabla de equivalencias
// (mismo cargo escrito distinto: plural, sufijo de licencia o nombre cortado a 30 letras por RRHH).
// Revisadas el 16/10/2026 (analisis_cargos_rrhh_vs_seguridad.xlsx). Agregar aqui las nuevas que se aprueben.
const EQUIVALENCIAS_CARGO = {
  'cocinero': 'Cocineros',
  'chofer licencia tipo e interno': 'Chofer interno',
  'chofer licencia tipo e externo': 'Choferes externos',
  'operador de consola': 'Operadores de Consola',
  'retroexcavador licencia tipo g': 'Retroexcavador',
  'montacarguista licencia tipo g': 'Montacarguista',
  'asistente tecnico de larvicult': 'Asistente Técnico de Larvicultura',
  'tractorista licencia tipo g': 'Tractorista',
  'operador de gallineta': 'Operador Gallineta',
  'analista de compras': 'Analistas de compras',
  'mecanico de fuera de borda': 'Mecánico fuera de borda',
  'comprador externo': 'Compradores externos',
  'jefe de mantenimiento campamen': 'Jefe de Mantenimiento Campamentos',
  'analista de inventarios': 'Analista de Inventario',
  'coordinador de sap': 'Coordinador SAP',
  'coordinador del cca': 'Coordinador de CCA',
  'docente de acuacultura': 'Docente Acuacultura',
  'jefe de cosecha': 'Jefe de Cosechas',
  'jefe de departamento medico': 'Jefe de Dpto. Médico',
  'jefe de mantenimiento electric': 'Jefe de Mantenimiento Eléctrico',
  'operador de motoniveladora': 'Operador Motoniveladora',
  'subgerente de logistica y abas': 'Subgerente de Logística y Abastecimiento',
  // Revisadas el 16/10/2026 desde la hoja "Seguridad sin RRHH"
  'administrador': 'Administrador de camaronera',
  'asistente administrativo': 'Asistente Administrativo Campamento',
  'asistente contable': 'Asistentes contables',
  'trabajadores sociales': 'Trabajadoras Sociales',
  'asistente de seguridad y salud': 'Asistente de Seguridad y Salud en el Trabajo',
  'asistente de mantenimiento': 'Asistente de Mantenimiento (M)'
}
const normCargo = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[.\-_/,()]/g, ' ').replace(/\s+/g, ' ').trim()
function cargoSeguridadDe(cat, cargoRRHH) {
  const k = normCargo(cargoRRHH)
  if (!k) return null
  const buscar = n => cat.listaCargos.find(c => normCargo(c.nombre) === normCargo(n)) || null
  // La equivalencia manda sobre el nombre igual (ej. RRHH "Administrador" -> "Administrador de camaronera",
  // aunque en Seguridad tambien exista "Administrador")
  return (EQUIVALENCIAS_CARGO[k] ? buscar(EQUIVALENCIAS_CARGO[k]) : null) || buscar(cargoRRHH)
}

async function catalogoUsuarios(env, forzar) {
  if (!forzar && _catUsr && Date.now() - _catUsrEn < 5 * 60 * 1000) return _catUsr
  const [users, uar, roles, subs, deps, cargos] = await Promise.all([
    secGet(env, 'users?pageSize=100000'),
    secGet(env, 'user_application_role?status=ACTIVO&pageSize=100000'),
    secGet(env, 'roles?PageSize=1000'),
    secGet(env, 'subsidiaries?status=ACTIVO&pageSize=1000'),
    secGet(env, 'department?pageSize=1000', PORTAL_BASE),
    secGet(env, 'position?pageSize=10000', PORTAL_BASE)
  ])
  // Cada cargo de Seguridad pertenece a un solo departamento (el desplegable "Cargo" de AP1 solo muestra
  // los del departamento elegido). Esa relacion solo viene en la estructura de Data Maestra.
  const depDeCargo = new Map()
  try {
    for (const c of await secGet(env, 'department_position?pageSize=10000', DM_ESTRUCTURA_BASE)) {
      if (c.departmentId) depDeCargo.set(c.idDepartmentPosition, c.departmentId)
    }
  } catch (e) { console.error('department_position:', e) }
  // RRHH es opcional: si falla, la pantalla sigue con el cargo de AP1
  let empleados = null
  try { empleados = await secGet(env, 'employees?status=ACTIVO&pageSize=10000', RRHH_BASE) } catch (e) { console.error('RRHH employees:', e) }
  const rrhhPorCedula = new Map()
  for (const e of (empleados || []).slice().sort((a, b) => String(a.hireDate || '').localeCompare(String(b.hireDate || '')))) {
    if (e.status !== 'ACTIVO' || !e.identification) continue
    // Cedula repetida (recontratos): queda el ingreso mas reciente
    rrhhPorCedula.set(String(e.identification).trim(), {
      cargo: tituloEs(e.position || e.positionDescription),
      centroCosto: tituloEs(e.costCenter),
      area: tituloEs(e.subcostCenter),
      fechaIngreso: e.hireDate || null,
      nombre: tituloEs([e.firstName, e.middleName, e.lastName, e.maternalLastName].filter(Boolean).join(' ')),
      nombres: tituloEs([e.firstName, e.middleName].filter(Boolean).join(' ')),
      apellidos: tituloEs([e.lastName, e.maternalLastName].filter(Boolean).join(' ')),
      telefono: e.phone || (Array.isArray(e.phones) ? e.phones[0] : '') || '',
      email: e.email || ''
    })
  }
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es')
  const rolesApp = new Map(roles.filter(r => r.applicationId === APP_BALANCEADO && r.status === 'ACTIVO').map(r => [r.idRole, r.name]))
  let apps = []
  try { apps = await secGet(env, 'applications?pageSize=100') } catch (e) { console.error('applications:', e) }
  const rolesPorUsuario = new Map()
  for (const x of uar) {
    if (x.status !== 'ACTIVO' || x.applicationId !== APP_BALANCEADO || !rolesApp.has(x.roleId)) continue
    if (!rolesPorUsuario.has(x.userId)) rolesPorUsuario.set(x.userId, [])
    rolesPorUsuario.get(x.userId).push(rolesApp.get(x.roleId))
  }
  _catUsr = {
    usuarios: new Map(users.map(u => [u.idUser, u])),
    rolesPorUsuario,
    rrhhPorCedula,
    rrhhDisponible: empleados !== null,
    rolesTodos: new Map(roles.map(r => [r.idRole, { nombre: r.name, app: r.applicationId, activo: r.status === 'ACTIVO' }])),
    aplicaciones: new Map(apps.map(a => [a.idApplication, a.name])),
    // AP1 Balanceado primero (es la que mas se pide), luego el resto por nombre
    rolesPorApp: apps.filter(a => a.status === 'ACTIVO')
      .map(a => ({ id: a.idApplication, nombre: a.name, roles: roles.filter(r => r.applicationId === a.idApplication && r.status === 'ACTIVO')
        .map(r => ({ id: r.idRole, nombre: r.name })).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')) }))
      .filter(a => a.roles.length)
      .sort((x, y) => (x.id === APP_BALANCEADO ? -1 : y.id === APP_BALANCEADO ? 1 : x.nombre.localeCompare(y.nombre, 'es'))),
    roles: [...rolesApp.values()].sort(),
    departamentos: new Map(deps.map(d => [d.idDepartment, d.name])),
    cargos: new Map(cargos.map(c => [c.idDepartmentPosition, c.name])),
    depDeCargo,
    listaDepartamentos: deps.filter(d => d.status !== 'INACTIVO').map(d => ({ id: d.idDepartment, nombre: d.name })).sort(porNombre),
    listaCargos: cargos.filter(c => c.status !== 'INACTIVO').map(c => ({ id: c.idDepartmentPosition, nombre: c.name, dep: depDeCargo.get(c.idDepartmentPosition) || null })).sort(porNombre),
    sucursales: subs
      .map(s => ({ id: s.idSubsidiary, nombre: s.name, tipo: s.type }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }
  _catUsrEn = Date.now()
  return _catUsr
}

// Una solicitud "lleva transportista" si da el rol TRANSPORTISTA de AP1 Balanceado (alta o edicion que lo agrega).
// Esas personas tambien se deben crear en Data Maestra como transportistas.
function requiereDataMaestra(sol) {
  let d = {}
  try { d = JSON.parse(sol.datos || '{}') } catch {}
  const esT = n => /(^|·\s*)TRANSPORTISTA$/i.test(String(n || '').trim())
  if (sol.tipo === 'ALTA') return (d.rolesNombres || []).some(esT) || /^TRANSPORTISTA$/i.test(d.rol || '')
  if (sol.tipo === 'CAMBIO') return (d.rolesAgregarNombres || []).some(esT) || (d.rolesAgregar || []).some(esT) || /^TRANSPORTISTA$/i.test(d.rol || '')
  return false
}

// Cedulas de los transportistas ACTIVOS en Data Maestra (Logística → Transportistas), 5 min en memoria.
// null si Data Maestra no responde (la pantalla no muestra aviso en ese caso).
let _dmCedulas = null, _dmCedulasEn = 0
// fresco: sin cache (boton Actualizar); si no, se reutiliza 1 minuto
async function cedulasTransportistasDM(env, fresco) {
  if (!fresco && _dmCedulas && Date.now() - _dmCedulasEn < 60 * 1000) return _dmCedulas
  try {
    const filas = await secGet(env, 'freight_transporter?status=ACTIVO&pageSize=10000', DM_LOGISTICA_BASE)
    _dmCedulas = new Set(filas.filter(t => t.status === 'ACTIVO').map(t => String(t.identification || '').trim()))
    _dmCedulasEn = Date.now()
    return _dmCedulas
  } catch (e) { console.error('Data Maestra transportistas:', e); return null }
}

async function leerConfigUsuarios(env, clave, defecto) {
  const r = await env.db.prepare('SELECT valor FROM usuarios_config WHERE clave = ?').bind(clave).first()
  if (!r) return defecto
  try { return JSON.parse(r.valor) } catch { return defecto }
}

// Aviso por correo "transportista creado: registrar en Data Maestra". Usa el buzon de Office 365
// (secrets CORREO_EMPRESA_USER / CORREO_EMPRESA_PASS); mientras no esten configurados queda pendiente.
async function avisarDataMaestra(env, sol, quien) {
  const correos = (await leerConfigUsuarios(env, 'correos_datamaestra', [])).filter(Boolean)
  if (!correos.length) return 'sin destinatarios'
  if (!env.CORREO_EMPRESA_USER || !env.CORREO_EMPRESA_PASS) return 'pendiente: sin canal de correo configurado'
  let d = {}
  try { d = JSON.parse(sol.datos || '{}') } catch {}
  const nombre = sol.tipo === 'ALTA' ? `${d.nombres || ''} ${d.apellidos || ''}`.trim() : sol.user_nombre
  const fila = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0"><b>${String(v).replace(/</g, '&lt;')}</b></td></tr>` : ''
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1f2f44">
    <h2 style="color:#1b3c5e;margin:0 0 6px">Nuevo transportista: registrar en Data Maestra</h2>
    <p style="margin:0 0 14px">Se creó en AP1 un usuario con rol <b>TRANSPORTISTA</b> (solicitud #${sol.id}). Regístralo también en <b>Data Maestra</b> como transportista.</p>
    <table style="font-size:14px">${fila('Nombre', nombre)}${fila('Identificación', sol.user_identificacion)}${fila('Teléfono', d.telefono)}${fila('Correo', d.email)}
    ${fila('Usuario AP1', sol.creado_usuario)}${fila('Sucursales', (d.sucursalesNombres || d.sucursalesAgregarNombres || [sol.subsidiary_nombre]).join(', '))}${fila('Ejecutado por', quien)}</table>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">Aviso automático de Control de Usuarios Naturisa.</p></div>`
  try {
    await invEnviarCorreoSmtp(env, correos, `Transportista nuevo para Data Maestra: ${nombre}`, html)
    return 'enviado a ' + correos.join(', ')
  } catch (e) {
    return 'error: ' + String(e.message || e).slice(0, 200)
  }
}

async function idsUsuariosDeSucursal(env, sid) {
  const filas = await secGet(env, `user_subsidiaries?subsidiaryId=${sid}&pageSize=100000`)
  return new Set(filas.filter(x => x.subsidiaryId === sid && x.status === 'ACTIVO').map(x => x.userId))
}

function sucursalesDeSesion(cat, s) {
  return s.adm ? cat.sucursales : cat.sucursales.filter(x => s.subs.includes(x.id))
}

function puedeVerSucursal(s, sid) {
  return s.adm || s.subs.includes(sid)
}

async function handleUsuariosD1(request, url, env) {
  const path = url.pathname
  const json = (obj, status) => corsResponse(JSON.stringify(obj), status || 200, request)
  try {
    await asegurarTablasUsuarios(env)

    // ── Login: valida contra AP1 y arma la sesion con las sucursales del usuario ──
    if (path === '/d1/usuarios/login' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}))
      if (!b.username || !b.password) return json({ error: 'Ingresa usuario y contraseña' }, 400)
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ userName: b.username, password: b.password, codeApplication: CODE_APP, includeUserInfo: true })
      })
      const r = await res.json().catch(() => ({}))
      const u = r.data?.usuario
      if (r.code !== 200 || !r.data?.token || !u?.idUser) return json({ error: 'Usuario o contraseña incorrectos' }, 401)
      const asignadas = await secGet(env, `user_subsidiaries?userId=${u.idUser}&pageSize=1000`)
      const s = {
        u: u.username,
        id: u.idUser,
        n: `${u.firstNames || ''} ${u.lastNames || ''}`.trim() || u.username,
        subs: asignadas.filter(x => x.userId === u.idUser && x.status === 'ACTIVO').map(x => x.subsidiaryId),
        exp: Date.now() + SESION_HORAS * 3600 * 1000
      }
      const token = await crearSesionUsuarios(env, s)
      s.adm = !!(await env.db.prepare('SELECT 1 FROM usuarios_admins WHERE username = ?').bind(s.u).first())
      const cat = await catalogoUsuarios(env)
      return json({ token, usuario: { username: s.u, nombre: s.n, idUser: s.id }, isAdmin: s.adm, sucursales: sucursalesDeSesion(cat, s), roles: cat.roles, todasSucursales: cat.sucursales,
        departamentos: cat.listaDepartamentos, cargos: cat.listaCargos, rolesPorApp: cat.rolesPorApp })
    }

    const s = await leerSesionUsuarios(request, env)
    if (!s) return json({ error: 'Sesión vencida, vuelve a ingresar' }, 401)

    // ── Sesion actual (al recargar la pagina) ──
    if (path === '/d1/usuarios/sesion' && request.method === 'GET') {
      const cat = await catalogoUsuarios(env)
      return json({ usuario: { username: s.u, nombre: s.n, idUser: s.id }, isAdmin: s.adm, sucursales: sucursalesDeSesion(cat, s), roles: cat.roles, todasSucursales: cat.sucursales,
        departamentos: cat.listaDepartamentos, cargos: cat.listaCargos, rolesPorApp: cat.rolesPorApp })
    }

    // ── Consulta por cedula: esta en la empresa? tiene usuario? que aplicaciones, roles y sucursales ──
    if (path === '/d1/usuarios/consulta' && request.method === 'GET') {
      const ced = String(url.searchParams.get('cedula') || '').trim()
      if (!/^\d{10,13}$/.test(ced)) return json({ error: 'Ingresa una cédula de 10 dígitos (o 13 si es RUC)' }, 400)
      const cat = await catalogoUsuarios(env)
      // Los filtros por identification de RRHH y Seguridad si filtran; igual se compara exacto por si cambian
      const [emps, usrs, dmTransp] = await Promise.all([
        secGet(env, `employees?identification=${ced}&pageSize=50`, RRHH_BASE).catch(() => null),
        secGet(env, `users?identification=${ced}&pageSize=50`),
        secGet(env, `freight_transporter?identification=${ced}&pageSize=20`, DM_LOGISTICA_BASE).catch(() => null)
      ])
      // Registro en Data Maestra como transportista (prefiere el ACTIVO si hay varios)
      const dmRegs = (dmTransp || []).filter(t => String(t.identification || '').trim() === ced)
      const dm = dmRegs.find(t => t.status === 'ACTIVO') || dmRegs[0] || null
      const registros = (emps || [])
        .filter(e => String(e.identification || '').trim() === ced)
        .sort((a, b) => String(b.hireDate || '').localeCompare(String(a.hireDate || '')))
        .map(e => ({
          // Solo datos laborales: el registro de RRHH trae sueldo y cargas familiares que no se exponen
          estado: e.status || '',
          nombres: tituloEs([e.firstName, e.middleName].filter(Boolean).join(' ')),
          apellidos: tituloEs([e.lastName, e.maternalLastName].filter(Boolean).join(' ')),
          cargo: tituloEs(e.position || e.positionDescription),
          // Su cargo en el catalogo de Seguridad (null si no existe ni tiene equivalencia)
          cargoSeguridad: cargoSeguridadDe(cat, e.position || e.positionDescription),
          centroCosto: tituloEs(e.costCenter),
          area: tituloEs(e.subcostCenter),
          fechaIngreso: e.hireDate || null,
          telefono: e.phone || '',
          email: e.email || ''
        }))
      const usuarios = []
      for (const u of usrs.filter(x => String(x.identification || '').trim() === ced)) {
        const [uar, usub] = await Promise.all([
          secGet(env, `user_application_role?userId=${u.idUser}&pageSize=500`),
          secGet(env, `user_subsidiaries?userId=${u.idUser}&pageSize=500`)
        ])
        const porApp = new Map()
        for (const x of uar.filter(x => x.userId === u.idUser && x.status === 'ACTIVO')) {
          const rol = cat.rolesTodos.get(x.roleId)
          const appId = x.applicationId || rol?.app
          if (!porApp.has(appId)) porApp.set(appId, { id: appId, nombre: cat.aplicaciones.get(appId) || `Aplicación ${appId}`, roles: [], roleIds: [] })
          porApp.get(appId).roles.push(rol?.nombre || `Rol ${x.roleId}`)
          porApp.get(appId).roleIds.push(x.roleId)
        }
        const subsDe = usub.filter(x => x.userId === u.idUser && x.status === 'ACTIVO')
          .map(x => ({ id: x.subsidiaryId, nombre: (cat.sucursales.find(c => c.id === x.subsidiaryId) || {}).nombre || `Sucursal ${x.subsidiaryId}` }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        const abierta = await env.db.prepare(
          `SELECT id, tipo, estado FROM usuarios_solicitudes WHERE user_id = ? AND estado IN ('PENDIENTE','APROBADA')`
        ).bind(u.idUser).first()
        usuarios.push({
          idUser: u.idUser, username: u.username || '', estado: u.status || '',
          nombres: (u.firstNames || '').trim(), apellidos: (u.lastNames || '').trim(),
          email: u.email || '', telefono: u.phone || '',
          cargoAp1: cat.cargos.get(u.departmentPositionId) || '', departamentoAp1: cat.departamentos.get(u.departmentId) || '',
          aplicaciones: [...porApp.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
          sucursales: subsDe,
          // Sucursales del usuario donde quien consulta puede pedir baja/cambio
          sucursalesGestionables: subsDe.filter(x => puedeVerSucursal(s, x.id)).map(x => x.id),
          rolesBalanceado: cat.rolesPorUsuario.get(u.idUser) || [],
          solicitudAbierta: abierta || null
        })
      }
      const altaAbierta = await env.db.prepare(
        `SELECT id, estado FROM usuarios_solicitudes WHERE tipo = 'ALTA' AND user_identificacion = ? AND estado IN ('PENDIENTE','APROBADA')`
      ).bind(ced).first()
      return json({
        cedula: ced,
        rrhhDisponible: emps !== null,
        empresa: { activo: registros.some(r => r.estado === 'ACTIVO'), registros },
        usuarios,
        altaAbierta: altaAbierta || null,
        dataMaestra: dmTransp === null ? { disponible: false }
          : { disponible: true, transportista: dm ? { estado: dm.status || '', nombre: dm.fullName || `${dm.firstName || ''} ${dm.lastName || ''}`.trim(), empleado: !!dm.isEmployee } : null }
      })
    }

    // ── Solicitudes ──
    if (path === '/d1/usuarios/solicitudes' && request.method === 'GET') {
      const estado = url.searchParams.get('estado')
      const where = [], binds = []
      if (estado) { where.push('estado = ?'); binds.push(estado) }
      if (!s.adm) {
        if (!s.subs.length) return json({ data: [] })
        where.push(`subsidiary_id IN (${s.subs.map(() => '?').join(',')})`)
        binds.push(...s.subs)
      }
      const { results } = await env.db.prepare(
        `SELECT * FROM usuarios_solicitudes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`
      ).bind(...binds).all()
      // Nombre real de quien resolvio (en la tabla solo queda el usuario de AP1)
      const cat = await catalogoUsuarios(env)
      const porUsuario = new Map([...cat.usuarios.values()].map(u => [String(u.username || '').toLowerCase(), `${u.firstNames || ''} ${u.lastNames || ''}`.trim()]))
      for (const r of results) r.resuelto_nombre = r.resuelto_por ? (porUsuario.get(r.resuelto_por.toLowerCase()) || '') : ''
      // ¿Esta en RRHH? (para "¿Es empleado?" al pegar en Data Maestra)
      for (const r of results) {
        let ced = r.user_identificacion
        if (!ced) { try { ced = JSON.parse(r.datos || '{}').identificacion } catch {} }
        r.en_rrhh = cat.rrhhDisponible ? cat.rrhhPorCedula.has(String(ced || '').trim()) : null
      }
      // Ediciones y bajas: datos actuales del usuario en AP1 (para mostrarlos igual que en un alta)
      for (const r of results) {
        const u = r.user_id ? cat.usuarios.get(r.user_id) : null
        if (u) r.usuario_actual = { username: u.username || '', telefono: u.phone || '', email: u.email || '',
          departamento: cat.departamentos.get(u.departmentId) || '', cargo: cat.cargos.get(u.departmentPositionId) || '',
          rrhh: null }
        // Departamento y Cargo se muestran siempre desde RRHH (el departamento es el del cargo equivalente en Seguridad)
        const e = cat.rrhhPorCedula.get(String(r.user_identificacion || '').trim())
        if (u && e) {
          const cs = cargoSeguridadDe(cat, e.cargo)
          const dep = cs && cs.dep ? cat.departamentos.get(cs.dep) : ''
          r.usuario_actual.rrhh = { cargo: e.cargo, centroCosto: e.centroCosto, departamento: dep || '', telefono: e.telefono, email: e.email, nombre: e.nombre, nombres: e.nombres, apellidos: e.apellidos }
        }
      }
      // Transportistas: ¿ya esta en Data Maestra? (true / false; null si no se pudo consultar)
      if (results.some(requiereDataMaestra)) {
        const dm = await cedulasTransportistasDM(env, url.searchParams.get('fresco') === '1')
        for (const r of results) if (requiereDataMaestra(r)) r.en_data_maestra = dm ? dm.has(String(r.user_identificacion || '').trim()) : null
      }
      return json({ data: results })
    }

    if (path === '/d1/usuarios/solicitudes' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}))
      const tipo = String(b.tipo || '').toUpperCase()
      const sid = parseInt(b.subsidiaryId, 10)
      const datos = b.datos || {}
      const motivo = String(b.motivo || '').trim().slice(0, 1000)
      if (!TIPOS_SOLICITUD.includes(tipo)) return json({ error: 'Tipo de solicitud no válido' }, 400)
      if (!sid || !puedeVerSucursal(s, sid)) return json({ error: 'No tienes acceso a ese campamento' }, 403)
      const cat = await catalogoUsuarios(env)
      const suc = cat.sucursales.find(x => x.id === sid)
      let afectado = null
      const ids = a => (Array.isArray(a) ? a : []).map(x => parseInt(x, 10)).filter(Boolean)
      const existeSuc = id => cat.sucursales.some(x => x.id === id)
      const nomSuc = id => (cat.sucursales.find(x => x.id === id) || {}).nombre || String(id)
      const rolValido = id => cat.rolesTodos.get(id)?.activo
      // "AP1 Balanceado · ALIMENTADOR" para mostrar sin tener que volver a consultar catalogos
      const nomRol = id => { const r = cat.rolesTodos.get(id); return r ? `${cat.aplicaciones.get(r.app) || 'App ' + r.app} · ${r.nombre}` : String(id) }

      if (tipo === 'ALTA') {
        const ced = String(datos.identificacion || '').trim()
        if (!/^\d{10,13}$/.test(ced)) return json({ error: 'La cédula debe tener 10 dígitos (o 13 si es RUC)' }, 400)
        if (!String(datos.nombres || '').trim() || !String(datos.apellidos || '').trim()) return json({ error: 'Nombres y apellidos son obligatorios' }, 400)
        // Formato nuevo: roleIds (de cualquier aplicacion) y sucursales; el anterior (un rol de AP1 Balanceado) se sigue aceptando
        const roleIds = ids(datos.roleIds), sucs = ids(datos.sucursales)
        if (roleIds.length) {
          if (!roleIds.every(rolValido)) return json({ error: 'Rol no válido' }, 400)
          datos.rolesNombres = roleIds.map(nomRol)
        } else if (!cat.roles.includes(datos.rol)) {
          return json({ error: 'Marca al menos un rol en alguna aplicación' }, 400)
        }
        if (sucs.length) {
          if (!sucs.every(existeSuc)) return json({ error: 'Sucursal no válida' }, 400)
          if (!s.adm && !sucs.every(id => s.subs.includes(id))) return json({ error: 'Solo puedes asignar tus propios campamentos' }, 403)
          if (!sucs.includes(sid)) return json({ error: 'El campamento de la solicitud debe estar entre las sucursales marcadas' }, 400)
          datos.sucursalesNombres = sucs.map(nomSuc)
        }
        Object.assign(datos, { roleIds, sucursales: sucs })
        if (datos.departmentId && !cat.departamentos.has(parseInt(datos.departmentId, 10))) return json({ error: 'Departamento no válido' }, 400)
        if (datos.cargoId && !cat.cargos.has(parseInt(datos.cargoId, 10))) return json({ error: 'Cargo no válido' }, 400)
        // El departamento lo manda el cargo: en AP1 el cargo solo aparece dentro de su departamento
        const depCargo = datos.cargoId ? cat.depDeCargo.get(parseInt(datos.cargoId, 10)) : null
        if (depCargo) datos.departmentId = depCargo
        datos.departamentoNombre = cat.departamentos.get(parseInt(datos.departmentId, 10)) || null
        datos.cargoNombre = cat.cargos.get(parseInt(datos.cargoId, 10)) || null
        const existe = [...cat.usuarios.values()].find(u => u.identification === ced)
        if (existe) return json({ error: `Ya existe el usuario ${existe.username} (${existe.firstNames} ${existe.lastNames}, ${existe.status}) con esa cédula. Pide un CAMBIO en lugar de un alta.` }, 409)
        const dup = await env.db.prepare(
          `SELECT id FROM usuarios_solicitudes WHERE tipo = 'ALTA' AND user_identificacion = ? AND estado IN ('PENDIENTE','APROBADA')`
        ).bind(ced).first()
        if (dup) return json({ error: `Ya hay una solicitud de alta abierta para esa cédula (#${dup.id})` }, 409)
        afectado = { id: null, nombre: `${datos.nombres} ${datos.apellidos}`.trim(), ced }
      } else {
        const uid = parseInt(b.userId, 10)
        if (!uid) return json({ error: 'Falta el usuario' }, 400)
        if (!motivo) return json({ error: 'El motivo es obligatorio' }, 400)
        // El usuario debe estar en el campamento de la solicitud, salvo en una edicion que justo lo agrega a ese campamento
        // (ej. un usuario que todavia no tiene ninguna sucursal)
        const loAgrega = tipo === 'CAMBIO' && (Array.isArray(datos.sucursalesAgregar) ? datos.sucursalesAgregar : []).map(Number).includes(sid)
        if (!loAgrega && !(await idsUsuariosDeSucursal(env, sid)).has(uid)) return json({ error: 'Ese usuario no pertenece al campamento seleccionado' }, 403)
        if (tipo === 'CAMBIO') {
          // Formato "editar": sucursales y roles que se agregan / quitan (lo que marca el formulario)
          const nombres = a => (Array.isArray(a) ? a : []).map(String)
          const sucAdd = ids(datos.sucursalesAgregar), sucQuitar = ids(datos.sucursalesQuitar)
          const rolAdd = nombres(datos.rolesAgregar), rolQuitar = nombres(datos.rolesQuitar)
          const rolAddIds = ids(datos.rolesAgregarIds), rolQuitarIds = ids(datos.rolesQuitarIds)
          if (![...sucAdd, ...sucQuitar].every(existeSuc)) return json({ error: 'Sucursal no válida' }, 400)
          if (![...rolAdd, ...rolQuitar].every(r => cat.roles.includes(r))) return json({ error: 'Rol no válido' }, 400)
          // Quitar un rol que hoy tiene aunque este inactivo esta bien; agregar solo roles activos
          if (!rolAddIds.every(rolValido) || !rolQuitarIds.every(id => cat.rolesTodos.has(id))) return json({ error: 'Rol no válido' }, 400)
          // Un solicitante solo mueve gente dentro de sus propios campamentos
          if (!s.adm && ![...sucAdd, ...sucQuitar].every(id => s.subs.includes(id))) return json({ error: 'Solo puedes agregar o quitar tus propios campamentos' }, 403)
          // Formato anterior (un rol / un campamento destino) se sigue aceptando
          const rolOk = !datos.rol || cat.roles.includes(datos.rol)
          const destOk = !datos.subsidiaryDestinoId || existeSuc(parseInt(datos.subsidiaryDestinoId, 10))
          const cargoOk = !datos.cargoId || cat.cargos.has(parseInt(datos.cargoId, 10))
          if (!rolOk || !destOk || !cargoOk) return json({ error: 'Rol, cargo o campamento destino no válido' }, 400)
          if (!datos.rol && !datos.subsidiaryDestinoId && !datos.cargoId && !sucAdd.length && !sucQuitar.length && !rolAdd.length && !rolQuitar.length && !rolAddIds.length && !rolQuitarIds.length) {
            return json({ error: 'No hay cambios: marca o desmarca alguna sucursal o rol, o elige un cargo' }, 400)
          }
          if (datos.cargoId) {
            datos.cargoNombre = cat.cargos.get(parseInt(datos.cargoId, 10))
            const depCargo = cat.depDeCargo.get(parseInt(datos.cargoId, 10))
            if (depCargo) { datos.departmentId = depCargo; datos.departamentoNombre = cat.departamentos.get(depCargo) || null }
          }
          Object.assign(datos, {
            sucursalesAgregar: sucAdd, sucursalesQuitar: sucQuitar, rolesAgregar: rolAdd, rolesQuitar: rolQuitar,
            sucursalesAgregarNombres: sucAdd.map(nomSuc), sucursalesQuitarNombres: sucQuitar.map(nomSuc),
            rolesAgregarIds: rolAddIds, rolesQuitarIds: rolQuitarIds,
            rolesAgregarNombres: rolAddIds.map(nomRol), rolesQuitarNombres: rolQuitarIds.map(nomRol)
          })
        }
        const abierta = await env.db.prepare(
          `SELECT id, tipo FROM usuarios_solicitudes WHERE user_id = ? AND estado IN ('PENDIENTE','APROBADA')`
        ).bind(uid).first()
        if (abierta) return json({ error: `Ese usuario ya tiene una solicitud abierta (#${abierta.id}, ${abierta.tipo})` }, 409)
        const u = cat.usuarios.get(uid) || {}
        afectado = { id: uid, nombre: `${u.firstNames || ''} ${u.lastNames || ''}`.trim(), ced: u.identification || '' }
        if (tipo === 'CAMBIO' && datos.subsidiaryDestinoId) {
          datos.subsidiaryDestinoNombre = (cat.sucursales.find(x => x.id === parseInt(datos.subsidiaryDestinoId, 10)) || {}).nombre
        }
        datos.rolesActuales = cat.rolesPorUsuario.get(uid) || []
        datos.cargoActual = cat.cargos.get(u.departmentPositionId) || null
        datos.departamentoActual = cat.departamentos.get(u.departmentId) || null
      }

      const r = await env.db.prepare(
        `INSERT INTO usuarios_solicitudes (tipo, estado, subsidiary_id, subsidiary_nombre, user_id, user_nombre, user_identificacion,
           datos, motivo, solicitante, solicitante_nombre, creado_en) VALUES (?, 'PENDIENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(tipo, sid, suc?.nombre || String(sid), afectado.id, afectado.nombre, afectado.ced,
        JSON.stringify(datos).slice(0, 50000), motivo, s.u, s.n, new Date().toISOString()).run()
      return json({ ok: true, id: r.meta?.last_row_id })
    }

    const mEstado = path.match(/^\/d1\/usuarios\/solicitudes\/(\d+)\/estado$/)
    if (mEstado && request.method === 'POST') {
      const id = parseInt(mEstado[1], 10)
      const b = await request.json().catch(() => ({}))
      const nuevo = String(b.estado || '').toUpperCase()
      const comentario = String(b.comentario || '').trim().slice(0, 1000)
      const sol = await env.db.prepare('SELECT * FROM usuarios_solicitudes WHERE id = ?').bind(id).first()
      if (!sol) return json({ error: 'Solicitud no encontrada' }, 404)
      const permitidos = s.adm
        ? { PENDIENTE: ['APROBADA', 'RECHAZADA', 'EJECUTADA'], APROBADA: ['EJECUTADA'] }   // aprobada ya no se rechaza
        : {}   // los solicitantes no cambian estados (ni anulan): solo los administradores
      if (!(permitidos[sol.estado] || []).includes(nuevo)) return json({ error: `No se puede pasar de ${sol.estado} a ${nuevo}` }, 403)
      if (nuevo === 'RECHAZADA' && !comentario) return json({ error: 'Indica el motivo del rechazo' }, 400)
      // Transportista: ya no se exige confirmar Data Maestra al ejecutar; la lista avisa (en vivo) si aun no esta
      const llevaTransportista = requiereDataMaestra(sol)
      // Usuario nuevo marcado como ejecutado: tiene que existir ya en AP1; se guarda su usuario
      let creado = null
      if (nuevo === 'EJECUTADA' && sol.tipo === 'ALTA') {
        const ced = String(sol.user_identificacion || '').trim()
        const enAp1 = (await secGet(env, `users?identification=${ced}&pageSize=50`)).filter(u => String(u.identification || '').trim() === ced)
        if (!enAp1.length) return json({ error: `Todavía no existe en AP1 un usuario con la cédula ${ced}. Créalo primero en AP1 → Seguridad y luego márcalo como ejecutado.` }, 409)
        creado = enAp1[0]
      }
      await env.db.prepare(
        'UPDATE usuarios_solicitudes SET estado = ?, resuelto_por = ?, resuelto_en = ?, comentario_admin = COALESCE(?, comentario_admin) WHERE id = ?'
      ).bind(nuevo, s.u, new Date().toISOString(), comentario || null, id).run()
      // El aprobador queda guardado aparte; si se ejecuta directo desde PENDIENTE, quien ejecuta tambien aprueba
      if (creado) {
        await env.db.prepare('UPDATE usuarios_solicitudes SET user_id = ?, creado_usuario = ? WHERE id = ?')
          .bind(creado.idUser, creado.username || '', id).run()
      }
      if (nuevo === 'APROBADA' || (nuevo === 'EJECUTADA' && sol.estado === 'PENDIENTE')) {
        await env.db.prepare('UPDATE usuarios_solicitudes SET aprobado_por = ?, aprobado_nombre = ?, aprobado_en = ? WHERE id = ?')
          .bind(s.u, s.n, new Date().toISOString(), id).run()
      }
      // Transportista: aviso por correo para registrarlo en Data Maestra
      let correoDM = null
      if (nuevo === 'EJECUTADA' && llevaTransportista) {
        const actual = await env.db.prepare('SELECT * FROM usuarios_solicitudes WHERE id = ?').bind(id).first()
        correoDM = await avisarDataMaestra(env, actual, s.n)
        await env.db.prepare('UPDATE usuarios_solicitudes SET correo_dm_estado = ? WHERE id = ?').bind(correoDM, id).run()
      }
      // Lo ejecutado ya cambio en AP1: forzar que la proxima lista se lea fresca
      if (nuevo === 'EJECUTADA') _catUsrEn = 0
      return json({ ok: true, correoDataMaestra: correoDM })
    }

    // ── Configuracion (solo admin) ──
    if (path === '/d1/usuarios/config') {
      if (!s.adm) return json({ error: 'Solo administradores' }, 403)
      if (request.method === 'GET') {
        return json({ correosDataMaestra: await leerConfigUsuarios(env, 'correos_datamaestra', []),
          canalCorreo: !!(env.CORREO_EMPRESA_USER && env.CORREO_EMPRESA_PASS) })
      }
      if (request.method === 'POST') {
        const b = await request.json().catch(() => ({}))
        const correos = [...new Set((Array.isArray(b.correosDataMaestra) ? b.correosDataMaestra : [])
          .map(c => String(c).trim().toLowerCase()).filter(Boolean))]
        const malo = correos.find(c => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))
        if (malo) return json({ error: `Correo no válido: ${malo}` }, 400)
        await env.db.prepare(`INSERT INTO usuarios_config (clave, valor, actualizado_por, actualizado_en) VALUES ('correos_datamaestra', ?, ?, ?)
          ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en`)
          .bind(JSON.stringify(correos), s.u, new Date().toISOString()).run()
        return json({ ok: true, correosDataMaestra: correos })
      }
    }

    // ── Administradores (solo admin) ──
    if (path === '/d1/usuarios/admins') {
      if (!s.adm) return json({ error: 'Solo administradores' }, 403)
      if (request.method === 'GET') {
        const { results } = await env.db.prepare('SELECT * FROM usuarios_admins ORDER BY username').all()
        const cat = await catalogoUsuarios(env)
        const porUsername = new Map([...cat.usuarios.values()].map(u => [String(u.username || '').toLowerCase(), u]))
        return json({ data: results.map(a => {
          const u = porUsername.get(a.username.toLowerCase())
          return { ...a, nombre: u ? `${u.firstNames} ${u.lastNames}` : '' }
        }) })
      }
      if (request.method === 'POST') {
        const b = await request.json().catch(() => ({}))
        const cat = await catalogoUsuarios(env)
        const u = [...cat.usuarios.values()].find(x => String(x.username || '').toLowerCase() === String(b.username || '').trim().toLowerCase())
        if (!u) return json({ error: 'Ese usuario no existe en AP1' }, 400)
        await env.db.prepare('INSERT OR IGNORE INTO usuarios_admins (username, agregado_por, creado_en) VALUES (?, ?, ?)')
          .bind(u.username, s.u, new Date().toISOString()).run()
        return json({ ok: true })
      }
      if (request.method === 'DELETE') {
        const username = url.searchParams.get('username') || ''
        if (username === s.u) return json({ error: 'No puedes quitarte a ti mismo' }, 400)
        await env.db.prepare('DELETE FROM usuarios_admins WHERE username = ?').bind(username).run()
        return json({ ok: true })
      }
    }

    return json({ error: 'not found' }, 404)
  } catch (e) {
    return json({ error: String(e.message || e) }, 500)
  }
}

export default {
  async email(message, env, ctx) {
    const to = message.to || ''
    if (to.startsWith('cambios@')) {
      ctx.waitUntil(handleEmailCambio(message, env).catch(e => console.error('email cambio error:', e)))
    } else {
      await message.forward('jparraga@naturisa.com.ec')
    }
  },

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

    if (url.pathname === '/db/reporte-diario') {
      return handleDbReporteDiario(request, url)
    }

    if (url.pathname === '/db/alertas-cosecha') {
      return handleDbAlertasCosecha(request, url)
    }

    if (url.pathname === '/db/alertas-siembra') {
      return handleDbAlertasSiembra(request, url)
    }

    if (url.pathname === '/db/alertas-liquidacion') {
      return handleDbAlertasLiquidacion(request, url)
    }

    if (url.pathname === '/db/inventario-laboratorios') {
      return handleDbInventarioLaboratorios(request, env)
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

    if (url.pathname === '/db/layers' && env.db) {
      return handleDbLayers(request, url, env)
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

    if (url.pathname === '/db/tendencias' && env.db) {
      return handleDbTendencias(request, url, env)
    }

    if (url.pathname === '/db/consumo-insumos/sync' && env.db) {
      return handleDbConsumoInsumosSync(request, env)
    }

    if (url.pathname === '/db/centro-costo' && env.db) {
      return handleDbCentroCosto(request, env)
    }

    if (url.pathname === '/db/centro-costo-reparto' && env.db) {
      return handleDbCentroCostoReparto(request, env)
    }

    if (url.pathname === '/db/combustible-tipo-equipo' && env.db) {
      return handleDbCombustibleTipoEquipo(request, env)
    }

    if (url.pathname === '/db/centro-costo-estructura' && env.db) {
      return handleDbCentroCostoEstructura(request, env)
    }

    if (url.pathname === '/db/centro-costo-estructura/sync' && env.db) {
      return handleDbCentroCostoEstructuraSync(request, env)
    }

    if (url.pathname === '/db/consumo-combustible' && env.db) {
      return handleDbConsumoCombustible(request, url, env)
    }

    if (url.pathname === '/db/consumo-combustible/sync' && env.db) {
      return handleDbConsumoCombustibleSync(request, env)
    }

    if (url.pathname === '/db/historial-ha' && env.db) {
      return handleDbHistorialHa(request, url, env)
    }

    if (url.pathname === '/db/historial-ha/sync' && env.db) {
      return handleDbHistorialHaSync(request, env)
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

    if (url.pathname === '/db/balanceado-tipos' && env.db) {
      return handleDbBalanceadoTipos(request, url, env)
    }

    if (url.pathname === '/db/muelles' && env.db) {
      return handleDbMuelles(request, url, env)
    }

    if (url.pathname === '/db/tiempo-recorrido-muelles' && env.db) {
      return handleDbTiempoRecorridoMuelles(request, url, env)
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

    if (url.pathname === '/db/marea-muelle' && env.db) {
      return handleDbMareaMuelle(request, url, env)
    }

    if (url.pathname === '/db/marea-muelle/refrescar' && env.db) {
      return handleDbMareaMuelleRefrescar(request, url, env)
    }

    if (url.pathname === '/db/marea-muelle-extremos' && env.db) {
      return handleDbMareaMuelleExtremos(request, url, env)
    }

    if (url.pathname === '/db/marea-muelle-extremos/recalcular' && env.db) {
      return handleDbMareaMuelleExtremosRecalcular(request, env)
    }

    if (url.pathname === '/db/clima/horaria/real' && env.db) {
      return handleDbClimaHorariaReal(request, url, env)
    }

    if (url.pathname === '/db/clima/real' && env.db) {
      return handleDbClimaReal(request, url, env)
    }

    // â”€â”€ Control de Cambios â€“ D1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (url.pathname.startsWith('/d1/cambios') && env.db) {
      return handleCambiosD1(request, url, env)
    }

    // â”€â”€ Activos Fijos â€“ D1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (url.pathname.startsWith('/d1/activos-fijos') && env.db) {
      return handleActivosFijos(request, url, env)
    }

    // ── Control de Usuarios AP1 Balanceado – D1 + Seguridad ──────────────
    if (url.pathname.startsWith('/d1/usuarios/') && env.db) {
      return handleUsuariosD1(request, url, env)
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
      if (!esCicloCosechado && !esIndice && !['excel','ciclos','cambios','cambios-dev','cambios-config','cambios-config-dev','cambios-usuarios'].includes(key)) {
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

    // Feeding mensual con cachÃ© (si falla, cae al proxy normal)
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

