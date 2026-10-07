import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition'
import './App.css'
import './web.css'
import { supabase } from './supabase'
import tescaLogo from './assets/tesca-tescagroup-logo.jpg'
import officeFloorplan from './assets/office-floorplan.jpg'

const assets = [
  ['PC-FIN-014', 'Poste comptable', 'Finance', '2e étage · Bureau 204'],
  ['PC-FIN-008', 'Poste recouvrement', 'Finance', '2e étage · Bureau 206'],
  ['IMP-RH-002', 'Imprimante RH', 'Ressources humaines', '1er étage · Accueil RH'],
  ['NET-001', 'Routeur principal', 'Infrastructure', 'Salle serveur · RDC'],
  ['IMP-FIN-001', 'Imprimante Finance', 'Finance', '2e étage · Bureau 210'],
  ['PC-RH-001', 'Poste gestion RH', 'Ressources humaines', '1er étage · Bureau RH'],
  ['PC-RH-002', 'Poste RH', 'Ressources humaines', '1er étage · Bureau RH'],
  ['PC-INF-002', 'Poste technicien IT', 'Infrastructure', 'Salle serveur · RDC'],
  ['SW-INF-001', 'Commutateur réseau', 'Infrastructure', 'Salle serveur · Baie 2'],
  ['PC-LOG-001', 'Poste expédition', 'Logistique', 'Entrepôt · Bureau logistique'],
  ['SCAN-LOG-001', 'Scanner codes-barres', 'Logistique', 'Entrepôt · Zone expédition'],
  ['IMP-LOG-001', 'Imprimante étiquettes', 'Logistique', 'Entrepôt · Zone expédition'],
  ['TAB-LOG-001', 'Tablette inventaire', 'Logistique', 'Entrepôt · Réserve'],
  ['PC-ADM-001', 'Poste administratif', 'Administration', 'Bâtiment principal · Bureau 101'],
  ['IMP-PRD-001', 'Imprimante de production', 'Production', 'Atelier · Poste de contrôle'],
]
const departments = [...new Set(assets.map((asset) => asset[2]))]

const getAsset = (id) => assets.find((asset) => asset[0] === id) || assets[0]
const defaultBrand = { companyName: 'Tesca Tech', logoPath: '', logoUrl: '' }
const playResolutionSound = async () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  if (context.state === 'suspended') await context.resume()
  const now = context.currentTime
  ;[660, 880].forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const volume = context.createGain()
    oscillator.frequency.value = frequency
    oscillator.type = 'sine'
    volume.gain.setValueAtTime(0.0001, now + index * 0.16)
    volume.gain.exponentialRampToValueAtTime(0.16, now + index * 0.16 + 0.025)
    volume.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.32)
    oscillator.connect(volume)
    volume.connect(context.destination)
    oscillator.start(now + index * 0.16)
    oscillator.stop(now + index * 0.16 + 0.33)
  })
  window.setTimeout(() => void context.close(), 800)
}
const playMessageSound = async () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  if (context.state === 'suspended') await context.resume()
  const now = context.currentTime
  ;[740, 990].forEach((frequency, index) => {
    const start = now + index * 0.13
    const oscillator = context.createOscillator()
    const volume = context.createGain()
    oscillator.frequency.value = frequency
    oscillator.type = 'sine'
    volume.gain.setValueAtTime(0.0001, start)
    volume.gain.exponentialRampToValueAtTime(0.11, start + 0.018)
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.17)
    oscillator.connect(volume)
    volume.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.18)
  })
  window.setTimeout(() => void context.close(), 600)
}
const repairPlaybooks = [
  { id: 'network-connectivity', title: 'Connexion réseau', steps: ['Vérifier le Wi-Fi ou le câble réseau', 'Confirmer si d’autres appareils sont touchés', 'Désactiver puis réactiver la connexion réseau', 'Tester l’accès à la passerelle et à un site web', 'Noter le message d’erreur ou le résultat'] },
  { id: 'printer', title: 'Imprimante', steps: ['Vérifier l’alimentation et les voyants', 'Contrôler le papier et les consommables', 'Vérifier l’écran et noter tout code erreur', 'Vider puis relancer la file d’impression', 'Imprimer une page de test'] },
  { id: 'workstation', title: 'Poste de travail', steps: ['Vérifier alimentation, câbles et périphériques', 'Redémarrer le poste et reproduire le problème', 'Contrôler l’espace disque et les mises à jour', 'Vérifier si le problème touche une application précise', 'Noter le message d’erreur et l’heure du problème'] },
  { id: 'general-it', title: 'Diagnostic informatique général', steps: ['Reproduire le problème et noter les étapes', 'Vérifier les branchements et l’alimentation', 'Redémarrer l’équipement si possible', 'Vérifier si d’autres utilisateurs sont concernés', 'Ajouter les résultats et les messages d’erreur'] },
]
const suggestPlaybook = (ticket) => {
  const text = `${ticket.assetId} ${ticket.issue}`.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/imp|imprim|papier|impression|toner/.test(text)) return 'printer'
  if (/net|wifi|wi-fi|internet|reseau|connexion/.test(text)) return 'network-connectivity'
  if (/pc|poste|ordinateur|lent|demarr|ecran|clavier/.test(text)) return 'workstation'
  return 'general-it'
}
const statusLabels = { open: 'Ouvert', assigned: 'Attribué', in_progress: 'En cours', waiting_parts: 'En attente de pièces', resolved: 'Résolu', closed: 'Clôturé', reopened: 'Réouvert', cancelled: 'Annulé' }
const dbStatus = { Ouvert: 'open', Attribué: 'assigned', 'En cours': 'in_progress', 'En attente de pièces': 'waiting_parts', Résolu: 'resolved', Clôturé: 'closed', Réouvert: 'reopened', Annulé: 'cancelled' }

const mapTicket = (row, profiles = {}) => ({
  dbId: row.id,
  id: row.reference,
  assetId: row.asset_id,
  reporter: profiles[row.reporter_id] || 'Employé',
  issue: row.issue,
  urgency: row.priority === 'high' ? 'Haute' : 'Normale',
  status: statusLabels[row.status] || 'Ouvert',
  createdAt: new Date(row.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }),
  createdAtRaw: row.created_at,
  resolvedAt: row.resolved_at || null,
  slaStartedAt: row.sla_started_at || row.created_at,
  firstResponseAt: row.first_response_at || null,
  responseDueAt: row.response_due_at || null,
  resolutionDueAt: row.resolution_due_at || null,
  assignee: profiles[row.technician_id] || '',
  technicianId: row.technician_id || '',
  note: row.technician_note || '',
  level: row.technician_level || 1,
  attachments: row.attachments || [],
  escalations: row.escalations || [],
  playbook: row.playbook || null,
})

const getTicketSlaInfo = (ticket, now = Date.now()) => {
  if (!ticket || ['Résolu', 'Clôturé', 'Annulé'].includes(ticket.status)) return null
  const waitingForResponse = !ticket.firstResponseAt
  const dueAt = waitingForResponse ? ticket.responseDueAt : ticket.resolutionDueAt
  if (!dueAt) return null
  const remainingMs = new Date(dueAt).getTime() - now
  return {
    step: waitingForResponse ? 'Réponse' : 'Résolution',
    dueAt,
    remainingMs,
    state: remainingMs <= 0 ? 'breached' : remainingMs <= 60 * 60 * 1000 ? 'at-risk' : 'on-track',
  }
}

const formatSlaRemaining = (remainingMs) => {
  const totalMinutes = Math.max(1, Math.ceil(Math.abs(remainingMs) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const duration = hours ? `${hours} h${minutes ? ` ${minutes} min` : ''}` : `${minutes} min`
  return remainingMs < 0 ? `Dépassé de ${duration}` : `dans ${duration}`
}

const mergeChatMessages = (current, incoming) => {
  const byId = new Map([...current, ...incoming].map((message) => [message.id, message]))
  return [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}
const markChatRead = async (ticketId) => {
  const { error } = await supabase.rpc('mark_ticket_chat_read', { p_ticket_id: ticketId })
  if (error) console.warn('Could not mark chat as read:', error.message)
}

const readTickets = async (role) => {
  let query = supabase.from('tickets').select('*').order('created_at', { ascending: false })
  if (role === 'employee') {
    const { data: authData } = await supabase.auth.getUser()
    if (authData.user) query = query.eq('reporter_id', authData.user.id)
  }
  const { data: rows, error } = await query
  if (error) throw error
  if (!rows?.length) return []
  const { data: files, error: filesError } = await supabase.from('ticket_attachments').select('*').in('ticket_id', rows.map((row) => row.id))
  if (filesError) throw filesError
  const { data: events, error: eventError } = await supabase.from('ticket_escalations').select('*').in('ticket_id', rows.map((row) => row.id)).order('created_at', { ascending: true })
  if (eventError) throw eventError
  const { data: playbookRows, error: playbookError } = await supabase.from('ticket_playbook_progress').select('*').in('ticket_id', rows.map((row) => row.id))
  if (playbookError) throw playbookError
  const userIds = [...new Set([...rows.flatMap((row) => [row.reporter_id, row.technician_id]), ...(events || []).map((event) => event.technician_id)].filter(Boolean))]
  const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
  const names = Object.fromEntries((people || []).map((person) => [person.id, person.full_name]))
  const attachmentsByTicket = {}
  await Promise.all((files || []).map(async (file) => {
    const { data, error: urlError } = await supabase.storage.from('ticket-attachments').createSignedUrl(file.storage_path, 3600)
    if (!urlError && data?.signedUrl) {
      attachmentsByTicket[file.ticket_id] ||= []
      attachmentsByTicket[file.ticket_id].push({ name: file.file_name, mimeType: file.mime_type, url: data.signedUrl })
    }
  }))
  const escalationsByTicket = {}
  ;(events || []).forEach((event) => {
    escalationsByTicket[event.ticket_id] ||= []
    escalationsByTicket[event.ticket_id].push({
      fromLevel: event.from_level,
      toLevel: event.to_level,
      technician: names[event.technician_id] || 'Technicien',
      note: event.note,
      createdAt: new Date(event.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }),
    })
  })
  const playbooksByTicket = Object.fromEntries((playbookRows || []).map((row) => [row.ticket_id, {
    playbookId: row.playbook_id,
    checkedSteps: row.checked_steps || [],
    note: row.technician_note || '',
    updatedAt: row.updated_at,
  }]))
  return rows.map((row) => mapTicket({ ...row, attachments: attachmentsByTicket[row.id] || [], escalations: escalationsByTicket[row.id] || [], playbook: playbooksByTicket[row.id] || null }, names))
}

export default function App() {
  const [user, setUser] = useState(null)
  const [brand, setBrand] = useState(defaultBrand)
  const [tickets, setTickets] = useState([])
  const [ticketError, setTicketError] = useState('')
  const [notifications, setNotifications] = useState([])

  const loadProfile = async (authUser) => {
    if (!authUser) {
      setUser(null)
      setTickets([])
      return
    }
    const { data } = await supabase.from('profiles').select('full_name, role').eq('id', authUser.id).single()
    if (data) setUser({ id: authUser.id, name: data.full_name, email: authUser.email || '', role: data.role })
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => loadProfile(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => loadProfile(session?.user))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true
    const refreshBrand = async () => {
      const { data, error } = await supabase.from('company_settings').select('company_name, logo_path').eq('id', true).maybeSingle()
      if (!active || error || !data) return
      const logoUrl = data.logo_path ? supabase.storage.from('company-branding').getPublicUrl(data.logo_path).data.publicUrl : ''
      setBrand({ companyName: data.company_name || defaultBrand.companyName, logoPath: data.logo_path || '', logoUrl })
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshBrand()
    }
    void refreshBrand()
    const channel = supabase.channel('company-branding-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_settings' }, () => void refreshBrand())
      .subscribe()
    const timer = window.setInterval(() => void refreshBrand(), 60000)
    window.addEventListener('focus', refreshBrand)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshBrand)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setNotifications([])
      return undefined
    }
    try {
      setNotifications(JSON.parse(localStorage.getItem(`notifications-${user.id}`) || '[]'))
    } catch {
      setNotifications([])
    }
    return undefined
  }, [user?.id])

  useEffect(() => {
    if (!user || !['it_manager', 'admin'].includes(user.role)) return undefined
    let active = true
    const fromRow = (row) => ({
      id: `sla-${row.id}`,
      slaNotificationId: row.id,
      title: row.title,
      message: row.message,
      createdAt: row.created_at,
      read: Boolean(row.read_at),
    })
    supabase.from('ticket_sla_notifications').select('*').eq('recipient_id', user.id).is('read_at', null).order('created_at', { ascending: false }).limit(40)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.warn('Could not load SLA notifications:', error.message)
          return
        }
        const incoming = (data || []).map(fromRow)
        setNotifications((current) => {
          const existingIds = new Set(current.map((item) => item.id))
          return [...current, ...incoming.filter((item) => !existingIds.has(item.id))].slice(0, 40)
        })
      })
    const channel = supabase.channel(`ticket-sla-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_sla_notifications', filter: `recipient_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = fromRow(payload.new)
          setNotifications((current) => current.some((item) => item.id === incoming.id) ? current : [incoming, ...current].slice(0, 40))
        } else if (payload.eventType === 'UPDATE') {
          const updated = fromRow(payload.new)
          setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item))
        }
      }).subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [user?.id, user?.role])

  useEffect(() => {
    if (!user || user.role !== 'technician') return undefined
    let active = true
    const fromRow = (row) => ({
      id: `task-${row.id}`,
      taskNotificationId: row.id,
      title: row.title,
      message: row.message,
      createdAt: row.created_at,
      read: Boolean(row.read_at),
    })
    supabase.from('technician_task_notifications').select('*').eq('recipient_id', user.id).is('read_at', null).order('created_at', { ascending: false }).limit(40)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.warn('Could not load task notifications:', error.message)
          return
        }
        const incoming = (data || []).map(fromRow)
        setNotifications((current) => {
          const existingIds = new Set(current.map((item) => item.id))
          return [...current, ...incoming.filter((item) => !existingIds.has(item.id))].slice(0, 40)
        })
      })
    const channel = supabase.channel(`technician-task-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'technician_task_notifications', filter: `recipient_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = fromRow(payload.new)
          setNotifications((current) => current.some((item) => item.id === incoming.id) ? current : [incoming, ...current].slice(0, 40))
        } else if (payload.eventType === 'UPDATE') {
          const updated = fromRow(payload.new)
          setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item))
        }
      }).subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [user?.id, user?.role])

  useEffect(() => {
    if (user) localStorage.setItem(`notifications-${user.id}`, JSON.stringify(notifications.slice(0, 40)))
  }, [user?.id, notifications])

  useEffect(() => {
    if (!user) return undefined
    let active = true
    const refresh = async () => {
      try {
        const nextTickets = await readTickets(user.role)
        if (active) {
          setTickets(nextTickets)
          setTicketError('')
        }
      } catch (error) {
        if (active) setTicketError(error.message || 'Impossible de charger les demandes.')
      }
    }
    void refresh()
    const channel = supabase.channel(`tickets-${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
      const row = payload.new
      let notification
      if (payload.eventType === 'INSERT' && user.role !== 'employee' && row?.reference) {
        notification = { title: 'Nouvel incident', message: `Une nouvelle demande ${row.reference} a été signalée.` }
      } else if (payload.eventType === 'UPDATE' && user.role === 'employee' && row?.reporter_id === user.id && payload.old?.status !== row.status) {
        const status = statusLabels[row.status] || row.status
        notification = { title: 'Statut mis à jour', message: `Votre demande ${row.reference} est maintenant : ${status}.` }
      }
      if (notification) {
        setNotifications((current) => [{ ...notification, id: `${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), read: false }, ...current].slice(0, 40))
      }
      void refresh()
    }).subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [user])

  return user
    ? <Portal user={user} tickets={tickets} setTickets={setTickets} ticketError={ticketError} notifications={notifications} setNotifications={setNotifications} logout={() => supabase.auth.signOut()} brand={brand} onBrandChanged={setBrand} />
    : <Login brand={brand} />
}

