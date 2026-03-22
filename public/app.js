// =====================================================
// RFID Factory — Conveyor Belt Inventory System
// Real USB RFID Reader + Live Scan Feed + Belt Animation
// =====================================================

const DB = {
  session: 'rfid_session', theme: 'rfid_theme'
};

// API helper — communicates with Express backend
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'API Error'); }
  return res.json();
}

const DEFAULT_USERS = [
  { id: 1, name: 'ผู้ดูแลระบบ', username: 'admin', password: '1234', role: 'admin', dept: 'it', active: true },
  { id: 2, name: 'เจ้าหน้าที่คลัง', username: 'warehouse', password: '1234', role: 'warehouse', dept: 'warehouse', active: true },
  { id: 3, name: 'ผู้เบิกสินค้า', username: 'staff', password: '1234', role: 'staff', dept: 'production', active: true },
];

const catMap = {
  'อิเล็กทรอนิกส์': { label: 'อิเล็กทรอนิกส์', icon: 'fa-microchip', color: 'cyan' },
  'เครื่องกล': { label: 'เครื่องกล', icon: 'fa-gears', color: 'purple' },
  'วัสดุสิ้นเปลือง': { label: 'วัสดุสิ้นเปลือง', icon: 'fa-boxes-stacked', color: 'amber' },
  'Safety': { label: 'Safety', icon: 'fa-hard-hat', color: 'green' }
};
// Legacy English key → Thai label mapping for old data
const legacyCatKeys = {
  electronics: 'อิเล็กทรอนิกส์',
  mechanical: 'เครื่องกล',
  material: 'วัสดุสิ้นเปลือง',
  safety: 'Safety'
};
function getCatInfo(cat) {
  if (catMap[cat]) return catMap[cat];
  if (legacyCatKeys[cat] && catMap[legacyCatKeys[cat]]) return catMap[legacyCatKeys[cat]];
  return { label: cat, icon: 'fa-tag', color: 'cyan' };
}
const roleLabel = { admin: 'ผู้ดูแลระบบ', warehouse: 'เจ้าหน้าที่คลัง', staff: 'ผู้เบิกสินค้า' };
const deptLabel = { warehouse: 'คลังสินค้า', production: 'ฝ่ายผลิต', logistics: 'โลจิสติกส์', it: 'ไอที', general: 'ทั่วไป' };

let products = [], transactions = [], users = [], userLog = [], currentUser = null;
let scanHistory = [], curProdFilter = 'all', curTxFilter = 'all', curHistoryFilter = 'all';
let stockSnapshots = [];
let nxt = { p: 1, t: 1, u: 10 };

// USB RFID reader state
let rfidBuffer = '', rfidTimeout = null;
let readerConnected = false, readerLastSeen = 0, readerCheckInterval = null;

// Live scan feed entries
let liveFeedEntries = [];

// Track which page is currently active
let currentPage = 'dashboard';

// Auto-refresh interval
let autoRefreshInterval = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  loadLanguage();
  loadTheme();
  await loadData();
  bindEvents();
  checkSession();
  initRfidReader();
  createParticles();
  applyStaticTranslations();
});

// ===== THEME =====
function loadTheme() {
  const saved = localStorage.getItem(DB.theme) || 'dark';
  setTheme(saved);
}
function toggleTheme() {
  // Cycle through themes: dark → light → cream → ocean → sakura → dark
  const themes = ['dark', 'light', 'cream', 'ocean', 'sakura'];
  const cur = document.documentElement.getAttribute('data-theme');
  const idx = themes.indexOf(cur);
  setTheme(themes[(idx + 1) % themes.length]);
}
function selectTheme(theme) {
  setTheme(theme);
  closeModal('themePickerModal');
  showToast('success', `${T('msg_theme_changed')} "${theme}"`);
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(DB.theme, theme);
  const icon = document.getElementById('themeIcon');
  if (icon) {
    const icons = { dark: 'fa-moon', light: 'fa-sun', cream: 'fa-mug-hot', ocean: 'fa-water', sakura: 'fa-fan' };
    icon.className = `fas ${icons[theme] || 'fa-palette'}`;
  }
  updateThemePickerUI(theme);
}
function updateThemePickerUI(theme) {
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.getAttribute('data-theme-value') === theme);
  });
}

// ===== PARTICLES =====
function createParticles() {
  const c = document.getElementById('particles');
  if (!c) return;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDelay = Math.random() * 8 + 's';
    p.style.animationDuration = (6 + Math.random() * 6) + 's';
    p.style.width = p.style.height = (2 + Math.random() * 4) + 'px';
    c.appendChild(p);
  }
}

// ===== DB =====
async function loadData() {
  try {
    const [p, tx, u, logs, snaps] = await Promise.all([
      api('GET', '/products'), api('GET', '/transactions'),
      api('GET', '/users'), api('GET', '/logs'), api('GET', '/snapshots'),
    ]);
    products = p; transactions = tx; users = u; userLog = logs;
    // Flatten snapshot format: API returns [{date, data:[...]}, ...] → flat array
    stockSnapshots = snaps.flatMap(s => (s.data || []).map(d => ({ ...d, date: s.date })));
  } catch (e) {
    console.warn('API not available, using empty data:', e.message);
    products = []; transactions = []; users = [...DEFAULT_USERS]; userLog = []; stockSnapshots = [];
  }
  migrateLegacyCategoryKeys();
  recalcNextIds();
}
// Migrate old English category keys to Thai labels
function migrateLegacyCategoryKeys() {
  products.forEach(p => {
    if (p.category && legacyCatKeys[p.category]) {
      p.category = legacyCatKeys[p.category];
    }
  });
}
function recalcNextIds() {
  nxt.p = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1;
  nxt.t = transactions.length ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
  nxt.u = users.length ? Math.max(...users.map(u => u.id)) + 1 : 10;
}
function addLog(action, detail) {
  const entry = { time: getNow(), user: currentUser?.name || 'ระบบ', role: currentUser?.role || '-', action, detail };
  userLog.unshift(entry);
  if (userLog.length > 200) userLog.length = 200;
  api('POST', '/logs', entry).catch(() => { }); // fire-and-forget
}

function bindEvents() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

// =========================================================
// CENTRAL SYNC — called after every data mutation
// Ensures all visible UI components reflect the latest data
// =========================================================
function syncAllViews() {
  // Always update these global indicators regardless of current page
  updateTxBadge();
  updateTodayStats();
  renderLiveFeed();
  updateCategoryDatalists();

  // Re-render the currently active page so its data is fresh
  refreshCurrentView();
}

// Keep datalist options in sync with custom categories from product data
function updateCategoryDatalists() {
  const customCats = [...new Set(products.map(p => p.category).filter(Boolean))];
  const defaultCats = Object.keys(catMap);
  const allCats = [...new Set([...defaultCats, ...customCats])];
  ['categoryList', 'categoryListWh'].forEach(dlId => {
    const dl = document.getElementById(dlId);
    if (!dl) return;
    dl.innerHTML = allCats.map(cat => `<option value="${cat}"></option>`).join('');
  });
}

function refreshCurrentView() {
  const renderers = {
    dashboard: renderDashboard, products: renderProducts,
    withdraw: renderWithdraw, receive: renderReceive, transactions: renderTransactions,
    userLog: renderUserLog, userManagement: renderUserMgmt, history: renderHistory, analytics: renderAnalytics,
  };
  if (renderers[currentPage]) renderers[currentPage]();
}

function updateTxBadge() {
  const badge = document.getElementById('txBadge');
  if (badge) badge.textContent = transactions.length || '';
}

