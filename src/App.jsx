import { useEffect, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

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
const getAsset = (id) => assets.find((asset) => asset[0] === id)
const load = () => { try { return JSON.parse(localStorage.getItem('setcar-tickets')) || initialTickets } catch { return initialTickets } }

export default function App() {
  const [user, setUser] = useState(null)
  const [tickets, setTickets] = useState(load)
  const loadProfile = async (authUser) => {
    if (!authUser) return setUser(null)
    const { data } = await supabase.from('profiles').select('full_name, role').eq('id', authUser.id).single()
    if (data) setUser({ id: authUser.id, name: data.full_name, role: data.role === 'technician' || data.role === 'admin' ? 'technician' : 'employee' })
  }
  useEffect(() => { supabase.auth.getUser().then(({ data }) => loadProfile(data.user)); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => loadProfile(session?.user)); return () => listener.subscription.unsubscribe() }, [])
  useEffect(() => localStorage.setItem('setcar-tickets', JSON.stringify(tickets)), [tickets])
  return user ? <Portal user={user} tickets={tickets} setTickets={setTickets} logout={() => supabase.auth.signOut()} /> : <Login />
}

function Login() {
  const [signup, setSignup] = useState(false); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState('')
  const submit = async (event) => { event.preventDefault(); setMessage(''); const result = signup ? await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } }) : await supabase.auth.signInWithPassword({ email, password }); setMessage(result.error ? result.error.message : signup ? 'Compte créé. Connectez-vous.' : '') }
  return <main className="auth-page"><section className="auth-card"><Brand /><p className="eyebrow">Portail support informatique</p><h1>{signup ? 'Créer un compte.' : 'Bienvenue.'}</h1><p className="subtle">{signup ? 'Les nouveaux comptes sont employés par défaut.' : 'Connectez-vous à votre espace support.'}</p><form onSubmit={submit}>{signup && <label className="field">Nom complet<input required value={name} onChange={(e) => setName(e.target.value)} /></label>}<label className="field">Adresse email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label className="field">Mot de passe<input required minLength="6" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>{message && <p className="demo-note">{message}</p>}<button className="primary-action">{signup ? 'Créer le compte' : 'Se connecter'} <span>→</span></button></form><button className="text-button" onClick={() => { setSignup(!signup); setMessage('') }}>{signup ? 'J’ai déjà un compte' : 'Créer un compte employé'}</button></section></main>
}

function Portal({ user, tickets, setTickets, logout }) {
  return <main className="app-shell"><Header user={user} logout={logout} />{user.role === 'employee' ? <Employee user={user} tickets={tickets} setTickets={setTickets} /> : <Technician user={user} tickets={tickets} setTickets={setTickets} />}</main>
}