function Login({ brand }) {
  const [signup, setSignup] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setMessage('')
    setLoading(true)
    const result = signup
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
      : await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    const duplicateEmail = signup && !result.error && result.data?.user?.identities?.length === 0
    setMessage(result.error ? result.error.message : duplicateEmail ? 'Un compte existe déjà avec cette adresse e-mail.' : signup ? 'Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.' : '')
  }

  const switchMode = () => {
    setSignup(!signup)
    setMessage('')
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-showcase" aria-label={brand.companyName}>
          <div className="showcase-top"><Brand light settings={brand} /><span className="showcase-tag">SUPPORT INFORMATIQUE</span></div>
          <div className="showcase-copy">
            <div className="logo-tile"><img src={brand.logoUrl || tescaLogo} alt={`Logo ${brand.companyName}`} /></div>
            <p className="showcase-kicker">SUPPORT INFORMATIQUE · MATÉRIEL</p>
            <h2>Votre matériel<br />repart du bon pied.</h2>
            <p className="showcase-description">Signalez une panne, retrouvez vos demandes et suivez chaque intervention jusqu’à la résolution.</p>
          </div>
          <div className="showcase-foot"><span className="status-dot" /> Votre équipe IT, toujours à vos côtés <span className="foot-year">{brand.companyName.toLocaleUpperCase('fr')}</span></div>
          <div className="showcase-orb orb-one" /><div className="showcase-orb orb-two" />
        </section>

        <section className="auth-panel">
          <div className="mobile-brand"><span className="mobile-logo"><img src={brand.logoUrl || tescaLogo} alt="" /></span><span className="mobile-brand-copy"><b>{brand.companyName}</b><small>SUPPORT INFORMATIQUE</small></span><span className="mobile-secure"><span /> SÉCURISÉ</span></div>
          <div className="auth-content">
            <div className="auth-heading"><p className="eyebrow">{signup ? 'VOTRE ESPACE TESCA' : 'GESTION DES INCIDENTS MATÉRIELS'}</p><h1>{signup ? 'Créer mon compte' : 'Content de vous revoir'}<span className="auth-title-dot">.</span></h1><p className="subtle">{signup ? 'Renseignez vos informations pour commencer.' : 'Connectez-vous pour signaler une panne ou suivre vos demandes IT.'}</p></div>
            {!signup && <div className="auth-service-note"><span className="service-note-icon" aria-hidden="true">⌘</span><span><b>Un souci avec votre matériel&nbsp;?</b><small>PC · imprimante · réseau</small></span><span className="service-note-status"><i /> Support actif</span></div>}
            <form className="auth-form" onSubmit={submit}>
              {signup && <label className="field auth-field"><span className="field-label">Nom complet</span><span className="input-wrap"><span className="field-icon" aria-hidden="true">✳</span><input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Amel Ben Salem" /></span></label>}
              <label className="field auth-field"><span className="field-label">Adresse e-mail</span><span className="input-wrap"><span className="field-icon" aria-hidden="true">@</span><input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nom@entreprise.com" /></span></label>
              <label className="field auth-field"><span className="field-label">Mot de passe</span><span className="input-wrap"><span className="field-icon password-icon" aria-hidden="true">●</span><input autoComplete={signup ? 'new-password' : 'current-password'} required minLength="6" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6 caractères minimum" /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showPassword ? 'Masquer' : 'Voir'}</button></span></label>
              {message && <p className={`form-message ${message.includes('Compte créé') ? 'form-success' : ''}`} role="status">{message}</p>}
              <button className="primary-action" disabled={loading}>{loading ? 'Un instant…' : signup ? 'Créer mon compte' : 'Se connecter'} <span aria-hidden="true">↗</span></button>
            </form>
            <div className="auth-switch"><span>{signup ? 'Déjà un compte ?' : 'Première visite ?'}</span><button className="text-button" onClick={switchMode}>{signup ? 'Se connecter' : 'Créer un compte'}</button></div>
            <p className="auth-legal">En continuant, vous accédez à votre espace de support Tesca.</p>
          </div>
          <div className="auth-mobile-foot"><span className="mobile-foot-pulse" /> Votre équipe IT est là pour vous <span className="mobile-foot-brand">TESCA GROUP</span></div>
        </section>
      </div>
    </main>
  )
}

function Portal({ user, tickets, setTickets, ticketError, notifications, setNotifications, logout, brand, onBrandChanged }) {
  const [activeChatTicket, setActiveChatTicket] = useState(null)
  return (
    <main className={`app-shell ${Capacitor.isNativePlatform() ? 'native-experience' : 'web-experience'}`}>
      <PushRegistration userId={user.id} />
      <Header user={user} logout={logout} notifications={notifications} setNotifications={setNotifications} brand={brand} />
      <ChatInbox user={user} tickets={tickets} selectedTicket={activeChatTicket} setSelectedTicket={setActiveChatTicket} />
      <div className="portal-content">
        {ticketError && <Notice title="Synchronisation indisponible" text={ticketError} />}
        {user.role === 'employee'
          ? <Employee user={user} tickets={tickets} setTickets={setTickets} onOpenChat={setActiveChatTicket} />
          : <Technician user={user} tickets={tickets} setTickets={setTickets} onOpenChat={setActiveChatTicket} brand={brand} onBrandChanged={onBrandChanged} />}
      </div>
    </main>
  )
}

function PushRegistration({ userId }) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined
    let active = true
    const listeners = []
    const setup = async () => {
      try {
        listeners.push(await PushNotifications.addListener('registration', async ({ value }) => {
          if (!active || !value) return
          const { error } = await supabase.from('push_tokens').upsert({
            user_id: userId,
            token: value,
            platform: Capacitor.getPlatform(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,token' })
          if (error) console.error('Could not save push token:', error.message)
        }))
        listeners.push(await PushNotifications.addListener('registrationError', (error) => console.error('Push registration failed:', error)))
        let permission = await PushNotifications.checkPermissions()
        if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions()
        if (!active || permission.receive !== 'granted') return
        if (Capacitor.getPlatform() === 'android') {
          await PushNotifications.createChannel({ id: 'incident-updates', name: 'Mises à jour des incidents', description: 'Nouvelles demandes et changements de statut', importance: 5, visibility: 1, vibration: true })
        }
        await PushNotifications.register()
      } catch (error) {
        console.error('Push notifications are not configured:', error)
      }
    }
    void setup()
    return () => {
      active = false
      listeners.forEach((listener) => { void listener.remove() })
    }
  }, [userId])
  return null
}

