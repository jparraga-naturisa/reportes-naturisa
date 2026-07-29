/**
 * naturisa-proxy — Cloudflare Worker
 *
 * Proxy CORS hacia gateway.naturisa.com.ec con caché KV por mes.
 * - Meses pasados → KV (permanente, TTL 1 año)
 * - Mes actual    → siempre fresco desde la API
 *
 * Rutas cacheadas: cualquier endpoint de feeding con timeGranularity=month
 * Resto de rutas: proxy transparente sin caché
 */

const GATEWAY = 'https://gateway.naturisa.com.ec';
const CACHEABLE_PATHS = ['/bff/mobile/feedcontrol/balanceado/api/report/feeding_general'];
const CACHE_TTL = 60 * 60 * 24 * 365; // 1 año en segundos

// ── Helpers ────────────────────────────────────────────────────────────────

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin':  origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
        'Access-Control-Max-Age':       '86400',
    };
}

function jsonResponse(body, extra = {}, status = 200) {
    return new Response(body, {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(),
            ...extra,
        },
    });
}

function pad(n) { return String(n).padStart(2, '0'); }

function lastDayOfMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m es 1-12
}

// Clave KV estable: excluye initDate/endDate, ordena params
function buildBaseKey(pathname, searchParams) {
    const sp = new URLSearchParams(searchParams);
    sp.delete('initDate');
    sp.delete('endDate');
    // Ordenar para que el orden de subsidiaryIds no importe
    const sorted = [...sp.entries()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    return `feeding:${pathname}:${new URLSearchParams(sorted).toString()}`;
}

// Proxy simple hacia el gateway conservando Authorization
async function proxyRequest(originalRequest, targetUrl) {
    const headers = new Headers();
    const fwd = ['Authorization', 'Accept', 'Content-Type'];
    fwd.forEach(h => { const v = originalRequest.headers.get(h); if (v) headers.set(h, v); });
    headers.set('Origin',  'https://ap1.naturisa.com.ec');
    headers.set('Referer', 'https://ap1.naturisa.com.ec/');
    headers.set('User-Agent', 'Mozilla/5.0');

    return fetch(targetUrl, {
        method:  originalRequest.method,
        headers,
        body:    originalRequest.method !== 'GET' ? originalRequest.body : undefined,
    });
}

// Obtiene filas de la API para un rango de fechas y las devuelve como array
async function fetchRows(request, baseUrl, iD, eD) {
    const u = new URL(baseUrl);
    u.searchParams.set('initDate', iD);
    u.searchParams.set('endDate',  eD);
    const resp = await proxyRequest(request, u.toString());
    if (!resp.ok) return { ok: false, status: resp.status, rows: [] };
    const json = await resp.json();
    return { ok: true, rows: json.data || [], envelope: json };
}

// ── Handler principal ──────────────────────────────────────────────────────

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get('Origin') || '*';

        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        const url = new URL(request.url);

        // ¿Es un endpoint de feeding con granularidad mensual?
        const isFeedingMonthly =
            CACHEABLE_PATHS.some(p => url.pathname === p) &&
            url.searchParams.get('timeGranularity') === 'month';

        if (!isFeedingMonthly) {
            // Proxy transparente sin caché
            const target = GATEWAY + url.pathname + url.search;
            const resp   = await proxyRequest(request, target);
            const body   = await resp.text();
            return new Response(body, {
                status:  resp.status,
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
        }

        // ── Lógica de caché por mes ──────────────────────────────────────
        const initDate = url.searchParams.get('initDate') || '';
        const endDate  = url.searchParams.get('endDate')  || '';

        const now      = new Date();
        const curYear  = now.getUTCFullYear();
        const curMonth = now.getUTCMonth() + 1; // 1-12

        const [startYear, startMonth] = initDate.split('-').map(Number);
        const [endYear,   endMonth]   = endDate.split('-').map(Number);

        const baseKey  = buildBaseKey(url.pathname, url.searchParams);
        const baseUrl  = GATEWAY + url.pathname + url.search; // incluye todos los params excepto fechas que se reemplazan

        // Función auxiliar: consulta KV o API para un rango en el pasado
        async function getPastRows(iD, eD) {
            const ck = `${baseKey}:${iD}:${eD}`;
            const cached = await env.CACHE.get(ck);
            if (cached !== null) {
                return { rows: JSON.parse(cached), hit: true };
            }
            const { ok, rows } = await fetchRows(request, baseUrl, iD, eD);
            if (ok && rows.length) {
                ctx.waitUntil(env.CACHE.put(ck, JSON.stringify(rows), { expirationTtl: CACHE_TTL }));
            }
            return { rows, hit: false };
        }

        // ¿Todo el rango es pasado (no incluye mes actual)?
        const rangeIsFullyPast = endYear < curYear || (endYear === curYear && endMonth < curMonth);

        let pastRows  = [];
        let curRows   = [];
        let envelope  = {};
        let cacheHit  = false;

        if (rangeIsFullyPast) {
            // Todo cacheable
            const result = await getPastRows(initDate, endDate);
            pastRows = result.rows;
            cacheHit = result.hit;
            // Construir envelope mínimo si vino de KV
            envelope = { data: pastRows };
        } else {
            // Rango incluye el mes actual — split: pasado + fresco

            // Porción pasada (si el rango empieza antes del mes actual)
            const hasPast = startYear < curYear || (startYear === curYear && startMonth < curMonth);
            if (hasPast && curMonth > 1) {
                const pastEnd = `${curYear}-${pad(curMonth - 1)}-${pad(lastDayOfMonth(curYear, curMonth - 1))}`;
                const result  = await getPastRows(initDate, pastEnd);
                pastRows = result.rows;
                cacheHit = result.hit;
            }

            // Porción actual (siempre fresca)
            const curStart = `${curYear}-${pad(curMonth)}-01`;
            const curEnd   = `${curYear}-${pad(curMonth)}-${pad(lastDayOfMonth(curYear, curMonth))}`;
            const result   = await fetchRows(request, baseUrl, curStart, curEnd);
            curRows  = result.rows;
            envelope = result.envelope || {};
        }

        const allRows = [...pastRows, ...curRows];
        const response = JSON.stringify({ ...envelope, data: allRows });

        return jsonResponse(response, {
            'X-Cache':       cacheHit ? 'HIT' : 'MISS',
            'X-Cache-Rows':  String(allRows.length),
        });
    },
};
