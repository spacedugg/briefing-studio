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

  const { action, productName, brand, asin, marketplace, seconds } = req.body;
  if (!action) return res.status(400).json({ error: 'Missing action' });

  try {
    const token = await getGoogleToken(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
    const sheetName = await getFirstSheetName(GOOGLE_SHEETS_ID, token);

    // Read all rows once (used by both actions)
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A:J`;
    const readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!readRes.ok) {
      const err = await readRes.json().catch(() => ({}));
      return res.status(500).json({ error: `Failed to read sheet: ${err.error?.message || readRes.status}` });
    }
    const readData = await readRes.json();
    const rows = readData.values || [];

    // Find existing row by ASIN (column D, index 3) — deduplicate by ASIN
    const findByAsin = (targetAsin) => {
      if (!targetAsin) return -1;
      for (let i = 1; i < rows.length; i++) {
        if ((rows[i][3] || '').trim().toUpperCase() === targetAsin.trim().toUpperCase()) return i;
      }
      return -1;
    };

    // ── GET: retrieve stored seconds for an ASIN (used on page load to restore timer) ──
    if (action === 'get') {
      if (!asin) return res.status(400).json({ error: 'Missing asin' });
      const rowIndex = findByAsin(asin);
      if (rowIndex > 0) {
        const row = rows[rowIndex];
        // Column G (index 6) = hours as decimal
        const storedHours = parseFloat(row[6] || '0');
        const storedSeconds = Math.round(storedHours * 3600);
        return res.status(200).json({ success: true, seconds: storedSeconds });
      }
      return res.status(200).json({ success: true, seconds: 0 });
    }

    // ── UPDATE: upsert time for an ASIN (only increases, never decreases) ──
    if (action === 'update') {
      if (!asin || seconds === undefined) return res.status(400).json({ error: 'Missing asin or seconds' });

      const rowIndex = findByAsin(asin);

      // If row exists, enforce time can only increase
      let effectiveSeconds = seconds;
      if (rowIndex > 0) {
        const storedHours = parseFloat(rows[rowIndex][6] || '0');
        const storedSeconds = Math.round(storedHours * 3600);
        effectiveSeconds = Math.max(seconds, storedSeconds);
      }

      const hours = (effectiveSeconds / 3600).toFixed(2);
      const costUsd = (parseFloat(hours) * 14).toFixed(2);

      // Fetch current EUR/USD rate
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
      const timeFormatted = formatTime(effectiveSeconds);

      // Use ASIN as the project ID for stable identification
      const projectId = asin.trim().toUpperCase();
      const rowData = [projectId, productName || '', brand || '', asin || '', marketplace || '', timeFormatted, hours, costUsd, costEur, timestamp];

      if (rowIndex > 0) {
        // Update existing row (same ASIN)
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A${rowIndex + 1}:J${rowIndex + 1}?valueInputOption=RAW`;
        const updateRes = await fetch(updateUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [rowData] }),
        });
        if (!updateRes.ok) {
          const err = await updateRes.json().catch(() => ({}));
          return res.status(500).json({ error: `Failed to update row: ${err.error?.message || updateRes.status}` });
        }
      } else {
        // Ensure header row exists
        if (rows.length === 0) {
          const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A1:J1?valueInputOption=RAW`;
          const headerRes = await fetch(headerUrl, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [['Project ID', 'Product', 'Brand', 'ASIN', 'Marketplace', 'Time', 'Hours', 'Cost (USD)', 'Cost (EUR)', 'Last Updated']] }),
          });
          if (!headerRes.ok) {
            const err = await headerRes.json().catch(() => ({}));
            return res.status(500).json({ error: `Failed to create header: ${err.error?.message || headerRes.status}` });
          }
        }
        // Append new row
        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A:J:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
        const appendRes = await fetch(appendUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [rowData] }),
        });
        if (!appendRes.ok) {
          const err = await appendRes.json().catch(() => ({}));
          return res.status(500).json({ error: `Failed to append row: ${err.error?.message || appendRes.status}` });
        }
      }

      return res.status(200).json({ success: true, hours, costUsd, costEur, eurRate, seconds: effectiveSeconds });
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

// Get the name of the first sheet tab (auto-detects language: Sheet1, Tabellenblatt1, etc.)
async function getFirstSheetName(spreadsheetId, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to read spreadsheet metadata');
  const data = await res.json();
  return data.sheets?.[0]?.properties?.title || 'Sheet1';
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