function Employee({ user, tickets, setTickets, onOpenChat }) {
  const [assetId, setAssetId] = useState(assets[0][0])
  const [issue, setIssue] = useState('')
  const [urgency, setUrgency] = useState('Normale')
  const [files, setFiles] = useState([])
  const [sent, setSent] = useState(false)
  const [createdReference, setCreatedReference] = useState('')
  const [createdTicketId, setCreatedTicketId] = useState('')
  const [highlightedTicketId, setHighlightedTicketId] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [voiceLanguage, setVoiceLanguage] = useState('fr-FR')
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [ticketQuery, setTicketQuery] = useState('')
  const [ticketStatus, setTicketStatus] = useState('Tous')
  const dictateIssue = async () => {
    setVoiceError('')
    setVoiceBusy(true)
    try {
      let transcript = ''
      if (Capacitor.isNativePlatform()) {
        const permission = await SpeechRecognition.requestPermissions()
        if (permission.speechRecognition !== 'granted') throw new Error('Autorisez l’accès au microphone pour dicter votre demande.')
        const { available } = await SpeechRecognition.available()
        if (!available) throw new Error('La dictée vocale n’est pas disponible sur cet appareil.')
        const result = await SpeechRecognition.start({ language: voiceLanguage, maxResults: 1, prompt: 'Décrivez le problème rencontré', partialResults: false, popup: true })
        transcript = result.matches?.[0] || ''
      } else {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!Recognition) throw new Error('La dictée vocale n’est pas prise en charge par ce navigateur.')
        transcript = await new Promise((resolve, reject) => {
          const recognition = new Recognition()
          recognition.lang = voiceLanguage
          recognition.interimResults = false
          recognition.maxAlternatives = 1
          recognition.onresult = (event) => resolve(event.results?.[0]?.[0]?.transcript || '')
          recognition.onerror = (event) => reject(new Error(event.error === 'not-allowed' ? 'Autorisez le microphone dans votre navigateur.' : 'La dictée vocale a échoué. Réessayez.'))
          recognition.start()
        })
      }
      if (transcript.trim()) setIssue((current) => `${current.trim()}${current.trim() ? ' ' : ''}${transcript.trim()}`.slice(0, 4000))
    } catch (error) {
      console.warn('Voice dictation failed:', error)
      setVoiceError(error.message || 'Impossible de démarrer la dictée vocale.')
    } finally {
      setVoiceBusy(false)
    }
  }
  const submit = async (event) => {
    event.preventDefault()
    if (!issue.trim()) return
    setSubmitError('')
    const { data, error } = await supabase.from('tickets').insert({
      asset_id: assetId,
      reporter_id: user.id,
      issue: issue.trim(),
      priority: urgency === 'Haute' ? 'high' : 'normal',
      status: 'open',
    }).select().single()
    if (error) {
      setSubmitError(error.message)
      return
    }
    setCreatedReference(data.reference || '')
    setCreatedTicketId(data.id)
    let fileError = ''
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${data.id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('ticket-attachments').upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) { fileError = `L’incident est créé, mais l’envoi de ${file.name} a échoué : ${uploadError.message}`; break }
      const { error: metadataError } = await supabase.from('ticket_attachments').insert({ ticket_id: data.id, storage_path: path, file_name: file.name, mime_type: file.type })
      if (metadataError) { fileError = `L’incident est créé, mais l’enregistrement de ${file.name} a échoué : ${metadataError.message}`; break }
    }
    if (fileError) setSubmitError(fileError)
    const { data: savedFiles } = await supabase.from('ticket_attachments').select('*').eq('ticket_id', data.id)
    const attachments = await Promise.all((savedFiles || []).map(async (file) => {
      const { data: signed } = await supabase.storage.from('ticket-attachments').createSignedUrl(file.storage_path, 3600)
      return signed?.signedUrl ? { name: file.file_name, mimeType: file.mime_type, url: signed.signedUrl } : null
    }))
    setTickets((all) => [mapTicket({ ...data, attachments: attachments.filter(Boolean) }, { [user.id]: user.name }), ...all])
    setIssue('')
    setFiles([])
    setSent(true)
    void playResolutionSound().catch((soundError) => console.warn('Success sound could not play:', soundError))
  }
  const closeSuccess = () => {
    setSent(false)
    if (!Capacitor.isNativePlatform() || !createdTicketId) return
    setHighlightedTicketId(createdTicketId)
    window.setTimeout(() => setHighlightedTicketId(''), 3500)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById(`ticket-${createdTicketId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }))
  }
  const cancelTicket = async (ticket) => {
    const { data, error } = await supabase.rpc('cancel_own_ticket', { p_ticket_id: ticket.dbId })
    if (error) return { ok: false, error: error.code === '42501' ? 'Cette demande a déjà été prise en charge ou ne peut plus être annulée.' : error.message }
    setTickets((all) => all.map((current) => current.dbId === ticket.dbId
      ? { ...mapTicket(data, { [user.id]: user.name }), attachments: current.attachments, escalations: current.escalations, playbook: current.playbook }
      : current))
    return { ok: true }
  }
  const mine = tickets.filter((ticket) => ticket.reporter === user.name)
  const normalizedQuery = ticketQuery.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const visibleTickets = mine.filter((ticket) => {
    const matchesStatus = ticketStatus === 'Tous' || ticket.status === ticketStatus
    const searchable = [ticket.id, ticket.assetId, getAsset(ticket.assetId)[1], ticket.issue, ticket.status]
      .join(' ').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery))
  })

  return <>
    <Welcome label="ESPACE EMPLOYÉ" name={user.name} text="Un souci avec votre équipement ? On s’en occupe." />
    <section className="grid employee-grid">
      <form className="card form-card" onSubmit={submit}>
        <div className="card-heading"><span className="heading-icon">＋</span><div><p className="eyebrow">NOUVELLE DEMANDE</p><h2>Signaler un problème</h2></div></div>
        {submitError && <p className="form-message" role="alert">{submitError}</p>}
        <label className="field">Équipement concerné<select value={assetId} onChange={(event) => setAssetId(event.target.value)}>{assets.map((asset) => <option key={asset[0]} value={asset[0]}>{asset[0]} — {asset[1]}</option>)}</select></label>
        <div className="preview"><span className="preview-icon">▣</span><div><b>{getAsset(assetId)[1]}</b><small>{getAsset(assetId)[3]}</small></div><span className="preview-code">{assetId}</span></div>
        <label className="field">Décrivez le problème<textarea required maxLength={4000} value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="Que se passe-t-il ? Ajoutez quelques détails…" /></label>
        <div className="voice-entry">
          <label className="voice-language">Langue de dictée<select value={voiceLanguage} onChange={(event) => setVoiceLanguage(event.target.value)} disabled={voiceBusy}><option value="fr-FR">Français</option><option value="ar-TN">العربية</option><option value="en-US">English</option></select></label>
          <button type="button" className={`voice-button ${voiceBusy ? 'voice-button-active' : ''}`} onClick={() => void dictateIssue()} disabled={voiceBusy}><span aria-hidden="true">{voiceBusy ? '●' : '🎙'}</span>{voiceBusy ? 'Écoute en cours…' : 'Dicter le problème'}</button>
        </div>
        <small className="voice-help">La reconnaissance utilise le service vocal disponible sur votre appareil.</small>
        {voiceError && <p className="voice-error" role="alert">{voiceError}</p>}
        <label className="field">Photos ou pièces jointes<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => {
          const selected = Array.from(event.target.files || [])
          if (selected.length > 5) { setSubmitError('Vous pouvez joindre jusqu’à 5 fichiers.'); event.target.value = ''; return }
          const oversized = selected.find((file) => file.size > 10 * 1024 * 1024)
          if (oversized) { setSubmitError(`${oversized.name} dépasse la limite de 10 Mo.`); event.target.value = ''; return }
          setSubmitError('')
          setFiles(selected)
        }} /><small className="upload-help">Jusqu’à 5 photos ou PDF, 10 Mo maximum par fichier.</small></label>
        {files.length > 0 && <ul className="selected-files">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>}
        <label className="field">Niveau d’urgence<select value={urgency} onChange={(event) => setUrgency(event.target.value)}><option>Normale</option><option>Haute</option></select></label>
        <button className="primary-action">Envoyer la demande <span aria-hidden="true">↗</span></button>
        <p className="form-caption"><span className="lock-icon">◈</span> Votre demande sera transmise uniquement à l’équipe IT.</p>
      </form>
      <section className="card tracking-card">
        <div className="card-heading"><span className="heading-icon heading-icon-soft">◷</span><div><p className="eyebrow">VOTRE ACTIVITÉ</p><h2>Mes demandes <span className="count-pill">{mine.length}</span></h2></div></div>
        <p className="card-intro">Gardez un œil sur vos signalements récents.</p>
        {mine.length > 0 && <div className="ticket-search-tools"><label className="ticket-search"><span aria-hidden="true">⌕</span><input type="search" value={ticketQuery} onChange={(event) => setTicketQuery(event.target.value)} placeholder="Référence, équipement ou description" aria-label="Rechercher dans mes demandes" /></label><select value={ticketStatus} onChange={(event) => setTicketStatus(event.target.value)} aria-label="Filtrer mes demandes par statut"><option value="Tous">Tous les statuts</option>{[...new Set(mine.map((ticket) => ticket.status))].map((status) => <option key={status}>{status}</option>)}</select></div>}
        <div className="ticket-list">{mine.length ? visibleTickets.length ? visibleTickets.map((ticket) => <Ticket key={ticket.id} ticket={ticket} user={user} onOpenChat={onOpenChat} onCancel={cancelTicket} highlighted={ticket.dbId === highlightedTicketId} />) : <p className="empty">Aucune demande ne correspond à cette recherche.</p> : <p className="empty">Aucune demande pour le moment. Vos signalements apparaîtront ici.</p>}</div>
      </section>
    </section>
    {sent && <SuccessDialog reference={createdReference} native={Capacitor.isNativePlatform()} onClose={closeSuccess} />}
    <EmployeeHelpChat />
  </>
}

function EmployeeHelpChat() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([{ from: 'bot', text: 'Bonjour ! Je peux vous aider avec vos demandes informatiques. Que souhaitez-vous savoir ?' }])

  const answerQuestion = (text) => {
    const value = text.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (/signal|declar|creer|ouvrir|report|panne|probleme/.test(value)) return 'Pour signaler un problème : choisissez l’équipement concerné, décrivez ce qui se passe, sélectionnez le niveau d’urgence puis appuyez sur « Envoyer la demande ». Votre signalement apparaîtra dans « Mes demandes ».'
    if (/suivi|etat|statut|avancement|demande|ticket/.test(value)) return 'Retrouvez vos signalements dans la carte « Mes demandes ». Le statut indique si le problème est ouvert, en cours ou résolu.'
    if (/urgent|urgence|priorite|grave/.test(value)) return 'Choisissez « Haute » si l’incident empêche un travail important ou touche plusieurs personnes. Sinon, sélectionnez « Normale ». En cas de danger électrique ou de fumée, éloignez-vous du matériel et prévenez directement votre équipe IT.'
    if (/materiel|equipement|pc|ordinateur|imprimante|reseau|routeur/.test(value)) return 'Vous pouvez signaler un problème concernant un PC, une imprimante ou un équipement réseau. Choisissez l’équipement dans le formulaire pour que l’équipe IT sache où intervenir.'
    if (/mot de passe|connexion|connecter|compte|acces|email|mail/.test(value)) return 'Vérifiez votre adresse e-mail et votre mot de passe. Si vous ne pouvez toujours pas accéder à votre compte, contactez directement l’équipe IT pour qu’elle vous aide.'
    return 'Je peux répondre aux questions sur le signalement d’un problème, le suivi d’une demande, l’urgence et les équipements pris en charge. Pour une autre question, contactez votre équipe IT.'
  }

  const ask = (text) => {
    const cleanText = text.trim()
    if (!cleanText) return
    setMessages((items) => [...items, { from: 'user', text: cleanText }, { from: 'bot', text: answerQuestion(cleanText) }])
    setQuestion('')
  }

  return <aside className={`help-chat ${open ? 'help-chat-open' : ''}`} aria-label="Assistant informatique">
    {open && <section className="help-chat-panel" aria-label="Discussion avec l’assistant">
      <header className="help-chat-header"><span className="help-chat-avatar" aria-hidden="true">?</span><span><b>Assistant IT</b><small><i /> Aide aux employés</small></span><button type="button" className="help-chat-close" onClick={() => setOpen(false)} aria-label="Fermer l’assistant">×</button></header>
      <div className="help-chat-messages" aria-live="polite">{messages.map((message, index) => <p key={`${index}-${message.from}`} className={`help-chat-message ${message.from}`}>{message.text}</p>)}</div>
      {messages.length === 1 && <div className="help-chat-prompts"><button type="button" onClick={() => ask('Comment signaler un problème ?')}>Signaler un problème</button><button type="button" onClick={() => ask('Comment suivre ma demande ?')}>Suivre une demande</button><button type="button" onClick={() => ask('Quels équipements sont concernés ?')}>Équipements concernés</button></div>}
      <form className="help-chat-form" onSubmit={(event) => { event.preventDefault(); ask(question) }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Écrivez votre question…" aria-label="Votre question" /><button type="submit" disabled={!question.trim()} aria-label="Envoyer la question">➤</button></form>
    </section>}
    <button type="button" className="help-chat-launcher" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'Fermer l’assistant informatique' : 'Ouvrir l’assistant informatique'}><span aria-hidden="true">{open ? '×' : '✦'}</span>{!open && <b>Besoin d’aide ?</b>}</button>
  </aside>
}

function Technician({ user, tickets, setTickets, onOpenChat, brand, onBrandChanged }) {
  const [selectedId, setSelectedId] = useState(tickets[0]?.id)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const queueRef = useRef(null)
  const detailRef = useRef(null)
  const scrollToDetailOnMobile = useRef(false)
  const [filter, setFilter] = useState('Tous')
  const [ticketQuery, setTicketQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('Tous')
  const [activePage, setActivePage] = useState(user.role === 'it_manager' || user.role === 'admin' ? 'overview' : 'map')
  const [updateError, setUpdateError] = useState('')
  const [technicians, setTechnicians] = useState([])
  const [assignmentId, setAssignmentId] = useState('')
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const isManager = user.role === 'it_manager'
  const isAdmin = user.role === 'admin'
  const canManageTickets = isManager || isAdmin
  const selected = tickets.find((ticket) => ticket.id === selectedId) || tickets[0]
  useEffect(() => {
    if (!scrollToDetailOnMobile.current) return
    scrollToDetailOnMobile.current = false
    if (window.matchMedia('(max-width: 680px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [selectedId])
  const selectTicket = (ticketId) => {
    scrollToDetailOnMobile.current = true
    if (Capacitor.isNativePlatform() && window.matchMedia('(max-width: 680px)').matches) setMobileDetailOpen(true)
    setSelectedId(ticketId)
  }
  const returnToQueue = () => {
    setMobileDetailOpen(false)
    requestAnimationFrame(() => queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  useEffect(() => {
    if (!canManageTickets) return
    supabase.from('profiles').select('id, full_name, role').in('role', ['technician', 'it_manager', 'admin']).order('full_name')
      .then(({ data, error }) => error ? setUpdateError(error.message) : setTechnicians(data || []))
  }, [canManageTickets])
  useEffect(() => setAssignmentId(selected?.technicianId || ''), [selected?.dbId, selected?.technicianId])
  const normalizedQuery = ticketQuery.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const shown = tickets.filter((ticket) => {
    const searchable = [ticket.id, ticket.assetId, getAsset(ticket.assetId)[1], getAsset(ticket.assetId)[2], ticket.issue, ticket.reporter, ticket.assignee]
      .filter(Boolean).join(' ').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return (filter === 'Tous' || ticket.status === filter)
      && (departmentFilter === 'Tous' || getAsset(ticket.assetId)[2] === departmentFilter)
      && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
  const update = async (status, note, level = selected?.level || 1) => {
    if (!selected) return
    setUpdateError('')
    const { data, error } = await supabase.from('tickets').update({
      status: dbStatus[status],
      technician_note: note,
      technician_level: level,
      technician_id: status === 'Ouvert' ? null : canManageTickets ? (selected.technicianId || user.id) : user.id,
    }).eq('id', selected.dbId).select().single()
    if (error) {
      setUpdateError(error.message)
      return false
    }
    setTickets((all) => all.map((ticket) => ticket.dbId === selected.dbId
      ? { ...mapTicket(data, { [data.reporter_id]: selected.reporter, [user.id]: user.name }), attachments: selected.attachments, escalations: selected.escalations, playbook: selected.playbook }
      : ticket))
    return true
  }
  const assignTicket = async () => {
    if (!selected || !canManageTickets) return
    setAssignmentBusy(true)
    setUpdateError('')
    const assignedTech = technicians.find((person) => person.id === assignmentId)
    const { data, error } = await supabase.from('tickets').update({
      technician_id: assignmentId || null,
      status: assignmentId && selected.status === 'Ouvert' ? 'assigned' : !assignmentId && selected.status === 'Attribu\u00e9' ? 'open' : dbStatus[selected.status],
    }).eq('id', selected.dbId).select().single()
    setAssignmentBusy(false)
    if (error) {
      setUpdateError(error.message)
      return
    }
    setTickets((all) => all.map((ticket) => ticket.dbId === selected.dbId
      ? { ...ticket, technicianId: data.technician_id || '', assignee: assignedTech?.full_name || '', status: statusLabels[data.status] || ticket.status }
      : ticket))
  }
  const escalate = async (note) => {
    if (!selected) return
    setUpdateError('')
    const { data, error } = await supabase.rpc('escalate_ticket', { p_ticket_id: selected.dbId, p_note: note })
    if (error) {
      setUpdateError(error.message)
      return
    }
    const ticketRow = data?.ticket
    const event = data?.escalation
    if (!ticketRow || !event) {
      setUpdateError('La demande a été escaladée, mais son historique n’a pas pu être actualisé. Rechargez la page.')
      return
    }
    const escalation = {
      fromLevel: event.from_level,
      toLevel: event.to_level,
      technician: user.name,
      note: event.note,
      createdAt: new Date(event.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }),
    }
    setTickets((all) => all.map((ticket) => ticket.dbId === selected.dbId
      ? { ...mapTicket(ticketRow, { [ticketRow.reporter_id]: selected.reporter }), attachments: selected.attachments, escalations: [...(selected.escalations || []), escalation], playbook: selected.playbook }
      : ticket))
  }
  const savePlaybook = async (ticket, progress) => {
    const { data, error } = await supabase.from('ticket_playbook_progress').upsert({
      ticket_id: ticket.dbId,
      playbook_id: progress.playbookId,
      checked_steps: progress.checkedSteps,
      technician_note: progress.note,
      technician_id: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ticket_id' }).select().single()
    if (error) return { ok: false, error: error.message }
    const saved = { playbookId: data.playbook_id, checkedSteps: data.checked_steps || [], note: data.technician_note || '', updatedAt: data.updated_at }
    setTickets((all) => all.map((item) => item.dbId === ticket.dbId ? { ...item, playbook: saved } : item))
    return { ok: true }
  }
  const count = (status) => tickets.filter((ticket) => ticket.status === status).length
  const welcomeLabel = isAdmin ? (activePage === 'overview' ? 'PILOTAGE ADMINISTRATEUR' : activePage === 'admin-users' ? 'ADMINISTRATION DES COMPTES' : activePage === 'branding' ? 'IDENTITÉ DE L’ENTREPRISE' : 'ANALYSE DU SUPPORT') : isManager && activePage === 'overview' ? 'PILOTAGE IT' : isManager ? 'GESTION DES INCIDENTS' : activePage === 'stats' ? 'STATISTIQUES' : activePage === 'map' ? 'PLAN DU SITE' : 'ESPACE TECHNICIEN'
  const welcomeText = isAdmin ? (activePage === 'admin-users' ? 'Gérez les accès et les rôles des comptes de votre organisation.' : activePage === 'branding' ? 'Personnalisez le nom et le logo visibles pour toute votre organisation.' : activePage === 'stats' ? 'Suivez le volume et les tendances de votre support informatique.' : 'Vue d’ensemble des incidents, des priorités et de la charge de l’équipe.') : isManager && activePage === 'overview' ? 'Suivez la charge, les priorités et les incidents à traiter.' : isManager ? 'Attribuez les demandes et coordonnez les interventions.' : 'Le tableau de bord de vos interventions.'

  return <>
    <Welcome label={welcomeLabel} name={user.name} text={welcomeText} className={activePage === 'stats' ? 'welcome-stats' : ''} />
    <nav className={`technician-page-tabs ${isManager ? 'manager-page-tabs' : ''} ${isAdmin ? 'admin-page-tabs' : ''}`} role="tablist" aria-label={isAdmin ? 'Pages administrateur' : isManager ? 'Pages responsable IT' : 'Pages technicien'}>
      {canManageTickets && <button type="button" role="tab" id="tab-overview" aria-controls="panel-overview" aria-selected={activePage === 'overview'} className={activePage === 'overview' ? 'active' : ''} onClick={() => setActivePage('overview')}>{isAdmin ? 'Vue admin' : 'Vue manager'}</button>}
      {isAdmin && <button type="button" role="tab" id="tab-admin-users" aria-controls="panel-admin-users" aria-selected={activePage === 'admin-users'} className={activePage === 'admin-users' ? 'active' : ''} onClick={() => setActivePage('admin-users')}>Comptes</button>}
      {isAdmin && <button type="button" role="tab" id="tab-admin-branding" aria-controls="panel-admin-branding" aria-selected={activePage === 'branding'} className={activePage === 'branding' ? 'active' : ''} onClick={() => setActivePage('branding')}>Identité</button>}
      {!isAdmin && <button type="button" role="tab" id="tab-tickets" aria-controls="panel-tickets" aria-selected={activePage === 'tickets'} className={activePage === 'tickets' ? 'active' : ''} onClick={() => setActivePage('tickets')}>Interventions</button>}
      <button type="button" role="tab" id="tab-tasks" aria-controls="panel-tasks" aria-selected={activePage === 'tasks'} className={activePage === 'tasks' ? 'active' : ''} onClick={() => setActivePage('tasks')}>{'T\u00e2ches'}</button>
      <button type="button" role="tab" id="tab-stats" aria-controls="panel-stats" aria-selected={activePage === 'stats'} className={activePage === 'stats' ? 'active' : ''} onClick={() => setActivePage('stats')}>Statistiques</button>
      <button type="button" role="tab" id="tab-map" aria-controls="panel-map" aria-selected={activePage === 'map'} className={activePage === 'map' ? 'active' : ''} onClick={() => setActivePage('map')}>Carte du site</button>
    </nav>
    {canManageTickets && activePage === 'overview' && <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview"><ManagerOverview tickets={tickets} technicians={technicians} onOpenTickets={() => setActivePage('tickets')} onOpenTasks={() => setActivePage('tasks')} isAdmin={isAdmin} /></div>}
    {isAdmin && activePage === 'admin-users' && <div role="tabpanel" id="panel-admin-users" aria-labelledby="tab-admin-users"><AdminUsers currentUserId={user.id} /></div>}
    {isAdmin && activePage === 'branding' && <div role="tabpanel" id="panel-admin-branding" aria-labelledby="tab-admin-branding"><AdminBranding brand={brand} onBrandChanged={onBrandChanged} /></div>}
    {activePage === 'tasks' && <div role="tabpanel" id="panel-tasks" aria-labelledby="tab-tasks"><TaskCenter user={user} technicians={technicians} /></div>}
    {activePage === 'stats' && <div role="tabpanel" id="panel-stats" aria-labelledby="tab-stats">
      <TicketAnalytics tickets={tickets} />
    </div>}
    {activePage === 'map' && <div role="tabpanel" id="panel-map" aria-labelledby="tab-map"><FacilityMap tickets={tickets} user={user} /></div>}
    {!isAdmin && activePage === 'tickets' && <section role="tabpanel" id="panel-tickets" aria-labelledby="tab-tickets" className={`grid technician-grid ${mobileDetailOpen ? 'mobile-detail-open' : ''}`}>
      <section ref={queueRef} className="card queue-card">
        <div className="card-heading"><span className="heading-icon">≡</span><div><p className="eyebrow">VUE D’ENSEMBLE</p><h2>File d’intervention</h2></div></div>
        <label className="ticket-search"><span aria-hidden="true">⌕</span><input type="search" value={ticketQuery} onChange={(event) => setTicketQuery(event.target.value)} placeholder="Référence, demandeur, équipement…" aria-label="Rechercher des interventions" /></label>
        <div className="ticket-advanced-filter"><label htmlFor="ticket-department-filter">Département</label><select id="ticket-department-filter" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="Tous">Tous les départements</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></div>
        <div className="filters" role="group" aria-label="Filtrer les incidents">{['Tous', 'Ouvert', 'En cours', 'Résolu', 'Annulé'].map((value) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{value}{value === 'Tous' && <span className="filter-count">{tickets.length}</span>}</button>)}</div>
        <div className="ticket-list">{shown.length ? shown.map((ticket) => <button className={`ticket select ${selected?.id === ticket.id ? 'selected' : ''}`} key={ticket.id} onClick={() => selectTicket(ticket.id)}><span className="queue-indicator" /><div><b>{getAsset(ticket.assetId)[1]}</b><small>{ticket.id} · {ticket.assetId} · {ticket.reporter}</small><small className="queue-issue">{ticket.issue}</small><SlaIndicator ticket={ticket} compact /></div><Status status={ticket.status} /></button>) : <p className="empty">Aucun incident dans cette catégorie.</p>}</div>
      </section>
      {selected && <Detail detailRef={detailRef} onBackToQueue={returnToQueue} showMobileBack={Capacitor.isNativePlatform()} ticket={selected} user={user} onOpenChat={onOpenChat} update={update} escalate={escalate} savePlaybook={savePlaybook} updateError={updateError} technicians={technicians} assignmentId={assignmentId} setAssignmentId={setAssignmentId} assignTicket={assignTicket} assignmentBusy={assignmentBusy} />}
    </section>}
  </>
}

function TaskCenter({ user, technicians }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [equipment, setEquipment] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [completionNotes, setCompletionNotes] = useState({})
  const canAssign = ['it_manager', 'admin'].includes(user.role)
  const loadTasks = async () => {
    const { data, error: loadError } = await supabase.from('technician_tasks').select('*').order('created_at', { ascending: false })
    if (loadError) setError(loadError.message)
    else { setTasks(data || []); setError('') }
    setLoading(false)
  }
  useEffect(() => {
    let active = true
    const refresh = async () => {
      const { data, error: loadError } = await supabase.from('technician_tasks').select('*').order('created_at', { ascending: false })
      if (!active) return
      if (loadError) setError(loadError.message)
      else { setTasks(data || []); setError('') }
      setLoading(false)
    }
    void refresh()
    const channel = supabase.channel(`technician-tasks-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'technician_tasks' }, () => void refresh())
      .subscribe()
    return () => { active = false; void supabase.removeChannel(channel) }
  }, [user.id])
  const createTask = async (event) => {
    event.preventDefault()
    if (!assignedTo) { setError('Choisissez un technicien.'); return }
    setSaving(true); setError(''); setMessage('')
    try {
      const { error: createError } = await supabase.from('technician_tasks').insert({ title: title.trim(), description: description.trim(), equipment: equipment.trim(), assigned_to: assignedTo, created_by: user.id, due_date: dueDate || null })
      if (createError) throw createError
      setTitle(''); setDescription(''); setEquipment(''); setDueDate('')
      setMessage('T\u00e2che attribu\u00e9e. Le technicien recevra une notification dans l\u2019application.')
      await loadTasks()
    } catch (createError) {
      setError(createError?.message || 'Impossible de cr\u00e9er la t\u00e2che. V\u00e9rifiez votre connexion et r\u00e9essayez.')
    } finally {
      setSaving(false)
    }
  }
  const updateTask = async (task, status) => {
    setError('')
    const { error: updateError } = await supabase.from('technician_tasks').update({ status, completion_note: status === 'completed' ? (completionNotes[task.id] || '').trim() : task.completion_note, updated_at: new Date().toISOString() }).eq('id', task.id)
    if (updateError) setError(updateError.message)
    else void loadTasks()
  }
  const names = Object.fromEntries(technicians.map((person) => [person.id, person.full_name]))
  const statusLabels = { pending: 'À faire', in_progress: 'En cours', completed: 'Terminée', cancelled: 'Annulée' }
  return <section className="task-center">
    {canAssign && <section className="card task-form-card">
      <div className="card-heading"><span className="heading-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span><div><p className="eyebrow">NOUVELLE MISSION</p><h2>{'Attribuer une t\u00e2che'}</h2></div></div>
      <p className="card-intro">{'Cr\u00e9ez une intervention planifi\u00e9e, par exemple une v\u00e9rification antivirus sur plusieurs postes.'}</p>
      <form onSubmit={(event) => void createTask(event)}>
        <label className="task-field">Titre<input required minLength="3" maxLength="160" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Vérifier l’antivirus des postes" /></label>
        <label className="task-field">Consignes<textarea maxLength="2000" rows="3" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Détaillez les vérifications à effectuer." /></label>
        <div className="task-form-row">
          <label className="task-field">Équipement / zone<input maxLength="160" value={equipment} onChange={(event) => setEquipment(event.target.value)} placeholder="Ex. Tous les PC Finance" /></label>
          <label className="task-field">Technicien<select required value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}><option value="">Choisir un technicien</option>{technicians.filter((person) => person.role === 'technician').map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
          <label className="task-field">Date limite<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
        </div>
        <button type="submit" className="primary-action task-submit" disabled={saving}>{saving ? 'Attribution...' : 'Attribuer la tâche'} <span aria-hidden="true">→</span></button>
      </form>
    </section>}
    <section className="card task-list-card">
      <div className="card-heading"><span className="heading-icon heading-icon-soft">✓</span><div><p className="eyebrow">SUIVI DES MISSIONS</p><h2>{canAssign ? 'Tâches de l’équipe' : 'Mes tâches'}</h2></div></div>
      {error && <p className="form-message" role="alert">{error}</p>}{message && <p className="task-success" role="status">{message}</p>}
      {loading ? <p className="empty">Chargement des tâches...</p> : tasks.length ? <div className="task-list">{tasks.map((task) => <article className="task-row" key={task.id}>
        <div className="task-row-head"><div><h3>{task.title}</h3><small>{canAssign ? `Attribuée à ${names[task.assigned_to] || 'Technicien'}` : 'Mission attribuée par le responsable IT'}{task.equipment ? ` · ${task.equipment}` : ''}</small></div><span className={`task-status task-status-${task.status}`}>{statusLabels[task.status] || task.status}</span></div>
        {task.description && <p className="task-description">{task.description}</p>}
        <div className="task-row-meta"><span>Créée le {new Date(task.created_at).toLocaleDateString('fr-FR')}</span>{task.due_date && <span>Échéance : {new Date(`${task.due_date}T00:00:00`).toLocaleDateString('fr-FR')}</span>}</div>
        {!canAssign && task.status !== 'completed' && task.status !== 'cancelled' && <div className="task-progress"><label className="task-field">Note de fin (facultatif)<textarea rows="2" value={completionNotes[task.id] ?? task.completion_note ?? ''} onChange={(event) => setCompletionNotes((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="Résultat ou anomalie constatée" /></label><div><button type="button" onClick={() => void updateTask(task, 'in_progress')} disabled={task.status === 'in_progress'}>Commencer</button><button type="button" className="task-complete" onClick={() => void updateTask(task, 'completed')}>Terminer</button></div></div>}
        {task.status === 'completed' && task.completion_note && <p className="task-completion-note"><b>Compte rendu :</b> {task.completion_note}</p>}
      </article>)}</div> : <p className="empty">{canAssign ? 'Aucune tâche attribuée pour le moment.' : 'Aucune tâche ne vous a été attribuée pour le moment.'}</p>}
    </section>
  </section>
}

function ManagerOverview({ tickets, technicians, onOpenTickets, onOpenTasks, isAdmin = false }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  const active = tickets.filter((ticket) => !['R\u00e9solu', 'Cl\u00f4tur\u00e9', 'Annul\u00e9'].includes(ticket.status))
  const unassigned = active.filter((ticket) => !ticket.technicianId)
  const urgent = active.filter((ticket) => ticket.urgency === 'Haute')
  const overdue = active.filter((ticket) => getTicketSlaInfo(ticket, now)?.state === 'breached')
  const atRisk = active.filter((ticket) => getTicketSlaInfo(ticket, now)?.state === 'at-risk')
  const needsAttention = [...overdue, ...atRisk, ...unassigned.filter((ticket) => !overdue.includes(ticket) && !atRisk.includes(ticket))]
  return <section className="manager-overview">
    <section className="manager-task-action"><div><b>{'Planifier le travail de l\u2019\u00e9quipe'}</b><span>{'Attribuez une t\u00e2che de maintenance ou de v\u00e9rification \u00e0 un technicien.'}</span></div><button type="button" onClick={onOpenTasks}>{'Cr\u00e9er une t\u00e2che'}</button></section>
    <div className="manager-metrics">
      <article><small>INCIDENTS ACTIFS</small><b>{active.length}</b><span>Demandes en cours de traitement</span></article>
      <article><small>À ATTRIBUER</small><b>{unassigned.length}</b><span>Demandes sans technicien</span></article>
      <article><small>PRIORITÉ HAUTE</small><b>{urgent.length}</b><span>Incidents actifs prioritaires</span></article>
      <article className={overdue.length ? 'manager-metric-breached' : ''}><small>SLA DÉPASSÉS</small><b>{overdue.length}</b><span>{atRisk.length} à surveiller dans l’heure</span></article>
    </div>
    <div className="manager-overview-grid">
      <section className="card manager-workload"><div className="card-heading"><span className="heading-icon">◉</span><div><p className="eyebrow">RÉPARTITION DE LA CHARGE</p><h2>Incidents par technicien</h2></div></div>
        <div className="manager-workload-head"><span>ÉQUIPE</span><span>ACTIFS</span><span>RÉSOLUS</span></div>
        {technicians.length ? technicians.map((person) => {
          const assigned = tickets.filter((ticket) => ticket.technicianId === person.id)
          const activeCount = assigned.filter((ticket) => !['Résolu', 'Clôturé', 'Annulé'].includes(ticket.status)).length
          const resolvedCount = assigned.filter((ticket) => ['Résolu', 'Clôturé'].includes(ticket.status)).length
          return <div className="manager-workload-row" key={person.id}><span>{person.full_name}<small>{person.role === 'it_manager' ? 'Responsable IT' : person.role === 'admin' ? 'Admin' : 'Technicien'}</small></span><b>{activeCount}</b><b className="manager-workload-resolved">{resolvedCount}</b></div>
        }) : <p className="empty">Aucun technicien disponible. Vérifiez que les comptes de l’équipe ont le rôle « technician ».</p>}
      </section>
      <section className="card manager-attention"><div className="card-heading"><span className="heading-icon heading-icon-soft">!</span><div><p className="eyebrow">SUIVI RECOMMANDÉ</p><h2>Demandes à surveiller</h2></div></div>
        {needsAttention.slice(0, 5).map((ticket) => {
          const row = <><span><b>{ticket.id}</b><small>{getAsset(ticket.assetId)[1]} · {ticket.reporter}{!ticket.technicianId ? ' · Non attribué' : ''}</small></span><SlaIndicator ticket={ticket} compact now={now} /></>
          return isAdmin
            ? <div className="manager-attention-row" key={ticket.dbId}>{row}</div>
            : <button type="button" className="manager-attention-row" key={ticket.dbId} onClick={onOpenTickets}>{row}</button>
        })}
        {!needsAttention.length && <p className="empty">Aucune demande ne nécessite d’attention immédiate.</p>}
        {!isAdmin && <button type="button" className="manager-all-tickets" onClick={onOpenTickets}>Ouvrir la file d’intervention <span aria-hidden="true">→</span></button>}
      </section>
    </div>
    {isAdmin && <SlaPolicySettings />}
  </section>
}

function SlaPolicySettings() {
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingPriority, setSavingPriority] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    supabase.from('ticket_sla_policies').select('priority, response_minutes, resolution_minutes').order('priority')
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMessage(error.message)
        else setPolicies(data || [])
        setLoading(false)
      })
    return () => { active = false }
  }, [])
  const edit = (priority, key, value) => setPolicies((all) => all.map((item) => item.priority === priority ? { ...item, [key]: value } : item))
  const save = async (event, policy) => {
    event.preventDefault()
    const response = Number(policy.response_minutes)
    const resolution = Number(policy.resolution_minutes)
    if (!Number.isInteger(response) || !Number.isInteger(resolution) || response < 1 || resolution < response) {
      setMessage('La durée de résolution doit être supérieure ou égale à la durée de réponse.')
      return
    }
    setSavingPriority(policy.priority)
    setMessage('')
    const { error } = await supabase.from('ticket_sla_policies').update({ response_minutes: response, resolution_minutes: resolution }).eq('priority', policy.priority)
    setSavingPriority('')
    setMessage(error ? error.message : 'Objectifs SLA enregistrés. Les échéances actives ont été recalculées.')
  }
  return <section className="card sla-settings-card">
    <div className="card-heading"><span className="heading-icon">⏱</span><div><p className="eyebrow">CONFIGURATION ADMIN</p><h2>Objectifs de service (SLA)</h2></div></div>
    <p className="sla-settings-intro">Définissez les délais en minutes calendaires. Les échéances actives seront recalculées après chaque modification.</p>
    {loading ? <p className="empty">Chargement des objectifs...</p> : <div className="sla-policy-grid">{policies.map((policy) => <form className="sla-policy" key={policy.priority} onSubmit={(event) => void save(event, policy)}>
      <h3>{policy.priority === 'high' ? 'Priorité haute' : 'Priorité normale'}</h3>
      <label>Première réponse (minutes)<input type="number" min="1" step="1" required value={policy.response_minutes} onChange={(event) => edit(policy.priority, 'response_minutes', event.target.value)} /></label>
      <label>Résolution (minutes)<input type="number" min="1" step="1" required value={policy.resolution_minutes} onChange={(event) => edit(policy.priority, 'resolution_minutes', event.target.value)} /></label>
      <button type="submit" disabled={savingPriority === policy.priority}>{savingPriority === policy.priority ? 'Enregistrement...' : 'Enregistrer'}</button>
    </form>)}</div>}
    {message && <p className={message.startsWith('Objectifs SLA') ? 'sla-settings-success' : 'form-message'} role="status">{message}</p>}
  </section>
}

