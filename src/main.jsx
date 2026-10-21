import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './styles.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const demoSets = [
  { id: 'set-a', label: 'Set A', description: 'Sin reservas para hoy', accent: 'blue', reservations: [] },
  { id: 'set-b', label: 'Set B', description: 'Sin reservas para hoy', accent: 'orange', reservations: [] },
  { id: 'set-c', label: 'Set C', description: 'Sin reservas para hoy', accent: 'violet', reservations: [] },
]

const loadBoards = async (date) => {
  const response = await fetch(`${API_BASE_URL}/api/boards?date=${encodeURIComponent(date)}`)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.message || 'No se pudo leer AppSheet')
  return payload
}

const loadSyncVersion = async () => {
  const response = await fetch(`${API_BASE_URL}/api/sync-status`, { cache: 'no-store' })
  if (!response.ok) throw new Error('No se pudo consultar la sincronización')
  return (await response.json()).version
}

const localDateKey = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const formatDate = (value) => new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(`${value}T12:00:00`))

const timeToMinutes = (value) => {
  const [hours, minutes] = String(value || '').split(':').map(Number)
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null
}

const minutesUntil = (reservation) => {
  const start = timeToMinutes(reservation.start)
  if (start === null) return null
  const now = new Date()
  return start - (now.getHours() * 60 + now.getMinutes())
}

const secondsUntil = (value) => {
  const target = timeToMinutes(value)
  if (target === null) return null
  const now = new Date()
  return target * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds())
}

