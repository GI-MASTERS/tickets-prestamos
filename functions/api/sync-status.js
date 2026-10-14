import { json } from '../_appsheet.js'

export async function onRequestGet(context) {
  const version = context.env.RESERVAS_CACHE ? await context.env.RESERVAS_CACHE.get('reservas:sync-version') : null
  return json({ version })
}