function AdminUsers({ currentUserId }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const loadUsers = async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('profiles').select('id, full_name, role, created_at').order('created_at', { ascending: false })
    setLoading(false)
    if (loadError) setError(loadError.message)
    else { setUsers(data || []); setError('') }
  }
  useEffect(() => { void loadUsers() }, [])
  const changeRole = async (person, role) => {
    if (role === 'admin' && !window.confirm(`Donner les droits administrateur à ${person.full_name} ?`)) return
    setUpdatingId(person.id)
    setError('')
    setMessage('')
    const { error: updateError } = await supabase.rpc('admin_set_user_role', { p_user_id: person.id, p_role: role })
    setUpdatingId('')
    if (updateError) setError(updateError.message)
    else {
      setUsers((current) => current.map((user) => user.id === person.id ? { ...user, role } : user))
      setMessage(`Rôle de ${person.full_name} mis à jour.`)
    }
  }
  const matchingUsers = users.filter((person) => {
    const matchesRole = roleFilter === 'all' || person.role === roleFilter
    const matchesText = `${person.full_name} ${person.role}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'))
    return matchesRole && matchesText
  })
  const roleNames = { employee: 'Employé', technician: 'Technicien', it_manager: 'Responsable IT', admin: 'Admin' }
  return <div className="admin-users-page">
    <div className="admin-account-summary">
      <article><small>TOTAL DES COMPTES</small><b>{users.length}</b></article>
      <article><small>EMPLOYÉS</small><b>{users.filter((person) => person.role === 'employee').length}</b></article>
      <article><small>ÉQUIPE IT</small><b>{users.filter((person) => ['technician', 'it_manager'].includes(person.role)).length}</b></article>
      <article><small>ADMINISTRATEURS</small><b>{users.filter((person) => person.role === 'admin').length}</b></article>
    </div>
    <section className="card admin-users-card">
    <div className="admin-users-heading"><div className="card-heading"><span className="heading-icon">⚙</span><div><p className="eyebrow">GESTION DES ACCÈS</p><h2>Annuaire des comptes</h2></div></div><button type="button" className="admin-refresh" onClick={() => void loadUsers()} disabled={loading}>Actualiser</button></div>
    <p className="card-intro">Attribuez le rôle adapté à chaque personne. Votre compte et les comptes administrateurs sont protégés.</p>
    <div className="admin-user-tools"><label className="admin-user-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un nom ou un rôle" aria-label="Rechercher un compte" /></label><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filtrer les comptes par rôle"><option value="all">Tous les rôles</option>{Object.entries(roleNames).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></div>
    {error && <p className="form-message" role="alert">{error}</p>}{message && <p className="admin-role-success" role="status">{message}</p>}
    <div className="admin-user-columns"><span>COMPTE</span><span>RÔLE ET ACCÈS</span></div>
    {loading ? <p className="empty">Chargement des comptes…</p> : matchingUsers.length ? <div className="admin-user-list">{matchingUsers.map((person) => {
      const locked = person.id === currentUserId || person.role === 'admin'
      return <div className="admin-user-row" key={person.id}>
        <span className="admin-user-avatar">{person.full_name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
        <span className="admin-user-copy"><b>{person.full_name}{person.id === currentUserId ? ' (vous)' : ''}</b><small>Compte créé le {new Date(person.created_at).toLocaleDateString('fr-FR')}</small></span>
        {locked ? <span className={`admin-role-pill admin-role-${person.role}`}>{person.id === currentUserId ? 'Votre compte · Admin' : 'Admin · Protégé'}</span> : <select aria-label={`Rôle de ${person.full_name}`} value={person.role} disabled={updatingId === person.id} onChange={(event) => void changeRole(person, event.target.value)}><option value="employee">Employé</option><option value="technician">Technicien</option><option value="it_manager">Responsable IT</option><option value="admin">Admin</option></select>}
      </div>
    })}</div> : <p className="empty">Aucun compte ne correspond à ces filtres.</p>}
    </section>
  </div>
}

function AdminBranding({ brand, onBrandChanged }) {
  const [companyName, setCompanyName] = useState(brand.companyName)
  const [logoFile, setLogoFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [removeLogo, setRemoveLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => setCompanyName(brand.companyName), [brand.companyName])
  useEffect(() => {
    if (!logoFile) { setPreviewUrl(''); return undefined }
    const url = URL.createObjectURL(logoFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [logoFile])

  const onChooseLogo = (event) => {
    const file = event.target.files?.[0]
    setError('')
    setMessage('')
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choisissez une image PNG, JPG ou WebP.')
      event.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Le logo ne peut pas dépasser 2 Mo.')
      event.target.value = ''
      return
    }
    setLogoFile(file)
    setRemoveLogo(false)
  }

  const saveBrand = async (event) => {
    event.preventDefault()
    const trimmedName = companyName.trim()
    if (!trimmedName) { setError('Saisissez le nom de l’entreprise.'); return }
    setSaving(true)
    setError('')
    setMessage('')
    let nextLogoPath = removeLogo ? null : brand.logoPath || null
    let uploadedPath = ''
    if (logoFile) {
      const extension = logoFile.type === 'image/jpeg' ? 'jpg' : logoFile.type === 'image/png' ? 'png' : 'webp'
      uploadedPath = `logos/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('company-branding').upload(uploadedPath, logoFile, { contentType: logoFile.type, upsert: false })
      if (uploadError) {
        setSaving(false)
        setError(uploadError.message)
        return
      }
      nextLogoPath = uploadedPath
    }
    const { error: saveError } = await supabase.from('company_settings').update({ company_name: trimmedName, logo_path: nextLogoPath, updated_at: new Date().toISOString() }).eq('id', true)
    if (saveError) {
      if (uploadedPath) await supabase.storage.from('company-branding').remove([uploadedPath])
      setSaving(false)
      setError(saveError.message)
      return
    }
    if (brand.logoPath && brand.logoPath !== nextLogoPath) await supabase.storage.from('company-branding').remove([brand.logoPath])
    const logoUrl = nextLogoPath ? supabase.storage.from('company-branding').getPublicUrl(nextLogoPath).data.publicUrl : ''
    onBrandChanged({ companyName: trimmedName, logoPath: nextLogoPath || '', logoUrl })
    setLogoFile(null)
    setRemoveLogo(false)
    setSaving(false)
    setMessage('L’identité de l’entreprise a été mise à jour pour tous les utilisateurs.')
  }

  const shownLogo = previewUrl || (removeLogo ? '' : brand.logoUrl)
  return <section className="card admin-branding-card">
    <div className="card-heading"><span className="heading-icon">✳</span><div><p className="eyebrow">MARQUE PARTAGÉE</p><h2>Identité de l’entreprise</h2></div></div>
    <p className="card-intro">Le nom et le logo s’affichent sur l’écran de connexion et dans l’en-tête pour tous les comptes.</p>
    <form className="admin-branding-form" onSubmit={saveBrand}>
      <div className="branding-preview"><span className="branding-preview-logo">{shownLogo ? <img src={shownLogo} alt="Aperçu du logo" /> : <span>{companyName.slice(0, 1).toUpperCase()}</span>}</span><div><small>APERÇU DE LA MARQUE</small><b>{companyName || 'Nom de l’entreprise'}</b><span>Portail de support informatique</span></div></div>
      <label className="field">Nom de l’entreprise<input value={companyName} maxLength={80} onChange={(event) => { setCompanyName(event.target.value); setMessage('') }} placeholder="Ex. Tesca Tech" /></label>
      <label className="field">Logo de l’entreprise<input type="file" accept="image/png,image/jpeg,image/webp" onChange={onChooseLogo} /><small className="branding-file-help">PNG, JPG ou WebP · 2 Mo maximum · format carré recommandé</small></label>
      {(brand.logoUrl || logoFile) && <button className="branding-remove-logo" type="button" onClick={() => { setLogoFile(null); setRemoveLogo(true); setMessage('') }}>Retirer le logo personnalisé</button>}
      {error && <p className="form-message" role="alert">{error}</p>}{message && <p className="admin-role-success" role="status">{message}</p>}
      <button className="primary-action branding-save" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer l’identité'} <span aria-hidden="true">→</span></button>
    </form>
  </section>
}

