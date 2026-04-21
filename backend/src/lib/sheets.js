// Google Sheets API client using a service account.
// The service account email must be granted VIEWER access on both sheets.
import { google } from 'googleapis';
import 'dotenv/config';

function getAuth() {
  // Method 1: Full service account JSON (base64-encoded) - most reliable
  const b64Json = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (b64Json) {
    try {
      const creds = JSON.parse(Buffer.from(b64Json, 'base64').toString('utf8'));
      console.log('[sheets] Using base64 JSON credentials for', creds.client_email);
      return new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    } catch (e) {
      console.error('[sheets] Failed to parse base64 JSON:', e.message);
    }
  }

  // Method 2: Separate email + key env vars (legacy fallback)
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';

  let key = rawKey;
  try {
    let k = rawKey.replace(/\\n/g, '\n');
    const b64 = k
      .replace(/-----BEGIN [A-Z ]+-----/g, '')
      .replace(/-----END [A-Z ]+-----/g, '')
      .replace(/[^A-Za-z0-9+\/=]/g, '');
    if (b64) {
      const lines = b64.match(/.{1,64}/g) || [];
      key = ['-----BEGIN PRIVATE KEY-----', ...lines, '-----END PRIVATE KEY-----'].join('\n');
    }
  } catch (e) {
    console.error('[sheets] PEM clean failed:', e.message);
  }

  if (!email || !key) throw new Error('Google service account env vars not set');

  console.log('[sheets] Using JWT with email:', email);
  return new google.auth.JWT({
    email, key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

export async function readSheet(spreadsheetId, range) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return data.values || [];
}

export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? null; });
    return o;
  });
}
