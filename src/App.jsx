import { useEffect, useState } from 'react'
import './App.css'
import { supabase } from './supabase'
import tescaLogo from './assets/tesca-tescagroup-logo.jpg'

const assets = [
  ['PC-FIN-014', 'Poste comptable', 'Finance', '2e étage · Bureau 204'],
  ['PC-FIN-008', 'Poste recouvrement', 'Finance', '2e étage · Bureau 206'],
  ['IMP-RH-002', 'Imprimante RH', 'Ressources humaines', '1er étage · Accueil RH'],
  ['NET-001', 'Routeur principal', 'Infrastructure', 'Salle serveur · RDC'],
]

const initialTickets = [
  { id: 'INC-1042', assetId: 'PC-FIN-014', reporter: 'Amel Ben Salem', issue: 'Le poste ne démarre plus après une coupure de courant.', urgency: 'Haute', status: 'Ouvert', createdAt: 'Aujourd’hui · 09:18', assignee: '', note: '' },
  { id: 'INC-1041', assetId: 'IMP-RH-002', reporter: 'Meriem Gharbi', issue: 'Bourrage papier répétitif.', urgency: 'Normale', status: 'En cours', createdAt: 'Aujourd’hui · 08:35', assignee: 'Mourad', note: 'Vérification du bac papier en cours.' },
]

const getAsset = (id) => assets.find((asset) => asset[0] === id) || assets[0]
const loadTickets = () => {
  try {
    return JSON.parse(localStorage.getItem('setcar-tickets')) || initialTickets
  } catch {
    return initialTickets
  }
}

