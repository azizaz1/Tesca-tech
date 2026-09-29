type TicketRecord = {
  id: string
  reference: string
  reporter_id: string
  asset_id: string
  issue: string
  priority: string
  created_at: string
}

type DatabaseWebhook = {
  type: string
  table: string
  schema: string
  record: TicketRecord | null
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => htmlEntities[character] || character)

const secretsMatch = (provided: string | null, expected: string) => {
  if (!provided) return false
  const left = new TextEncoder().encode(provided)
  const right = new TextEncoder().encode(expected)
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

const supabaseRequest = async (path: string, serviceKey: string, method = 'GET') => {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${await response.text()}`)
  return response.json()
}

const findTechnicianEmails = async (serviceKey: string) => {
  const technicianProfiles = await supabaseRequest(
    '/rest/v1/profiles?select=id&role=in.(technician,admin)',
    serviceKey,
  ) as Array<{ id: string }>
  const technicianIds = new Set(technicianProfiles.map((profile) => profile.id))
  if (technicianIds.size === 0) return []

  const users: Array<{ id: string; email?: string }> = []
  const pageSize = 1000
  for (let page = 1; ; page += 1) {
    const result = await supabaseRequest(`/auth/v1/admin/users?page=${page}&per_page=${pageSize}`, serviceKey)
    const pageUsers = (result.users || []) as Array<{ id: string; email?: string }>
    users.push(...pageUsers)
    if (pageUsers.length < pageSize) break
  }

  return [...new Set(users
    .filter((user) => technicianIds.has(user.id) && user.email)
    .map((user) => user.email!.trim())
    .filter(Boolean))]
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const webhookSecret = Deno.env.get('TICKET_EMAIL_WEBHOOK_SECRET')
  const gmailRelayUrl = Deno.env.get('GMAIL_RELAY_URL')
  const gmailRelaySecret = Deno.env.get('GMAIL_RELAY_SECRET')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!webhookSecret || !gmailRelayUrl || !gmailRelaySecret || !serviceKey || !supabaseUrl) {
    console.error('Ticket email function is missing one or more required secrets.')
    return json({ error: 'Email notifications are not configured.' }, 500)
  }
  if (!secretsMatch(request.headers.get('x-webhook-secret'), webhookSecret)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let payload: DatabaseWebhook
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400)
  }
  if (payload.type !== 'INSERT' || payload.schema !== 'public' || payload.table !== 'tickets' || !payload.record) {
    return json({ ok: true, skipped: true })
  }

  const ticket = payload.record
  try {
    const [technicianEmails, reporters, assets] = await Promise.all([
      findTechnicianEmails(serviceKey),
      supabaseRequest(`/rest/v1/profiles?select=full_name&id=eq.${encodeURIComponent(ticket.reporter_id)}&limit=1`, serviceKey),
      supabaseRequest(`/rest/v1/assets?select=name&id=eq.${encodeURIComponent(ticket.asset_id)}&limit=1`, serviceKey),
    ]) as [string[], Array<{ full_name: string }>, Array<{ name: string }>]

    if (technicianEmails.length === 0) {
      console.warn(`No technician email addresses found for ticket ${ticket.reference}.`)
      return json({ ok: true, sent: 0 })
    }

    const reporterName = reporters[0]?.full_name || 'Employ\u00e9'
    const assetName = assets[0]?.name || ticket.asset_id
    const isHighPriority = ticket.priority === 'high'
    const priority = isHighPriority ? 'Haute' : 'Normale'
    const issue = ticket.issue || 'Aucune description fournie.'
    const text = [
      `Nouvel incident ${ticket.reference}`,
      '',
      `\u00c9quipement : ${assetName} (${ticket.asset_id})`,
      `Signal\u00e9 par : ${reporterName}`,
      `Priorit\u00e9 : ${priority}`,
      '',
      'Description :',
      issue,
      '',
      'Connectez-vous \u00e0 Tesca Tech pour consulter et prendre en charge cette demande.',
    ].join('\n')
    const priorityColor = isHighPriority ? '#b42318' : '#9a6700'
    const priorityBackground = isHighPriority ? '#fef3f2' : '#fff8e1'
    const html = `
      <div style="margin:0;padding:28px 12px;background:#f2f5fa;font-family:Arial,Helvetica,sans-serif;color:#172033">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e4e9f1;border-radius:14px;overflow:hidden">
          <tr><td style="padding:28px 32px;background:#10234a;border-bottom:4px solid #20a6a2">
            <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px;color:#a9c7e8">TESCA TECH | SUPPORT INFORMATIQUE</div>
            <div style="margin-top:13px;font-size:25px;line-height:32px;font-weight:700;color:#ffffff">Nouvel incident</div>
            <div style="margin-top:5px;font-size:15px;line-height:22px;color:#d9e5f3">R\u00e9f\u00e9rence <strong style="color:#ffffff">${escapeHtml(ticket.reference)}</strong></div>
          </td></tr>
          <tr><td style="padding:28px 32px 8px">
            <p style="margin:0 0 20px;font-size:15px;line-height:23px;color:#46536a">Une nouvelle demande d\u2019assistance vient d\u2019\u00eatre cr\u00e9\u00e9e et n\u00e9cessite votre attention.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0 10px">
              <tr>
                <td width="50%" style="padding:14px 16px;background:#f7f9fc;border:1px solid #e9edf4;border-radius:9px;vertical-align:top">
                  <div style="font-size:11px;font-weight:700;letter-spacing:.7px;color:#6b7890;text-transform:uppercase">\u00c9quipement</div>
                  <div style="margin-top:6px;font-size:15px;font-weight:700;color:#172033">${escapeHtml(assetName)}</div>
                  <div style="margin-top:3px;font-size:12px;color:#65728a">${escapeHtml(ticket.asset_id)}</div>
                </td>
                <td width="10"></td>
                <td width="50%" style="padding:14px 16px;background:#f7f9fc;border:1px solid #e9edf4;border-radius:9px;vertical-align:top">
                  <div style="font-size:11px;font-weight:700;letter-spacing:.7px;color:#6b7890;text-transform:uppercase">Priorit\u00e9</div>
                  <div style="margin-top:8px"><span style="display:inline-block;padding:5px 10px;border-radius:20px;background:${priorityBackground};color:${priorityColor};font-size:13px;font-weight:700">${priority.toUpperCase()}</span></div>
                </td>
              </tr>
              <tr>
                <td colspan="3" style="padding:14px 16px;background:#f7f9fc;border:1px solid #e9edf4;border-radius:9px">
                  <div style="font-size:11px;font-weight:700;letter-spacing:.7px;color:#6b7890;text-transform:uppercase">Signal\u00e9 par</div>
                  <div style="margin-top:6px;font-size:15px;font-weight:700;color:#172033">${escapeHtml(reporterName)}</div>
                </td>
              </tr>
            </table>
            <div style="margin:12px 0 20px;padding:17px 18px;background:#f2f8fb;border-left:4px solid #20a6a2;border-radius:5px">
              <div style="margin-bottom:8px;font-size:11px;font-weight:700;letter-spacing:.7px;color:#52657d;text-transform:uppercase">Description de l\u2019incident</div>
              <div style="font-size:14px;line-height:22px;color:#172033;white-space:pre-wrap">${escapeHtml(issue)}</div>
            </div>
            <p style="margin:0 0 22px;font-size:13px;line-height:20px;color:#526078">Connectez-vous \u00e0 <strong>Tesca Tech</strong> pour consulter et prendre en charge cette demande.</p>
          </td></tr>
        </table>
      </div>`
    const response = await fetch(gmailRelayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: gmailRelaySecret,
        to: technicianEmails,
        subject: `Nouvel incident ${ticket.reference} - ${assetName}`,
        text,
        html,
      }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.ok !== true) {
      console.error('Gmail relay rejected the ticket notification:', response.status, result)
      return json({ error: 'Email provider rejected the notification.' }, 502)
    }

    return json({ ok: true, sent: technicianEmails.length })
  } catch (error) {
    console.error('Could not email technicians about a new incident:', error)
    return json({ error: 'Could not send technician notification.' }, 500)
  }
})
