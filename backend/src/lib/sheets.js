// Google Sheets API client using a service account JWT.
import { google } from 'googleapis';

let sheetsClient = null;

function getClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

export async function readSheet(spreadsheetId, range) {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

// Convert rows (first row = headers) into array of objects.
export function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
}