export default function App() {
  const [user, setUser] = useState(null)
  const [tickets, setTickets] = useState(loadTickets)

  const loadProfile = async (authUser) => {
    if (!authUser) {
      setUser(null)
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

  useEffect(() => localStorage.setItem('setcar-tickets', JSON.stringify(tickets)), [tickets])

  return user
    ? <Portal user={user} tickets={tickets} setTickets={setTickets} logout={() => supabase.auth.signOut()} />
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
            <p className="showcase-kicker">LE SUPPORT, EN MOUVEMENT</p>
            <h2>Chaque demande<br />trouve sa solution.</h2>
            <p className="showcase-description">Un espace simple pour signaler un incident et suivre son avancement, du premier clic à la résolution.</p>
          </div>
          <div className="showcase-foot"><span className="status-dot" /> Votre équipe IT, toujours à vos côtés <span className="foot-year">TESCA GROUP</span></div>
          <div className="showcase-orb orb-one" /><div className="showcase-orb orb-two" />
        </section>

        <section className="auth-panel">
          <div className="mobile-brand"><span className="mobile-logo"><img src={tescaLogo} alt="" /></span><span className="mobile-brand-copy"><b>Tesca <i>Tech</i></b><small>SUPPORT INFORMATIQUE</small></span><span className="mobile-secure"><span /> SÉCURISÉ</span></div>
          <div className="auth-content">
            <div className="auth-heading"><p className="eyebrow">{signup ? 'VOTRE ESPACE TESCA' : 'VOTRE ASSISTANT INFORMATIQUE'}</p><h1>{signup ? 'Créer mon compte' : 'Content de vous revoir'}<span className="auth-title-dot">.</span></h1><p className="subtle">{signup ? 'Renseignez vos informations pour commencer.' : 'Connectez-vous pour retrouver votre équipe support.'}</p></div>
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

function Portal({ user, tickets, setTickets, logout }) {
  return (
    <main className="app-shell">
      <Header user={user} logout={logout} />
      <div className="portal-content">
        {user.role === 'employee'
          ? <Employee user={user} tickets={tickets} setTickets={setTickets} />
          : <Technician user={user} tickets={tickets} setTickets={setTickets} />}
      </div>
    </main>
  )
}

function Employee({ user, tickets, setTickets }) {
  const [assetId, setAssetId] = useState(assets[0][0])
  const [issue, setIssue] = useState('')
  const [urgency, setUrgency] = useState('Normale')
  const [sent, setSent] = useState(false)
  const submit = (event) => {
    event.preventDefault()
    if (!issue.trim()) return
    setTickets((all) => [{ id: `INC-${1043 + all.length}`, assetId, reporter: user.name, issue, urgency, status: 'Ouvert', createdAt: "À l’instant", assignee: '', note: '' }, ...all])
    setIssue('')
    setSent(true)
  }
  const mine = tickets.filter((ticket) => ticket.reporter === user.name)

  return <>
    <Welcome label="ESPACE EMPLOYÉ" name={user.name} text="Un souci avec votre équipement ? On s’en occupe." />
    <section className="grid employee-grid">
      <form className="card form-card" onSubmit={submit}>
        <div className="card-heading"><span className="heading-icon">＋</span><div><p className="eyebrow">NOUVELLE DEMANDE</p><h2>Signaler un problème</h2></div></div>
        {sent && <Notice title="Demande envoyée" text="Un technicien sera prévenu. Vous pouvez suivre son avancement ici." />}
        <label className="field">Équipement concerné<select value={assetId} onChange={(event) => setAssetId(event.target.value)}>{assets.map((asset) => <option key={asset[0]} value={asset[0]}>{asset[0]} — {asset[1]}</option>)}</select></label>
        <div className="preview"><span className="preview-icon">▣</span><div><b>{getAsset(assetId)[1]}</b><small>{getAsset(assetId)[3]}</small></div><span className="preview-code">{assetId}</span></div>
        <label className="field">Décrivez le problème<textarea required value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="Que se passe-t-il ? Ajoutez quelques détails…" /></label>
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
  </>
}

function Technician({ user, tickets, setTickets }) {
  const [selectedId, setSelectedId] = useState(tickets[0]?.id)
  const [filter, setFilter] = useState('Tous')
  const selected = tickets.find((ticket) => ticket.id === selectedId) || tickets[0]
  const shown = tickets.filter((ticket) => filter === 'Tous' || ticket.status === filter)
  const update = (status, note) => setTickets((all) => all.map((ticket) => ticket.id === selected.id ? { ...ticket, status, note, assignee: status === 'Ouvert' ? '' : user.name } : ticket))
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
      {selected && <Detail ticket={selected} update={update} />}
    </section>
  </>
}

function Detail({ ticket, update }) {
  const [note, setNote] = useState(ticket.note)
  useEffect(() => setNote(ticket.note), [ticket.id, ticket.note])
  const asset = getAsset(ticket.assetId)
  return <section className="card detail-card">
    <div className="detail-head"><div><p className="eyebrow">FICHE D’INTERVENTION <span className="reference">{ticket.id}</span></p><h2>{asset[1]}</h2><p className="subtle small">{asset[0]} <span>·</span> {asset[3]}</p></div><Status status={ticket.status} /></div>
    <div className={`alert ${ticket.urgency === 'Haute' ? 'alert-priority' : ''}`}><span className="alert-symbol">{ticket.urgency === 'Haute' ? '!' : 'i'}</span><div><strong>{ticket.urgency === 'Haute' ? 'À traiter en priorité' : 'Nouveau signalement'}</strong><p>Par {ticket.reporter} <span>·</span> {ticket.createdAt}</p></div></div>
    <div className="issue"><small>DESCRIPTION DU PROBLÈME</small><p>{ticket.issue}</p></div>
    <div className="info"><div><small>DÉPARTEMENT</small><b>{asset[2]}</b></div><div><small>RESPONSABLE</small><b>{ticket.assignee || 'À attribuer'}</b></div></div>
    {ticket.status === 'Résolu'
      ? <Notice title="Intervention clôturée" text={ticket.note || 'Aucun compte rendu ajouté.'} />
      : <><label className="field">Compte rendu technicien<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Diagnostic et action réalisée…" /></label><button className="primary-action" onClick={() => update(ticket.status === 'Ouvert' ? 'En cours' : 'Résolu', note)}>{ticket.status === 'Ouvert' ? 'Prendre en charge' : 'Clôturer l’intervention'} <span aria-hidden="true">↗</span></button></>}
  </section>
}

function Ticket({ ticket }) {
  return <article className="ticket employee-ticket"><div className="employee-ticket-top"><span className="ticket-marker">{ticket.urgency === 'Haute' ? '!' : '↗'}</span><div><b>{getAsset(ticket.assetId)[1]}</b><small>{ticket.id} <span>·</span> {ticket.assetId}</small></div><Status status={ticket.status} /></div><p>{ticket.issue}</p><small className="ticket-meta">{ticket.createdAt}{ticket.assignee ? ` · ${ticket.assignee}` : ''}</small></article>
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

function Header({ user, logout }) {
  return <header className="app-header"><Brand /><div className="header-user"><div className="header-user-copy"><small>CONNECTÉ EN TANT QUE</small><b>{user.role === 'employee' ? 'Employé' : 'Technicien'}</b></div><button className="avatar" onClick={logout} title="Se déconnecter" aria-label="Se déconnecter">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}<span className="avatar-presence" /></button><button className="logout-button" onClick={logout}>Quitter <span aria-hidden="true">↗</span></button></div></header>
}