function FacilityMap({ tickets, user }) {
  const [selectedAssetId, setSelectedAssetId] = useState(null)
  const [mapAssets, setMapAssets] = useState(assets)
  const [positions, setPositions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('facility-map-positions') || '{}') } catch { return {} }
  })
  const positionsRef = useRef(positions)
  const [mapPath, setMapPath] = useState('')
  const [mapImageUrl, setMapImageUrl] = useState('')
  const [mapBusy, setMapBusy] = useState(false)
  const [mapError, setMapError] = useState('')
  const [is3d, setIs3d] = useState(false)
  const [mapZoom, setMapZoom] = useState(1)
  const mapPointers = useRef(new Map())
  const pinchStart = useRef(null)
  const draggedAsset = useRef(null)
  const [addingAsset, setAddingAsset] = useState(false)
  const [newAsset, setNewAsset] = useState({ id: '', name: '', kind: 'PC fixe', department: 'Infrastructure', location: '' })
  const [assetBusy, setAssetBusy] = useState(false)
  const canEdit = ['it_manager', 'admin'].includes(user?.role)

  useEffect(() => {
    let active = true
    const refreshSharedMap = async () => {
      const [settingsResult, positionsResult, assetsResult] = await Promise.all([
        supabase.from('facility_map_settings').select('map_path').eq('id', true).maybeSingle(),
        supabase.from('facility_map_positions').select('asset_id, x, y'),
        supabase.from('assets').select('id, name, kind, department, location').order('id'),
      ])
      if (!active) return
      if (!assetsResult.error && assetsResult.data?.length) {
        setMapAssets(assetsResult.data.map((asset) => [asset.id, asset.name, asset.department, asset.location, asset.kind]))
      }
      if (settingsResult.error) setMapError(settingsResult.error.message)
      else {
        const path = settingsResult.data?.map_path || ''
        setMapPath(path)
        if (path) {
          const { data, error } = await supabase.storage.from('facility-maps').createSignedUrl(path, 3600)
          if (!active) return
          if (error) setMapError(error.message)
          else setMapImageUrl(data?.signedUrl || '')
        } else setMapImageUrl('')
      }
      if (positionsResult.error) setMapError(positionsResult.error.message)
      else {
        const shared = Object.fromEntries((positionsResult.data || []).map((position) => [position.asset_id, { x: Number(position.x), y: Number(position.y) }]))
        setPositions((current) => {
          const next = { ...current, ...shared }
          positionsRef.current = next
          return next
        })
      }
    }
    void refreshSharedMap()
    const channel = supabase.channel(`facility-map-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facility_map_settings' }, () => void refreshSharedMap())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facility_map_positions' }, () => void refreshSharedMap())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, () => void refreshSharedMap())
      .subscribe()
    return () => { active = false; void supabase.removeChannel(channel) }
  }, [user.id])

  const getZone = (location) => {
    const text = location.toLocaleLowerCase('fr')
    if (text.includes('2e')) return '2e etage'
    if (text.includes('1er')) return '1er etage'
    if (text.includes('entrep')) return 'Entrepot'
    if (text.includes('atelier')) return 'Atelier'
    return 'Rez-de-chaussee'
  }
  const zones = [...new Set(mapAssets.map((asset) => getZone(asset[3])))]
  const selectedAsset = mapAssets.find((asset) => asset[0] === selectedAssetId)
  const pointsByZone = [[[54, 46], [61, 50], [58, 56]], [[78, 62], [84, 70], [80, 76]], [[26, 78], [32, 84], [38, 77], [43, 82]], [[55, 61], [62, 58], [68, 64], [72, 56]], [[82, 34], [88, 40]]]
  const markerPosition = (asset, index) => {
    if (positions[asset[0]]) return { left: `${positions[asset[0]].x}%`, top: `${positions[asset[0]].y}%` }
    const zoneIndex = zones.indexOf(getZone(asset[3]))
    const points = pointsByZone[zoneIndex] || pointsByZone[0]
    const [left, top] = points[index % points.length]
    return { left: `${left}%`, top: `${top}%` }
  }
  const setAssetPosition = (event, id) => {
    const bounds = event.currentTarget.closest('.facility-plan-image').getBoundingClientRect()
    const x = Math.min(97, Math.max(3, ((event.clientX - bounds.left) / bounds.width) * 100))
    const y = Math.min(94, Math.max(6, ((event.clientY - bounds.top) / bounds.height) * 100))
    setPositions((current) => {
      const next = { ...current, [id]: { x, y } }
      positionsRef.current = next
      localStorage.setItem('facility-map-positions', JSON.stringify(next))
      return next
    })
  }
  const saveDraggedPosition = async (id) => {
    if (!canEdit || !id || !positionsRef.current[id]) return
    const { x, y } = positionsRef.current[id]
    const { error } = await supabase.from('facility_map_positions').upsert({ asset_id: id, x, y, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'asset_id' })
    if (error) setMapError(error.message)
  }
  const addAsset = async (event) => {
    event.preventDefault()
    const record = {
      id: newAsset.id.trim().toUpperCase(),
      name: newAsset.name.trim(),
      kind: newAsset.kind.trim(),
      department: newAsset.department.trim(),
      location: newAsset.location.trim(),
    }
    if (!record.id || !record.name || !record.kind || !record.department || !record.location) return
    setAssetBusy(true)
    setMapError('')
    const { error } = await supabase.from('assets').insert(record)
    if (error) setMapError(error.message)
    else {
      setNewAsset({ id: '', name: '', kind: 'PC fixe', department: 'Infrastructure', location: '' })
      setAddingAsset(false)
      const { data } = await supabase.from('assets').select('id, name, kind, department, location').order('id')
      if (data) setMapAssets(data.map((asset) => [asset.id, asset.name, asset.department, asset.location, asset.kind]))
    }
    setAssetBusy(false)
  }
  const handleMapPointerDown = (event) => {
    mapPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (mapPointers.current.size === 2) {
      const [a, b] = [...mapPointers.current.values()]
      pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: mapZoom }
      draggedAsset.current = null
    }
  }
  const handleMapPointerMove = (event) => {
    if (!mapPointers.current.has(event.pointerId)) return
    mapPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (mapPointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...mapPointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      setMapZoom(Math.min(2, Math.max(0.75, pinchStart.current.zoom * distance / Math.max(1, pinchStart.current.distance))))
      event.preventDefault()
    } else if (draggedAsset.current?.pointerId === event.pointerId) {
      setAssetPosition(event, draggedAsset.current.id)
      event.preventDefault()
    }
  }
  const handleMapPointerEnd = (event) => {
    mapPointers.current.delete(event.pointerId)
    if (mapPointers.current.size < 2) pinchStart.current = null
    if (draggedAsset.current?.pointerId === event.pointerId) {
      const id = draggedAsset.current.id
      draggedAsset.current = null
      void saveDraggedPosition(id)
    }
  }
  const uploadMap = async (event) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setMapError('')
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type)) {
      setMapError('Choisissez une image JPEG, PNG, WebP ou HEIC.')
      input.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setMapError('Le plan doit faire 10 Mo maximum.')
      input.value = ''
      return
    }
    setMapBusy(true)
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' })[file.type]
    const newPath = `${user.id}/${Date.now()}.${extension}`
    try {
      const { error: uploadError } = await supabase.storage.from('facility-maps').upload(newPath, file, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError
      const { error: settingsError } = await supabase.from('facility_map_settings').update({ map_path: newPath, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', true)
      if (settingsError) {
        await supabase.storage.from('facility-maps').remove([newPath])
        throw settingsError
      }
      const { data, error: urlError } = await supabase.storage.from('facility-maps').createSignedUrl(newPath, 3600)
      if (urlError) throw urlError
      setMapPath(newPath)
      setMapImageUrl(data.signedUrl)
      if (mapPath && mapPath !== newPath) void supabase.storage.from('facility-maps').remove([mapPath])
    } catch (error) {
      setMapError(error?.message || "Impossible d importer le plan du site.")
    } finally {
      setMapBusy(false)
      input.value = ''
    }
  }
  return <section className="facility-map card">
    <div className="facility-map-heading"><div><p className="eyebrow">PLAN INTERACTIF</p><h2>Carte du site</h2><p>{canEdit ? 'Importez un plan, puis deplacez les reperes numerotes.' : 'Selectionnez un numero pour afficher l equipement correspondant.'}</p></div><div className="facility-map-actions">
      {canEdit && <label className="map-upload-control">{mapBusy ? 'Import en cours...' : mapImageUrl ? 'Changer le plan' : 'Importer un plan'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => void uploadMap(event)} disabled={mapBusy} /></label>}
      {canEdit && <button type="button" className="add-map-asset" onClick={() => setAddingAsset((value) => !value)}>Ajouter un équipement</button>}
      <div className="map-zoom-controls" aria-label="Zoom"><button type="button" onClick={() => setMapZoom((zoom) => Math.max(0.75, +(zoom - 0.25).toFixed(2)))} aria-label="Zoom arriere" disabled={mapZoom <= 0.75}>-</button><span>{Math.round(mapZoom * 100)}%</span><button type="button" onClick={() => setMapZoom((zoom) => Math.min(2, +(zoom + 0.25).toFixed(2)))} aria-label="Zoom avant" disabled={mapZoom >= 2}>+</button><button type="button" onClick={() => setMapZoom(1)} aria-label="Reinitialiser le zoom">Reset</button></div>
      <button type="button" className={is3d ? 'active' : ''} onClick={() => setIs3d((value) => !value)}>{is3d ? 'Vue 2D' : 'Vue 3D'}</button>
    </div></div>
    {mapError && <p className="map-upload-error" role="alert">{mapError}</p>}
    {addingAsset && canEdit && <form className="map-asset-form" onSubmit={(event) => void addAsset(event)}><input required maxLength={80} placeholder="Référence (ex. PC-IT-005)" value={newAsset.id} onChange={(event) => setNewAsset({ ...newAsset, id: event.target.value })} /><input required maxLength={160} placeholder="Nom de l’équipement" value={newAsset.name} onChange={(event) => setNewAsset({ ...newAsset, name: event.target.value })} /><input required maxLength={80} placeholder="Type (PC fixe, imprimante…)" value={newAsset.kind} onChange={(event) => setNewAsset({ ...newAsset, kind: event.target.value })} /><input required maxLength={120} placeholder="Service" value={newAsset.department} onChange={(event) => setNewAsset({ ...newAsset, department: event.target.value })} /><input required maxLength={160} placeholder="Bâtiment, étage, bureau" value={newAsset.location} onChange={(event) => setNewAsset({ ...newAsset, location: event.target.value })} /><button type="submit" disabled={assetBusy}>{assetBusy ? 'Ajout…' : 'Ajouter'}</button></form>}
    <div className="facility-plan">
      <div className={`facility-plan-image ${is3d ? 'map-view-3d' : ''}`} style={{ '--map-zoom': mapZoom }} onPointerDown={handleMapPointerDown} onPointerMove={handleMapPointerMove} onPointerUp={handleMapPointerEnd} onPointerCancel={handleMapPointerEnd}>
        <img src={mapImageUrl || officeFloorplan} alt="Plan du site" />
        {mapAssets.map((asset, index) => { const assetTickets = tickets.filter((ticket) => ticket.assetId === asset[0]); const hasOpen = assetTickets.some((ticket) => !['R\u00e9solu', 'Cl\u00f4tur\u00e9', 'Annul\u00e9'].includes(ticket.status)); return <button type="button" onPointerDown={(event) => { if (!canEdit || mapPointers.current.size > 1) return; if (event.pointerType === 'touch' || event.pointerType === 'pen') event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); draggedAsset.current = { id: asset[0], pointerId: event.pointerId } }} className={`facility-plan-pin ${hasOpen ? 'has-open-ticket' : ''} ${selectedAssetId === asset[0] ? 'selected' : ''}`} key={asset[0]} style={markerPosition(asset, index)} onClick={() => setSelectedAssetId(asset[0])} title={`${asset[1]} - ${asset[3]}`} aria-label={`Equipement ${index + 1}: ${asset[1]} (${asset[0]})`}>{index + 1}</button> })}
      </div>
      <div className="facility-map-asset-index" aria-label="Numeros des equipements">{mapAssets.map((asset, index) => <button type="button" className={selectedAssetId === asset[0] ? 'active' : ''} key={asset[0]} onClick={() => setSelectedAssetId(asset[0])}><b>{index + 1}</b><span>{asset[0]} · {asset[1]}</span></button>)}</div>
      {selectedAsset && <section className="facility-map-selection" aria-live="polite"><div className="facility-map-selection-heading"><div><h3>{selectedAsset[1]}</h3><small>{selectedAsset[0]} - {selectedAsset[2]}</small></div><span>Equipement selectionne</span></div><p className="map-location-edit">Emplacement : {selectedAsset[3]}</p></section>}
    </div>
  </section>
}
function TicketAnalytics({ tickets }) {
  const [period, setPeriod] = useState('30')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState('Tous')
  const [urgencyFilter, setUrgencyFilter] = useState('Toutes')
  const [departmentFilter, setDepartmentFilter] = useState('Tous')
  const [assetFilter, setAssetFilter] = useState('Tous')
  const now = new Date()
  const periodStart = period === 'custom' ? (startDate ? new Date(`${startDate}T00:00:00`) : null) : period === 'year' ? new Date(now.getFullYear(), 0, 1) : new Date(now.getTime() - Number(period) * 86400000)
  const periodEnd = period === 'custom' && endDate ? new Date(`${endDate}T23:59:59.999`) : now
  const inRange = (timestamp) => {
    if (!timestamp) return false
    const time = new Date(timestamp).getTime()
    return (!periodStart || time >= periodStart.getTime()) && time <= periodEnd.getTime()
  }
  const filtered = tickets.filter((ticket) =>
    (statusFilter === 'Tous' || ticket.status === statusFilter) &&
    (urgencyFilter === 'Toutes' || ticket.urgency === urgencyFilter) &&
    (departmentFilter === 'Tous' || getAsset(ticket.assetId)[2] === departmentFilter) &&
    (assetFilter === 'Tous' || ticket.assetId === assetFilter))
  const periodTickets = filtered.filter((ticket) => inRange(ticket.createdAtRaw))
  const resolvedTickets = filtered.filter((ticket) => inRange(ticket.resolvedAt))
  const openCount = periodTickets.filter((ticket) => ['Ouvert', 'R\u00e9ouvert'].includes(ticket.status)).length
  const progressCount = periodTickets.filter((ticket) => ['En cours', 'Attribu\u00e9', 'En attente de pi\u00e8ces'].includes(ticket.status)).length
  const resolvedCount = periodTickets.filter((ticket) => ['R\u00e9solu', 'Cl\u00f4tur\u00e9'].includes(ticket.status)).length
  const total = periodTickets.length
  const durations = resolvedTickets.filter((ticket) => ticket.createdAtRaw && ticket.resolvedAt).map((ticket) => (new Date(ticket.resolvedAt) - new Date(ticket.createdAtRaw)) / 60000).filter((minutes) => minutes >= 0).sort((a, b) => a - b)
  const median = durations.length ? durations.length % 2 ? durations[(durations.length - 1) / 2] : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2 : null
  const formatDuration = (minutes) => minutes < 60 ? `${Math.round(minutes)} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min` : `${Math.floor(minutes / 1440)} j ${Math.floor(minutes % 1440 / 60)} h`
  const machineRows = assets.map(([id, name]) => ({ label: `${name} \u00b7 ${id}`, count: periodTickets.filter((ticket) => ticket.assetId === id).length })).sort((a, b) => b.count - a.count)
  const departmentRows = departments.map((department) => ({ label: department, count: periodTickets.filter((ticket) => getAsset(ticket.assetId)[2] === department).length })).sort((a, b) => b.count - a.count)
  const volumeByWeek = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (7 - index) * 7)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 7 * 86400000)
    return { label: start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), count: filtered.filter((ticket) => { const created = new Date(ticket.createdAtRaw); return created >= start && created < end && inRange(ticket.createdAtRaw) }).length }
  })
  const openPercent = total ? openCount / total * 100 : 0
  const progressPercent = total ? progressCount / total * 100 : 0
  const resolvedPercent = total ? resolvedCount / total * 100 : 0
  const donutStyle = {
    background: total
      ? `conic-gradient(#f16d5b 0% ${openPercent}%, #f0bd68 ${openPercent}% ${openPercent + progressPercent}%, #74b68e ${openPercent + progressPercent}% ${openPercent + progressPercent + resolvedPercent}%, #dce5e0 ${openPercent + progressPercent + resolvedPercent}% 100%)`
      : '#dce5e0',
  }
  const slaResolved = resolvedTickets.filter((ticket) => ticket.resolutionDueAt)
  const slaMet = slaResolved.filter((ticket) => new Date(ticket.resolvedAt).getTime() <= new Date(ticket.resolutionDueAt).getTime()).length
  const slaCompliance = slaResolved.length ? `${Math.round((slaMet / slaResolved.length) * 100)}%` : '—'
  const kpis = [
    { label: 'Incidents ouverts', count: openCount, className: 'kpi-open', icon: '01' },
    { label: 'En cours', count: progressCount, className: 'kpi-progress', icon: '02' },
    { label: 'R\u00e9solus', count: resolvedCount, className: 'kpi-resolved', icon: '03' },
    { label: 'Priorit\u00e9 haute', count: periodTickets.filter((ticket) => ticket.urgency === 'Haute' && !['R\u00e9solu', 'Cl\u00f4tur\u00e9'].includes(ticket.status)).length, className: 'kpi-priority', icon: '!' },
  ]
  kpis.push({ label: 'Résolus dans le SLA', count: slaCompliance, className: 'kpi-sla', icon: '⏱' })
  const renderRows = (rows) => {
    const maxCount = Math.max(1, ...rows.map((row) => row.count))
    return rows.map((row, index) => <div className="analytics-row" key={row.label}>
      <span className="analytics-rank">{String(index + 1).padStart(2, '0')}</span>
      <div className="analytics-row-main">
        <div className="analytics-row-heading"><span>{row.label}</span><b>{row.count}<small> tickets</small></b></div>
        <div className="analytics-track"><span style={{ width: `${(row.count / maxCount) * 100}%` }} /></div>
      </div>
    </div>)
  }

  return <div className="stats-page">
    <section className="card stats-filters" aria-label="Filtres des statistiques">
      <label>Période<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option><option value="year">Cette année</option><option value="custom">Personnalisée</option></select></label>
      {period === 'custom' && <><label>Du<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Au<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></>}
      <label>Statut<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Tous</option>{['Ouvert', 'Attribu\u00e9', 'En cours', 'En attente de pi\u00e8ces', 'R\u00e9solu', 'Cl\u00f4tur\u00e9', 'R\u00e9ouvert', 'Annul\u00e9'].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Urgence<select value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value)}><option>Toutes</option><option>Normale</option><option>Haute</option></select></label>
      <label>Département<select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option>Tous</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Équipement<select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)}><option value="Tous">Tous</option>{assets.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <button type="button" onClick={() => { setPeriod('30'); setStartDate(''); setEndDate(''); setStatusFilter('Tous'); setUrgencyFilter('Toutes'); setDepartmentFilter('Tous'); setAssetFilter('Tous') }}>Réinitialiser</button>
    </section>
    <section className="stats-hero">
      <div className="stats-hero-copy">
        <p className="stats-eyebrow">TESCA TECH <span /> VUE D'ENSEMBLE</p>
        <h2>{'Les incidents, en un coup d\u2019oeil.'}</h2>
        <p className="stats-hero-caption">{'Volume des demandes ouvertes sur la p\u00e9riode s\u00e9lectionn\u00e9e.'}</p>
        <div className="stats-total"><b>{total}</b><span>{'tickets enregistr\u00e9s'}</span></div>
      </div>
      <div className="stats-distribution">
        <div className="stats-donut" style={donutStyle} role="img" aria-label={`${openCount} ouverts, ${progressCount} en cours, ${resolvedCount} r\u00e9solus`}>
          <div><b>{total}</b><span>{'tickets'}</span></div>
        </div>
        <div className="stats-legend">
          <span><i className="legend-open" />{'Ouverts'} <b>{openCount}</b></span>
          <span><i className="legend-progress" />{'En cours'} <b>{progressCount}</b></span>
          <span><i className="legend-resolved" />{'R\u00e9solus'} <b>{resolvedCount}</b></span>
        </div>
      </div>
      <span className="stats-hero-orb" aria-hidden="true" />
    </section>
    <section className="card stats-trend-card">
      <div className="stat-card-heading"><span className="stat-card-icon">↗</span><div><p className="eyebrow">TENDANCE</p><h2>Tickets créés · 8 dernières semaines</h2></div></div>
      <div className="stats-week-chart" role="img" aria-label="Nombre de tickets ouverts chaque semaine">{volumeByWeek.map((week) => <div className="stats-week" key={week.label}><b>{week.count}</b><span className="stats-week-track"><i style={{ height: `${Math.max(4, week.count / Math.max(1, ...volumeByWeek.map((item) => item.count)) * 100)}%` }} /></span><small>{week.label}</small></div>)}</div>
      <p className="stats-footnote">Évolution sur les 8 dernières semaines; les filtres s’appliquent.</p>
    </section>
    <section className="stats-kpis" aria-label="Délai de résolution">
      <article className="stats-kpi kpi-resolved stats-resolution-kpi"><span className="stats-kpi-icon" aria-hidden="true">⏱</span><b>{median === null ? '—' : formatDuration(median)}</b><span>Délai médian de résolution</span><small>{resolvedTickets.length} ticket{resolvedTickets.length === 1 ? '' : 's'} résolu{resolvedTickets.length === 1 ? '' : 's'} dans la période</small></article>
    </section>
    <section className="stats-kpis" aria-label="Indicateurs clés">
      {kpis.map((kpi) => <article className={`stats-kpi ${kpi.className}`} key={kpi.className}>
        <span className="stats-kpi-icon" aria-hidden="true">{kpi.icon}</span>
        <b>{kpi.count}</b>
        <span>{kpi.label}</span>
      </article>)}
    </section>
    <div className="stats-section-heading"><div><p className="eyebrow">ANALYSE DU PARC</p><h3>{'O\u00f9 les incidents se concentrent'}</h3></div><span>{'PAR \u00c9QUIPEMENT & SERVICE'}</span></div>
    <section className="ticket-analytics" aria-label="Incidents par machine et d\u00e9partement">
      <article className="card stat-card">
        <div className="stat-card-heading"><span className="stat-card-icon">01</span><div><p className="eyebrow">{'\u00c9QUIPEMENTS'}</p><h2>{'Machines les plus signal\u00e9es'}</h2></div></div>
        <div className="stat-rows">{renderRows(machineRows)}</div>
      </article>
      <article className="card stat-card">
        <div className="stat-card-heading"><span className="stat-card-icon stat-card-icon-warm">02</span><div><p className="eyebrow">SITES ET SERVICES</p><h2>{'Incidents par d\u00e9partement'}</h2></div></div>
        <div className="stat-rows">{renderRows(departmentRows)}</div>
      </article>
    </section>
    <p className="stats-footnote">Le volume et les répartitions utilisent la date de création; le délai médian utilise la date de résolution. Les tickets historiques sans date de résolution sont exclus du calcul.</p>
  </div>
}
function Detail({ detailRef, onBackToQueue, showMobileBack = false, ticket, user, onOpenChat, update, escalate, savePlaybook, updateError, technicians = [], assignmentId = '', setAssignmentId, assignTicket, assignmentBusy = false }) {
  const [note, setNote] = useState(ticket.note)
  const [playbookId, setPlaybookId] = useState(ticket.playbook?.playbookId || suggestPlaybook(ticket))
  const [checkedSteps, setCheckedSteps] = useState(ticket.playbook?.checkedSteps || [])
  const [playbookNote, setPlaybookNote] = useState(ticket.playbook?.note || '')
  const [playbookSaving, setPlaybookSaving] = useState(false)
  const [playbookMessage, setPlaybookMessage] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiAdvice, setAiAdvice] = useState(null)
  useEffect(() => setNote(ticket.note), [ticket.id, ticket.note])
  useEffect(() => {
    setPlaybookId(ticket.playbook?.playbookId || suggestPlaybook(ticket))
    setCheckedSteps(ticket.playbook?.checkedSteps || [])
    setPlaybookNote(ticket.playbook?.note || '')
  }, [ticket.id, ticket.playbook?.updatedAt])
  useEffect(() => setPlaybookMessage(''), [ticket.id])
  useEffect(() => { setAiAdvice(null); setAiError('') }, [ticket.id])
  const activePlaybook = repairPlaybooks.find((item) => item.id === playbookId) || repairPlaybooks[0]
  const requestAiAdvice = async () => {
    setAiBusy(true)
    setAiError('')
    setAiAdvice(null)
    const { data, error } = await supabase.functions.invoke('technician-ai-assist', {
      body: { assetId: ticket.assetId, issue: ticket.issue, priority: ticket.urgency, status: ticket.status },
    })
    setAiBusy(false)
    if (error) {
      let errorMessage = error.message || 'Assistant IA indisponible. Vérifiez le déploiement de la fonction.'
      if (error.context && typeof error.context.clone === 'function') {
        const responseBody = await error.context.clone().json().catch(() => null)
        if (typeof responseBody?.error === 'string') errorMessage = responseBody.error
      }
      setAiError(errorMessage)
      return
    }
    if (!data?.steps?.length) {
      setAiError(data?.error || 'L’assistant IA n’a pas renvoyé de conseils exploitables.')
      return
    }
    setAiAdvice(data)
  }
  const appendAdviceToNote = () => {
    const adviceText = [
      'Conseils de diagnostic assistés par IA (à vérifier) :',
      ...(aiAdvice.likelyCauses || []).map((cause) => `• Cause possible : ${cause}`),
      ...aiAdvice.steps.map((step, index) => `${index + 1}. ${step}`),
      aiAdvice.safetyNote ? `Précaution : ${aiAdvice.safetyNote}` : '',
    ].filter(Boolean).join('\n')
    setPlaybookNote((current) => current ? `${current.trim()}\n\n${adviceText}` : adviceText)
    setPlaybookMessage('Conseils ajoutés au résultat du diagnostic. Vérifiez-les avant enregistrement.')
  }
  const saveCurrentPlaybook = async () => {
    setPlaybookSaving(true)
    setPlaybookMessage('')
    try {
      const result = await savePlaybook(ticket, { playbookId, checkedSteps, note: playbookNote })
      setPlaybookMessage(result.ok ? 'Diagnostic enregistr\u00e9 pour cette demande.' : result.error || 'Impossible d\u2019enregistrer le diagnostic.')
    } catch (error) {
      console.error('Could not save playbook progress:', error)
      setPlaybookMessage(error?.message || 'Impossible d\u2019enregistrer le diagnostic. V\u00e9rifiez la connexion puis r\u00e9essayez.')
    } finally {
      setPlaybookSaving(false)
    }
  }
  const resolveTicket = async () => {
    const resolvedStatus = Object.keys(dbStatus).find((status) => dbStatus[status] === 'resolved')
    if (await update(resolvedStatus, note)) await playResolutionSound()
  }
  const asset = getAsset(ticket.assetId)
  return <section ref={detailRef} className="card detail-card">
    {showMobileBack && <button type="button" className="mobile-detail-back" onClick={onBackToQueue}>← Retour à la file</button>}
    {updateError && <p className="form-message" role="alert">{updateError}</p>}
    <div className="detail-head"><div><p className="eyebrow">FICHE D’INTERVENTION <span className="reference">{ticket.id}</span></p><h2>{asset[1]}</h2><p className="subtle small">{asset[0]} <span>·</span> {asset[3]}</p></div><Status status={ticket.status} /></div>
    <div className="alert"><span className="alert-symbol">{ticket.level}</span><div><strong>Technicien niveau {ticket.level}</strong><p>{ticket.level < 3 ? `Si le problème n’est pas résolu, escaladez au niveau ${ticket.level + 1}.` : 'Niveau maximum atteint.'}</p></div></div>
    <div className={`alert ${ticket.urgency === 'Haute' ? 'alert-priority' : ''}`}><span className="alert-symbol">{ticket.urgency === 'Haute' ? '!' : 'i'}</span><div><strong>{ticket.urgency === 'Haute' ? 'À traiter en priorité' : 'Nouveau signalement'}</strong><p>Par {ticket.reporter} <span>·</span> {ticket.createdAt}</p></div></div>
    <SlaIndicator ticket={ticket} />
    <div className="issue"><small>DESCRIPTION DU PROBLÈME</small><p>{ticket.issue}</p></div>
    <TicketChat ticket={ticket} user={user} onOpenChat={onOpenChat} />
    {ticket.status !== 'Annulé' && <section className="repair-playbook">
      <div className="playbook-heading"><div><p className="eyebrow">GUIDE DE DIAGNOSTIC</p><h3>Playbook de réparation</h3></div><span className="playbook-count">{checkedSteps.length}/{activePlaybook.steps.length}</span></div>
      <div className="technician-ai-card"><div className="technician-ai-heading"><div><p className="eyebrow">ASSISTANT IA · CONSEILS À VÉRIFIER</p><p>Obtenez des pistes de diagnostic à partir du problème signalé.</p></div><button type="button" className="technician-ai-button" onClick={requestAiAdvice} disabled={aiBusy}>{aiBusy ? 'Analyse…' : '✦ Suggérer des étapes'}</button></div><small className="technician-ai-privacy">La description du ticket est envoyée au service IA configuré par votre entreprise.</small>
        {aiError && <p className="form-message" role="alert">{aiError}</p>}
        {aiAdvice && <div className="technician-ai-result"><div><b>Pistes possibles</b><ul>{aiAdvice.likelyCauses.map((cause) => <li key={cause}>{cause}</li>)}</ul></div><div><b>Étapes proposées</b><ol>{aiAdvice.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></div>{aiAdvice.safetyNote && <p className="technician-ai-safety"><b>Précaution :</b> {aiAdvice.safetyNote}</p>}<button type="button" className="playbook-save" onClick={appendAdviceToNote}>Ajouter au compte rendu</button></div>}
      </div>
      <label className="field playbook-select">Choisir un guide<select value={playbookId} onChange={(event) => { setPlaybookId(event.target.value); setCheckedSteps([]); setPlaybookMessage('') }}>{repairPlaybooks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <div className="playbook-progress"><span style={{ width: `${(checkedSteps.length / activePlaybook.steps.length) * 100}%` }} /></div>
      <div className="playbook-steps">{activePlaybook.steps.map((step, index) => <label className={`playbook-step ${checkedSteps.includes(index) ? 'checked' : ''}`} key={step}><input type="checkbox" checked={checkedSteps.includes(index)} onChange={() => { setCheckedSteps((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]); setPlaybookMessage('') }} /><span className="playbook-check" aria-hidden="true">✓</span><span>{step}</span></label>)}</div>
      <label className="field playbook-note">Résultat du diagnostic<textarea value={playbookNote} onChange={(event) => { setPlaybookNote(event.target.value); setPlaybookMessage('') }} placeholder="Résultats, messages d’erreur, actions effectuées…" /></label>
      <div className="playbook-footer"><button type="button" className="playbook-save" onClick={saveCurrentPlaybook} disabled={playbookSaving}>{playbookSaving ? 'Enregistrement…' : 'Enregistrer le diagnostic'}</button>{playbookMessage && <small className={playbookMessage.startsWith('Diagnostic enregistré') ? 'playbook-success' : 'playbook-error'} role="status">{playbookMessage}</small>}</div>
    </section>}
    <EscalationTimeline ticket={ticket} />
    {ticket.attachments?.length > 0 && <AttachmentList attachments={ticket.attachments} />}
    <div className="info"><div><small>DÉPARTEMENT</small><b>{asset[2]}</b></div><div><small>RESPONSABLE</small><b>{ticket.assignee || 'À attribuer'}</b></div></div>
    {['it_manager', 'admin'].includes(user.role) && !['Annulé', 'Résolu', 'Clôturé'].includes(ticket.status) && <section className="manager-assignment"><p className="eyebrow">ATTRIBUTION DE L’INCIDENT</p><div><select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} aria-label="Attribuer à un technicien"><option value="">Non attribué</option>{technicians.filter((person) => person.role === 'technician' || person.id === assignmentId).map((person) => <option key={person.id} value={person.id}>{person.full_name}{person.role === 'technician' ? '' : ` · ${person.role === 'admin' ? 'Admin' : 'Responsable IT'}`}</option>)}</select><button type="button" onClick={assignTicket} disabled={assignmentBusy}>{assignmentBusy ? 'Enregistrement…' : 'Enregistrer'}</button></div></section>}
    {ticket.status === 'Annulé'
      ? <Notice title="Demande annulée" text="L’employé a annulé cette demande avant sa prise en charge." />
      : ticket.status === 'Résolu'
      ? <Notice title={"Intervention cl\u00f4tur\u00e9e"} text={ticket.note || "Aucun compte rendu ajout\u00e9."} />
      : <><label className="field">Compte rendu technicien<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Diagnostic et action réalisée…" /></label><button className="primary-action" onClick={() => ticket.status === 'Ouvert' ? update('En cours', note) : resolveTicket()}>{ticket.status === 'Ouvert' ? 'Prendre en charge' : 'Marquer comme résolu'} <span aria-hidden="true">↗</span></button>{ticket.level < 3 && <button className="secondary-action" onClick={() => escalate(note)}>Non résolu — escalader au niveau {ticket.level + 1}</button>}</>}
  </section>
}

function Ticket({ ticket, user, onOpenChat, onCancel, highlighted = false }) {
  const [cancelPrompt, setCancelPrompt] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const cancel = async () => {
    setCancelBusy(true)
    setCancelError('')
    try {
      const result = await onCancel(ticket)
      if (!result?.ok) setCancelError(result?.error || 'Impossible d’annuler cette demande.')
      else setCancelPrompt(false)
    } catch (error) {
      setCancelError(error?.message || 'Impossible d’annuler cette demande.')
    } finally {
      setCancelBusy(false)
    }
  }
  return <article id={`ticket-${ticket.dbId}`} className={`ticket employee-ticket ${highlighted ? 'employee-ticket-highlighted' : ''}`}>
    <div className="employee-ticket-top"><span className="ticket-marker">{ticket.urgency === 'Haute' ? '!' : '↗'}</span><div><b>{getAsset(ticket.assetId)[1]}</b><small>{ticket.id} <span>·</span> {ticket.assetId}</small></div><Status status={ticket.status} /></div>
    <p>{ticket.issue}</p>
    {ticket.attachments?.length > 0 && <AttachmentList attachments={ticket.attachments} />}
    <small className="ticket-meta">Niveau {ticket.level} · {ticket.createdAt}{ticket.assignee ? ` · ${ticket.assignee}` : ''}</small>
    {onCancel && ticket.status === 'Ouvert' && !ticket.assignee && <div className="ticket-cancel-actions">
      {cancelError && <p className="ticket-cancel-error" role="alert">{cancelError}</p>}
      {cancelPrompt
        ? <><p>Annuler cette demande ? Elle restera dans l’historique comme annulée.</p><div><button type="button" className="ticket-cancel-confirm" onClick={() => void cancel()} disabled={cancelBusy}>{cancelBusy ? 'Annulation…' : 'Oui, annuler'}</button><button type="button" className="ticket-cancel-keep" onClick={() => { setCancelPrompt(false); setCancelError('') }} disabled={cancelBusy}>Garder ma demande</button></div></>
        : <button type="button" className="ticket-cancel-start" onClick={() => setCancelPrompt(true)}>Annuler ma demande</button>}
    </div>}
    <TicketChat ticket={ticket} user={user} onOpenChat={onOpenChat} />
  </article>
}

function TicketChat({ ticket, user, startOpen = false, hideLauncher = false, onClose, onOpenChat }) {
  const [open, setOpen] = useState(startOpen)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const peerName = user.role === 'employee' ? (ticket.assignee || 'Équipe technique') : ticket.reporter
  const closeChat = () => {
    setOpen(false)
    onClose?.()
  }
  const openChat = () => onOpenChat ? onOpenChat(ticket) : setOpen(true)

  useEffect(() => {
    if (!open) return undefined
    window.dispatchEvent(new CustomEvent('ticket-chat-opened', { detail: ticket.dbId }))
    return () => window.dispatchEvent(new CustomEvent('ticket-chat-closed', { detail: ticket.dbId }))
  }, [open, ticket.dbId])

  useEffect(() => {
    if (!open) return undefined
    let active = true
    const openedAt = new Date().toISOString()
    void markChatRead(ticket.dbId)
    const load = async () => {
      setLoading(true)
      setError('')
      const { data, error: loadError } = await supabase.from('ticket_chat_messages').select('id, ticket_id, sender_id, body, created_at').eq('ticket_id', ticket.dbId).order('created_at', { ascending: true })
      if (!active) return
      if (loadError) setError(loadError.message)
      else setMessages((current) => mergeChatMessages(current, data || []))
      setLoading(false)
    }
    void load()
    const channel = supabase.channel(`ticket-chat-${ticket.dbId}-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_chat_messages', filter: `ticket_id=eq.${ticket.dbId}` }, (payload) => {
        if (active) {
          setMessages((current) => mergeChatMessages(current, [payload.new]))
          if (payload.new.sender_id !== user.id) void markChatRead(ticket.dbId)
        }
      })
      .subscribe()
    const poll = window.setInterval(async () => {
      const { data, error: pollError } = await supabase.from('ticket_chat_messages').select('id, ticket_id, sender_id, body, created_at').eq('ticket_id', ticket.dbId).gte('created_at', openedAt).order('created_at', { ascending: true })
      if (!active) return
      if (pollError) setError(pollError.message)
      else if (data?.length) {
        setMessages((current) => mergeChatMessages(current, data))
        if (data.some((message) => message.sender_id !== user.id)) void markChatRead(ticket.dbId)
      }
    }, 4000)
    return () => {
      active = false
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [open, ticket.dbId, user.id])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  const send = async (event) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    const { data, error: sendError } = await supabase.from('ticket_chat_messages').insert({ ticket_id: ticket.dbId, sender_id: user.id, body }).select('id, ticket_id, sender_id, body, created_at').single()
    if (sendError) setError(sendError.message)
    else {
      setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data])
      setDraft('')
    }
    setSending(false)
  }

  return <div className={`ticket-chat-wrap ${user.role !== 'employee' && !hideLauncher ? 'technician-chat-wrap' : ''}`}>
    {!hideLauncher && (user.role !== 'employee'
      ? <section className="technician-chat-prompt"><span className="technician-chat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11h8M8 14h5" /></svg></span><span className="technician-chat-copy"><small>MESSAGERIE EMPLOYÉ</small><b>Échanger avec {ticket.reporter}</b><span>Demandez des précisions ou informez l’employé de l’avancement.</span></span><button type="button" className="technician-chat-action" onClick={openChat}>Envoyer un message <span aria-hidden="true">→</span></button></section>
      : <button type="button" className="ticket-chat-open" onClick={openChat}><span aria-hidden="true">▣</span> Écrire à l’équipe IT <span className="chat-open-arrow" aria-hidden="true">→</span></button>)}
    {open && <div className="messenger-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeChat() }}>
      <section className="messenger" role="dialog" aria-modal="true" aria-label={`Conversation ${ticket.id}`}>
        <header className="messenger-header"><div className="messenger-peer-avatar">{peerName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div className="messenger-peer-copy"><b>{peerName}</b><small><i /> Conversation liée à {ticket.id}</small></div><button type="button" className="messenger-close" onClick={closeChat} aria-label="Fermer la conversation">×</button></header>
        <div className="messenger-ticket"><span className="messenger-ticket-icon">⌘</span><span><small>{getAsset(ticket.assetId)[1]} · {ticket.assetId}</small><b>{ticket.issue}</b></span><Status status={ticket.status} /></div>
        <div className="messenger-body" aria-live="polite">
          <div className="messenger-day">MESSAGES DE L’INCIDENT</div>
          {loading && <p className="messenger-empty">Chargement de la conversation…</p>}
          {!loading && messages.length === 0 && <div className="messenger-empty-state"><span>✦</span><b>La conversation commence ici</b><small>Échangez avec {peerName} au sujet de cet incident.</small></div>}
          {messages.map((message) => <div key={message.id} className={`messenger-row ${message.sender_id === user.id ? 'mine' : 'theirs'}`}><div className="messenger-bubble"><p>{message.body}</p><time>{new Date(message.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time></div></div>)}
          {error && <p className="messenger-error" role="alert">{error}</p>}
          <div ref={endRef} />
        </div>
        <form className="messenger-compose" onSubmit={send}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Écrivez un message…" aria-label="Votre message" maxLength={4000} /><button type="submit" disabled={!draft.trim() || sending} aria-label="Envoyer le message">➤</button></form>
        <p className="messenger-footnote">Messages privés entre l’employé et l’équipe technique</p>
      </section>
    </div>}
  </div>
}

function ChatInbox({ user, tickets, selectedTicket, setSelectedTicket }) {
  const [open, setOpen] = useState(false)
  const unreadStorageKey = `chat-unread-${user.id}`
  const [unreadByTicket, setUnreadByTicket] = useState(() => {
    try { return JSON.parse(localStorage.getItem(unreadStorageKey) || '{}') } catch { return {} }
  })
  const [toast, setToast] = useState(null)
  const unreadInitializedRef = useRef(false)
  const activeTicketIdRef = useRef(selectedTicket?.dbId || null)
  const ticketsRef = useRef(tickets)
  activeTicketIdRef.current = selectedTicket?.dbId || null
  ticketsRef.current = tickets
  const unreadCount = Object.values(unreadByTicket).reduce((sum, count) => sum + count, 0)
  const selected = tickets.find((ticket) => ticket.dbId === selectedTicket?.dbId) || selectedTicket

  useEffect(() => {
    localStorage.setItem(unreadStorageKey, JSON.stringify(unreadByTicket))
  }, [unreadStorageKey, unreadByTicket])

  const ticketIdsKey = tickets.map((ticket) => ticket.dbId).filter(Boolean).join(',')
  useEffect(() => {
    const ticketIds = ticketIdsKey ? ticketIdsKey.split(',') : []
    if (!ticketIds.length) return undefined
    let active = true
    const loadUnreadCounts = async () => {
      const { data, error } = await supabase.rpc('get_unread_ticket_chat_counts', { p_ticket_ids: ticketIds })
      if (error) {
        console.warn('Could not load unread chat counts:', error.message)
        return
      }
      if (!active) return
      const next = Object.fromEntries((data || [])
        .map((row) => [row.ticket_id, Number(row.unread_count)])
        .filter(([, count]) => count > 0))
      setUnreadByTicket(next)
      if (!unreadInitializedRef.current) {
        unreadInitializedRef.current = true
        const total = Object.values(next).reduce((sum, count) => sum + count, 0)
        if (total > 0) {
          const ticket = ticketsRef.current.find((item) => next[item.dbId] > 0)
          if (ticket) setToast({ id: `unread-${Date.now()}`, ticketId: ticket.dbId, ticket, body: `Vous avez ${total} messages non lus.`, count: total })
        }
      }
    }
    void loadUnreadCounts()
    return () => { active = false }
  }, [ticketIdsKey])

  useEffect(() => {
    const onOpened = (event) => {
      const ticketId = event.detail
      activeTicketIdRef.current = ticketId
      setUnreadByTicket((current) => {
        if (!current[ticketId]) return current
        const next = { ...current }
        delete next[ticketId]
        return next
      })
      setToast((current) => current?.ticketId === ticketId ? null : current)
    }
    const onClosed = (event) => {
      if (activeTicketIdRef.current === event.detail) activeTicketIdRef.current = null
    }
    window.addEventListener('ticket-chat-opened', onOpened)
    window.addEventListener('ticket-chat-closed', onClosed)
    return () => {
      window.removeEventListener('ticket-chat-opened', onOpened)
      window.removeEventListener('ticket-chat-closed', onClosed)
    }
  }, [])

  useEffect(() => {
    const startedAt = new Date().toISOString()
    const seenIds = new Set()
    const notify = (message) => {
      if (!message?.id || seenIds.has(message.id)) return
      if (!message.ticket_id || message.sender_id === user.id) {
        seenIds.add(message.id)
        return
      }
      const ticket = ticketsRef.current.find((item) => item.dbId === message.ticket_id)
      if (!ticket) return
      seenIds.add(message.id)
      if (activeTicketIdRef.current === message.ticket_id) return
      setUnreadByTicket((current) => ({ ...current, [message.ticket_id]: (current[message.ticket_id] || 0) + 1 }))
      setToast({ id: message.id, ticketId: message.ticket_id, ticket, body: message.body })
      void playMessageSound().catch((soundError) => console.warn('Message sound could not play:', soundError))
    }
    const channel = supabase.channel(`incoming-ticket-chat-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_chat_messages' }, (payload) => notify(payload.new))
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Realtime chat notifications unavailable; polling for new messages.')
      })
    const pollForMessages = async () => {
      const ticketIds = ticketsRef.current.map((ticket) => ticket.dbId).filter(Boolean)
      if (!ticketIds.length) return
      const { data, error } = await supabase.from('ticket_chat_messages')
        .select('id, ticket_id, sender_id, body, created_at')
        .in('ticket_id', ticketIds)
        .gte('created_at', startedAt)
        .order('created_at', { ascending: true })
      if (error) {
        console.warn('Could not check for new chat messages:', error.message)
        return
      }
      ;(data || []).forEach(notify)
    }
    const poll = window.setInterval(() => { void pollForMessages() }, 4000)
    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [user.id])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(null), 5500)
    return () => window.clearTimeout(timeout)
  }, [toast?.id])

  const openConversation = (ticket) => {
    setUnreadByTicket((current) => {
      if (!current[ticket.dbId]) return current
      const next = { ...current }
      delete next[ticket.dbId]
      return next
    })
    setToast((current) => current?.ticketId === ticket.dbId ? null : current)
    setSelectedTicket(ticket)
    setOpen(false)
  }

  return <>
    <aside className="chat-inbox-launcher">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="chat-inbox-icon" aria-hidden="true">◉</span><span>Messages</span>{unreadCount > 0 && <span className="chat-inbox-unread">{unreadCount > 99 ? '99+' : unreadCount}</span>}<span className="chat-inbox-arrow" aria-hidden="true">{open ? '×' : '↗'}</span></button>
      {open && <section className="chat-inbox-panel"><div className="chat-inbox-heading"><span><b>Vos conversations</b><small>Discussions liées aux incidents</small></span><button type="button" onClick={() => setOpen(false)} aria-label="Fermer">×</button></div>
        {tickets.length ? <div className="chat-inbox-list">{tickets.map((ticket) => <button type="button" className="chat-inbox-item" key={ticket.dbId} onClick={() => openConversation(ticket)}><span className="chat-inbox-avatar">{user.role === 'employee' ? (ticket.assignee || 'IT').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() : ticket.reporter.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span className="chat-inbox-copy"><b>{user.role === 'employee' ? (ticket.assignee || 'Équipe technique') : ticket.reporter}</b><small>{ticket.id} · {getAsset(ticket.assetId)[1]}</small><small className="chat-inbox-issue">{ticket.issue}</small></span>{unreadByTicket[ticket.dbId] > 0 && <span className="chat-inbox-item-unread">{unreadByTicket[ticket.dbId]}</span>}<span className="chat-inbox-chevron">›</span></button>)}</div> : <p className="chat-inbox-empty">Vos conversations apparaîtront ici dès qu’un incident sera créé.</p>}
      </section>}
      {toast && <button type="button" className="message-toast" onClick={() => openConversation(toast.ticket)}><span className="message-toast-icon" aria-hidden="true">●</span><span><b>+{toast.count || unreadByTicket[toast.ticketId] || 1} {((toast.count || unreadByTicket[toast.ticketId] || 1) > 1) ? 'nouveaux messages' : 'nouveau message'}</b><small>{user.role === 'employee' ? (toast.ticket.assignee || 'Équipe technique') : toast.ticket.reporter} · {toast.ticket.id}</small><small className="message-toast-preview">{toast.body}</small></span><span className="message-toast-close" onClick={(event) => { event.stopPropagation(); setToast(null) }}>×</span></button>}
    </aside>
    {selected && <TicketChat key={selected.dbId} ticket={selected} user={user} startOpen hideLauncher onClose={() => setSelectedTicket(null)} />}
  </>
}