function Employee({ user, tickets, setTickets }) {
  const [assetId, setAssetId] = useState(assets[0][0]); const [issue, setIssue] = useState(''); const [urgency, setUrgency] = useState('Normale'); const [sent, setSent] = useState(false)
  const submit = (e) => { e.preventDefault(); if (!issue.trim()) return; setTickets((all) => [{ id: `INC-${1043 + all.length}`, assetId, reporter: user.name, issue, urgency, status: 'Ouvert', createdAt: "À l'instant", assignee: '', note: '' }, ...all]); setIssue(''); setSent(true) }
  const mine = tickets.filter((ticket) => ticket.reporter === user.name)
  return <><Welcome label="Espace employé" name={user.name} text="Un souci avec votre équipement ? Signalez-le ici." /><section className="grid"><form className="card" onSubmit={submit}><p className="eyebrow">Nouvelle demande</p><h2>Signaler un problème</h2>{sent && <Notice title="Demande envoyée." text="Un technicien sera prévenu." />}<label className="field">Équipement concerné<select value={assetId} onChange={(e) => setAssetId(e.target.value)}>{assets.map((a) => <option key={a[0]} value={a[0]}>{a[0]} — {a[1]}</option>)}</select></label><div className="preview"><b>{getAsset(assetId)[1]}</b><small>{getAsset(assetId)[3]}</small></div><label className="field">Décrivez le problème<textarea required value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Ex. l'écran reste noir au démarrage…" /></label><label className="field">Niveau d'urgence<select value={urgency} onChange={(e) => setUrgency(e.target.value)}><option>Normale</option><option>Haute</option></select></label><button className="primary-action">Envoyer la demande <span>→</span></button></form><section className="card"><p className="eyebrow">Suivi</p><h2>Mes demandes</h2><div className="ticket-list">{mine.length ? mine.map((ticket) => <Ticket key={ticket.id} ticket={ticket} />) : <p className="empty">Vous n'avez pas encore de demande.</p>}</div></section></section></>
}

function Technician({ user, tickets, setTickets }) {
  const [selectedId, setSelectedId] = useState(tickets[0]?.id); const [filter, setFilter] = useState('Tous')
  const selected = tickets.find((ticket) => ticket.id === selectedId) || tickets[0]; const shown = tickets.filter((t) => filter === 'Tous' || t.status === filter)
  const update = (status, note) => setTickets((all) => all.map((t) => t.id === selected.id ? { ...t, status, note, assignee: status === 'Ouvert' ? '' : user.name } : t))
  const count = (status) => tickets.filter((t) => t.status === status).length
  return <><Welcome label="Espace technicien" name={user.name} text="Voici les interventions qui demandent votre attention." /><section className="summary"><div className="metric urgent"><b>{count('Ouvert')}</b><small>Incidents ouverts</small></div><div className="metric"><b>{count('En cours')}</b><small>Interventions en cours</small></div></section><section className="grid"><section className="card"><p className="eyebrow">File d'intervention</p><h2>Incidents</h2><div className="filters">{['Tous', 'Ouvert', 'En cours', 'Résolu'].map((f) => <button className={filter === f ? 'active' : ''} key={f} onClick={() => setFilter(f)}>{f}</button>)}</div><div className="ticket-list">{shown.map((ticket) => <button className={`ticket select ${selected?.id === ticket.id ? 'selected' : ''}`} key={ticket.id} onClick={() => setSelectedId(ticket.id)}><div><b>{getAsset(ticket.assetId)[1]}</b><small>{ticket.id} · {ticket.assetId} · {ticket.reporter}</small></div><Status status={ticket.status} /></button>)}</div></section>{selected && <Detail ticket={selected} update={update} />}</section></>
}

function Detail({ ticket, update }) { const [note, setNote] = useState(ticket.note); useEffect(() => setNote(ticket.note), [ticket.id]); const a = getAsset(ticket.assetId); return <section className="card"><div className="detail-head"><div><p className="eyebrow">{ticket.id}</p><h2>{a[1]}</h2><p className="subtle small">{a[0]} · {a[3]}</p></div><Status status={ticket.status} /></div><div className="alert"><b>!</b><div><strong>{ticket.urgency === 'Haute' ? 'Incident prioritaire' : 'Incident signalé'}</strong><p>Signalé par {ticket.reporter} · {ticket.createdAt}</p></div></div><div className="issue"><small>PROBLÈME DÉCLARÉ</small><p>{ticket.issue}</p></div><div className="info"><div><small>Département</small><b>{a[2]}</b></div><div><small>Assigné à</small><b>{ticket.assignee || 'Non assigné'}</b></div></div>{ticket.status === 'Résolu' ? <Notice title="Intervention clôturée." text={ticket.note || 'Aucun compte rendu ajouté.'} /> : <><label className="field">Compte rendu technicien<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Diagnostic et action réalisée…" /></label><button className="primary-action" onClick={() => update(ticket.status === 'Ouvert' ? 'En cours' : 'Résolu', note)}>{ticket.status === 'Ouvert' ? 'Prendre en charge' : "Clôturer l'intervention"} <span>→</span></button></>}</section> }
function Ticket({ ticket }) { return <article className="ticket"><div><b>{getAsset(ticket.assetId)[1]}</b><small>{ticket.id} · {ticket.assetId}</small></div><Status status={ticket.status} /><p>{ticket.issue}</p><small>{ticket.createdAt}{ticket.assignee ? ` · ${ticket.assignee}` : ''}</small></article> }
function Status({ status }) { return <span className={`status ${status === 'Ouvert' ? 'danger' : status === 'Résolu' ? 'success' : 'warning'}`}>{status}</span> }
function Notice({ title, text }) { return <div className="notice"><b>{title}</b><span>{text}</span></div> }
function Welcome({ label, name, text }) { return <section className="welcome"><p className="eyebrow">{label}</p><h1>Bonjour, {name.split(' ')[0]}.</h1><p className="subtle">{text}</p></section> }
function Brand() { return <div className="brand"><i>S</i><b>setcar<span>.tech</span></b></div> }
function Header({ user, logout }) { return <header><Brand /><div><small>{user.role === 'employee' ? 'Employé' : 'Technicien'}</small><button className="avatar" onClick={logout} title="Se déconnecter">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</button></div></header> }