// ===== AUTH =====
async function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('loginEmail').value.trim();
  const p = document.getElementById('loginPassword').value;
  try {
    const user = await api('POST', '/auth/login', { username: u, password: p });
    currentUser = user;
    localStorage.setItem(DB.session, JSON.stringify(user));
    addLog('เข้าสู่ระบบ', `${user.name} (${roleLabel[user.role]})`);
    enterApp();
  } catch (err) {
    showFormError('loginError', T('login_error'));
  }
}
function fillLogin(u, p) { document.getElementById('loginEmail').value = u; document.getElementById('loginPassword').value = p; }
function checkSession() {
  const s = JSON.parse(localStorage.getItem(DB.session) || 'null');
  if (s) { currentUser = s; enterApp(); }
}
function logout() {
  addLog('ออกจากระบบ', currentUser?.name || '');
  currentUser = null;
  localStorage.removeItem(DB.session);
  // Reset all live state
  liveFeedEntries = [];
  currentPage = 'dashboard';
  // Stop auto-refresh
  if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
  showPage('loginPage');
  document.getElementById('appLayout').classList.remove('active');
  // Reset login form
  document.getElementById('loginForm').reset();
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.classList.remove('show');
}
async function enterApp() {
  await loadData(); // Fetch fresh data from server
  showPage('appLayout');
  updateUserDisplay();
  applyRoles();
  navigateTo('dashboard');
  // Save stock snapshot on login (once per day)
  autoSaveStockSnapshot();
  // Start auto-refresh — keeps dashboard fresh every 30s
  startAutoRefresh();
}
function updateUserDisplay() {
  if (!currentUser) return;
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userRole').textContent = getRoleLabel(currentUser.role);
  document.getElementById('userAvatar').textContent = currentUser.name.charAt(0);
}
function applyRoles() {
  const r = currentUser?.role;
  document.getElementById('adminSection').style.display = r === 'admin' ? '' : 'none';
  const addBtn = document.getElementById('btnAddProduct');
  if (addBtn) addBtn.style.display = (r === 'admin' || r === 'warehouse') ? '' : 'none';
}

// ===== AUTO-REFRESH =====
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(async () => {
    await loadData(); // Fetch fresh data from server
    if (currentPage === 'dashboard') {
      renderDashboard();
    }
    updateTxBadge();
    updateTodayStats();
  }, 30000); // every 30 seconds
}

// ===== NAV =====
function showPage(id) {
  document.querySelectorAll('body > .page-view').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.page-content').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  const titles = {
    dashboard: ['page_dashboard', 'page_dashboard_bread'], products: ['page_products', 'page_products_bread'],
    withdraw: ['page_withdraw', 'page_withdraw_bread'],
    receive: ['page_receive', 'page_receive_bread'], transactions: ['page_transactions', 'page_transactions_bread'],
    history: ['page_history', 'page_history_bread'],
    analytics: ['page_analytics', 'page_analytics_bread'],
    userLog: ['page_userlog', 'page_userlog_bread'], userManagement: ['page_usermgmt', 'page_usermgmt_bread'],
  };
  const [tKey, bKey] = titles[page] || [page, page];
  document.getElementById('pageTitle').textContent = T(tKey);
  document.getElementById('pageBreadcrumb').textContent = T(bKey);
  const view = document.getElementById(page + 'View');
  if (view) view.classList.add('active');

  // Always refresh target page + update global indicators
  const renderers = {
    dashboard: renderDashboard, products: renderProducts,
    withdraw: renderWithdraw, receive: renderReceive, transactions: renderTransactions,
    userLog: renderUserLog, userManagement: renderUserMgmt, history: renderHistory, analytics: renderAnalytics,
  };
  if (renderers[page]) renderers[page]();
  updateTxBadge();
  updateTodayStats();
  refocusRfid();
  // Close mobile sidebar if open
  document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ==========================================
// USB RFID READER — REAL DEVICE DETECTION
// ==========================================
function initRfidReader() {
  document.addEventListener('keydown', handleRfidKey);
  document.addEventListener('click', refocusRfid);

  updateReaderStatus(false);
  readerCheckInterval = setInterval(() => {
    if (readerConnected && Date.now() - readerLastSeen > 60000) {
      updateReaderStatus(false);
    }
  }, 5000);
}

function refocusRfid() {
  const inp = document.getElementById('rfidHiddenInput');
  const active = document.activeElement;
  if (active && active.id !== 'rfidHiddenInput' && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) return;
  if (inp) inp.focus();
}

function handleRfidKey(e) {
  const active = document.activeElement;
  if (active && active.id !== 'rfidHiddenInput' && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) return;

  if (/^\d$/.test(e.key)) {
    rfidBuffer += e.key;
    e.preventDefault();
    showScanningIndicator();
    clearTimeout(rfidTimeout);
    rfidTimeout = setTimeout(() => { rfidBuffer = ''; hideScanningIndicator(); }, 500);
  } else if (e.key === 'Enter' && rfidBuffer.length >= 4) {
    e.preventDefault();
    const uid = rfidBuffer;
    rfidBuffer = '';
    clearTimeout(rfidTimeout);
    hideScanningIndicator();

    readerLastSeen = Date.now();
    if (!readerConnected) updateReaderStatus(true);

    processRfidScan(uid);
  }
}

function updateReaderStatus(connected) {
  readerConnected = connected;
  const dot = document.getElementById('conveyorStatusDot');
  const text = document.getElementById('conveyorStatusText');
  if (connected) {
    if (dot) { dot.classList.remove('offline'); }
    if (text) text.textContent = T('conveyor_online');
  } else {
    if (dot) { dot.classList.add('offline'); }
    if (text) text.textContent = T('conveyor_waiting');
  }
  const monitorStatus = document.getElementById('conveyorMonitorStatus');
  if (monitorStatus) {
    monitorStatus.innerHTML = connected
      ? `<div class="dot"></div><span>${T('dash_conveyor_running')}</span>`
      : `<div class="dot" style="background:var(--accent-red);animation:none;"></div><span style="color:var(--accent-red);">${T('dash_conveyor_waiting')}</span>`;
  }
}

function showScanningIndicator() {
  // Show visual feedback that digits are being received
  const indicators = ['withdrawScannerStatus', 'receiveScannerStatus'];
  indicators.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.closest('.page-view.active')) {
      el.textContent = `${T('msg_receiving_signal')} (${rfidBuffer})`;
    }
  });
}
function hideScanningIndicator() {
  updateReaderStatus(readerConnected);
}

function processRfidScan(uid) {
  showRfidPopup(uid);
  animateConveyor(uid);
  addToLiveFeed(uid);

  const activePage = document.querySelector('.page-content.active');
  if (!activePage) return;
  const pid = activePage.id;
  if (pid === 'withdrawView') handleWithdrawScan(uid);
  else if (pid === 'receiveView') handleReceiveScan(uid);
  else {
    const p = findByRfid(uid);
    showToast(p ? 'info' : 'warning', p ? `${T('msg_scan_found')}: ${p.name} (${p.sku}) — ${T('msg_scan_stock')} ${p.quantity} ${p.unit}` : `${T('msg_rfid_not_found')}: ${uid}`);
    addLog('สแกน RFID', `UID: ${uid} — ${p ? p.name : 'ไม่พบ'}`);
  }
}

function showRfidPopup(uid) {
  const popup = document.getElementById('rfidScanPopup');
  if (!popup) return;
  const p = findByRfid(uid);
  const uidEl = document.getElementById('rfidPopupUid');
  const prodEl = document.getElementById('rfidPopupProduct');
  if (uidEl) uidEl.textContent = uid;
  if (prodEl) prodEl.textContent = p ? `${p.name} (${p.sku})` : T('msg_rfid_not_found');
  popup.classList.add('show');
  setTimeout(() => popup.classList.remove('show'), 3000);
}
function findByRfid(rfid) { return products.find(p => p.rfid === rfid); }

// ===== CONVEYOR BELT ANIMATION =====
function animateConveyor(uid) {
  const area = document.getElementById('conveyorBeltArea');
  const gate = document.getElementById('rfidGate');
  if (!area || !gate) return;

  // Flash the RFID gate
  gate.classList.add('scanning');
  setTimeout(() => gate.classList.remove('scanning'), 1500);

  // Create a belt item
  const p = findByRfid(uid);
  const item = document.createElement('div');
  item.className = 'belt-item';
  item.innerHTML = `<i class="fas ${p ? (catMap[p.category]?.icon || 'fa-box') : 'fa-question'}"></i>`;
  item.title = p ? p.name : `RFID: ${uid}`;

  // Position inside belt track
  const track = area.querySelector('.belt-track');
  if (track) {
    track.appendChild(item);
    // Remove after animation
    item.addEventListener('animationend', () => item.remove());
  }

  // Update last scan time
  const lastScan = document.getElementById('lastScanTime');
  if (lastScan) lastScan.textContent = fmtTime(getNow());
}

