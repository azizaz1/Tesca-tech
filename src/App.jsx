import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition'
import './App.css'
import './web.css'
import { supabase } from './supabase'
import tescaLogo from './assets/tesca-tescagroup-logo.jpg'

const assets = [
  ['PC-FIN-014', 'Poste comptable', 'Finance', '2e étage · Bureau 204'],
  ['PC-FIN-008', 'Poste recouvrement', 'Finance', '2e étage · Bureau 206'],
  ['IMP-RH-002', 'Imprimante RH', 'Ressources humaines', '1er étage · Accueil RH'],
  ['NET-001', 'Routeur principal', 'Infrastructure', 'Salle serveur · RDC'],
]

const getAsset = (id) => assets.find((asset) => asset[0] === id) || assets[0]
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
const statusLabels = { open: 'Ouvert', assigned: 'Attribué', in_progress: 'En cours', waiting_parts: 'En attente de pièces', resolved: 'Résolu', closed: 'Clôturé', reopened: 'Réouvert' }
const dbStatus = { Ouvert: 'open', Attribué: 'assigned', 'En cours': 'in_progress', 'En attente de pièces': 'waiting_parts', Résolu: 'resolved', Clôturé: 'closed', Réouvert: 'reopened' }

const mapTicket = (row, profiles = {}) => ({
  dbId: row.id,
  id: row.reference,
  assetId: row.asset_id,
  reporter: profiles[row.reporter_id] || 'Employé',
  issue: row.issue,
  urgency: row.priority === 'high' ? 'Haute' : 'Normale',
  status: statusLabels[row.status] || 'Ouvert',
  createdAt: new Date(row.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }),
  assignee: profiles[row.technician_id] || '',
  note: row.technician_note || '',
  level: row.technician_level || 1,
  attachments: row.attachments || [],
  escalations: row.escalations || [],
  playbook: row.playbook || null,
})

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
    if (data) setUser({ id: authUser.id, name: data.full_name, email: authUser.email || '', role: data.role === 'technician' || data.role === 'admin' ? 'technician' : 'employee' })
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => loadProfile(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => loadProfile(session?.user))
    return () => listener.subscription.unsubscribe()
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
      if (payload.eventType === 'INSERT' && user.role === 'technician' && row?.reference) {
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
    ? <Portal user={user} tickets={tickets} setTickets={setTickets} ticketError={ticketError} notifications={notifications} setNotifications={setNotifications} logout={() => supabase.auth.signOut()} />
    : <Login />
}

