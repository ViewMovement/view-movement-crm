// Google Sheets API client using a service account.
// The service account email must be granted VIEWER access on both sheets.
import { google } from 'googleapis';
import 'dotenv/config';

/**
 * Reconstruct a clean PEM key from whatever format the env var holds.
 * Handles: literal \n, real newlines, missing newlines, extra whitespace.
 */
function cleanPemKey(raw) {
    if (!raw) return '';
    // 1. Replace literal \n with real newlines
  let k = raw.replace(/\\n/g, '\n');
    // 2. Strip PEM headers, footers, and all whitespace to get pure base64
  const b64 = k
      .replace(/-----BEGIN [A-Z ]+-----/g, '')
      .replace(/-----END [A-Z ]+-----/g, '')
      .replace(/\s+/g, '');
    if (!b64) return '';
    // 3. Rebuild proper PEM with 64-char lines
  const lines = b64.match(/.{1,64}/g) || [];
    return ['-----BEGIN PRIVATE KEY-----', ...lines, '-----END PRIVATE KEY-----'].join('\n');
}

function getAuth() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
    const key = cleanPemKey(rawKey);
    if (!email || !key) throw new Error('Google service account env vars not set');
    return new google.auth.JWT({
          email, key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
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