function AttachmentList({ attachments }) {
  return <section className="attachments"><p className="eyebrow">PHOTOS ET PIÈCES JOINTES</p><div className="attachment-list">{attachments.map((file) => <a className="attachment-item" href={file.url} target="_blank" rel="noreferrer" key={`${file.name}-${file.url}`}>{file.mimeType?.startsWith('image/') ? <img src={file.url} alt={file.name} /> : <span className="attachment-file-icon">PDF</span>}<span>{file.name}</span></a>)}</div></section>
}

function EscalationTimeline({ ticket }) {
  return <section className="escalation-timeline" aria-label="Historique des escalades">
    <div className="timeline-heading"><div><p className="eyebrow">SUIVI DE L’INCIDENT</p><h3>Parcours d’escalade</h3></div><span className="timeline-current">Niveau {ticket.level}</span></div>
    <ol className="timeline-steps">
      <li className="timeline-step"><span className="timeline-dot" /><div><b>Signalé · Niveau 1</b><small>{ticket.createdAt}</small></div></li>
      {(ticket.escalations || []).map((event, index) => <li className="timeline-step" key={`${event.createdAt}-${index}`}><span className="timeline-dot timeline-dot-escalated" /><div><b>Niveau {event.fromLevel} → Niveau {event.toLevel}</b><small>{event.technician} · {event.createdAt}</small>{event.note && <p>{event.note}</p>}</div></li>)}
      {(ticket.escalations || []).length === 0 && ticket.level > 1
        ? <li className="timeline-step timeline-step-current"><span className="timeline-dot timeline-dot-current" /><div><b>Niveau actuel · Niveau {ticket.level}</b><small>Les escalades précédentes n’étaient pas historisées.</small></div></li>
        : <li className="timeline-step timeline-step-current"><span className="timeline-dot timeline-dot-current" /><div><b>{ticket.status === 'Annulé' ? 'Annulé par l’employé' : ticket.status === 'Résolu' ? 'Résolu' : 'En traitement'} · Niveau {ticket.level}</b><small>{ticket.status}</small></div></li>}
    </ol>
  </section>
}

