import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
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
})

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
  return rows.map((row) => mapTicket({ ...row, attachments: attachmentsByTicket[row.id] || [], escalations: escalationsByTicket[row.id] || [] }, names))
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
    if (data) setUser({ id: authUser.id, name: data.full_name, role: data.role === 'technician' || data.role === 'admin' ? 'technician' : 'employee' })
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
    setMessage(result.error ? result.error.message : signup ? 'Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.' : '')
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
  return (
    <main className={`app-shell ${Capacitor.isNativePlatform() ? 'native-experience' : 'web-experience'}`}>
      <PushRegistration userId={user.id} />
      <Header user={user} logout={logout} notifications={notifications} setNotifications={setNotifications} />
      <div className="portal-content">
        {ticketError && <Notice title="Synchronisation indisponible" text={ticketError} />}
        {user.role === 'employee'
          ? <Employee user={user} tickets={tickets} setTickets={setTickets} />
          : <Technician user={user} tickets={tickets} setTickets={setTickets} />}
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

function Employee({ user, tickets, setTickets }) {
  const [assetId, setAssetId] = useState(assets[0][0])
  const [issue, setIssue] = useState('')
  const [urgency, setUrgency] = useState('Normale')
  const [files, setFiles] = useState([])
  const [sent, setSent] = useState(false)
  const [submitError, setSubmitError] = useState('')
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
  }
  const mine = tickets.filter((ticket) => ticket.reporter === user.name)

  return <>
    <Welcome label="ESPACE EMPLOYÉ" name={user.name} text="Un souci avec votre équipement ? On s’en occupe." />
    <section className="grid employee-grid">
      <form className="card form-card" onSubmit={submit}>
        <div className="card-heading"><span className="heading-icon">＋</span><div><p className="eyebrow">NOUVELLE DEMANDE</p><h2>Signaler un problème</h2></div></div>
        {submitError && <p className="form-message" role="alert">{submitError}</p>}
        {sent && <Notice title="Demande envoyée" text="Un technicien sera prévenu. Vous pouvez suivre son avancement ici." />}
        <label className="field">Équipement concerné<select value={assetId} onChange={(event) => setAssetId(event.target.value)}>{assets.map((asset) => <option key={asset[0]} value={asset[0]}>{asset[0]} — {asset[1]}</option>)}</select></label>
        <div className="preview"><span className="preview-icon">▣</span><div><b>{getAsset(assetId)[1]}</b><small>{getAsset(assetId)[3]}</small></div><span className="preview-code">{assetId}</span></div>
        <label className="field">Décrivez le problème<textarea required value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="Que se passe-t-il ? Ajoutez quelques détails…" /></label>
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
        <div className="ticket-list">{mine.length ? mine.map((ticket) => <Ticket key={ticket.id} ticket={ticket} />) : <p className="empty">Aucune demande pour le moment. Vos signalements apparaîtront ici.</p>}</div>
      </section>
    </section>
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

function Technician({ user, tickets, setTickets }) {
  const [selectedId, setSelectedId] = useState(tickets[0]?.id)
  const [filter, setFilter] = useState('Tous')
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
      return
    }
    setTickets((all) => all.map((ticket) => ticket.dbId === selected.dbId
      ? mapTicket(data, { [data.reporter_id]: selected.reporter, [user.id]: user.name })
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
      ? { ...mapTicket(ticketRow, { [ticketRow.reporter_id]: selected.reporter }), attachments: selected.attachments, escalations: [...(selected.escalations || []), escalation] }
      : ticket))
  }
  const count = (status) => tickets.filter((ticket) => ticket.status === status).length

  return <>
    <Welcome label="ESPACE TECHNICIEN" name={user.name} text="Le tableau de bord de vos interventions." />
    <section className="summary">
      <div className="metric metric-open"><span className="metric-symbol">!</span><div><b>{count('Ouvert')}</b><small>Incidents ouverts</small></div><span className="metric-arrow">↗</span></div>
      <div className="metric"><span className="metric-symbol metric-symbol-warm">◷</span><div><b>{count('En cours')}</b><small>Interventions en cours</small></div><span className="metric-arrow">↗</span></div>
      <div className="metric metric-total"><span className="metric-symbol metric-symbol-dark">✓</span><div><b>{count('Résolu')}</b><small>Incidents résolus</small></div><span className="metric-arrow">↗</span></div>
    </section>
    <section className="grid technician-grid">
      <section className="card queue-card">
        <div className="card-heading"><span className="heading-icon">≡</span><div><p className="eyebrow">VUE D’ENSEMBLE</p><h2>File d’intervention</h2></div></div>
        <div className="filters" role="group" aria-label="Filtrer les incidents">{['Tous', 'Ouvert', 'En cours', 'Résolu'].map((value) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{value}{value === 'Tous' && <span className="filter-count">{tickets.length}</span>}</button>)}</div>
        <div className="ticket-list">{shown.length ? shown.map((ticket) => <button className={`ticket select ${selected?.id === ticket.id ? 'selected' : ''}`} key={ticket.id} onClick={() => setSelectedId(ticket.id)}><span className="queue-indicator" /><div><b>{getAsset(ticket.assetId)[1]}</b><small>{ticket.id} · {ticket.assetId} · {ticket.reporter}</small><small className="queue-issue">{ticket.issue}</small></div><Status status={ticket.status} /></button>) : <p className="empty">Aucun incident dans cette catégorie.</p>}</div>
      </section>
      {selected && <Detail ticket={selected} update={update} escalate={escalate} updateError={updateError} />}
    </section>
  </>
}

