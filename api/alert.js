// Alert endpoint — forwards error notifications to configured webhook (Slack, Discord, etc.)
// Set ALERT_WEBHOOK_URL in environment to enable (e.g. Slack Incoming Webhook URL)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    // No webhook configured — log to console and return OK (don't break the client)
    console.warn('[alert] No ALERT_WEBHOOK_URL configured. Error:', req.body?.text?.slice(0, 200));
    return res.status(200).json({ ok: true, delivered: false, reason: 'no_webhook' });
  }

  try {
    const { text } = req.body || {};
    if (!text) return res.status(200).json({ ok: true, delivered: false, reason: 'empty' });

    // Detect webhook type and format payload accordingly
    let payload;
    if (webhookUrl.includes('discord')) {
      payload = { content: text.replace(/\*/g, '**') };
    } else {
      // Default: Slack-compatible format (also works with many other webhook services)
      payload = { text };
    }

    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      console.error('[alert] Webhook delivery failed:', r.status, await r.text().catch(() => ''));
      return res.status(200).json({ ok: true, delivered: false, reason: 'webhook_error' });
    }

    return res.status(200).json({ ok: true, delivered: true });
  } catch (e) {
    console.error('[alert] Error:', e.message);
    // Never return an error to the client — alerting should never break the app
    return res.status(200).json({ ok: true, delivered: false, reason: 'exception' });
  }
}
