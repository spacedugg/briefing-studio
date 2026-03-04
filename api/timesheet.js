// Google Sheets time tracking API
// Stores designer time data in a shared Google Sheet
// Required env vars: GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
//
// Column layout (A-M):
// A: Project ID | B: Product | C: Brand | D: ASIN | E: Amazon Link | F: Marketplace
// G: Briefing Link | H: Output Folder | I: Time | J: Hours | K: Cost (USD)
// L: Cost (EUR) | M: Last Updated

const HEADERS = ['Project ID', 'Product', 'Brand', 'ASIN', 'Amazon Link', 'Marketplace', 'Briefing Link', 'Output Folder', 'Time', 'Hours', 'Cost (USD)', 'Cost (EUR)', 'Last Updated'];
const COL_COUNT = HEADERS.length; // 13 = A-M
const COL = { asin: 3, amazonLink: 4, marketplace: 5, briefingUrl: 6, outputUrl: 7, hours: 9 };

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

  const { action, productName, brand, asin, marketplace, seconds, briefingUrl, outputUrl } = req.body;
  if (!action) return res.status(400).json({ error: 'Missing action' });

  try {
    const token = await getGoogleToken(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
    const sheetName = await getFirstSheetName(GOOGLE_SHEETS_ID, token);

    // Read all rows once (used by both actions)
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A:M`;
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
        if ((rows[i][COL.asin] || '').trim().toUpperCase() === targetAsin.trim().toUpperCase()) return i;
      }
      return -1;
    };

    // ── GET: retrieve stored seconds for an ASIN (used on page load to restore timer) ──
    if (action === 'get') {
      if (!asin) return res.status(400).json({ error: 'Missing asin' });
      const rowIndex = findByAsin(asin);
      if (rowIndex > 0) {
        const row = rows[rowIndex];
        const storedHours = parseFloat(row[COL.hours] || '0');
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
        const storedHours = parseFloat(rows[rowIndex][COL.hours] || '0');
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
      // Build Amazon product link from marketplace + ASIN
      const mpDomain = (marketplace || 'Amazon.de').replace(/^Amazon\.?/i, '').toLowerCase() || 'de';
      const amazonLink = asin ? `https://www.amazon.${mpDomain === 'com' ? 'com' : mpDomain || 'de'}/dp/${asin.trim().toUpperCase()}` : '';
      // Preserve existing link columns when updating (don't overwrite with empty)
      const existingBriefingUrl = rowIndex > 0 ? (rows[rowIndex][COL.briefingUrl] || '') : '';
      const existingOutputUrl = rowIndex > 0 ? (rows[rowIndex][COL.outputUrl] || '') : '';
      const existingAmazonLink = rowIndex > 0 ? (rows[rowIndex][COL.amazonLink] || '') : '';

      // Row order: Project ID, Product, Brand, ASIN, Amazon Link, Marketplace, Briefing Link, Output Folder, Time, Hours, Cost USD, Cost EUR, Last Updated
      const rowData = [projectId, productName || '', brand || '', asin || '', amazonLink || existingAmazonLink, marketplace || '', briefingUrl || existingBriefingUrl, outputUrl || existingOutputUrl, timeFormatted, hours, costUsd, costEur, timestamp];

      // Ensure header row exists and matches current layout (auto-fix old sheets missing columns)
      const needsHeaderUpdate = rows.length === 0 || rows[0].length !== HEADERS.length || HEADERS.some((h, i) => rows[0][i] !== h);
      if (needsHeaderUpdate) {
        const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A1:M1?valueInputOption=RAW`;
        const headerRes = await fetch(headerUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [HEADERS] }),
        });
        if (!headerRes.ok) {
          const err = await headerRes.json().catch(() => ({}));
          return res.status(500).json({ error: `Failed to update header: ${err.error?.message || headerRes.status}` });
        }
      }

      if (rowIndex > 0) {
        // Update existing row (same ASIN)
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A${rowIndex + 1}:M${rowIndex + 1}?valueInputOption=RAW`;
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
        // Append new row
        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A:M:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
        const appendRes = await fetch(appendUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [rowData] }),
        });
        if (!appendRes.ok) {
          const err = await appendRes.json().catch(() => ({}));
          return res.status(500).json({ error: `Failed to append row: ${err.error?.message || appendRes.status}` });
        }

        // Post-append dedup: if another tab simultaneously created a row for the same ASIN,
        // merge them (keep the one with the highest hours, delete the other)
        try {
          const reReadRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (reReadRes.ok) {
            const reData = await reReadRes.json();
            const allRows = reData.values || [];
            const targetAsin = asin.trim().toUpperCase();
            const dupeIndices = [];
            for (let i = 1; i < allRows.length; i++) {
              if ((allRows[i][COL.asin] || '').trim().toUpperCase() === targetAsin) dupeIndices.push(i);
            }
            if (dupeIndices.length > 1) {
              // Find the row with the highest hours
              let bestIdx = dupeIndices[0], bestHours = 0;
              for (const di of dupeIndices) {
                const h = parseFloat(allRows[di][COL.hours] || '0');
                if (h > bestHours) { bestHours = h; bestIdx = di; }
              }
              // Update the best row with the merged (max) hours, delete the rest
              const mergedSeconds = Math.max(effectiveSeconds, Math.round(bestHours * 3600));
              const mHours = (mergedSeconds / 3600).toFixed(2);
              const mCostUsd = (parseFloat(mHours) * 14).toFixed(2);
              const mCostEur = (parseFloat(mCostUsd) * eurRate).toFixed(2);
              const mergedRow = [projectId, productName || '', brand || '', asin || '', amazonLink, marketplace || '', briefingUrl || '', outputUrl || '', formatTime(mergedSeconds), mHours, mCostUsd, mCostEur, timestamp];
              // Update the best row
              const mergeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A${bestIdx + 1}:M${bestIdx + 1}?valueInputOption=RAW`;
              await fetch(mergeUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [mergedRow] }) });
              // Clear duplicate rows (set to empty)
              const emptyRow = new Array(COL_COUNT).fill('');
              for (const di of dupeIndices) {
                if (di === bestIdx) continue;
                const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/${encodeURIComponent(sheetName)}!A${di + 1}:M${di + 1}?valueInputOption=RAW`;
                await fetch(clearUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [emptyRow] }) });
              }
            }
          }
        } catch { /* dedup is best-effort, don't fail the request */ }
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