function Icon({ name, size = 18 }) {
  const paths = {
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4L3 10" /><path d="M3 5v5h5M4 13a8 8 0 0 0 14.8 4L21 14" /><path d="M21 19v-5h-5" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function ReservationCard({ reservation }) {
  const minutes = minutesUntil(reservation)
  const upcoming = minutes !== null && minutes >= 0 && minutes <= 10
  return <article className={`kanban-reservation ${upcoming ? 'upcoming' : ''}`}>
    <div className="reservation-time"><strong>{reservation.start}</strong><span>{reservation.end}</span></div>
    <div className="reservation-info"><strong>{reservation.title}</strong><span>{reservation.status} · {reservation.quantity} equipos · {reservation.room}</span></div>
    {upcoming && <span className="upcoming-label">En {minutes} min</span>}
  </article>
}

function SetBoard({ set }) {
  return <section className="set-board" aria-labelledby={`${set.id}-heading`}>
    <header className="set-board-header"><div className="set-heading"><span className={`set-mark ${set.accent}`} /><div><h2 id={`${set.id}-heading`}>{set.label}</h2><p>{set.reservations.length ? `${set.reservations.length} ${set.reservations.length === 1 ? 'reserva programada' : 'reservas programadas'}` : 'Disponible todo el día'}</p></div></div><span className={`set-state ${set.reservations.length ? 'reserved' : 'available'}`}>{set.reservations.length ? 'Reservado' : 'Disponible'}</span></header>
    <div className="set-board-body">{set.reservations.length ? set.reservations.map((reservation) => <ReservationCard reservation={reservation} key={reservation.id} />) : <div className="set-empty"><span className="empty-check">✓</span><div><strong>Set disponible</strong><span>No hay reservas para este día</span></div></div>}</div>
  </section>
}

function App() {
  const [sets, setSets] = useState(demoSets)
  const [reservations, setReservations] = useState([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState(localDateKey)
  const [connection, setConnection] = useState({ status: 'loading', message: '' })
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [phoneNotifications, setPhoneNotifications] = useState(Capacitor.isNativePlatform() ? 'idle' : 'web')
  const [bellTestActive, setBellTestActive] = useState(false)
  const [reminder, setReminder] = useState(null)
  const audioContext = useRef(null)
  const boardingAudio = useRef(null)
  const bellTestInterval = useRef(null)
  const bellTestTimeout = useRef(null)
  const bellSequenceActive = useRef(false)
  const syncVersion = useRef(null)
  const oneSignalClient = useRef(null)
  const alertedReservations = useRef(new Set())

  const refreshBoards = async () => {
    setConnection({ status: 'loading', message: '' })
    try {
      const payload = await loadBoards(selectedDate)
      setSets(payload.boards)
      setReservations(payload.reservations)
      setConnection({ status: 'connected', message: '' })
      try {
        syncVersion.current = await loadSyncVersion()
      } catch {
        syncVersion.current = null
      }
    } catch (error) {
      setSets(demoSets)
      setReservations([])
      setConnection({ status: 'error', message: error.message })
    }
  }

  const playReminder = () => {
    const context = audioContext.current
    if (!context) return
    const start = context.currentTime
    const masterGain = context.createGain()
    masterGain.gain.setValueAtTime(0.82, start)
    masterGain.connect(context.destination)

    // Aviso de embarque: cuatro tonos cortos, con un segundo armónico para hacerlo más reconocible.
    ;[523.25, 659.25, 783.99, 659.25].forEach((frequency, index) => {
      const noteStart = start + index * 0.16
      const noteEnd = noteStart + 0.52
      const noteGain = context.createGain()
      noteGain.gain.setValueAtTime(0.0001, noteStart)
      noteGain.gain.exponentialRampToValueAtTime(0.34, noteStart + 0.025)
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd)
      noteGain.connect(masterGain)

      const tone = context.createOscillator()
      tone.type = 'triangle'
      tone.frequency.setValueAtTime(frequency, noteStart)
      tone.connect(noteGain)
      tone.start(noteStart)
      tone.stop(noteEnd)

      const harmonic = context.createOscillator()
      harmonic.type = 'sine'
      harmonic.frequency.setValueAtTime(frequency * 2, noteStart)
      harmonic.connect(noteGain)
      harmonic.start(noteStart)
      harmonic.stop(noteEnd)
    })
  }

  const speakBoardingAnnouncement = () => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const announcement = new SpeechSynthesisUtterance('Pasajeros de sistemas, por favor diríjanse a su destino antes de que lleguen tarde.')
    announcement.lang = 'es-AR'
    announcement.rate = 1.08
    announcement.pitch = 1.4
    announcement.volume = 1
    const spanishVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('es'))
    if (spanishVoice) announcement.voice = spanishVoice
    window.speechSynthesis.speak(announcement)
  }

  const playBoardingAudio = () => {
    boardingAudio.current ||= new Audio('/boarding-chime.mp3')
    boardingAudio.current.currentTime = 0
    boardingAudio.current.volume = 1
    boardingAudio.current.play().catch(playReminder)
  }

  const getAudioContext = async () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return null
    audioContext.current ||= new AudioContext()
    await audioContext.current.resume()
    return audioContext.current
  }

  const startBellSequence = (onFinish) => {
    if (bellSequenceActive.current) return
    bellSequenceActive.current = true
    playBoardingAudio()
    speakBoardingAnnouncement()
    bellTestInterval.current = setInterval(playBoardingAudio, 3400)
    bellTestTimeout.current = setTimeout(() => {
      clearInterval(bellTestInterval.current)
      bellTestInterval.current = null
      bellTestTimeout.current = null
      bellSequenceActive.current = false
      onFinish?.()
    }, 10000)
  }

  const testBell = async () => {
    const context = await getAudioContext()
    if (!context || bellTestActive || bellSequenceActive.current) return

    setSoundEnabled(true)
    setBellTestActive(true)
    startBellSequence(() => setBellTestActive(false))
  }

  const enablePhoneNotifications = async () => {
    if (!Capacitor.isNativePlatform() || !import.meta.env.VITE_ONESIGNAL_APP_ID) return
    setPhoneNotifications('loading')
    try {
      if (!oneSignalClient.current) {
        const { default: OneSignal } = await import('onesignal-cordova-plugin')
        OneSignal.initialize(import.meta.env.VITE_ONESIGNAL_APP_ID)
        oneSignalClient.current = OneSignal
      }
      const granted = await oneSignalClient.current.Notifications.requestPermission(true)
      setPhoneNotifications(granted ? 'enabled' : 'denied')
    } catch {
      setPhoneNotifications('error')
    }
  }

  useEffect(() => () => {
    clearInterval(bellTestInterval.current)
    clearTimeout(bellTestTimeout.current)
  }, [])

  useEffect(() => {
    const unlockSound = () => {
      getAudioContext().then((context) => {
        if (context) setSoundEnabled(true)
      })
      window.removeEventListener('pointerdown', unlockSound)
      window.removeEventListener('keydown', unlockSound)
    }
    window.addEventListener('pointerdown', unlockSound, { once: true })
    window.addEventListener('keydown', unlockSound, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlockSound)
      window.removeEventListener('keydown', unlockSound)
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !import.meta.env.VITE_ONESIGNAL_APP_ID) return
    import('onesignal-cordova-plugin').then(({ default: OneSignal }) => {
      OneSignal.initialize(import.meta.env.VITE_ONESIGNAL_APP_ID)
      oneSignalClient.current = OneSignal
      OneSignal.Notifications.getPermissionAsync().then((granted) => setPhoneNotifications(granted ? 'enabled' : 'idle'))
    }).catch(() => setPhoneNotifications('error'))
  }, [])

  useEffect(() => { refreshBoards() }, [selectedDate])

  useEffect(() => {
    const checkForSync = async () => {
      try {
        const nextVersion = await loadSyncVersion()
        if (!nextVersion) return
        if (!syncVersion.current) {
          syncVersion.current = nextVersion
          return
        }
        if (nextVersion !== syncVersion.current) await refreshBoards()
      } catch {
        // The next status check or the manual refresh can recover from a temporary outage.
      }
    }
    const interval = setInterval(checkForSync, 30000)
    return () => clearInterval(interval)
  }, [selectedDate])

  useEffect(() => {
    const checkReminders = () => {
      const starting = reservations.find((reservation) => {
        const remaining = minutesUntil(reservation)
        return remaining !== null && remaining >= 0 && remaining <= 10 && !alertedReservations.current.has(`start:${reservation.id}`)
      })
      const ending = reservations.find((reservation) => {
        const remaining = secondsUntil(reservation.end)
        return remaining !== null && remaining <= 0 && remaining >= -30 && !alertedReservations.current.has(`end:${reservation.id}`)
      })
      const next = starting ? { ...starting, kind: 'start' } : ending ? { ...ending, kind: 'end' } : null
      if (!next) return
      alertedReservations.current.add(`${next.kind}:${next.id}`)
      if (soundEnabled) {
        startBellSequence()
      }
      setReminder(next)
    }
    checkReminders()
    const interval = setInterval(checkReminders, 15000)
    return () => clearInterval(interval)
  }, [reservations, soundEnabled])

  const filteredSets = useMemo(() => sets.filter((set) => activeFilter === 'all' || set.id === activeFilter).map((set) => ({
    ...set,
    reservations: set.reservations.filter((reservation) => `${reservation.title} ${reservation.set} ${reservation.room}`.toLowerCase().includes(query.toLowerCase())),
  })), [sets, activeFilter, query])

  return <div className="app-shell">
    <main className="main-content" id="reservas">
      <div className="content-wrap">
        {reminder && <div className="reminder-alert" role="alert"><Icon name="bell" size={17} /><div><strong>{reminder.kind === 'end' ? `Reserva finalizada, ${reminder.end}` : `Reserva próxima, ${reminder.start}`}</strong><span>{reminder.title} · {reminder.set} · {reminder.room}</span></div><button onClick={() => setReminder(null)} aria-label="Cerrar recordatorio">Cerrar</button></div>}
        <div className="toolbar kanban-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filtrar sets">{[['all', 'Todos'], ...sets.map((set) => [set.id, set.label])].map(([id, label]) => <button key={id} className={activeFilter === id ? 'filter-tab selected' : 'filter-tab'} onClick={() => setActiveFilter(id)} role="tab" aria-selected={activeFilter === id}>{label}</button>)}</div><div className="toolbar-actions"><span className={`sync-status ${connection.status}`}><span />{connection.status === 'connected' ? 'Sincronizado' : connection.status === 'loading' ? 'Actualizando' : 'Sin conexión'}</span><label className="date-picker"><Icon name="calendar" size={16} /><span>Ver día</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Seleccionar día de reservas" /></label><span className="sound-status"><Icon name="bell" size={16} />Timbre automático</span>{Capacitor.isNativePlatform() && <button className={`notification-button ${phoneNotifications}`} onClick={enablePhoneNotifications} disabled={phoneNotifications === 'loading' || phoneNotifications === 'enabled'}><Icon name="bell" size={16} />{phoneNotifications === 'enabled' ? 'Avisos activos' : phoneNotifications === 'loading' ? 'Activando...' : phoneNotifications === 'denied' ? 'Permiso bloqueado' : phoneNotifications === 'error' ? 'Reintentar avisos' : 'Avisos al teléfono'}</button>}<button className="bell-test-button" onClick={testBell} disabled={bellTestActive} aria-label="Probar el timbre durante 10 segundos"><Icon name="bell" size={16} />{bellTestActive ? 'Timbre sonando...' : 'Probar timbre (10 s)'}</button><button className="refresh-button" onClick={refreshBoards} disabled={connection.status === 'loading'}><Icon name="refresh" size={16} />Actualizar</button><label className="search-box"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar reserva, salón o profesor" aria-label="Buscar reserva, salón o profesor" /></label></div></div>
        {connection.status === 'error' && <div className="connection-alert" role="alert"><strong>No se pudo actualizar AppSheet.</strong><span>{connection.message}</span><button onClick={refreshBoards}>Reintentar</button></div>}
        {connection.status === 'loading' && <div className="loading-state" role="status"><span className="loading-spinner" />Consultando las reservas de hoy...</div>}
        <div className="boards horizontal-boards" id="sets">{filteredSets.length ? filteredSets.map((set) => <SetBoard set={set} key={set.id} />) : <div className="global-empty"><strong>No encontramos reservas</strong><span>Probá con otro nombre, salón o set.</span></div>}</div>
      </div>
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