function Detail({ ticket, update, escalate, updateError }) {
  const [note, setNote] = useState(ticket.note)
  useEffect(() => setNote(ticket.note), [ticket.id, ticket.note])
  const asset = getAsset(ticket.assetId)
  return <section className="card detail-card">
    {updateError && <p className="form-message" role="alert">{updateError}</p>}
    <div className="detail-head"><div><p className="eyebrow">FICHE D’INTERVENTION <span className="reference">{ticket.id}</span></p><h2>{asset[1]}</h2><p className="subtle small">{asset[0]} <span>·</span> {asset[3]}</p></div><Status status={ticket.status} /></div>
    <div className="alert"><span className="alert-symbol">{ticket.level}</span><div><strong>Technicien niveau {ticket.level}</strong><p>{ticket.level < 3 ? `Si le problème n’est pas résolu, escaladez au niveau ${ticket.level + 1}.` : 'Niveau maximum atteint.'}</p></div></div>
    <div className={`alert ${ticket.urgency === 'Haute' ? 'alert-priority' : ''}`}><span className="alert-symbol">{ticket.urgency === 'Haute' ? '!' : 'i'}</span><div><strong>{ticket.urgency === 'Haute' ? 'À traiter en priorité' : 'Nouveau signalement'}</strong><p>Par {ticket.reporter} <span>·</span> {ticket.createdAt}</p></div></div>
    <div className="issue"><small>DESCRIPTION DU PROBLÈME</small><p>{ticket.issue}</p></div>
    <EscalationTimeline ticket={ticket} />
    {ticket.attachments?.length > 0 && <AttachmentList attachments={ticket.attachments} />}
    <div className="info"><div><small>DÉPARTEMENT</small><b>{asset[2]}</b></div><div><small>RESPONSABLE</small><b>{ticket.assignee || 'À attribuer'}</b></div></div>
    {ticket.status === 'Résolu'
      ? <Notice title="Intervention clôturée" text={ticket.note || 'Aucun compte rendu ajouté.'} />
      : <><label className="field">Compte rendu technicien<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Diagnostic et action réalisée…" /></label><button className="primary-action" onClick={() => update(ticket.status === 'Ouvert' ? 'En cours' : 'Résolu', note)}>{ticket.status === 'Ouvert' ? 'Prendre en charge' : 'Marquer comme résolu'} <span aria-hidden="true">↗</span></button>{ticket.level < 3 && <button className="secondary-action" onClick={() => escalate(note)}>Non résolu — escalader au niveau {ticket.level + 1}</button>}</>}
  </section>
}

function Ticket({ ticket }) {
  return <article className="ticket employee-ticket"><div className="employee-ticket-top"><span className="ticket-marker">{ticket.urgency === 'Haute' ? '!' : '↗'}</span><div><b>{getAsset(ticket.assetId)[1]}</b><small>{ticket.id} <span>·</span> {ticket.assetId}</small></div><Status status={ticket.status} /></div><p>{ticket.issue}</p>{ticket.attachments?.length > 0 && <AttachmentList attachments={ticket.attachments} />}<small className="ticket-meta">Niveau {ticket.level} · {ticket.createdAt}{ticket.assignee ? ` · ${ticket.assignee}` : ''}</small></article>
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

function Notice({ title, text }) {
  return <div className="notice"><span className="notice-check">✓</span><div><b>{title}</b><span>{text}</span></div></div>
}

function Welcome({ label, name, text }) {
  return <section className="welcome"><div><p className="eyebrow">{label}</p><h1>Bonjour, {name.split(' ')[0]}<span className="hello-dot">.</span></h1><p className="subtle">{text}</p></div><div className="welcome-art" aria-hidden="true"><span className="welcome-art-line" /><span className="welcome-art-orb">✳</span><small>TESCA<br />SUPPORT</small></div></section>
}

function Brand({ light = false }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}><span className="brand-mark">t</span><span className="brand-word">tesca<span>.tech</span></span></div>
}

function Header({ user, logout, notifications, setNotifications }) {
  const [open, setOpen] = useState(false)
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
        <button className="avatar" onClick={logout} title="Se déconnecter" aria-label="Se déconnecter">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}<span className="avatar-presence" /></button>
        <button className="logout-button" onClick={logout}>Quitter <span aria-hidden="true">↗</span></button>
      </div>
    </header>
  )
}
