import { createClient } from 'npm:@supabase/supabase-js@2'
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret' }
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

type TicketRow = { id: string; reference: string; reporter_id: string; status: string }
type WebhookEvent = { type: 'INSERT' | 'UPDATE'; record: TicketRow; old_record?: Partial<TicketRow> }

const statusMessage = (status: string, reference: string) => {
  if (status === 'in_progress') return { title: 'Incident pris en charge', body: `Votre demande ${reference} est en cours de traitement.` }
  if (status === 'resolved') return { title: 'Incident résolu', body: `Votre demande ${reference} a été marquée comme résolue.` }
  if (status === 'waiting_parts') return { title: 'Incident en attente', body: `Votre demande ${reference} est en attente de pièces.` }
  if (status === 'reopened') return { title: 'Incident rouvert', body: `Votre demande ${reference} nécessite encore une intervention.` }
  return { title: 'Mise à jour de votre incident', body: `Le statut de votre demande ${reference} a changé.` }
}

async function fcmAccessToken(serviceAccount: { client_email: string; private_key: string }) {
  const key = await importPKCS8(serviceAccount.private_key.replace(/\\n/g, '\n'), 'RS256')
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error_description || 'Could not authorize with Firebase.')
  return result.access_token as string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('PUSH_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  try {
    const event = await request.json() as WebhookEvent
    const ticket = event.record
    let recipientIds: string[] = []
    let notification: { title: string; body: string }

    if (event.type === 'INSERT') {
      const { data: technicians, error } = await supabase.from('profiles').select('id').in('role', ['technician', 'admin'])
      if (error) throw error
      recipientIds = (technicians || []).map((profile) => profile.id)
      notification = { title: 'Nouvel incident signalé', body: `Nouvelle demande ${ticket.reference} à traiter.` }
    } else if (event.type === 'UPDATE' && event.old_record?.status !== ticket.status) {
      recipientIds = [ticket.reporter_id]
      notification = statusMessage(ticket.status, ticket.reference)
    } else {
      return Response.json({ skipped: true }, { headers: corsHeaders })
    }

    if (!recipientIds.length) return Response.json({ sent: 0 }, { headers: corsHeaders })
    const { data: registrations, error } = await supabase.from('push_tokens').select('user_id, token').in('user_id', recipientIds)
    if (error) throw error
    if (!registrations?.length) return Response.json({ sent: 0 }, { headers: corsHeaders })

    const serviceAccount = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')!)
    const accessToken = await fcmAccessToken(serviceAccount)
    const results = await Promise.all(registrations.map(async ({ token }) => {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: {
          token,
          notification,
          android: { priority: 'HIGH', notification: { channel_id: 'incident-updates' } },
          data: { ticketId: ticket.id, reference: ticket.reference },
        } }),
      })
      if (!response.ok) console.error('FCM send failed:', response.status, await response.text())
      return response.ok
    }))
    return Response.json({ sent: results.filter(Boolean).length, failed: results.length - results.filter(Boolean).length }, { headers: corsHeaders })
  } catch (error) {
    console.error('ticket-push failed:', error)
    return Response.json({ error: error instanceof Error ? error.message : 'Notification request failed' }, { status: 500, headers: corsHeaders })
  }
})