function Status({ status }) {
  const tone = status === 'Ouvert' ? 'danger' : status === 'Résolu' ? 'success' : status === 'Annulé' ? 'neutral' : 'warning'
  return <span className={`status ${tone}`}><span className="status-dot" />{status}</span>
}

function SlaIndicator({ ticket, compact = false, now: suppliedNow }) {
  const [clock, setClock] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const info = getTicketSlaInfo(ticket, suppliedNow || clock)
  if (!info) return null
  const title = info.state === 'breached' ? `${info.step} hors délai` : info.state === 'at-risk' ? `${info.step} bientôt due` : `${info.step} attendue`
  return <span className={`sla-indicator sla-${info.state}${compact ? ' sla-compact' : ''}`} role="status" title={`${title} · ${new Date(info.dueAt).toLocaleString('fr-FR')}`}>
    <i aria-hidden="true" />
    <span><b>{title}</b><small>{formatSlaRemaining(info.remainingMs)}</small></span>
  </span>
}

function SuccessDialog({ reference, native = false, onClose }) {
  return <div className="success-overlay">
    <section className="success-dialog" role="dialog" aria-modal="true" aria-labelledby="success-dialog-title">
      <button type="button" className="success-dialog-close" onClick={onClose} aria-label="Fermer">×</button>
      <div className="success-emblem" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m13 24 7 7 16-17" /></svg></div>
      <p className="success-kicker">DEMANDE TRANSMISE</p>
      <h2 id="success-dialog-title">Incident ajouté avec succès !</h2>
      <p className="success-copy">Un technicien a été informé. Vous pouvez suivre votre demande dans « Mes demandes ».</p>
      {reference && <div className="success-reference"><small>RÉFÉRENCE</small><b>{reference}</b></div>}
      <button type="button" className="success-continue" onClick={onClose}>{native ? 'Voir ma demande' : 'Continuer'}</button>
    </section>
  </div>
}

