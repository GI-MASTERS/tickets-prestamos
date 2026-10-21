import { cacheKey, json, loadSnapshot } from '../_appsheet.js'
import { sendOneSignalNotification } from '../_onesignal.js'

export async function onRequestPost(context) {
  const expectedSecret = context.env.WEBHOOK_SECRET
  const receivedSecret = context.request.headers.get('X-Webhook-Secret')
  if (expectedSecret && receivedSecret !== expectedSecret) return json({ message: 'Webhook no autorizado' }, { status: 401 })

  try {
    const event = await context.request.json().catch(() => ({}))
    const snapshot = await loadSnapshot(context.env)
    const cache = context.env.RESERVAS_CACHE
    if (cache) {
      await cache.put(cacheKey(context.request), JSON.stringify(snapshot), { expirationTtl: 120 })
      await cache.put('reservas:sync-version', new Date().toISOString(), { expirationTtl: 86400 })
    }
    let notification
    try {
      notification = await sendOneSignalNotification(context.env, snapshot, event)
    } catch (error) {
      notification = { configured: true, error: error.message }
    }
    return json({ ok: true, date: snapshot.date, reservations: snapshot.reservations.length, notification })
  } catch (error) {
    return json({ message: error.message }, { status: 502 })
  }
}