function Login() {
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
        <section className="auth-showcase" aria-label="Tesca Tech">
          <div className="showcase-top"><Brand light /><span className="showcase-tag">SUPPORT INFORMATIQUE</span></div>
          <div className="showcase-copy">
            <div className="logo-tile"><img src={tescaLogo} alt="Logo Tesca Group" /></div>
            <p className="showcase-kicker">SUPPORT INFORMATIQUE · MATÉRIEL</p>
            <h2>Votre matériel<br />repart du bon pied.</h2>
            <p className="showcase-description">Signalez une panne, retrouvez vos demandes et suivez chaque intervention jusqu’à la résolution.</p>
          </div>
          <div className="showcase-foot"><span className="status-dot" /> Votre équipe IT, toujours à vos côtés <span className="foot-year">TESCA GROUP</span></div>
          <div className="showcase-orb orb-one" /><div className="showcase-orb orb-two" />
        </section>

        <section className="auth-panel">
          <div className="mobile-brand"><span className="mobile-logo"><img src={tescaLogo} alt="" /></span><span className="mobile-brand-copy"><b>Tesca <i>Tech</i></b><small>SUPPORT INFORMATIQUE</small></span><span className="mobile-secure"><span /> SÉCURISÉ</span></div>
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

function Portal({ user, tickets, setTickets, ticketError, notifications, setNotifications, logout }) {
  const [activeChatTicket, setActiveChatTicket] = useState(null)
  return (
    <main className={`app-shell ${Capacitor.isNativePlatform() ? 'native-experience' : 'web-experience'}`}>
      <PushRegistration userId={user.id} />
      <Header user={user} logout={logout} notifications={notifications} setNotifications={setNotifications} />
      <ChatInbox user={user} tickets={tickets} selectedTicket={activeChatTicket} setSelectedTicket={setActiveChatTicket} />
      <div className="portal-content">
        {ticketError && <Notice title="Synchronisation indisponible" text={ticketError} />}
        {user.role === 'employee'
          ? <Employee user={user} tickets={tickets} setTickets={setTickets} onOpenChat={setActiveChatTicket} />
          : <Technician user={user} tickets={tickets} setTickets={setTickets} onOpenChat={setActiveChatTicket} />}
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
  const [submitError, setSubmitError] = useState('')
  const [voiceLanguage, setVoiceLanguage] = useState('fr-FR')
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceError, setVoiceError] = useState('')
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
  const mine = tickets.filter((ticket) => ticket.reporter === user.name)

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
        <div className="ticket-list">{mine.length ? mine.map((ticket) => <Ticket key={ticket.id} ticket={ticket} user={user} onOpenChat={onOpenChat} />) : <p className="empty">Aucune demande pour le moment. Vos signalements apparaîtront ici.</p>}</div>
      </section>
    </section>
    {sent && <SuccessDialog reference={createdReference} onClose={() => setSent(false)} />}
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

function Technician({ user, tickets, setTickets, onOpenChat }) {
  const [selectedId, setSelectedId] = useState(tickets[0]?.id)
  const [filter, setFilter] = useState('Tous')
  const [activePage, setActivePage] = useState('tickets')
  const [updateError, setUpdateError] = useState('')
  const selected = tickets.find((ticket) => ticket.id === selectedId) || tickets[0]
  const shown = tickets.filter((ticket) => filter === 'Tous' || ticket.status === filter)
  const update = async (status, note, level = selected?.level || 1) => {
    if (!selected) return
    setUpdateError('')
    const { data, error } = await supabase.from('tickets').update({
      status: dbStatus[status],
      technician_note: note,
      technician_level: level,
      technician_id: status === 'Ouvert' ? null : user.id,
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
  const highPriorityOpenCount = tickets.filter((ticket) => ticket.urgency === 'Haute' && ticket.status !== 'Résolu' && ticket.status !== 'Clôturé').length

  return <>
    <Welcome label={activePage === 'stats' ? 'STATISTIQUES' : 'ESPACE TECHNICIEN'} name={user.name} text={activePage === 'stats' ? 'Incidents par machine, d\u00e9partement et priorit\u00e9.' : 'Le tableau de bord de vos interventions.'} className={activePage === 'stats' ? 'welcome-stats' : ''} />
    <nav className="technician-page-tabs" role="tablist" aria-label="Pages technicien">
      <button type="button" role="tab" id="tab-tickets" aria-controls="panel-tickets" aria-selected={activePage === 'tickets'} className={activePage === 'tickets' ? 'active' : ''} onClick={() => setActivePage('tickets')}>Interventions</button>
      <button type="button" role="tab" id="tab-stats" aria-controls="panel-stats" aria-selected={activePage === 'stats'} className={activePage === 'stats' ? 'active' : ''} onClick={() => setActivePage('stats')}>Statistiques</button>
    </nav>
    {activePage === 'stats' && <div role="tabpanel" id="panel-stats" aria-labelledby="tab-stats">
      <TicketAnalytics tickets={tickets} highPriorityOpenCount={highPriorityOpenCount} />
    </div>}
    {activePage === 'tickets' && <section role="tabpanel" id="panel-tickets" aria-labelledby="tab-tickets" className="grid technician-grid">
      <section className="card queue-card">
        <div className="card-heading"><span className="heading-icon">≡</span><div><p className="eyebrow">VUE D’ENSEMBLE</p><h2>File d’intervention</h2></div></div>
        <div className="filters" role="group" aria-label="Filtrer les incidents">{['Tous', 'Ouvert', 'En cours', 'Résolu'].map((value) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{value}{value === 'Tous' && <span className="filter-count">{tickets.length}</span>}</button>)}</div>
        <div className="ticket-list">{shown.length ? shown.map((ticket) => <button className={`ticket select ${selected?.id === ticket.id ? 'selected' : ''}`} key={ticket.id} onClick={() => setSelectedId(ticket.id)}><span className="queue-indicator" /><div><b>{getAsset(ticket.assetId)[1]}</b><small>{ticket.id} · {ticket.assetId} · {ticket.reporter}</small><small className="queue-issue">{ticket.issue}</small></div><Status status={ticket.status} /></button>) : <p className="empty">Aucun incident dans cette catégorie.</p>}</div>
      </section>
      {selected && <Detail ticket={selected} user={user} onOpenChat={onOpenChat} update={update} escalate={escalate} savePlaybook={savePlaybook} updateError={updateError} />}
    </section>}
  </>
}

function TicketAnalytics({ tickets, highPriorityOpenCount }) {
  const openCount = tickets.filter((ticket) => ['Ouvert', 'R\u00e9ouvert'].includes(ticket.status)).length
  const progressCount = tickets.filter((ticket) => ['En cours', 'Attribu\u00e9', 'En attente de pi\u00e8ces'].includes(ticket.status)).length
  const resolvedCount = tickets.filter((ticket) => ['R\u00e9solu', 'Cl\u00f4tur\u00e9'].includes(ticket.status)).length
  const total = tickets.length
  const machineRows = assets.map(([id, name]) => ({
    label: `${name} \u00b7 ${id}`,
    count: tickets.filter((ticket) => ticket.assetId === id).length,
  })).sort((a, b) => b.count - a.count)
  const departmentRows = [...new Set(assets.map((asset) => asset[2]))].map((department) => ({
    label: department,
    count: tickets.filter((ticket) => getAsset(ticket.assetId)[2] === department).length,
  })).sort((a, b) => b.count - a.count)
  const openPercent = total ? openCount / total * 100 : 0
  const progressPercent = total ? progressCount / total * 100 : 0
  const resolvedPercent = total ? resolvedCount / total * 100 : 0
  const donutStyle = {
    background: total
      ? `conic-gradient(#f16d5b 0% ${openPercent}%, #f0bd68 ${openPercent}% ${openPercent + progressPercent}%, #74b68e ${openPercent + progressPercent}% ${openPercent + progressPercent + resolvedPercent}%, #dce5e0 ${openPercent + progressPercent + resolvedPercent}% 100%)`
      : '#dce5e0',
  }
  const kpis = [
    { label: 'Incidents ouverts', count: openCount, className: 'kpi-open', icon: '01' },
    { label: 'En cours', count: progressCount, className: 'kpi-progress', icon: '02' },
    { label: 'R\u00e9solus', count: resolvedCount, className: 'kpi-resolved', icon: '03' },
    { label: 'Priorit\u00e9 haute', count: highPriorityOpenCount, className: 'kpi-priority', icon: '!' },
  ]
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
    <section className="stats-hero">
      <div className="stats-hero-copy">
        <p className="stats-eyebrow">TESCA TECH <span /> VUE D'ENSEMBLE</p>
        <h2>{'Les incidents, en un coup d\u2019oeil.'}</h2>
        <p className="stats-hero-caption">{'Suivez les demandes et rep\u00e9rez les points qui n\u00e9cessitent votre attention.'}</p>
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
    <section className="stats-kpis" aria-label="Indicateurs cl\u00e9s">
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
    <p className="stats-footnote">{'Les chiffres couvrent tous les incidents visibles pour votre compte technicien.'}</p>
  </div>
}
function Detail({ ticket, user, onOpenChat, update, escalate, savePlaybook, updateError }) {
  const [note, setNote] = useState(ticket.note)
  const [playbookId, setPlaybookId] = useState(ticket.playbook?.playbookId || suggestPlaybook(ticket))
  const [checkedSteps, setCheckedSteps] = useState(ticket.playbook?.checkedSteps || [])
  const [playbookNote, setPlaybookNote] = useState(ticket.playbook?.note || '')
  const [playbookSaving, setPlaybookSaving] = useState(false)
  const [playbookMessage, setPlaybookMessage] = useState('')
  useEffect(() => setNote(ticket.note), [ticket.id, ticket.note])
  useEffect(() => {
    setPlaybookId(ticket.playbook?.playbookId || suggestPlaybook(ticket))
    setCheckedSteps(ticket.playbook?.checkedSteps || [])
    setPlaybookNote(ticket.playbook?.note || '')
  }, [ticket.id, ticket.playbook?.updatedAt])
  useEffect(() => setPlaybookMessage(''), [ticket.id])
  const activePlaybook = repairPlaybooks.find((item) => item.id === playbookId) || repairPlaybooks[0]
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
  return <section className="card detail-card">
    {updateError && <p className="form-message" role="alert">{updateError}</p>}
    <div className="detail-head"><div><p className="eyebrow">FICHE D’INTERVENTION <span className="reference">{ticket.id}</span></p><h2>{asset[1]}</h2><p className="subtle small">{asset[0]} <span>·</span> {asset[3]}</p></div><Status status={ticket.status} /></div>
    <div className="alert"><span className="alert-symbol">{ticket.level}</span><div><strong>Technicien niveau {ticket.level}</strong><p>{ticket.level < 3 ? `Si le problème n’est pas résolu, escaladez au niveau ${ticket.level + 1}.` : 'Niveau maximum atteint.'}</p></div></div>
    <div className={`alert ${ticket.urgency === 'Haute' ? 'alert-priority' : ''}`}><span className="alert-symbol">{ticket.urgency === 'Haute' ? '!' : 'i'}</span><div><strong>{ticket.urgency === 'Haute' ? 'À traiter en priorité' : 'Nouveau signalement'}</strong><p>Par {ticket.reporter} <span>·</span> {ticket.createdAt}</p></div></div>
    <div className="issue"><small>DESCRIPTION DU PROBLÈME</small><p>{ticket.issue}</p></div>
    <TicketChat ticket={ticket} user={user} onOpenChat={onOpenChat} />
    <section className="repair-playbook">
      <div className="playbook-heading"><div><p className="eyebrow">GUIDE DE DIAGNOSTIC</p><h3>Playbook de réparation</h3></div><span className="playbook-count">{checkedSteps.length}/{activePlaybook.steps.length}</span></div>
      <label className="field playbook-select">Choisir un guide<select value={playbookId} onChange={(event) => { setPlaybookId(event.target.value); setCheckedSteps([]); setPlaybookMessage('') }}>{repairPlaybooks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <div className="playbook-progress"><span style={{ width: `${(checkedSteps.length / activePlaybook.steps.length) * 100}%` }} /></div>
      <div className="playbook-steps">{activePlaybook.steps.map((step, index) => <label className={`playbook-step ${checkedSteps.includes(index) ? 'checked' : ''}`} key={step}><input type="checkbox" checked={checkedSteps.includes(index)} onChange={() => { setCheckedSteps((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]); setPlaybookMessage('') }} /><span className="playbook-check" aria-hidden="true">✓</span><span>{step}</span></label>)}</div>
      <label className="field playbook-note">Résultat du diagnostic<textarea value={playbookNote} onChange={(event) => { setPlaybookNote(event.target.value); setPlaybookMessage('') }} placeholder="Résultats, messages d’erreur, actions effectuées…" /></label>
      <div className="playbook-footer"><button type="button" className="playbook-save" onClick={saveCurrentPlaybook} disabled={playbookSaving}>{playbookSaving ? 'Enregistrement…' : 'Enregistrer le diagnostic'}</button>{playbookMessage && <small className={playbookMessage.startsWith('Diagnostic enregistré') ? 'playbook-success' : 'playbook-error'} role="status">{playbookMessage}</small>}</div>
    </section>
    <EscalationTimeline ticket={ticket} />
    {ticket.attachments?.length > 0 && <AttachmentList attachments={ticket.attachments} />}
    <div className="info"><div><small>DÉPARTEMENT</small><b>{asset[2]}</b></div><div><small>RESPONSABLE</small><b>{ticket.assignee || 'À attribuer'}</b></div></div>
    {ticket.status === 'Résolu'
      ? <Notice title={"Intervention cl\u00f4tur\u00e9e"} text={ticket.note || "Aucun compte rendu ajout\u00e9."} />
      : <><label className="field">Compte rendu technicien<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Diagnostic et action réalisée…" /></label><button className="primary-action" onClick={() => ticket.status === 'Ouvert' ? update('En cours', note) : resolveTicket()}>{ticket.status === 'Ouvert' ? 'Prendre en charge' : 'Marquer comme résolu'} <span aria-hidden="true">↗</span></button>{ticket.level < 3 && <button className="secondary-action" onClick={() => escalate(note)}>Non résolu — escalader au niveau {ticket.level + 1}</button>}</>}
  </section>
}

function Ticket({ ticket, user, onOpenChat }) {
  return <article className="ticket employee-ticket"><div className="employee-ticket-top"><span className="ticket-marker">{ticket.urgency === 'Haute' ? '!' : '↗'}</span><div><b>{getAsset(ticket.assetId)[1]}</b><small>{ticket.id} <span>·</span> {ticket.assetId}</small></div><Status status={ticket.status} /></div><p>{ticket.issue}</p>{ticket.attachments?.length > 0 && <AttachmentList attachments={ticket.attachments} />}<small className="ticket-meta">Niveau {ticket.level} · {ticket.createdAt}{ticket.assignee ? ` · ${ticket.assignee}` : ''}</small><TicketChat ticket={ticket} user={user} onOpenChat={onOpenChat} /></article>
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

  return <div className={`ticket-chat-wrap ${user.role === 'technician' && !hideLauncher ? 'technician-chat-wrap' : ''}`}>
    {!hideLauncher && (user.role === 'technician'
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
        : <li className="timeline-step timeline-step-current"><span className="timeline-dot timeline-dot-current" /><div><b>{ticket.status === 'Résolu' ? 'Résolu' : 'En traitement'} · Niveau {ticket.level}</b><small>{ticket.status}</small></div></li>}
    </ol>
  </section>
}

function Status({ status }) {
  return <span className={`status ${status === 'Ouvert' ? 'danger' : status === 'Résolu' ? 'success' : 'warning'}`}><span className="status-dot" />{status}</span>
}

function SuccessDialog({ reference, onClose }) {
  return <div className="success-overlay">
    <section className="success-dialog" role="dialog" aria-modal="true" aria-labelledby="success-dialog-title">
      <button type="button" className="success-dialog-close" onClick={onClose} aria-label="Fermer">×</button>
      <div className="success-emblem" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m13 24 7 7 16-17" /></svg></div>
      <p className="success-kicker">DEMANDE TRANSMISE</p>
      <h2 id="success-dialog-title">Incident ajouté avec succès !</h2>
      <p className="success-copy">Un technicien a été informé. Vous pouvez suivre votre demande dans « Mes demandes ».</p>
      {reference && <div className="success-reference"><small>RÉFÉRENCE</small><b>{reference}</b></div>}
      <button type="button" className="success-continue" onClick={onClose}>Continuer</button>
    </section>
  </div>
}

function Notice({ title, text }) {
  return <div className="notice"><span className="notice-check">✓</span><div><b>{title}</b><span>{text}</span></div></div>
}

function Welcome({ label, name, text, className = '' }) {
  return <section className={`welcome ${className}`}><div><p className="eyebrow">{label}</p><h1>Bonjour, {name.split(' ')[0]}<span className="hello-dot">.</span></h1><p className="subtle">{text}</p></div><div className="welcome-art" aria-hidden="true"><span className="welcome-art-line" /><span className="welcome-art-orb">✳</span><small>TESCA<br />SUPPORT</small></div></section>
}

function Brand({ light = false }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}><span className="brand-mark">t</span><span className="brand-word">tesca<span>.tech</span></span></div>
}

function Header({ user, logout, notifications, setNotifications }) {
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const unread = notifications.filter((item) => !item.read).length
  const markRead = (id) => setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item))
  return (
    <header className="app-header">
      <Brand />
      <div className="header-user">
        <div className="header-user-copy"><small>CONNECTÉ EN TANT QUE</small><b>{user.role === 'employee' ? 'Employé' : 'Technicien'}</b></div>
        <div className="notification-wrap">
          <button className="notification-button" onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? `, ${unread} non lues` : ''}`} aria-expanded={open}>
            <span aria-hidden="true">🔔</span>{unread > 0 && <i>{unread > 9 ? '9+' : unread}</i>}
          </button>
          {open && <section className="notification-panel">
            <div className="notification-panel-head"><b>Notifications</b><button onClick={() => setNotifications([])}>Effacer</button></div>
            {notifications.length ? <div className="notification-items">{notifications.map((item) => <button className={`notification-item${item.read ? '' : ' unread'}`} key={item.id} onClick={() => markRead(item.id)}><span className="notification-dot" /><span><b>{item.title}</b><small>{item.message}</small><time>{new Date(item.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</time></span></button>)}</div> : <p className="notification-empty">Aucune notification pour le moment.</p>}
          </section>}
        </div>
        <div className="header-profile">
          <button className="avatar" onClick={() => setProfileOpen((value) => !value)} title="Voir mon profil" aria-label="Voir mon profil" aria-expanded={profileOpen} aria-haspopup="dialog">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}<span className="avatar-presence" /></button>
          {profileOpen && <section className="profile-card" role="dialog" aria-label="Informations du profil">
            <div className="profile-card-head"><span className="profile-card-avatar">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><b>{user.name}</b><small>{user.role === 'employee' ? 'Employé' : 'Technicien'}</small></div></div>
            <div className="profile-card-info"><small>ADRESSE E-MAIL</small><b>{user.email || 'Non renseignée'}</b></div>
            <button type="button" className="profile-card-logout" onClick={logout}>Se déconnecter <span aria-hidden="true">↗</span></button>
          </section>}
        </div>
        <button className="logout-button" onClick={logout}>Quitter <span aria-hidden="true">↗</span></button>
      </div>
    </header>
  )
}