function Notice({ title, text }) {
  return <div className="notice"><span className="notice-check">✓</span><div><b>{title}</b><span>{text}</span></div></div>
}

function Welcome({ label, name, text, className = '' }) {
  return <section className={`welcome ${className}`}><div><p className="eyebrow">{label}</p><h1>Bonjour, {name.split(' ')[0]}<span className="hello-dot">.</span></h1><p className="subtle">{text}</p></div><div className="welcome-art" aria-hidden="true"><span className="welcome-art-line" /><span className="welcome-art-orb">✳</span><small>TESCA<br />SUPPORT</small></div></section>
}

function Brand({ light = false, settings = defaultBrand }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}><span className={`brand-mark${settings.logoUrl ? ' brand-mark-image' : ''}`}>{settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : settings.companyName.slice(0, 1).toLowerCase()}</span><span className="brand-word">{settings.companyName}</span></div>
}

function Header({ user, logout, notifications, setNotifications, brand }) {
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const unread = notifications.filter((item) => !item.read).length
  const markRead = async (id) => {
    const item = notifications.find((notification) => notification.id === id)
    if (item?.slaNotificationId) {
      const readAt = new Date().toISOString()
      await supabase.from('ticket_sla_notifications').update({ read_at: readAt }).eq('id', item.slaNotificationId)
    }
    if (item?.taskNotificationId) {
      const readAt = new Date().toISOString()
      await supabase.from('technician_task_notifications').update({ read_at: readAt }).eq('id', item.taskNotificationId)
    }
    setNotifications((items) => items.map((notification) => notification.id === id ? { ...notification, read: true } : notification))
  }
  const clearNotifications = async () => {
    if (['it_manager', 'admin'].includes(user.role)) {
      await supabase.from('ticket_sla_notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', user.id).is('read_at', null)
    }
    if (user.role === 'technician') {
      await supabase.from('technician_task_notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', user.id).is('read_at', null)
    }
    setNotifications([])
  }
  return (
    <header className="app-header">
      <Brand settings={brand} />
      <div className="header-user">
        <div className="header-user-copy"><small>CONNECTÉ EN TANT QUE</small><b>{user.role === 'employee' ? 'Employé' : user.role === 'admin' ? 'Admin' : user.role === 'it_manager' ? 'Responsable IT' : 'Technicien'}</b></div>
        <div className="notification-wrap">
          <button className="notification-button" onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? `, ${unread} non lues` : ''}`} aria-expanded={open}>
            <span aria-hidden="true">🔔</span>{unread > 0 && <i>{unread > 9 ? '9+' : unread}</i>}
          </button>
          {open && <section className="notification-panel">
            <div className="notification-panel-head"><b>Notifications</b><button onClick={clearNotifications}>Effacer</button></div>
            {notifications.length ? <div className="notification-items">{notifications.map((item) => <button className={`notification-item${item.read ? '' : ' unread'}`} key={item.id} onClick={() => markRead(item.id)}><span className="notification-dot" /><span><b>{item.title}</b><small>{item.message}</small><time>{new Date(item.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</time></span></button>)}</div> : <p className="notification-empty">Aucune notification pour le moment.</p>}
          </section>}
        </div>
        <div className="header-profile">
          <button className="avatar" onClick={() => setProfileOpen((value) => !value)} title="Voir mon profil" aria-label="Voir mon profil" aria-expanded={profileOpen} aria-haspopup="dialog">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}<span className="avatar-presence" /></button>
          {profileOpen && <section className="profile-card" role="dialog" aria-label="Informations du profil">
            <div className="profile-card-head"><span className="profile-card-avatar">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><b>{user.name}</b><small>{user.role === 'employee' ? 'Employé' : user.role === 'admin' ? 'Admin' : user.role === 'it_manager' ? 'Responsable IT' : 'Technicien'}</small></div></div>
            <div className="profile-card-info"><small>ADRESSE E-MAIL</small><b>{user.email || 'Non renseignée'}</b></div>
            <button type="button" className="profile-card-logout" onClick={logout}>Se déconnecter <span aria-hidden="true">↗</span></button>
          </section>}
        </div>
        <button className="logout-button" onClick={logout}>Quitter <span aria-hidden="true">↗</span></button>
      </div>
    </header>
  )
}

