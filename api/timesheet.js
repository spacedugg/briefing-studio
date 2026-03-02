// Google Sheets time tracking API
// Stores designer time data in a shared Google Sheet
// Required env vars: GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (!GOOGLE_SHEETS_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Google Sheets credentials not configured. Set GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY in env.' });
  }

  const { action, projectId, productName, brand, asin, marketplace, seconds } = req.body;
  if (!action) return res.status(400).json({ error: 'Missing action' });

  try {
    const token = await getGoogleToken(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);

    if (action === 'update') {
      // Upsert row: find by projectId or append new
      if (!projectId || seconds === undefined) return res.status(400).json({ error: 'Missing projectId or seconds' });

      const hours = (seconds / 3600).toFixed(2);
      const costUsd = (parseFloat(hours) * 14).toFixed(2);

      // Fetch current EUR/USD rate (2-week average approximation via latest rate)
      let eurRate = 0.92; // fallback
      try {
        const fxRes = await fetch('https://api.exchangerate-host.com/latest?base=USD&symbols=EUR');
        if (fxRes.ok) {
          const fxData = await fxRes.json();
          eurRate = fxData.rates?.EUR || 0.92;
        }
      } catch { /* use fallback */ }
      const costEur = (parseFloat(costUsd) * eurRate).toFixed(2);

      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const timeFormatted = formatTime(seconds);

      // Read existing rows to find projectId
      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/Sheet1!A:H`;
      const readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${token}` } });
      const readData = await readRes.json();
      const rows = readData.values || [];

      // Find existing row by projectId (column A)
      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === projectId) { rowIndex = i; break; }
      }

      const rowData = [projectId, productName || '', brand || '', asin || '', marketplace || '', timeFormatted, hours, costUsd, costEur, timestamp];

      if (rowIndex > 0) {
        // Update existing row
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/Sheet1!A${rowIndex + 1}:J${rowIndex + 1}?valueInputOption=RAW`;
        await fetch(updateUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [rowData] }),
        });
      } else {
        // Ensure header row exists
        if (rows.length === 0) {
          const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/Sheet1!A1:J1?valueInputOption=RAW`;
          await fetch(headerUrl, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [['Project ID', 'Product', 'Brand', 'ASIN', 'Marketplace', 'Time', 'Hours', 'Cost (USD)', 'Cost (EUR)', 'Last Updated']] }),
          });
        }
        // Append new row
        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/Sheet1!A:J:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
        await fetch(appendUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [rowData] }),
        });
      }

      return res.status(200).json({ success: true, hours, costUsd, costEur, eurRate });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function formatTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
    : `${m}:${ss.toString().padStart(2, '0')}`;
}

// Generate Google API OAuth2 token from service account credentials
async function getGoogleToken(email, privateKeyEnv) {
  const privateKey = privateKeyEnv.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsignedToken = enc(header) + '.' + enc(payload);

  // Import private key and sign
  const keyData = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsignedToken)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = unsignedToken + '.' + sig;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get Google token: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}
