// =====================================================
// RFID Factory — Database Layer (Google Sheets)
// =====================================================
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_CREDENTIALS = process.env.GOOGLE_CREDENTIALS; // JSON string of service account key

if (!SPREADSHEET_ID || !GOOGLE_CREDENTIALS) {
  console.error('❌ SPREADSHEET_ID or GOOGLE_CREDENTIALS env variable is not set!');
  process.exit(1);
}

let _sheets = null;

async function getSheets() {
  if (_sheets) return _sheets;
  const credentials = JSON.parse(GOOGLE_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  console.log('✅ Connected to Google Sheets');
  await ensureSheets();
  return _sheets;
}

// Sheet names for each collection
const SHEETS = {
  users: 'users',
  products: 'products',
  transactions: 'transactions',
  logs: 'logs',
  snapshots: 'snapshots',
};

// Ensure all sheets exist with headers
async function ensureSheets() {
  const sheets = _sheets;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = meta.data.sheets.map(s => s.properties.title);

  const headers = {
    users:        ['id','name','username','password','role','dept','active'],
    products:     ['id','sku','name','rfid','category','unit','location','quantity','minStock','updatedAt'],
    transactions: ['id','type','rfid','product','sku','qty','user','time','reason'],
    logs:         ['time','user','role','action','detail'],
    snapshots:    ['date','data'],
  };

  const requests = [];
  for (const [name] of Object.entries(SHEETS)) {
    if (!existing.includes(name)) {
      requests.push({ addSheet: { properties: { title: name } } });
    }
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  }

  // Write headers row if sheet is empty
  for (const [name, cols] of Object.entries(headers)) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${name}!A1:Z1`,
    });
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${name}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [cols] },
      });
    }
  }

  // Seed default users if empty
  await seedDefaultUsers(sheets);
}

async function seedDefaultUsers(sheets) {
  const rows = await readAll('users', sheets);
  if (rows.length === 0) {
    const defaults = [
      [1, 'ผู้ดูแลระบบ',     'admin',     '1234', 'admin',     'it',         true],
      [2, 'เจ้าหน้าที่คลัง', 'warehouse', '1234', 'warehouse', 'warehouse',  true],
      [3, 'ผู้เบิกสินค้า',   'staff',     '1234', 'staff',     'production', true],
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'users!A2',
      valueInputOption: 'RAW',
      requestBody: { values: defaults },
    });
    console.log('✅ Seeded default users');
  }
}

// Read all rows as array of objects
async function readAll(sheetName, sheetsClient) {
  const s = sheetsClient || await getSheets();
  const res = await s.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1:Z`,
  });
  const [headerRow, ...dataRows] = res.data.values || [[]];
  if (!headerRow || dataRows.length === 0) return [];
  return dataRows.map(row =>
    Object.fromEntries(headerRow.map((key, i) => [key, parseVal(row[i])]))
  );
}

function parseVal(v) {
  if (v === undefined || v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return isNaN(n) || v === '' ? v : n;
}

// Append a new row
async function appendRow(sheetName, headers, obj) {
  const s = await getSheets();
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  await s.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

// Overwrite all data rows
async function writeAll(sheetName, headers, data) {
  const s = await getSheets();
  const rows = data.map(obj => headers.map(h => (obj[h] !== undefined ? obj[h] : '')));
  // Clear old data rows (keep header)
  await s.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:Z`,
  });
  if (rows.length > 0) {
    await s.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
  }
}

async function nextId(sheetName) {
  const data = await readAll(sheetName);
  if (data.length === 0) return 1;
  return Math.max(...data.map(d => Number(d.id) || 0)) + 1;
}

const USER_HEADERS = ['id','name','username','password','role','dept','active'];
const PRODUCT_HEADERS = ['id','sku','name','rfid','category','unit','location','quantity','minStock','updatedAt'];
const TX_HEADERS = ['id','type','rfid','product','sku','qty','user','time','reason'];
const LOG_HEADERS = ['time','user','role','action','detail'];
const SNAP_HEADERS = ['date','data'];

const dao = {
  // --- Users ---
  async getAllUsers() {
    const data = await readAll('users');
    return data.sort((a, b) => a.id - b.id);
  },
  async getUserByCredentials(username, password) {
    const users = await readAll('users');
    return users.find(u =>
      u.username?.toLowerCase() === username?.toLowerCase() &&
      String(u.password) === String(password) &&
      u.active !== false
    ) || null;
  },
  async insertUser(data) {
    const user = { id: await nextId('users'), ...data };
    await appendRow('users', USER_HEADERS, user);
    return user;
  },
  async updateUser(id, data) {
    const users = await readAll('users');
    const idx = users.findIndex(u => u.id == id);
    if (idx < 0) return null;
    users[idx] = { ...users[idx], ...data, id: Number(id) };
    await writeAll('users', USER_HEADERS, users);
    return users[idx];
  },
  async toggleUserActive(id) {
    const users = await readAll('users');
    const idx = users.findIndex(u => u.id == id);
    if (idx < 0) return null;
    users[idx].active = !users[idx].active;
    await writeAll('users', USER_HEADERS, users);
    return users[idx];
  },

  // --- Products ---
  async getAllProducts() {
    return (await readAll('products')).sort((a, b) => a.id - b.id);
  },
  async getProductById(id) {
    const products = await readAll('products');
    return products.find(p => p.id == id) || null;
  },
  async insertProduct(data) {
    const product = { id: await nextId('products'), ...data };
    await appendRow('products', PRODUCT_HEADERS, product);
    return product;
  },
  async updateProduct(id, data) {
    const products = await readAll('products');
    const idx = products.findIndex(p => p.id == id);
    if (idx < 0) return null;
    products[idx] = { ...products[idx], ...data, id: Number(id) };
    await writeAll('products', PRODUCT_HEADERS, products);
    return products[idx];
  },
  async updateProductQty(id, quantity, updatedAt) {
    return this.updateProduct(id, { quantity, updatedAt });
  },
  async deleteProduct(id) {
    const products = await readAll('products');
    await writeAll('products', PRODUCT_HEADERS, products.filter(p => p.id != id));
    return true;
  },

  // --- Transactions ---
  async getAllTransactions() {
    return (await readAll('transactions')).sort((a, b) => b.id - a.id);
  },
  async insertTransaction(data) {
    const t = { id: await nextId('transactions'), ...data };
    await appendRow('transactions', TX_HEADERS, t);
    return t;
  },

  // --- Logs ---
  async getAllLogs() {
    const logs = await readAll('logs');
    return logs.reverse().slice(0, 200);
  },
  async insertLog(data) {
    await appendRow('logs', LOG_HEADERS, data);
    return data;
  },

  // --- Snapshots ---
  async getAllSnapshots() {
    return (await readAll('snapshots')).sort((a, b) => new Date(b.date) - new Date(a.date));
  },
  async upsertSnapshot(date, data) {
    const snaps = await readAll('snapshots');
    const idx = snaps.findIndex(s => s.date === date);
    const entry = { date, data: JSON.stringify(data) };
    if (idx >= 0) snaps[idx] = entry; else snaps.push(entry);
    await writeAll('snapshots', SNAP_HEADERS, snaps);
    return { date, data };
  },
};

module.exports = { dao, getDb: async () => ({}) };
