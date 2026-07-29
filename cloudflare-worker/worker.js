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

function corsResponse(body, status, request, extraHeaders) {
  const cors = getCors(request.headers.get('Origin') || '')
  const headers = { ...cors, 'Content-Type': 'application/json', ...(extraHeaders || {}) }
  return new Response(body, { status, headers })
}

// ── Caché de feeding por mes ───────────────────────────────────────────────

const FEEDING_PATH = '/bff/mobile/feedcontrol/balanceado/api/report/feeding_general'
const CACHE_TTL    = 60 * 60 * 24 * 365 // 1 año

function pad(n) { return String(n).padStart(2, '0') }
function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate() } // m = 1-12

function feedCacheKey(pathname, searchParams, iD, eD) {
  const sp = new URLSearchParams(searchParams)
  sp.delete('initDate'); sp.delete('endDate')
  const sorted = [...sp.entries()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  return `feed:${pathname}:${new URLSearchParams(sorted)}:${iD}:${eD}`
}

async function fetchFeedRows(request, pathname, searchParams, iD, eD) {
  const sp = new URLSearchParams(searchParams)
  sp.set('initDate', iD); sp.set('endDate', eD)
  const target = GATEWAY + pathname + '?' + sp.toString()
  const res = await fetch(target, { method: 'GET', headers: request.headers })
  if (!res.ok) return { ok: false, rows: [], envelope: {} }
  const json = await res.json()
  return { ok: true, rows: json.data || [], envelope: json }
}

async function handleFeedingCached(request, url, env, ctx) {
  const initDate = url.searchParams.get('initDate') || ''
  const endDate  = url.searchParams.get('endDate')  || ''

  const now      = new Date()
  const curYear  = now.getUTCFullYear()
  const curMonth = now.getUTCMonth() + 1

  const [, , endYear, endMonth] = (endDate.match(/^(\d{4})-(\d{2})/) || []).map(Number)
  const [, , startYear, startMonth] = (initDate.match(/^(\d{4})-(\d{2})/) || []).map(Number)

  // Obtiene filas de un rango pasado: primero KV, luego API
  async function getPast(iD, eD) {
    const ck = feedCacheKey(url.pathname, url.searchParams, iD, eD)
    const hit = await env.data.get(ck)
    if (hit !== null) return { rows: JSON.parse(hit), cached: true }
    const { ok, rows } = await fetchFeedRows(request, url.pathname, url.searchParams, iD, eD)
    if (ok && rows.length) ctx.waitUntil(env.data.put(ck, JSON.stringify(rows), { expirationTtl: CACHE_TTL }))
    return { rows, cached: false }
  }

  const fullyPast = endYear < curYear || (endYear === curYear && endMonth < curMonth)

  let pastRows = [], curRows = [], envelope = {}, cached = false

  if (fullyPast) {
    const r = await getPast(initDate, endDate)
    pastRows = r.rows; cached = r.cached
    envelope = { data: pastRows }
  } else {
    // Meses pasados → KV; mes actual → siempre fresco
    const hasPast = startYear < curYear || (startYear === curYear && startMonth < curMonth)
    if (hasPast && curMonth > 1) {
      const pastEnd = `${curYear}-${pad(curMonth - 1)}-${pad(lastDay(curYear, curMonth - 1))}`
      const r = await getPast(initDate, pastEnd)
      pastRows = r.rows; cached = r.cached
    }
    const curStart = `${curYear}-${pad(curMonth)}-01`
    const curEnd   = `${curYear}-${pad(curMonth)}-${pad(lastDay(curYear, curMonth))}`
    const r = await fetchFeedRows(request, url.pathname, url.searchParams, curStart, curEnd)
    curRows = r.rows; envelope = r.envelope || {}
  }

  const allRows = [...pastRows, ...curRows]
  const body = JSON.stringify({ ...envelope, data: allRows })
  return corsResponse(body, 200, request, {
    'X-Cache': cached ? 'HIT' : 'MISS',
    'X-Cache-Rows': String(allRows.length),
  })
}

// ── Handler principal ──────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url)
    const origin = request.headers.get('Origin') || ''

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCors(origin) })
    }

    // /kv/ — rutas existentes sin cambios
    if (url.pathname.startsWith('/kv/')) {
      const key = url.pathname.replace('/kv/', '')
      if (!['excel', 'ciclos', 'cambios', 'cambios-dev', 'cambios-config', 'cambios-config-dev'].includes(key)) {
        return corsResponse('{"error":"key no permitida"}', 400, request)
      }
      if (request.method === 'GET') {
        const val = await env.data.get(key)
        return corsResponse(val || '[]', 200, request)
      }
      if (request.method === 'POST') {
        const body = await request.text()
        await env.data.put(key, body)
        return corsResponse('{"ok":true}', 200, request)
      }
      return corsResponse('{"error":"method not allowed"}', 405, request)
    }

    // Feeding con granularidad mensual → caché KV
    if (
      request.method === 'GET' &&
      url.pathname === FEEDING_PATH &&
      url.searchParams.get('timeGranularity') === 'month'
    ) {
      return handleFeedingCached(request, url, env, ctx)
    }

    // Proxy transparente para todo lo demás
    const target = GATEWAY + url.pathname + url.search
    const cors   = getCors(origin)
    const res    = await fetch(target, {
      method:  request.method,
      headers: request.headers,
      body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body
    })
    const out = new Response(res.body, res)
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v))
    return out
  }
}
