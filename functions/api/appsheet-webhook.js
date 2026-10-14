import { cacheKey, json, loadSnapshot } from '../_appsheet.js'

export async function onRequestPost(context) {
  const expectedSecret = context.env.WEBHOOK_SECRET
  const receivedSecret = context.request.headers.get('X-Webhook-Secret')
  if (expectedSecret && receivedSecret !== expectedSecret) return json({ message: 'Webhook no autorizado' }, { status: 401 })

  try {
    const snapshot = await loadSnapshot(context.env)
    const cache = context.env.RESERVAS_CACHE
    if (cache) {
      await cache.put(cacheKey(context.request), JSON.stringify(snapshot), { expirationTtl: 120 })
      await cache.put('reservas:sync-version', new Date().toISOString(), { expirationTtl: 86400 })
    }
    return json({ ok: true, date: snapshot.date, reservations: snapshot.reservations.length })
  } catch (error) {
    return json({ message: error.message }, { status: 502 })
  }
}
