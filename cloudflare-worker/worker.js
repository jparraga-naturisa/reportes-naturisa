const GATEWAY = 'https://gateway.naturisa.com.ec'

const ALLOWED_ORIGINS = [
  'https://jparraga-naturisa.github.io',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
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

// ── Handler principal ──────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url)
    const origin = request.headers.get('Origin') || ''

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCors(origin) })
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