// ===== LIVE SCAN FEED =====
function addToLiveFeed(uid) {
  const p = findByRfid(uid);
  const entry = {
    time: getNow(),
    type: 'scan',
    uid: uid,
    product: p ? p.name : T('msg_rfid_not_found'),
    qty: null
  };
  liveFeedEntries.unshift(entry);
  if (liveFeedEntries.length > 50) liveFeedEntries.length = 50;
  renderLiveFeed();
}

function addToLiveFeedTx(type, uid, productName, qty) {
  const entry = {
    time: getNow(),
    type: type,
    uid: uid,
    product: productName,
    qty: qty
  };
  liveFeedEntries.unshift(entry);
  if (liveFeedEntries.length > 50) liveFeedEntries.length = 50;
  renderLiveFeed();
}

function renderLiveFeed() {
  const feed = document.getElementById('liveScanFeed');
  if (!feed) return;
  if (!liveFeedEntries.length) {
    feed.innerHTML = `<div class="feed-empty"><i class="fas fa-satellite-dish"></i><p>${T('dash_live_wait')}<br><small>${T('dash_live_sub')}</small></p></div>`;
    return;
  }
  feed.innerHTML = liveFeedEntries.slice(0, 20).map((e, i) => {
    const typeLabel = e.type === 'out' ? 'OUT' : e.type === 'in' ? 'IN' : 'SCAN';
    const typeClass = e.type;
    const isNew = i === 0;
    return `<div class="feed-entry${isNew ? ' new' : ''}">
      <span class="feed-time">${fmtTime(e.time)}</span>
      <span class="feed-type ${typeClass}">${typeLabel}</span>
      <span class="feed-uid">${e.uid}</span>
      <span class="feed-product">${e.product}</span>
      ${e.qty ? `<span class="feed-qty">x${e.qty}</span>` : ''}
    </div>`;
  }).join('');
  feed.scrollTop = 0;
}

// ===== TODAY'S STATS =====
function updateTodayStats() {
  const today = getNow().slice(0, 10);
  const todayOut = transactions.filter(t => t.type === 'out' && t.time && t.time.startsWith(today)).reduce((s, t) => s + t.qty, 0);
  const todayIn = transactions.filter(t => t.type === 'in' && t.time && t.time.startsWith(today)).reduce((s, t) => s + t.qty, 0);
  const outEl = document.getElementById('todayOutCount');
  const inEl = document.getElementById('todayInCount');
  if (outEl) outEl.textContent = todayOut.toLocaleString();
  if (inEl) inEl.textContent = todayIn.toLocaleString();
}

// ===== DASHBOARD =====
function renderDashboard() {
  renderStats();
  renderRecentActivity();
  renderWithdrawChart();
  renderLowStock();
  renderTopWithdraw();
  renderLiveFeed();
  updateTodayStats();
  updateTxBadge();
}

function renderStats() {
  const total = products.reduce((s, p) => s + p.quantity, 0);
  const low = products.filter(p => p.quantity <= p.minStock).length;
  const outs = transactions.filter(t => t.type === 'out').reduce((s, t) => s + t.qty, 0);
  const ins = transactions.filter(t => t.type === 'in').reduce((s, t) => s + t.qty, 0);
  const g = document.getElementById('statsGrid');
  if (!g) return;
  g.innerHTML = `
    <div class="stat-card" style="--card-accent:var(--gradient-primary)"><div class="stat-icon" style="background:rgba(0,212,255,.08);color:var(--accent-cyan);"><i class="fas fa-boxes-stacked"></i></div><div class="stat-info"><h4>${T('dash_total_products')}</h4><div class="value">${total.toLocaleString()}</div><div class="sub">${products.length} ${T('dash_items')}</div></div></div>
    <div class="stat-card" style="--card-accent:var(--gradient-amber)"><div class="stat-icon" style="background:rgba(255,184,0,.08);color:var(--accent-amber);"><i class="fas fa-triangle-exclamation"></i></div><div class="stat-info"><h4>${T('dash_low_stock')}</h4><div class="value">${low}</div><div class="sub">${T('dash_below_min')}</div></div></div>
    <div class="stat-card" style="--card-accent:var(--gradient-danger)"><div class="stat-icon" style="background:rgba(255,71,87,.08);color:var(--accent-red);"><i class="fas fa-arrow-right-from-bracket"></i></div><div class="stat-info"><h4>${T('dash_total_out')}</h4><div class="value">${outs.toLocaleString()}</div><div class="sub">${transactions.filter(t => t.type === 'out').length} ${T('dash_items')}</div></div></div>
    <div class="stat-card" style="--card-accent:var(--gradient-success)"><div class="stat-icon" style="background:rgba(0,255,136,.08);color:var(--accent-green);"><i class="fas fa-arrow-right-to-bracket"></i></div><div class="stat-info"><h4>${T('dash_total_in')}</h4><div class="value">${ins.toLocaleString()}</div><div class="sub">${transactions.filter(t => t.type === 'in').length} ${T('dash_items')}</div></div></div>`;
}

function renderRecentActivity() {
  const el = document.getElementById('dashRecentActivity');
  if (!el) return;
  const recent = transactions.slice(0, 8);
  if (!recent.length) { el.innerHTML = `<li style="text-align:center;padding:30px;color:var(--text-muted);"><i class="fas fa-inbox" style="font-size:28px;display:block;margin-bottom:8px;opacity:.4;"></i>${T('dash_no_activity')}<br><small>${T('dash_start_scan')}</small></li>`; return; }
  el.innerHTML = recent.map(t => {
    const ic = t.type === 'in' ? 'fa-arrow-right-to-bracket' : t.type === 'out' ? 'fa-arrow-right-from-bracket' : 'fa-satellite-dish';
    return `<li><div class="activity-icon ${t.type}"><i class="fas ${ic}"></i></div><div class="activity-details"><strong>${t.product}</strong> — ${t.type === 'in' ? T('tx_type_in') : T('tx_type_out')} ${t.qty}</div><div class="activity-time">${fmtTime(t.time)}</div></li>`;
  }).join('');
}

function renderWithdrawChart() {
  const c = document.getElementById('dashWithdrawChart');
  if (!c) return;
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  const data = days.map(day => {
    const count = transactions.filter(t => t.type === 'out' && t.time && t.time.startsWith(day)).reduce((s, t) => s + t.qty, 0);
    return { day: day.slice(5), count };
  });
  const max = Math.max(...data.map(d => d.count), 1);
  c.innerHTML = data.map(d => `<div class="chart-bar-group"><div class="chart-bar-label"><span>${d.day}</span><span>${d.count}</span></div><div class="chart-bar-track"><div class="chart-bar-fill" style="width:${d.count / max * 100}%;background:var(--gradient-danger);"></div></div></div>`).join('');
}

