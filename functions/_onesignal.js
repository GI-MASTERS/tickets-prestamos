const notificationCopy = (snapshot, event) => {
  const firstReservation = snapshot.reservations[0]
  const detail = event?.room || firstReservation?.room || 'Sin salón'
  if (event?.type === 'start-reminder') return { title: 'Reserva en 10 minutos', body: `${event.start || firstReservation?.start || ''} · ${detail}` }
  if (event?.type === 'reservation-ended') return { title: 'Reserva finalizada', body: `${event.end || firstReservation?.end || ''} · ${detail}` }
  return {
    title: 'Nueva reserva',
    body: firstReservation
      ? `${snapshot.reservations.length} reservas. Próxima: ${firstReservation.start}, ${firstReservation.room}.`
      : 'Las reservas fueron actualizadas.',
  }
}

export const sendOneSignalNotification = async (env, snapshot, event) => {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) return { configured: false }

  const copy = notificationCopy(snapshot, event)
  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      Authorization: `Key ${env.ONESIGNAL_REST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: env.ONESIGNAL_APP_ID,
      included_segments: ['Subscribed Users'],
      target_channel: 'push',
      headings: { es: copy.title, en: copy.title },
      contents: { es: copy.body, en: copy.body },
      android_sound: 'boarding_chime',
      priority: 10,
      data: { route: '/', type: event?.type || 'reservation-created' },
    }),
  })

  const result = await response.json()
  if (!response.ok) throw new Error(result.errors?.join(', ') || `OneSignal respondió ${response.status}`)
  return { configured: true, id: result.id, recipients: result.recipients || 0 }
}
