import { cacheKey, json, loadSnapshot } from '../_appsheet.js'

export async function onRequestGet(context) {
  const cache = context.env.RESERVAS_CACHE
  const key = cacheKey(context.request)

  if (cache) {
    const cached = await cache.get(key)
    if (cached) return json(JSON.parse(cached), { headers: { 'X-Reservations-Cache': 'HIT' } })
  }

  try {
    const snapshot = await loadSnapshot(context.env)
    if (cache) await cache.put(key, JSON.stringify(snapshot), { expirationTtl: 120 })
    return json(snapshot, { headers: { 'X-Reservations-Cache': 'MISS' } })
  } catch (error) {
    return json({ message: error.message }, { status: 502 })
  }
}