function renderLowStock() {
  const b = document.getElementById('lowStockBody');
  if (!b) return;
  const low = products.filter(p => p.quantity <= p.minStock).sort((a, c) => a.quantity - c.quantity);
  if (!low.length) { b.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">${T('dash_no_low_stock')}</td></tr>`; return; }
  b.innerHTML = low.map(p => `<tr><td class="product-name">${p.name}</td><td>${p.sku}</td><td><strong>${p.quantity}</strong> ${p.unit}</td><td><span class="status ${p.quantity === 0 ? 'critical' : 'low'}">${p.quantity === 0 ? T('status_critical') : T('status_low')}</span></td></tr>`).join('');
}

function renderTopWithdraw() {
  const c = document.getElementById('dashTopWithdraw');
  if (!c) return;
  const counts = {};
  transactions.filter(t => t.type === 'out').forEach(t => { counts[t.product] = (counts[t.product] || 0) + t.qty; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!sorted.length) { c.innerHTML = `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>${T('dash_no_withdraw_data')}</p></div>`; return; }
  const max = sorted[0][1];
  c.innerHTML = sorted.map(([name, count], i) => {
    const rank = i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze';
    return `<div class="top-withdraw-item"><div class="top-withdraw-rank ${rank}">${i + 1}</div><div class="top-withdraw-info"><div class="name">${name}</div><div class="count">${T('dash_withdrawn')} ${count} ${T('dash_pieces')}</div></div><div class="top-withdraw-bar"><div class="top-withdraw-bar-fill" style="width:${count / max * 100}%"></div></div></div>`;
  }).join('');
}

// ===== PRODUCTS =====
function renderProducts() {
  const b = document.getElementById('productTableBody');
  if (!b) return;
  // Build dynamic category filter chips
  buildCategoryFilters();
  let list = [...products];
  const q = (document.getElementById('productSearch')?.value || '').toLowerCase();
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.rfid || '').includes(q));
  if (curProdFilter !== 'all') list = list.filter(p => p.category === curProdFilter);
  if (!list.length) { b.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:30px;"><i class="fas fa-box-open" style="font-size:24px;display:block;margin-bottom:8px;"></i>${T('prod_no_items')}</td></tr>`; return; }
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'warehouse';
  b.innerHTML = list.map(p => {
    const cat = getCatInfo(p.category);
    const st = p.quantity === 0 ? 'critical' : p.quantity <= p.minStock ? 'low' : 'ok';
    const stL = p.quantity === 0 ? T('status_critical') : p.quantity <= p.minStock ? T('status_low') : T('status_ok');
    return `<tr><td>${p.sku}</td><td class="product-name">${p.name}</td><td><span class="status ${st}" style="background:rgba(0,212,255,.06);">${cat.label}</span></td><td>${p.location || '-'}</td><td><strong>${p.quantity}</strong></td><td>${p.unit}</td><td><span class="status ${st}">${stL}</span></td><td>${canEdit ? `<div class="action-btns"><button class="action-btn edit" onclick="editProduct(${p.id})"><i class="fas fa-pen"></i></button><button class="action-btn delete" onclick="deleteProduct(${p.id})"><i class="fas fa-trash"></i></button></div>` : '-'}</td></tr>`;
  }).join('');
}
function buildCategoryFilters() {
  const container = document.getElementById('categoryFilters');
  if (!container) return;
  // Collect unique categories from products
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
  let html = '<button class="filter-chip' + (curProdFilter === 'all' ? ' active' : '') + '" onclick="setProductFilter(\'all\', this)">ทั้งหมด</button>';
  cats.forEach(cat => {
    const info = getCatInfo(cat);
    html += `<button class="filter-chip${curProdFilter === cat ? ' active' : ''}" onclick="setProductFilter('${cat}', this)">${info.label}</button>`;
  });
  container.innerHTML = html;
}
function filterProducts() { renderProducts(); }
function setProductFilter(f, el) { curProdFilter = f; document.querySelectorAll('#categoryFilters .filter-chip').forEach(c => c.classList.remove('active')); if (el) el.classList.add('active'); renderProducts(); }
function openAddProductModal() {
  document.getElementById('productModalTitle').innerHTML = '<i class="fas fa-plus text-cyan"></i> เพิ่มสินค้าใหม่';
  document.getElementById('productForm').reset(); document.getElementById('editProductId').value = '';
  openModal('addProductModal');
}
function editProduct(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  document.getElementById('productModalTitle').innerHTML = '<i class="fas fa-pen text-amber"></i> แก้ไขสินค้า';
  document.getElementById('editProductId').value = p.id;
  document.getElementById('prodSku').value = p.sku; document.getElementById('prodName').value = p.name;
  document.getElementById('prodRfid').value = p.rfid || ''; document.getElementById('prodCategory').value = p.category;
  document.getElementById('prodUnit').value = p.unit; document.getElementById('prodLocation').value = p.location || '';
  document.getElementById('prodQuantity').value = p.quantity; document.getElementById('prodMinStock').value = p.minStock;
  openModal('addProductModal');
}
async function saveProduct() {
  const id = document.getElementById('editProductId').value;
  const d = {
    sku: document.getElementById('prodSku').value.trim(), name: document.getElementById('prodName').value.trim(),
    rfid: document.getElementById('prodRfid').value.trim(), category: document.getElementById('prodCategory').value,
    unit: document.getElementById('prodUnit').value.trim(), location: document.getElementById('prodLocation').value.trim(),
    quantity: parseInt(document.getElementById('prodQuantity').value) || 0, minStock: parseInt(document.getElementById('prodMinStock').value) || 0,
    updatedAt: getNow()
  };
  if (!d.sku || !d.name || !d.category) { showToast('error', T('msg_fill_all')); return; }
  try {
    if (id) {
      await api('PUT', `/products/${id}`, d);
      const idx = products.findIndex(p => p.id === parseInt(id));
      if (idx >= 0) products[idx] = { ...products[idx], ...d };
      addLog('แก้ไขสินค้า', `${d.name} (${d.sku})`);
    } else {
      const result = await api('POST', '/products', d);
      products.push({ id: result.id, ...d });
      addLog('เพิ่มสินค้า', `${d.name} (${d.sku}) RFID:${d.rfid}`);
    }
    closeModal('addProductModal');
    showToast('success', id ? T('msg_product_edited') : T('msg_product_added'));
    syncAllViews();
  } catch (err) { showToast('error', err.message); }
}
async function deleteProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p || !confirm(`${T('msg_confirm_delete')} "${p.name}" ?`)) return;
  try {
    await api('DELETE', `/products/${id}`);
    products = products.filter(x => x.id !== id);
    addLog('ลบสินค้า', `${p.name} (${p.sku})`);
    showToast('success', T('msg_product_deleted'));
    syncAllViews();
  } catch (err) { showToast('error', err.message); }
}

