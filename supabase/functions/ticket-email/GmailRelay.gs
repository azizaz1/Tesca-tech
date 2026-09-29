/**
 * Gmail relay for Setcar ticket notifications.
 * Deploy this as a Google Apps Script web app running as your account.
 * Store RELAY_SECRET in Project Settings > Script Properties.
 */
const TESCA_LOGO_BASE64 = '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';
function doPost(e) {
  try {
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET');
    const payload = JSON.parse(e.postData.contents || '{}');

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    const recipients = [...new Set((payload.to || [])
      .filter((email) => typeof email === 'string')
      .map((email) => email.trim())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];

    if (!recipients.length || !payload.subject || !payload.text) {
      return jsonResponse({ ok: false, error: 'Invalid email payload' });
    }

    const logo = Utilities.newBlob(Utilities.base64Decode(TESCA_LOGO_BASE64), 'image/jpeg', 'tesca-logo.jpg');
    const htmlBody = `${String(payload.html || '')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#10234a;border-top:4px solid #20a6a2">
        <tr><td align="center" style="padding:22px 20px 18px">
          <img src="cid:tescaLogo" width="64" height="64" alt="Tesca Group" style="display:block;width:64px;height:64px;border:0;border-radius:8px">
          <div style="margin-top:10px;color:#ffffff;font:700 12px Arial,Helvetica,sans-serif;letter-spacing:1.4px">TESCA GROUP</div>
          <div style="margin-top:5px;color:#b6c5d9;font:12px Arial,Helvetica,sans-serif">Notification automatique | Tesca Tech</div>
        </td></tr>
      </table>`;

    GmailApp.sendEmail(recipients.join(','), String(payload.subject), String(payload.text), {
      htmlBody,
      inlineImages: { tescaLogo: logo },
      name: 'Tesca Tech',
    });

    return jsonResponse({ ok: true, sent: recipients.length });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: 'Unable to send email' });
  }
}

function jsonResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
