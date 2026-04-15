// Google Sheets API client using a service account.
// The service account email must be granted VIEWER access on both sheets.
import { google } from 'googleapis';
import 'dotenv/config';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  // Railway variables often have \n escaped.
  key = key.replace(/\\n/g, '\n');
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