// ===== WITHDRAW =====
function renderWithdraw() {
  renderWithdrawHist();
  // Reset scanner state
  const st = document.getElementById('withdrawScannerStatus');
  if (st) st.textContent = T('withdraw_scan_hint');
  const sid = document.getElementById('withdrawScannedId');
  if (sid) sid.textContent = '';
}
function handleWithdrawScan(uid) {
  const ring = document.getElementById('withdrawScannerRing');
  const st = document.getElementById('withdrawScannerStatus');
  const sid = document.getElementById('withdrawScannedId');
  if (!ring || !st || !sid) return;
  ring.classList.add('scanning'); st.textContent = T('msg_searching'); sid.textContent = uid;
  setTimeout(() => {
    ring.classList.remove('scanning');
    const p = findByRfid(uid);
    if (p) {
      ring.classList.add('success');
      st.textContent = `${T('msg_found')}: ${p.name}`;
      showWithdrawForm(p.id);
      setTimeout(() => ring.classList.remove('success'), 3000);
    } else {
      st.textContent = `${T('msg_rfid_not_found')}: ${uid}`;
      showToast('warning', `${T('msg_rfid_not_found')}: ${uid}`);
    }
  }, 500);
}
function showWithdrawForm(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  document.getElementById('withdrawFormPanel').style.display = '';
  document.getElementById('withdrawProductId').value = p.id;
  document.getElementById('withdrawProductInfo').innerHTML = `<div class="product-info-box"><h4>${p.name}</h4><div class="detail"><i class="fas fa-barcode"></i> ${p.sku} | RFID: ${p.rfid}</div><div class="detail"><i class="fas fa-cubes"></i> ${T('msg_scan_stock')}: <strong>${p.quantity}</strong> ${p.unit}</div></div>`;
  document.getElementById('withdrawUser').value = currentUser?.name || '';
  document.getElementById('withdrawQty').value = 1; document.getElementById('withdrawQty').max = p.quantity;
}
async function processWithdraw() {
  const id = parseInt(document.getElementById('withdrawProductId').value);
  const qty = parseInt(document.getElementById('withdrawQty').value);
  const user = document.getElementById('withdrawUser').value.trim();
  const reason = document.getElementById('withdrawReason').value.trim();
  const p = products.find(x => x.id === id); if (!p) return;
  if (!qty || qty < 1) { showToast('error', T('msg_specify_qty')); return; }
  if (qty > p.quantity) { showToast('error', `${T('msg_insufficient')} (${T('msg_remaining')} ${p.quantity} ${p.unit})`); return; }
  if (!user) { showToast('error', T('msg_specify_user')); return; }
  try {
    const now = getNow();
    const newQty = p.quantity - qty;
    await api('PATCH', `/products/${id}/quantity`, { quantity: newQty, updatedAt: now });
    const txData = { type: 'out', rfid: p.rfid, product: p.name, sku: p.sku, qty, user, time: now, reason };
    const txResult = await api('POST', '/transactions', txData);
    p.quantity = newQty; p.updatedAt = now;
    transactions.unshift({ id: txResult.id, ...txData });
    addLog('เบิกสินค้า', `${p.name} x${qty} โดย ${user}`);
    addToLiveFeedTx('out', p.rfid, p.name, qty);
    showToast('success', `${T('msg_withdraw_success')}: ${p.name} x${qty} ${p.unit}`);
    document.getElementById('withdrawFormPanel').style.display = 'none';
    document.getElementById('withdrawForm').reset();
    const st = document.getElementById('withdrawScannerStatus');
    if (st) st.textContent = T('withdraw_scan_hint');
    const sid = document.getElementById('withdrawScannedId');
    if (sid) sid.textContent = '';
    syncAllViews();
  } catch (err) { showToast('error', err.message); }
}
function renderWithdrawHist() {
  const b = document.getElementById('withdrawHistoryBody');
  if (!b) return;
  const list = transactions.filter(t => t.type === 'out').slice(0, 15);
  if (!list.length) { b.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">${T('withdraw_no_items')}</td></tr>`; return; }
  b.innerHTML = list.map(t => `<tr><td>${fmtTime(t.time)}</td><td style="font-family:var(--font-mono,'Consolas');font-size:11px;">${t.rfid}</td><td class="product-name">${t.product}</td><td>${t.qty}</td><td>${t.user}</td><td>${t.reason || '-'}</td></tr>`).join('');
}

// ===== RECEIVE =====
function renderReceive() {
  renderReceiveHist();
  const st = document.getElementById('receiveScannerStatus');
  if (st) st.textContent = T('receive_scan_hint');
  const sid = document.getElementById('receiveScannedId');
  if (sid) sid.textContent = '';
  const existPanel = document.getElementById('receiveExistingPanel');
  if (existPanel) existPanel.style.display = 'none';
}
function handleReceiveScan(uid) {
  const ring = document.getElementById('receiveScannerRing');
  const st = document.getElementById('receiveScannerStatus');
  const sid = document.getElementById('receiveScannedId');
  if (!ring || !st || !sid) return;
  ring.classList.add('scanning'); st.textContent = T('msg_searching'); sid.textContent = uid;
  setTimeout(() => {
    ring.classList.remove('scanning');
    const p = findByRfid(uid);
    if (p) {
      ring.classList.add('success');
      st.textContent = `${T('msg_found')}: ${p.name}`;
      showReceiveForm(p.id);
      setTimeout(() => ring.classList.remove('success'), 3000);
    } else {
      st.textContent = `UID: ${uid} — ${T('msg_not_found_in_system')}`;
      const rfidInput = document.getElementById('whNewRfid');
      const bindLabel = document.getElementById('bindRfidUid');
      if (rfidInput) rfidInput.value = uid;
      if (bindLabel) bindLabel.textContent = uid;
      showToast('info', T('msg_rfid_new'));
    }
  }, 500);
}
function showReceiveForm(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  document.getElementById('receiveExistingPanel').style.display = '';
  document.getElementById('receiveProductId').value = p.id;
  document.getElementById('receiveProductInfo').innerHTML = `<div class="product-info-box"><h4>${p.name}</h4><div class="detail"><i class="fas fa-barcode"></i> ${p.sku} | RFID: ${p.rfid}</div><div class="detail"><i class="fas fa-cubes"></i> ${T('msg_scan_stock')}: <strong>${p.quantity}</strong> ${p.unit}</div></div>`;
  document.getElementById('receiveQty').value = 1;
}
async function processReceive() {
  const id = parseInt(document.getElementById('receiveProductId').value);
  const qty = parseInt(document.getElementById('receiveQty').value);
  const p = products.find(x => x.id === id); if (!p || !qty || qty < 1) { showToast('error', T('msg_specify_qty')); return; }
  try {
    const now = getNow();
    const newQty = p.quantity + qty;
    await api('PATCH', `/products/${id}/quantity`, { quantity: newQty, updatedAt: now });
    const txData = { type: 'in', rfid: p.rfid, product: p.name, sku: p.sku, qty, user: currentUser?.name || 'ระบบ', time: now, reason: '' };
    const txResult = await api('POST', '/transactions', txData);
    p.quantity = newQty; p.updatedAt = now;
    transactions.unshift({ id: txResult.id, ...txData });
    addLog('รับสินค้าเข้า', `${p.name} x${qty}`);
    addToLiveFeedTx('in', p.rfid, p.name, qty);
    showToast('success', `${p.name} x${qty} ${p.unit} ${T('msg_receive_success')}`);
    document.getElementById('receiveExistingPanel').style.display = 'none';
    const st = document.getElementById('receiveScannerStatus');
    if (st) st.textContent = T('receive_scan_hint');
    syncAllViews();
  } catch (err) { showToast('error', err.message); }
}
async function addProductFromWarehouse() {
  const d = {
    rfid: document.getElementById('whNewRfid').value.trim(), sku: document.getElementById('whNewSku').value.trim(),
    name: document.getElementById('whNewName').value.trim(), category: document.getElementById('whNewCategory').value,
    unit: document.getElementById('whNewUnit').value.trim(), location: document.getElementById('whNewLocation').value.trim(),
    quantity: parseInt(document.getElementById('whNewQuantity').value) || 0, minStock: parseInt(document.getElementById('whNewMinStock').value) || 0
  };
  if (!d.rfid || !d.sku || !d.name || !d.category || !d.unit || !d.quantity) { showToast('error', T('msg_fill_all')); return; }
  if (products.find(p => p.rfid === d.rfid)) { showToast('error', T('msg_rfid_dup')); return; }
  try {
    const now = getNow();
    const prodResult = await api('POST', '/products', { ...d, updatedAt: now });
    const newP = { id: prodResult.id, ...d, updatedAt: now };
    products.push(newP);
    const txData = { type: 'in', rfid: d.rfid, product: d.name, sku: d.sku, qty: d.quantity, user: currentUser?.name || 'ระบบ', time: now, reason: T('product_added_new') };
    const txResult = await api('POST', '/transactions', txData);
    transactions.unshift({ id: txResult.id, ...txData });
    addLog('เพิ่มสินค้า+ผูกRFID', `${d.name} (${d.sku}) RFID:${d.rfid}`);
    addToLiveFeedTx('in', d.rfid, d.name, d.quantity);
    showToast('success', `${T('msg_product_added')}: "${d.name}"`);
    document.getElementById('whAddProductForm').reset();
    document.getElementById('bindRfidUid').textContent = T('receive_bind_wait');
    syncAllViews();
  } catch (err) { showToast('error', err.message); }
}
function renderReceiveHist() {
  const b = document.getElementById('receiveHistoryBody');
  if (!b) return;
  const list = transactions.filter(t => t.type === 'in').slice(0, 15);
  if (!list.length) { b.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">${T('receive_no_items')}</td></tr>`; return; }
  b.innerHTML = list.map(t => `<tr><td>${fmtTime(t.time)}</td><td style="font-family:var(--font-mono,'Consolas');font-size:11px;">${t.rfid}</td><td class="product-name">${t.product}</td><td>${t.sku}</td><td>${t.qty}</td><td>${t.user}</td></tr>`).join('');
}


// ===== TRANSACTIONS =====
function renderTransactions() {
  const b = document.getElementById('txTableBody');
  if (!b) return;
  let list = [...transactions];
  const q = (document.getElementById('txSearch')?.value || '').toLowerCase();
  if (q) list = list.filter(t => t.product.toLowerCase().includes(q) || (t.rfid || '').includes(q) || t.user.toLowerCase().includes(q));
  if (curTxFilter !== 'all') list = list.filter(t => t.type === curTxFilter);
  if (!list.length) { b.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px;">${T('tx_no_items')}</td></tr>`; return; }
  b.innerHTML = list.map(t => {
    const tl = t.type === 'in' ? T('tx_type_in') : T('tx_type_out');
    return `<tr><td>${fmtTime(t.time)}</td><td><span class="status ${t.type}-type">${tl}</span></td><td style="font-family:var(--font-mono,'Consolas');font-size:11px;">${t.rfid}</td><td class="product-name">${t.product}</td><td>${t.qty || '-'}</td><td>${t.user}</td><td>${t.reason || '-'}</td></tr>`;
  }).join('');
  updateTxBadge();
}
function filterTransactions() { renderTransactions(); }
function setTxFilter(f, el) { curTxFilter = f; document.querySelectorAll('#transactionsView .filter-chip').forEach(c => c.classList.remove('active')); if (el) el.classList.add('active'); renderTransactions(); }
function exportCSV() {
  const rows = [['เวลา', 'ประเภท', 'RFID UID', 'สินค้า', 'จำนวน', 'ผู้ทำรายการ', 'หมายเหตุ']];
  transactions.forEach(t => rows.push([t.time, t.type === 'in' ? 'รับเข้า' : 'เบิกออก', t.rfid, t.product, t.qty, t.user, t.reason || '']));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `transactions_${getNow().replace(/[: ]/g, '_')}.csv`; a.click();
  showToast('success', T('tx_export_success'));
}

// ===== USER LOG =====
function renderUserLog() {
  const b = document.getElementById('userLogBody');
  if (!b) return;
  if (!userLog.length) { b.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px;">${T('ulog_no_items')}</td></tr>`; return; }
  b.innerHTML = userLog.slice(0, 50).map(l => `<tr><td>${fmtTime(l.time)}</td><td>${l.user}</td><td><span class="role-badge ${l.role}">${getRoleLabel(l.role)}</span></td><td>${l.action}</td><td style="font-size:11px;color:var(--text-muted);">${l.detail}</td></tr>`).join('');
}

// ===== USER MANAGEMENT =====
function renderUserMgmt() {
  const b = document.getElementById('userTableBody');
  if (!b) return;
  b.innerHTML = users.map(u => `<tr><td class="product-name">${u.name}</td><td>${u.username}</td><td><span class="role-badge ${u.role}">${getRoleLabel(u.role)}</span></td><td>${getDeptLabel(u.dept)}</td><td><span class="status ${u.active !== false ? 'ok' : 'critical'}">${u.active !== false ? T('umgmt_active') : T('umgmt_inactive')}</span></td><td><div class="action-btns"><button class="action-btn edit" onclick="editUser(${u.id})"><i class="fas fa-pen"></i></button>${u.id !== currentUser?.id ? `<button class="action-btn delete" onclick="toggleUserActive(${u.id})"><i class="fas fa-${u.active !== false ? 'ban' : 'check'}"></i></button>` : ''}</div></td></tr>`).join('');
}
function openAddUserModal() { document.getElementById('userForm').reset(); document.getElementById('editUserId').value = ''; openModal('addUserModal'); }
function editUser(id) {
  const u = users.find(x => x.id === id); if (!u) return;
  document.getElementById('editUserId').value = u.id;
  document.getElementById('newUserName').value = u.name; document.getElementById('newUserUsername').value = u.username;
  document.getElementById('newUserPassword').value = u.password; document.getElementById('newUserRole').value = u.role;
  document.getElementById('newUserDept').value = u.dept || '';
  openModal('addUserModal');
}
async function saveUser() {
  const id = document.getElementById('editUserId').value;
  const d = { name: document.getElementById('newUserName').value.trim(), username: document.getElementById('newUserUsername').value.trim(), password: document.getElementById('newUserPassword').value, role: document.getElementById('newUserRole').value, dept: document.getElementById('newUserDept').value, active: true };
  if (!d.name || !d.username || !d.password || !d.role) { showToast('error', T('msg_fill_all')); return; }
  try {
    if (id) {
      await api('PUT', `/users/${id}`, d);
      const idx = users.findIndex(u => u.id === parseInt(id));
      if (idx >= 0) users[idx] = { ...users[idx], ...d };
    } else {
      const result = await api('POST', '/users', d);
      users.push({ id: result.id, ...d });
    }
    closeModal('addUserModal'); renderUserMgmt();
    addLog(id ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้', `${d.name} (${getRoleLabel(d.role)})`);
    showToast('success', id ? T('msg_user_edited') : T('msg_user_added'));
  } catch (err) { showToast('error', err.message); }
}
async function toggleUserActive(id) {
  const u = users.find(x => x.id === id); if (!u) return;
  try {
    await api('PATCH', `/users/${id}/toggle`);
    u.active = !u.active;
    renderUserMgmt();
    addLog(u.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน', u.name);
    showToast('success', `${u.active ? 'เปิด' : 'ปิด'}ใช้งาน ${u.name}`);
  } catch (err) { showToast('error', err.message); }
}

// ===== GLOBAL SEARCH =====
function handleGlobalSearch(q) {
  if (!q || q.length < 2) return;
  const p = products.find(x => x.name.toLowerCase().includes(q.toLowerCase()) || x.sku.toLowerCase().includes(q.toLowerCase()) || (x.rfid || '').includes(q));
  if (p) { navigateTo('products'); document.getElementById('productSearch').value = q; filterProducts(); }
}

// ===== MODAL =====
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
  refocusRfid();
}

// ===== TOAST =====
function showToast(type, msg) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const t = document.createElement('div'); t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i>${msg}`;
  c.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4000);
}
function showFormError(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); } }

// =========================================================
// HISTORY PAGE — ข้อมูลย้อนหลัง
// =========================================================
function getHistoryDateRange() {
  let from = document.getElementById('historyDateFrom')?.value || '';
  let to = document.getElementById('historyDateTo')?.value || '';
  if (!from) {
    // Default: 30 days back
    const d = new Date(); d.setDate(d.getDate() - 30);
    from = d.toISOString().slice(0, 10);
    const el = document.getElementById('historyDateFrom');
    if (el) el.value = from;
  }
  if (!to) {
    to = new Date().toISOString().slice(0, 10);
    const el = document.getElementById('historyDateTo');
    if (el) el.value = to;
  }
  return { from, to };
}

function getFilteredHistory() {
  const { from, to } = getHistoryDateRange();
  const q = (document.getElementById('historySearch')?.value || '').toLowerCase();
  let list = transactions.filter(t => {
    if (!t.time) return false;
    const day = t.time.slice(0, 10);
    return day >= from && day <= to;
  });
  if (curHistoryFilter !== 'all') list = list.filter(t => t.type === curHistoryFilter);
  if (q) list = list.filter(t => t.product.toLowerCase().includes(q) || (t.rfid || '').includes(q) || t.user.toLowerCase().includes(q));
  return { list, from, to };
}

function renderHistory() {
  renderHistorySummary();
  renderHistoryChart();
  renderHistoryTable();
  renderSnapshotTimeline();
}

function setHistoryFilter(f, el) {
  curHistoryFilter = f;
  document.querySelectorAll('#historyView .filter-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderHistory();
}

function renderHistorySummary() {
  const g = document.getElementById('historySummaryGrid');
  if (!g) return;
  const { list } = getFilteredHistory();
  const totalOut = list.filter(t => t.type === 'out').reduce((s, t) => s + t.qty, 0);
  const totalIn = list.filter(t => t.type === 'in').reduce((s, t) => s + t.qty, 0);
  const txCount = list.length;
  // Find top product
  const counts = {};
  list.filter(t => t.type === 'out').forEach(t => { counts[t.product] = (counts[t.product] || 0) + t.qty; });
  const topEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topProduct = topEntries.length ? `${topEntries[0][0]} (${topEntries[0][1]})` : '-';

  g.innerHTML = `
    <div class="history-summary-card" style="--card-accent:var(--gradient-danger)">
      <div class="hsc-icon" style="background:rgba(255,71,87,.08);color:var(--accent-red);"><i class="fas fa-arrow-right-from-bracket"></i></div>
      <div class="hsc-info"><h4>${T('hist_total_out')}</h4><div class="hsc-value">${totalOut.toLocaleString()}</div></div>
    </div>
    <div class="history-summary-card" style="--card-accent:var(--gradient-success)">
      <div class="hsc-icon" style="background:rgba(0,255,136,.08);color:var(--accent-green);"><i class="fas fa-arrow-right-to-bracket"></i></div>
      <div class="hsc-info"><h4>${T('hist_total_in')}</h4><div class="hsc-value">${totalIn.toLocaleString()}</div></div>
    </div>
    <div class="history-summary-card" style="--card-accent:var(--gradient-primary)">
      <div class="hsc-icon" style="background:rgba(0,212,255,.08);color:var(--accent-cyan);"><i class="fas fa-receipt"></i></div>
      <div class="hsc-info"><h4>${T('hist_tx_count')}</h4><div class="hsc-value">${txCount.toLocaleString()}</div></div>
    </div>
    <div class="history-summary-card" style="--card-accent:var(--gradient-amber)">
      <div class="hsc-icon" style="background:rgba(255,184,0,.08);color:var(--accent-amber);"><i class="fas fa-trophy"></i></div>
      <div class="hsc-info"><h4>${T('hist_top_product')}</h4><div class="hsc-value hsc-top">${topProduct}</div></div>
    </div>`;
}

function renderHistoryChart() {
  const c = document.getElementById('historyDailyChart');
  if (!c) return;
  const { from, to } = getHistoryDateRange();
  // Generate day list
  const days = [];
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  const maxDays = 60;
  let cursor = new Date(start);
  while (cursor <= end && days.length < maxDays) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  if (!days.length) { c.innerHTML = `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>${T('hist_chart_empty')}</p></div>`; return; }

  const data = days.map(day => {
    const outQty = transactions.filter(t => t.type === 'out' && t.time && t.time.startsWith(day)).reduce((s, t) => s + t.qty, 0);
    const inQty = transactions.filter(t => t.type === 'in' && t.time && t.time.startsWith(day)).reduce((s, t) => s + t.qty, 0);
    return { day: day.slice(5), outQty, inQty };
  });
  const max = Math.max(...data.map(d => Math.max(d.outQty, d.inQty)), 1);
  c.innerHTML = data.map(d => `<div class="hc-day-group">
    <div class="hc-day-label">${d.day}</div>
    <div class="hc-bars">
      <div class="hc-bar hc-bar-out" style="height:${d.outQty / max * 100}%" title="${T('tx_type_out')} ${d.outQty}"><span>${d.outQty || ''}</span></div>
      <div class="hc-bar hc-bar-in" style="height:${d.inQty / max * 100}%" title="${T('tx_type_in')} ${d.inQty}"><span>${d.inQty || ''}</span></div>
    </div>
  </div>`).join('') + `<div class="hc-legend"><span class="hc-legend-out">${T('hist_legend_out')}</span><span class="hc-legend-in">${T('hist_legend_in')}</span></div>`;
}

function renderHistoryTable() {
  const b = document.getElementById('historyTableBody');
  const countEl = document.getElementById('historyResultCount');
  if (!b) return;
  const { list } = getFilteredHistory();
  if (countEl) countEl.textContent = `${list.length} ${T('hist_items')}`;
  if (!list.length) {
    b.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:30px;"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;opacity:.4;"></i>${T('hist_no_data')}</td></tr>`;
    return;
  }
  b.innerHTML = list.map(t => {
    const [date, time] = (t.time || '').split(' ');
    const tl = t.type === 'in' ? T('tx_type_in') : T('tx_type_out');
    return `<tr>
      <td>${date || '-'}</td>
      <td>${time ? time.slice(0, 5) : '-'}</td>
      <td><span class="status ${t.type}-type">${tl}</span></td>
      <td style="font-family:var(--font-mono,'Consolas');font-size:11px;">${t.rfid || '-'}</td>
      <td class="product-name">${t.product}</td>
      <td>${t.qty || '-'}</td>
      <td>${t.user}</td>
      <td>${t.reason || '-'}</td>
    </tr>`;
  }).join('');
}

function exportFilteredCSV() {
  const { list } = getFilteredHistory();
  if (!list.length) { showToast('warning', T('hist_no_export')); return; }
  const rows = [['วันที่', 'เวลา', 'ประเภท', 'RFID UID', 'สินค้า', 'จำนวน', 'ผู้ทำรายการ', 'หมายเหตุ']];
  list.forEach(t => {
    const [date, time] = (t.time || '').split(' ');
    rows.push([date, time || '', t.type === 'in' ? 'รับเข้า' : 'เบิกออก', t.rfid, t.product, t.qty, t.user, t.reason || '']);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `history_${getHistoryDateRange().from}_${getHistoryDateRange().to}.csv`; a.click();
  showToast('success', `${T('hist_export_success')} (${list.length} ${T('hist_items')})`);
}

// ===== STOCK SNAPSHOTS =====
async function saveStockSnapshot() {
  const today = getNow().slice(0, 10);
  const data = products.map(p => ({ productId: p.id, name: p.name, sku: p.sku, quantity: p.quantity }));
  try {
    await api('POST', '/snapshots', { date: today, data });
    stockSnapshots = stockSnapshots.filter(s => s.date !== today);
    data.forEach(d => stockSnapshots.push({ ...d, date: today }));
    showToast('success', `${T('msg_snapshot_saved')} ${today} (${products.length} ${T('msg_snapshot_items')})`);
    if (currentPage === 'history') renderSnapshotTimeline();
  } catch (err) { showToast('error', err.message); }
}

async function autoSaveStockSnapshot() {
  const today = getNow().slice(0, 10);
  const hasTodaySnapshot = stockSnapshots.some(s => s.date === today);
  if (!hasTodaySnapshot && products.length > 0) {
    const data = products.map(p => ({ productId: p.id, name: p.name, sku: p.sku, quantity: p.quantity }));
    try {
      await api('POST', '/snapshots', { date: today, data });
      data.forEach(d => stockSnapshots.push({ ...d, date: today }));
    } catch (e) { /* silent */ }
  }
}

function renderSnapshotTimeline() {
  const b = document.getElementById('snapshotTableBody');
  if (!b) return;
  if (!stockSnapshots.length) {
    b.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px;"><i class="fas fa-camera" style="font-size:24px;display:block;margin-bottom:8px;opacity:.4;"></i>${T('hist_snapshot_empty')}<br><small>${T('hist_snapshot_hint')}</small></td></tr>`;
    return;
  }
  // Group by date and show latest dates first
  const dateGroups = {};
  stockSnapshots.forEach(s => {
    if (!dateGroups[s.date]) dateGroups[s.date] = [];
    dateGroups[s.date].push(s);
  });
  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a)).slice(0, 14);
  let html = '';
  sortedDates.forEach(date => {
    const items = dateGroups[date];
    items.forEach(s => {
      const currentProd = products.find(p => p.id === s.productId);
      const currentQty = currentProd ? currentProd.quantity : null;
      const diff = currentQty !== null ? currentQty - s.quantity : null;
      let diffLabel = '-';
      if (diff !== null) {
        if (diff > 0) diffLabel = `<span style="color:var(--accent-green);">+${diff} ▲</span>`;
        else if (diff < 0) diffLabel = `<span style="color:var(--accent-red);">${diff} ▼</span>`;
        else diffLabel = `<span style="color:var(--text-muted);">0 —</span>`;
      }
      html += `<tr>
        <td>${date}</td>
        <td class="product-name">${s.name}</td>
        <td>${s.sku}</td>
        <td><strong>${s.quantity}</strong></td>
        <td>${diffLabel}</td>
      </tr>`;
    });
  });
  b.innerHTML = html;
}

// =========================================================
// ANALYTICS PAGE — สรุปภาพรวม
// =========================================================
function renderAnalytics() {
  renderAnalyticsKPI();
  renderAnalyticsDailyChart();
  renderAnalyticsDonut();
  renderAnalyticsTopProducts();
  renderAnalyticsUserActivity();
  renderAnalyticsHourly();
}

function renderAnalyticsKPI() {
  const g = document.getElementById('analyticsKpiGrid');
  if (!g) return;
  const total = products.reduce((s, p) => s + p.quantity, 0);
  const totalOut = transactions.filter(t => t.type === 'out').reduce((s, t) => s + t.qty, 0);
  const totalIn = transactions.filter(t => t.type === 'in').reduce((s, t) => s + t.qty, 0);
  const low = products.filter(p => p.quantity <= p.minStock).length;
  const today = getNow().slice(0, 10);
  const todayTx = transactions.filter(t => t.time && t.time.startsWith(today)).length;
  const activeUsers = users.filter(u => u.active !== false).length;
  g.innerHTML = `
    <div class="an-kpi" style="--kpi-color:var(--accent-cyan)"><div class="an-kpi-icon"><i class="fas fa-boxes-stacked"></i></div><div class="an-kpi-info"><div class="an-kpi-value">${total.toLocaleString()}</div><div class="an-kpi-label" data-i18n="an_kpi_stock">${T('an_kpi_stock')}</div></div></div>
    <div class="an-kpi" style="--kpi-color:var(--accent-purple)"><div class="an-kpi-icon"><i class="fas fa-box"></i></div><div class="an-kpi-info"><div class="an-kpi-value">${products.length}</div><div class="an-kpi-label" data-i18n="an_kpi_products">${T('an_kpi_products')}</div></div></div>
    <div class="an-kpi" style="--kpi-color:var(--accent-red)"><div class="an-kpi-icon"><i class="fas fa-arrow-right-from-bracket"></i></div><div class="an-kpi-info"><div class="an-kpi-value">${totalOut.toLocaleString()}</div><div class="an-kpi-label" data-i18n="an_kpi_out">${T('an_kpi_out')}</div></div></div>
    <div class="an-kpi" style="--kpi-color:var(--accent-green)"><div class="an-kpi-icon"><i class="fas fa-arrow-right-to-bracket"></i></div><div class="an-kpi-info"><div class="an-kpi-value">${totalIn.toLocaleString()}</div><div class="an-kpi-label" data-i18n="an_kpi_in">${T('an_kpi_in')}</div></div></div>
    <div class="an-kpi" style="--kpi-color:var(--accent-amber)"><div class="an-kpi-icon"><i class="fas fa-triangle-exclamation"></i></div><div class="an-kpi-info"><div class="an-kpi-value">${low}</div><div class="an-kpi-label" data-i18n="an_kpi_low">${T('an_kpi_low')}</div></div></div>
    <div class="an-kpi" style="--kpi-color:#a78bfa"><div class="an-kpi-icon"><i class="fas fa-bolt"></i></div><div class="an-kpi-info"><div class="an-kpi-value">${todayTx}</div><div class="an-kpi-label" data-i18n="an_kpi_today">${T('an_kpi_today')}</div></div></div>`;
}

function renderAnalyticsDailyChart() {
  const c = document.getElementById('analyticsDailyChart');
  if (!c) return;
  const days = [];
  const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 13);
  let cursor = new Date(start);
  while (cursor <= end) { days.push(cursor.toISOString().slice(0, 10)); cursor.setDate(cursor.getDate() + 1); }
  const data = days.map(day => {
    const outQty = transactions.filter(t => t.type === 'out' && t.time && t.time.startsWith(day)).reduce((s, t) => s + t.qty, 0);
    const inQty = transactions.filter(t => t.type === 'in' && t.time && t.time.startsWith(day)).reduce((s, t) => s + t.qty, 0);
    return { day: day.slice(5), outQty, inQty };
  });
  const max = Math.max(...data.map(d => Math.max(d.outQty, d.inQty)), 1);
  if (!data.some(d => d.outQty || d.inQty)) {
    c.innerHTML = `<div class="empty-state"><i class="fas fa-chart-area"></i><p>${T('an_no_data')}</p></div>`;
    return;
  }
  c.innerHTML = `<div class="an-chart-grid">${data.map(d => `<div class="an-chart-col">
    <div class="an-chart-bars">
      <div class="an-bar an-bar-out" style="height:${d.outQty / max * 100}%" title="${T('tx_type_out')} ${d.outQty}"><span>${d.outQty || ''}</span></div>
      <div class="an-bar an-bar-in" style="height:${d.inQty / max * 100}%" title="${T('tx_type_in')} ${d.inQty}"><span>${d.inQty || ''}</span></div>
    </div>
    <div class="an-chart-label">${d.day}</div>
  </div>`).join('')}</div>
  <div class="an-chart-legend"><span class="an-legend-out">■ ${T('tx_type_out')}</span><span class="an-legend-in">■ ${T('tx_type_in')}</span></div>`;
}

function renderAnalyticsDonut() {
  const el = document.getElementById('analyticsDonut');
  if (!el) return;
  const counts = {};
  products.forEach(p => { const c = p.category || 'Other'; counts[c] = (counts[c] || 0) + p.quantity; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, e) => s + e[1], 0);
  if (!total) { el.innerHTML = `<div class="empty-state"><i class="fas fa-chart-pie"></i><p>${T('an_no_data')}</p></div>`; return; }
  const colors = ['#00d4ff', '#a78bfa', '#ffb800', '#00ff88', '#ff4757', '#38b6ff', '#ff6b9d', '#ffd43b'];
  let gradParts = [], cumPct = 0;
  entries.forEach((e, i) => {
    const pct = e[1] / total * 100;
    const color = colors[i % colors.length];
    gradParts.push(`${color} ${cumPct}% ${cumPct + pct}%`);
    cumPct += pct;
  });
  const legendHtml = entries.map((e, i) => {
    const pct = (e[1] / total * 100).toFixed(1);
    return `<div class="an-donut-legend-item"><span class="an-donut-dot" style="background:${colors[i % colors.length]}"></span><span class="an-donut-name">${e[0]}</span><span class="an-donut-pct">${pct}%</span></div>`;
  }).join('');
  el.innerHTML = `<div class="an-donut" style="background:conic-gradient(${gradParts.join(',')})"><div class="an-donut-hole"><span class="an-donut-total">${total.toLocaleString()}</span><span class="an-donut-sub">${T('an_donut_total')}</span></div></div><div class="an-donut-legend">${legendHtml}</div>`;
}

function renderAnalyticsTopProducts() {
  const el = document.getElementById('analyticsTopProducts');
  if (!el) return;
  const counts = {};
  transactions.filter(t => t.type === 'out').forEach(t => { counts[t.product] = (counts[t.product] || 0) + t.qty; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!sorted.length) { el.innerHTML = `<div class="empty-state"><i class="fas fa-trophy"></i><p>${T('an_no_data')}</p></div>`; return; }
  const max = sorted[0][1];
  el.innerHTML = sorted.map(([name, count], i) => {
    const pct = count / max * 100;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    return `<div class="an-top-item"><span class="an-top-rank">${medal}</span><div class="an-top-info"><div class="an-top-name">${name}</div><div class="an-top-bar-wrap"><div class="an-top-bar" style="width:${pct}%"></div></div></div><span class="an-top-count">${count}</span></div>`;
  }).join('');
}

function renderAnalyticsUserActivity() {
  const el = document.getElementById('analyticsUserActivity');
  if (!el) return;
  const counts = {};
  transactions.forEach(t => { counts[t.user] = (counts[t.user] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!sorted.length) { el.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><p>${T('an_no_data')}</p></div>`; return; }
  const max = sorted[0][1];
  el.innerHTML = sorted.map(([name, count]) => {
    const pct = count / max * 100;
    return `<div class="an-user-item"><div class="an-user-avatar">${name.charAt(0)}</div><div class="an-user-info"><div class="an-user-name">${name}</div><div class="an-user-bar-wrap"><div class="an-user-bar" style="width:${pct}%"></div></div></div><span class="an-user-count">${count} ${T('an_user_txs')}</span></div>`;
  }).join('');
}

function renderAnalyticsHourly() {
  const el = document.getElementById('analyticsHourly');
  if (!el) return;
  const hours = Array(24).fill(0);
  transactions.forEach(t => {
    if (!t.time) return;
    const h = parseInt(t.time.split(' ')[1]?.split(':')[0]);
    if (!isNaN(h)) hours[h]++;
  });
  const max = Math.max(...hours, 1);
  if (!hours.some(h => h > 0)) { el.innerHTML = `<div class="empty-state"><i class="fas fa-clock"></i><p>${T('an_no_data')}</p></div>`; return; }
  el.innerHTML = `<div class="an-heat-grid">${hours.map((count, h) => {
    const intensity = count / max;
    const bg = count === 0 ? 'rgba(255,255,255,.03)' : `rgba(0,212,255,${0.15 + intensity * 0.85})`;
    return `<div class="an-heat-cell" style="background:${bg}" title="${String(h).padStart(2, '0')}:00 — ${count} ${T('an_user_txs')}"><div class="an-heat-hour">${String(h).padStart(2, '0')}</div><div class="an-heat-count">${count || ''}</div></div>`;
  }).join('')}</div>`;
}

// ===== UTILS =====
function getNow() { const d = new Date(); return `${d.getFullYear()}-${S(d.getMonth() + 1)}-${S(d.getDate())} ${S(d.getHours())}:${S(d.getMinutes())}:${S(d.getSeconds())}`; }
function S(n) { return String(n).padStart(2, '0'); }
function fmtTime(str) { if (!str) return '-'; try { const [date, time] = str.split(' '); const [y, m, d] = date.split('-'); return `${d}/${m} ${time ? time.slice(0, 5) : ''}`; } catch { return str; } }
