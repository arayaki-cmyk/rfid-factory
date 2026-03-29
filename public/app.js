// =====================================================
// RFID Factory — Conveyor Belt Inventory System
// Real USB RFID Reader + Live Scan Feed + Belt Animation
// =====================================================

const DB = {
  session: 'rfid_session', theme: 'rfid_theme'
};

// ─── Network / Connectivity State ─────────────────────────
let _isOnline = true;
let _pingInterval = null;
let _reconnectAttempts = 0;

function setOnlineState(online) {
  if (_isOnline === online) return;
  _isOnline = online;
  const bar = document.getElementById('offlineBanner');
  if (bar) bar.style.display = online ? 'none' : 'flex';
  if (online) {
    _reconnectAttempts = 0;
    showToast('success', '✅ เชื่อมต่อเซิร์ฟเวอร์แล้ว — กำลังโหลดข้อมูลใหม่');
    loadData(true).then(() => syncAllViews());
  } else {
    _reconnectAttempts++;
    console.warn(`Offline detected (attempt ${_reconnectAttempts})`);
  }
}

function startPing() {
  if (_pingInterval) clearInterval(_pingInterval);
  _pingInterval = setInterval(async () => {
    try {
      const r = await fetch('/api/ping', { method: 'GET', signal: AbortSignal.timeout(4000) });
      setOnlineState(r.ok);
    } catch { setOnlineState(false); }
  }, 8000); // ping every 8s
}

// API helper — communicates with Express backend
async function api(method, path, body, retries = 2) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12000), // 12s timeout
  };
  if (body) opts.body = JSON.stringify(body);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch('/api' + path, opts);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setOnlineState(true);
      return await res.json();
    } catch (e) {
      const isNet = e.name === 'AbortError' || e.name === 'TypeError' || e.message.includes('fetch');
      if (isNet) setOnlineState(false);
      if (attempt < retries && (e.message.includes('429') || e.message.includes('503') || isNet)) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
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

// ─── Permission Matrix ───────────────────────────────────────────────────────
// Define exactly what each role can do. Check with can(action) anywhere in code.
const PERMISSIONS = {
  admin: {
    pages:        ['dashboard','products','withdraw','receive','transactions','history','analytics','userLog','userManagement','batchScan','shiftReport'],
    products:     { view: true,  add: true,  edit: true,  delete: true  },
    withdraw:     { perform: true },
    receive:      { perform: true },
    transactions: { view: true,  export: true },
    history:      { view: true,  export: true },
    analytics:    { view: true },
    users:        { view: true,  add: true,  edit: true,  toggleActive: true },
    userLog:      { view: true },
    settings:     { theme: true, language: true },
  },
  warehouse: {
    pages:        ['dashboard','products','withdraw','receive','transactions','history','analytics','userLog','batchScan','shiftReport'],
    products:     { view: true,  add: true,  edit: true,  delete: false },
    withdraw:     { perform: true },
    receive:      { perform: true },
    transactions: { view: true,  export: true },
    history:      { view: true,  export: true },
    analytics:    { view: true },
    users:        { view: false, add: false, edit: false, toggleActive: false },
    userLog:      { view: true },
    settings:     { theme: true, language: true },
  },
  staff: {
    pages:        ['dashboard','withdraw','transactions','batchScan'],
    products:     { view: false, add: false, edit: false, delete: false },
    withdraw:     { perform: true },
    receive:      { perform: false },
    transactions: { view: true,  export: false },
    history:      { view: false, export: false },
    analytics:    { view: false },
    users:        { view: false, add: false, edit: false, toggleActive: false },
    userLog:      { view: false },
    settings:     { theme: true, language: true },
  },
};

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function can(resource, action) {
  const role = currentUser?.role || 'staff';
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  if (resource === 'page') return (perms.pages || []).includes(action);
  return !!(perms[resource]?.[action]);
}
// ────────────────────────────────────────────────────────────────────────────

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
  startPing(); // network health monitoring
});

// ===== THEME =====
function loadTheme() { /* single light theme */ }
function toggleTheme() { /* single light theme */ }
function selectTheme(theme) { closeModal('themePickerModal'); }
function setTheme(theme) { /* single light theme */ }
function applyTheme(theme) { /* single light theme */ }
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
async function loadData(silent = false) {
  try {
    const [p, tx, u, logs, snaps] = await Promise.all([
      api('GET', '/products'), api('GET', '/transactions'),
      api('GET', '/users'), api('GET', '/logs'), api('GET', '/snapshots'),
    ]);
    products = p; transactions = tx; users = u; userLog = logs;
    stockSnapshots = snaps.flatMap(s => (s.data || []).map(d => ({ ...d, date: s.date })));
  } catch (e) {
    console.warn('API load failed, keeping existing data:', e.message);
    if (!products.length && !transactions.length) {
      products = []; transactions = []; users = [...DEFAULT_USERS]; userLog = []; stockSnapshots = [];
    }
    // Warning toast suppressed
  }
  migrateLegacyCategoryKeys();
  recalcNextIds();
  runNotifChecks();
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

  // Always keep dashboard widgets fresh
  renderRecentActivity();
  renderLowStock();
  renderStats();
  renderWithdrawChart();
  renderTopWithdraw();

  // Re-render current page — but don't disrupt withdraw/receive mid-flow
  const _wActive = document.getElementById('withdrawFormPanel')?.style.display !== 'none';
  const _reActive = document.getElementById('receiveExistingPanel')?.style.display !== 'none';
  const _midFlow = (currentPage === 'withdraw' && _wActive)
                || (currentPage === 'receive' && _reActive);
  if (_midFlow) {
    if (currentPage === 'withdraw') renderWithdrawHist();
    else if (currentPage === 'receive') renderReceiveHist();
  } else {
    refreshCurrentView();
  }
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
    batchScan: renderBatch, shiftReport: renderShiftReport,
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
  const btn = e.target.querySelector('button[type="submit"]');
  const u = document.getElementById('loginEmail').value.trim();
  const p = document.getElementById('loginPassword').value;
  
  // Prevent double-submit
  if (btn.disabled) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>กำลังเข้าสู่ระบบ...</span>';
  
  try {
    const user = await api('POST', '/auth/login', { username: u, password: p });
    currentUser = user;
    localStorage.setItem(DB.session, JSON.stringify(user));
    addLog('เข้าสู่ระบบ', `${user.name} (${roleLabel[user.role]})`);
    
    // ✅ เพิ่มการแจ้งเตือนเมื่อเข้าสู่ระบบสำเร็จ
    showToast('success', `เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${user.name}`);
    
    // ✅ รีเซ็ตปุ่มกลับเป็นเหมือนเดิม (ป้องกันปุ่มค้างเวลา Logout ออกมา)
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> <span data-i18n="login_btn">เข้าสู่ระบบ</span><div class="btn-shine"></div>';
    
    enterApp();
  } catch (err) {
    // แจ้งเตือนเมื่อรหัสผิด
    showFormError('loginError', err.message || T('login_error'));
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> <span data-i18n="login_btn">เข้าสู่ระบบ</span><div class="btn-shine"></div>';
  }
}

function fillLogin(u, p) { document.getElementById('loginEmail').value = u; document.getElementById('loginPassword').value = p; }
function checkSession() {
  const s = JSON.parse(localStorage.getItem(DB.session) || 'null');
  if (s) { currentUser = s; enterApp(); }
  // If no session, ensure login page is visible
  else { showPage('loginPage'); }
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
  if (errEl) {
    errEl.classList.remove('show');
    errEl.textContent = ''; // ✅ เคลียร์ข้อความ error ที่อาจค้างอยู่
  }
}
async function enterApp() {
  await loadData(false); // show error only on first load
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
  const role = currentUser?.role || 'staff';
  const allowed = PERMISSIONS[role]?.pages || [];

  // Show/hide nav items based on allowed pages
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.dataset.page;
    el.style.display = allowed.includes(page) ? '' : 'none';
  });

  // Sync mobile bottom nav visibility with permissions
  document.querySelectorAll('.mbn-item[data-page]').forEach(el => {
    const page = el.dataset.page;
    el.style.display = allowed.includes(page) ? '' : 'none';
  });

  // Admin-only nav section (user management)
  const adminSection = document.getElementById('adminSection');
  if (adminSection) adminSection.style.display = can('users', 'view') ? '' : 'none';

  // Product add button
  const addBtn = document.getElementById('btnAddProduct');
  if (addBtn) addBtn.style.display = can('products', 'add') ? '' : 'none';

  // Export buttons
  document.querySelectorAll('.btn-export, [onclick*="exportCSV"], [onclick*="exportData"]').forEach(el => {
    el.style.display = can('transactions', 'export') ? '' : 'none';
  });

  // Role badge color on topbar
  const badge = document.getElementById('userRole');
  if (badge) {
    badge.className = 'role-pill role-' + role;
    badge.textContent = getRoleLabel(role);
  }
}

// ===== AUTO-REFRESH =====
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(async () => {
    if (!_isOnline) return; // skip if offline
    await loadData(true); // silent refresh — no error toast
    // Always refresh dashboard widgets regardless of current page
    renderStats();
    renderRecentActivity();
    renderLowStock();
    renderWithdrawChart();
    renderTopWithdraw();
    updateTxBadge();
    updateTodayStats();
    // Don't disrupt withdraw/receive if user is mid-scan or mid-form
    const _wA = document.getElementById('withdrawFormPanel')?.style.display !== 'none';
    const _rA = document.getElementById('receiveExistingPanel')?.style.display !== 'none';
    const _mid = (currentPage === 'withdraw' && _wA)
              || (currentPage === 'receive' && _rA);
    if (_mid) {
      if (currentPage === 'withdraw') renderWithdrawHist();
      else if (currentPage === 'receive') renderReceiveHist();
    } else if (currentPage === 'dashboard') {
      renderDashboard();
    } else {
      refreshCurrentView();
    }
  }, 15000); // every 15 seconds — faster sync
}

// ===== NAV =====
function showPage(id) {
  document.querySelectorAll('body > .page-view').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function navigateTo(page) {
  if (!can('page', page)) {
    showToast('warning', `คุณไม่มีสิทธิ์เข้าถึงหน้านี้`);
    return;
  }
  if (page === 'shiftReport') {
    setTimeout(() => {
      const d = document.getElementById('shiftDate');
      if (d && !d.value) d.value = getNow().slice(0,10);
      renderShiftReport();
    }, 50);
  }
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
  syncMobileNav(page);
  // Close mobile sidebar if open
  document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ==========================================
// USB RFID READER — REAL DEVICE DETECTION
// ==========================================
function initRfidReader() {
  document.addEventListener('keydown', handleRfidKey);
  // Use mousedown (not click) so button onclick fires BEFORE refocus
  document.addEventListener('mousedown', refocusRfid);
  document.addEventListener('touchend', refocusRfid);

  updateReaderStatus(false);
  readerCheckInterval = setInterval(() => {
    if (readerConnected && Date.now() - readerLastSeen > 60000) {
      updateReaderStatus(false);
    }
  }, 5000);
}

function refocusRfid(e) {
  // Don't steal focus if the user clicked a button, link, or interactive element
  const target = e?.target;
  if (target) {
    const tag = target.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (target.closest('button, a, input, select, textarea, [onclick]')) return;
  }

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
  const indicators = ['withdrawScannerStatus', 'receiveScannerStatus', 'batchScannerStatus'];
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
  else if (pid === 'batchScanView') handleBatchScan(uid);
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

  // Flash the RFID gate beam
  gate.classList.add('scanning');
  setTimeout(() => gate.classList.remove('scanning'), 1200);

  // Create belt item with product icon
  const p = findByRfid(uid);
  const icon = p ? (catMap[p.category]?.icon || 'fa-box') : 'fa-question';
  const item = document.createElement('div');
  item.className = 'belt-item';
  item.innerHTML = `<i class="fas ${icon}"></i>`;
  item.title = p ? p.name : `RFID: ${uid}`;

  const track = area.querySelector('.belt-track');
  if (track) {
    track.appendChild(item);
    // Flash scanned color when passing gate (midpoint ~1.5s into 3s animation)
    setTimeout(() => item.classList.add('scanned'), 1400);
    item.addEventListener('animationend', () => item.remove());
  }

  // Update last scan time
  const lastScan = document.getElementById('lastScanTime');
  if (lastScan) lastScan.textContent = fmtTime(getNow());
  
  // Also refresh today stats
  updateTodayStats();
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

  // Merge transactions + userLog into unified activity stream
  const txItems = transactions.slice(0, 30).map(t => {
    const iconClass = t.type === 'in' ? 'in' : t.type === 'out' ? 'out' : 'scan';
    const icon = t.type === 'in' ? 'fa-arrow-right-to-bracket' : t.type === 'out' ? 'fa-arrow-right-from-bracket' : 'fa-satellite-dish';
    const badge = t.type === 'in'
      ? `<span class="status in-type" style="font-size:10px;padding:2px 7px;">${T('tx_type_in')}</span>`
      : t.type === 'out'
      ? `<span class="status out-type" style="font-size:10px;padding:2px 7px;">${T('tx_type_out')}</span>`
      : `<span class="status" style="font-size:10px;padding:2px 7px;background:#6366f120;color:#6366f1;">SCAN</span>`;
    return { time: t.time||'', icon, iconClass, badge, title: escapeHtml(t.product||t.rfid||'-'), sub: t.qty ? `${t.qty} ${t.unit||'ชิ้น'} · ${t.user||''}` : (t.user||'') };
  });

  const logItems = userLog.slice(0, 20).map(l => {
    const iconClass = l.action.includes('เบิก') ? 'out' : l.action.includes('รับ') ? 'in' : 'scan';
    const icon = l.action.includes('เบิก') ? 'fa-arrow-right-from-bracket' : l.action.includes('รับ') ? 'fa-arrow-right-to-bracket' : l.action.includes('สแกน') ? 'fa-satellite-dish' : 'fa-circle-dot';
    const badge = `<span class="status" style="font-size:10px;padding:2px 7px;background:#f3f4f6;color:#6b7280;">${escapeHtml(l.action)}</span>`;
    return { time: l.time||'', icon, iconClass, badge, title: escapeHtml(l.user||'ระบบ'), sub: escapeHtml(l.detail||'') };
  });

  const all = [...txItems, ...logItems].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5);

  if (!all.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>${T('dash_no_activity')}</p><small>${T('dash_start_scan')}</small></div>`;
    return;
  }
  el.innerHTML = all.map(item => {
    const [date, time] = (item.time || '').split(' ');
    return `<li class="activity-item">
      <div class="activity-icon ${item.iconClass}"><i class="fas ${item.icon}"></i></div>
      <div class="activity-details">
        <strong>${item.title}</strong>
        <small>${item.badge} ${item.sub}</small>
      </div>
      <div class="activity-time">${date ? date.slice(5) : ''} ${time ? time.slice(0,5) : ''}</div>
    </li>`;
  }).join('');
}

function renderWithdrawChart() {
  const c = document.getElementById('dashWithdrawChart');
  if (!c) return;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const data = days.map(day => {
    const outQty = transactions.filter(t => t.type === 'out' && t.time && t.time.startsWith(day)).reduce((s, t) => s + t.qty, 0);
    const inQty  = transactions.filter(t => t.type === 'in'  && t.time && t.time.startsWith(day)).reduce((s, t) => s + t.qty, 0);
    const d2 = new Date(day);
    const label = `${String(d2.getDate()).padStart(2,'0')}/${String(d2.getMonth()+1).padStart(2,'0')}`;
    return { label, outQty, inQty };
  });

  const maxVal = Math.max(...data.map(d => Math.max(d.outQty, d.inQty)), 1);
  const chartH = 160;

  const bars = data.map(d => {
    const outH = Math.round((d.outQty / maxVal) * chartH);
    const inH  = Math.round((d.inQty  / maxVal) * chartH);
    const hasData = d.outQty > 0 || d.inQty > 0;
    return `<div class="dc-col">
      <div class="dc-bars">
        <div class="dc-bar-wrap">
          ${d.outQty > 0 ? `<span class="dc-val out-val">${d.outQty}</span>` : ''}
          <div class="dc-bar dc-bar-out" style="height:${outH}px" title="เบิกออก: ${d.outQty}"></div>
        </div>
        <div class="dc-bar-wrap">
          ${d.inQty > 0 ? `<span class="dc-val in-val">${d.inQty}</span>` : ''}
          <div class="dc-bar dc-bar-in" style="height:${inH}px" title="รับเข้า: ${d.inQty}"></div>
        </div>
      </div>
      <div class="dc-label${hasData ? ' dc-label-active' : ''}">${d.label}</div>
    </div>`;
  }).join('');

  const totalOut = data.reduce((s, d) => s + d.outQty, 0);
  const totalIn  = data.reduce((s, d) => s + d.inQty, 0);

  c.innerHTML = `
    <div class="dc-summary">
      <span class="dc-sum-item"><span class="dc-dot out-dot"></span>เบิกออก <strong>${totalOut}</strong> ชิ้น</span>
      <span class="dc-sum-item"><span class="dc-dot in-dot"></span>รับเข้า <strong>${totalIn}</strong> ชิ้น</span>
    </div>
    <div class="dc-chart" style="--chart-h:${chartH}px">
      ${bars}
    </div>`;
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
  transactions.filter(t => t.type === 'out').forEach(t => {
    if (t.product) counts[t.product] = (counts[t.product] || 0) + t.qty;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  if (!sorted.length) {
    c.innerHTML = `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>ยังไม่มีข้อมูลการเบิก</p><small>ข้อมูลจะแสดงหลังจากมีการเบิกสินค้า</small></div>`;
    return;
  }
  const maxQ = sorted[0][1];
  const medals = ['🥇','🥈','🥉'];
  const rankClass = ['gold','silver','bronze'];

  c.innerHTML = `<div class="tw-grid">` + sorted.map(([name, qty], i) => {
    const pct = Math.round(qty / maxQ * 100);
    const prod = products.find(p => p.name === name);
    const unit = prod?.unit || 'ชิ้น';
    return `<div class="tw-item">
      <div class="tw-rank ${rankClass[i] || ''}">${medals[i] || (i+1)}</div>
      <div class="tw-info">
        <div class="tw-name">${escapeHtml(name)}</div>
        <div class="tw-bar-track"><div class="tw-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="tw-qty"><strong>${qty.toLocaleString()}</strong><span>${unit}</span></div>
    </div>`;
  }).join('') + `</div>`;
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
  if (id && !can('products', 'edit'))   { showToast('error', 'ไม่มีสิทธิ์แก้ไขสินค้า'); return; }
  if (!id && !can('products', 'add'))   { showToast('error', 'ไม่มีสิทธิ์เพิ่มสินค้า'); return; }
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
  if (!can('products', 'delete')) { showToast('error', 'ไม่มีสิทธิ์ลบสินค้า'); return; }
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
  // Only reset scanner if no product is currently selected
  const formPanel = document.getElementById('withdrawFormPanel');
  if (!formPanel || formPanel.style.display === 'none') {
    const st = document.getElementById('withdrawScannerStatus');
    if (st) st.textContent = T('withdraw_scan_hint');
    const sid = document.getElementById('withdrawScannedId');
    if (sid) sid.textContent = '';
  }
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
  if (!can('withdraw', 'perform')) { showToast('error', 'ไม่มีสิทธิ์เบิกสินค้า'); return; }
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
  // Only reset scanner if no product/form is currently active
  const existPanel = document.getElementById('receiveExistingPanel');
  const isFormActive = existPanel && existPanel.style.display !== 'none';
  if (!isFormActive) {
    const st = document.getElementById('receiveScannerStatus');
    if (st) st.textContent = T('receive_scan_hint');
    const sid = document.getElementById('receiveScannedId');
    if (sid) sid.textContent = '';
    if (existPanel) existPanel.style.display = 'none';
  }
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
  if (!can('receive', 'perform')) { showToast('error', 'ไม่มีสิทธิ์รับสินค้าเข้า'); return; }
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
  const uid = document.getElementById('editUserId')?.value;
  if (uid && !can('users', 'edit'))   { showToast('error', 'ไม่มีสิทธิ์แก้ไขผู้ใช้'); return; }
  if (!uid && !can('users', 'add'))   { showToast('error', 'ไม่มีสิทธิ์เพิ่มผู้ใช้'); return; }
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
  if (!can('users', 'toggleActive')) { showToast('error', 'ไม่มีสิทธิ์จัดการสถานะผู้ใช้'); return; }
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


// ═══════════════════════════════════════════════════════════════
// 🔔 NOTIFICATION CENTER
// ═══════════════════════════════════════════════════════════════
let notifications = [];
let notifPanelOpen = false;

function pushNotif(type, title, body, icon = '') {
  const n = {
    id: Date.now() + Math.random(),
    type,   // 'warning' | 'danger' | 'info' | 'success'
    title,
    body,
    icon: icon || (type === 'danger' ? 'fa-triangle-exclamation' : type === 'warning' ? 'fa-circle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info'),
    time: getNow(),
    read: false,
  };
  notifications.unshift(n);
  if (notifications.length > 50) notifications.length = 50;
  renderNotifBadge();
  renderNotifList();
  // Also show a brief toast for urgent ones
  if (type === 'danger' || type === 'warning') {
    showToast(type === 'danger' ? 'error' : 'warning', `${title}: ${body}`);
  }
}

function renderNotifBadge() {
  const unread = notifications.filter(n => !n.read).length;
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  badge.textContent = unread > 9 ? '9+' : unread;
  badge.style.display = unread > 0 ? '' : 'none';
  const btn = document.getElementById('notifBtn');
  if (btn) btn.classList.toggle('has-notif', unread > 0);
}

function renderNotifList() {
  const el = document.getElementById('notifList');
  if (!el) return;
  if (!notifications.length) {
    el.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>ยังไม่มีการแจ้งเตือน</p></div>';
    return;
  }
  el.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.read ? 'read' : ''} notif-${n.type}" onclick="markNotifRead('${n.id}')">
      <div class="notif-item-icon"><i class="fas ${n.icon}"></i></div>
      <div class="notif-item-body">
        <div class="notif-item-title">${escapeHtml(n.title)}</div>
        <div class="notif-item-msg">${escapeHtml(n.body)}</div>
        <div class="notif-item-time">${fmtTime(n.time)}</div>
      </div>
      ${n.read ? '' : '<div class="notif-dot"></div>'}
    </div>`).join('');
}

function markNotifRead(id) {
  const n = notifications.find(x => String(x.id) === String(id));
  if (n) { n.read = true; renderNotifBadge(); renderNotifList(); }
}

function clearAllNotifs() {
  notifications = [];
  renderNotifBadge();
  renderNotifList();
}

function toggleNotifPanel() {
  notifPanelOpen = !notifPanelOpen;
  const panel = document.getElementById('notifPanel');
  const overlay = document.getElementById('notifOverlay');
  if (panel) panel.classList.toggle('open', notifPanelOpen);
  if (overlay) overlay.classList.toggle('open', notifPanelOpen);
  if (notifPanelOpen) {
    notifications.forEach(n => n.read = true);
    renderNotifBadge();
    renderNotifList();
  }
}

// Check for low-stock and anomalies — called after every data load
function runNotifChecks() {
  // Low stock alerts
  products.forEach(p => {
    if (p.quantity <= 0) {
      const key = `outofstock-${p.id}`;
      if (!notifications.find(n => n._key === key)) {
        const n = { _key: key };
        Object.assign(n, { id: Date.now() + Math.random(), type: 'danger', title: 'สต็อกหมด', body: `${p.name} (${p.sku}) — คงเหลือ 0 ${p.unit}`, icon: 'fa-box-open', time: getNow(), read: false });
        notifications.unshift(n);
      }
    } else if (p.minStock > 0 && p.quantity <= p.minStock) {
      const key = `lowstock-${p.id}-${p.quantity}`;
      if (!notifications.find(n => n._key === key)) {
        const n = { _key: key };
        Object.assign(n, { id: Date.now() + Math.random(), type: 'warning', title: 'สต็อกใกล้หมด', body: `${p.name} — เหลือ ${p.quantity} ${p.unit} (ขั้นต่ำ ${p.minStock})`, icon: 'fa-triangle-exclamation', time: getNow(), read: false });
        notifications.unshift(n);
      }
    }
  });
  // Unusual withdraw: single withdrawal > 50 units
  const recentBig = transactions.filter(t => t.type === 'out' && t.qty > 50).slice(0, 3);
  recentBig.forEach(t => {
    const key = `bigwithdraw-${t.id}`;
    if (!notifications.find(n => n._key === key)) {
      const n = { _key: key };
      Object.assign(n, { id: Date.now() + Math.random(), type: 'warning', title: 'เบิกจำนวนมากผิดปกติ', body: `${t.product} — ${t.qty} ชิ้น โดย ${t.user}`, icon: 'fa-circle-exclamation', time: t.time, read: false });
      notifications.unshift(n);
    }
  });
  if (notifications.length > 50) notifications.length = 50;
  renderNotifBadge();
  renderNotifList();
}


// ═══════════════════════════════════════════════════════════════
// 📦 BATCH SCAN
// ═══════════════════════════════════════════════════════════════
let batchItems = [];
let batchType = 'out';

function setBatchType(type) {
  batchType = type;
  document.getElementById('batchTypeOut').classList.toggle('active', type === 'out');
  document.getElementById('batchTypeIn').classList.toggle('active', type === 'in');
}

function renderBatch() {
  // called when navigating to batchScan page
  document.getElementById('batchUser').value = currentUser?.name || '';
}

function handleBatchScan(uid) {
  const ring = document.getElementById('batchScannerRing');
  const st = document.getElementById('batchScannerStatus');
  const sid = document.getElementById('batchScannedId');
  if (!ring || !st || !sid) return;
  ring.classList.add('scanning'); sid.textContent = uid; st.textContent = 'กำลังค้นหา...';
  setTimeout(() => {
    ring.classList.remove('scanning');
    const p = products.find(x => x.rfid === uid || x.sku === uid);
    if (!p) { st.textContent = `ไม่พบสินค้า: ${uid}`; sid.textContent = ''; return; }
    // Check duplicate
    const existing = batchItems.find(b => b.productId === p.id);
    if (existing) {
      existing.qty += 1;
      st.textContent = `เพิ่มจำนวน: ${p.name} (รวม ${existing.qty})`;
    } else {
      batchItems.push({ productId: p.id, rfid: uid, name: p.name, sku: p.sku, unit: p.unit, qty: 1, stock: p.quantity });
      st.textContent = `เพิ่ม: ${p.name}`;
    }
    sid.textContent = p.rfid;
    renderBatchTable();
  }, 600);
}

function renderBatchTable() {
  const b = document.getElementById('batchTableBody');
  const cnt = document.getElementById('batchCount');
  const btn = document.getElementById('batchConfirmBtn');
  if (!b) return;
  if (!batchItems.length) {
    b.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;"><i class="fas fa-layer-group" style="font-size:24px;display:block;margin-bottom:8px;opacity:.3;"></i>ยังไม่มีรายการ</td></tr>';
    if (cnt) cnt.textContent = '0 รายการ';
    if (btn) btn.disabled = true;
    return;
  }
  if (cnt) cnt.textContent = `${batchItems.length} รายการ`;
  if (btn) btn.disabled = false;
  b.innerHTML = batchItems.map((item, i) => {
    const warn = batchType === 'out' && item.qty > item.stock;
    return `<tr class="${warn ? 'row-warn' : ''}">
      <td>${i + 1}</td>
      <td class="product-name">${escapeHtml(item.name)}</td>
      <td style="font-family:monospace;font-size:11px;">${item.rfid}</td>
      <td>${item.stock} ${item.unit}</td>
      <td><input type="number" min="1" value="${item.qty}" style="width:64px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;text-align:center;" onchange="updateBatchQty(${i}, this.value)"></td>
      <td><button class="action-btn delete" onclick="removeBatchItem(${i})"><i class="fas fa-trash"></i></button></td>
    </tr>`;
  }).join('');
}

function updateBatchQty(idx, val) {
  if (batchItems[idx]) batchItems[idx].qty = Math.max(1, parseInt(val) || 1);
  renderBatchTable();
}

function removeBatchItem(idx) {
  batchItems.splice(idx, 1);
  renderBatchTable();
}

function clearBatch() {
  batchItems = [];
  renderBatchTable();
  const st = document.getElementById('batchScannerStatus');
  if (st) st.textContent = 'แตะ RFID เพื่อเพิ่มในรายการ';
}

async function confirmBatch() {
  if (!batchItems.length) return;
  const user = document.getElementById('batchUser').value.trim() || currentUser?.name || 'ระบบ';
  const reason = document.getElementById('batchReason').value.trim();
  // Validate stock for out type
  if (batchType === 'out') {
    const insufficient = batchItems.filter(item => item.qty > item.stock);
    if (insufficient.length) {
      showToast('error', `สต็อกไม่พอ: ${insufficient.map(i => i.name).join(', ')}`);
      return;
    }
  }
  const btn = document.getElementById('batchConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...'; }
  try {
    const now = getNow();
    for (const item of batchItems) {
      const p = products.find(x => x.id === item.productId);
      if (!p) continue;
      const newQty = batchType === 'out' ? p.quantity - item.qty : p.quantity + item.qty;
      await api('PATCH', `/products/${p.id}/quantity`, { quantity: newQty, updatedAt: now });
      const txData = { type: batchType, rfid: item.rfid, product: item.name, sku: item.sku, qty: item.qty, user, time: now, reason };
      const txResult = await api('POST', '/transactions', txData);
      p.quantity = newQty; p.updatedAt = now;
      transactions.unshift({ id: txResult.id, ...txData });
      addToLiveFeedTx(batchType, item.rfid, item.name, item.qty);
    }
    addLog(`Batch ${batchType === 'out' ? 'เบิก' : 'รับ'}`, `${batchItems.length} รายการ โดย ${user}`);
    pushNotif('success', 'Batch สำเร็จ', `${batchType === 'out' ? 'เบิก' : 'รับ'} ${batchItems.length} รายการ รวม ${batchItems.reduce((s,i)=>s+i.qty,0)} ชิ้น`);
    showToast('success', `Batch ${batchType === 'out' ? 'เบิก' : 'รับ'} สำเร็จ ${batchItems.length} รายการ`);
    clearBatch();
    syncAllViews();
  } catch (err) {
    showToast('error', err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> ยืนยัน'; }
  }
}


// ═══════════════════════════════════════════════════════════════
// 🗓️ SHIFT REPORT
// ═══════════════════════════════════════════════════════════════
let shiftFilter = 'all';

function setShiftFilter(filter, el) {
  shiftFilter = filter;
  document.querySelectorAll('#shiftReportView .filter-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderShiftReport();
}

function renderShiftReport() {
  const container = document.getElementById('shiftReportContent');
  if (!container) return;

  const dateEl = document.getElementById('shiftDate');
  const date = dateEl?.value || getNow().slice(0, 10);

  const shiftRanges = {
    all:       [0, 24],
    morning:   [6, 14],
    afternoon: [14, 22],
    night:     [22, 30], // 22-06 next day
  };
  const [hStart, hEnd] = shiftRanges[shiftFilter] || [0, 24];

  const dayTx = transactions.filter(t => {
    if (!t.time || !t.time.startsWith(date)) return false;
    const h = parseInt(t.time.slice(11, 13));
    if (shiftFilter === 'night') return h >= 22 || h < 6;
    return h >= hStart && h < hEnd;
  });

  const outTx = dayTx.filter(t => t.type === 'out');
  const inTx  = dayTx.filter(t => t.type === 'in');
  const totalOut = outTx.reduce((s, t) => s + t.qty, 0);
  const totalIn  = inTx.reduce((s, t) => s + t.qty, 0);
  const uniqueUsers = [...new Set(dayTx.map(t => t.user).filter(Boolean))];

  // Top products
  const prodCounts = {};
  outTx.forEach(t => { prodCounts[t.product] = (prodCounts[t.product] || 0) + t.qty; });
  const topProds = Object.entries(prodCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const shiftLabel = { all: 'ทั้งวัน', morning: 'กะเช้า (06:00–14:00)', afternoon: 'กะบ่าย (14:00–22:00)', night: 'กะดึก (22:00–06:00)' };

  container.innerHTML = `
    <div id="shiftReportPrintArea">
      <div class="shift-header">
        <div>
          <h2 class="shift-title"><i class="fas fa-clipboard-list"></i> รายงานกะการทำงาน</h2>
          <div class="shift-subtitle">${date} — ${shiftLabel[shiftFilter]}</div>
        </div>
        <div class="shift-meta">สร้างโดย: ${currentUser?.name || '-'} | ${getNow()}</div>
      </div>

      <div class="shift-kpi-row">
        <div class="shift-kpi out"><div class="shift-kpi-val">${totalOut.toLocaleString()}</div><div class="shift-kpi-lbl"><i class="fas fa-arrow-right-from-bracket"></i> เบิกออกรวม</div></div>
        <div class="shift-kpi in"><div class="shift-kpi-val">${totalIn.toLocaleString()}</div><div class="shift-kpi-lbl"><i class="fas fa-arrow-right-to-bracket"></i> รับเข้ารวม</div></div>
        <div class="shift-kpi tx"><div class="shift-kpi-val">${dayTx.length}</div><div class="shift-kpi-lbl"><i class="fas fa-receipt"></i> รายการทั้งหมด</div></div>
        <div class="shift-kpi user"><div class="shift-kpi-val">${uniqueUsers.length}</div><div class="shift-kpi-lbl"><i class="fas fa-users"></i> ผู้ดำเนินการ</div></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
        <div class="panel">
          <div class="panel-header"><h3><i class="fas fa-trophy text-amber"></i> สินค้าเบิกสูงสุด</h3></div>
          <div class="panel-body" style="padding:0;">
            ${topProds.length ? `<table class="data-table"><thead><tr><th>สินค้า</th><th>จำนวน</th></tr></thead><tbody>${topProds.map(([n,q]) => `<tr><td>${escapeHtml(n)}</td><td><strong>${q}</strong></td></tr>`).join('')}</tbody></table>` : '<div class="empty-state" style="padding:24px;">ไม่มีข้อมูล</div>'}
          </div>
        </div>
        <div class="panel">
          <div class="panel-header"><h3><i class="fas fa-users text-green"></i> ผู้ดำเนินการ</h3></div>
          <div class="panel-body">
            ${uniqueUsers.length ? uniqueUsers.map(u => {
              const uOut = outTx.filter(t => t.user === u).reduce((s,t) => s+t.qty, 0);
              const uIn  = inTx.filter(t => t.user === u).reduce((s,t) => s+t.qty, 0);
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                <strong>${escapeHtml(u)}</strong>
                <span style="font-size:12px;color:var(--text-muted);">เบิก ${uOut} | รับ ${uIn}</span>
              </div>`;
            }).join('') : '<div style="color:var(--text-muted);text-align:center;padding:16px;">ไม่มีข้อมูล</div>'}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3><i class="fas fa-list"></i> รายการทั้งหมด (${dayTx.length} รายการ)</h3></div>
        <div class="panel-body" style="padding:0;">
          ${dayTx.length ? `<table class="data-table">
            <thead><tr><th>เวลา</th><th>ประเภท</th><th>สินค้า</th><th>RFID</th><th>จำนวน</th><th>ผู้ดำเนินการ</th></tr></thead>
            <tbody>${dayTx.map(t => `<tr>
              <td>${fmtTime(t.time)}</td>
              <td><span class="status ${t.type === 'in' ? 'ok' : 'out-type'}">${t.type === 'in' ? 'รับเข้า' : 'เบิกออก'}</span></td>
              <td class="product-name">${escapeHtml(t.product || '-')}</td>
              <td style="font-family:monospace;font-size:11px;">${t.rfid || '-'}</td>
              <td><strong>${t.qty}</strong></td>
              <td>${escapeHtml(t.user || '-')}</td>
            </tr>`).join('')}</tbody>
          </table>` : '<div class="empty-state" style="padding:40px;">ไม่มีรายการในช่วงเวลานี้</div>'}
        </div>
      </div>
    </div>`;
}

function exportShiftPDF() {
  const area = document.getElementById('shiftReportPrintArea');
  if (!area) { showToast('error', 'ไม่พบข้อมูลรายงาน'); return; }
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>รายงานกะ</title>
  <style>
    body{font-family:sans-serif;padding:24px;color:#111;font-size:13px;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;}
    th,td{border:1px solid #ddd;padding:8px 10px;text-align:left;}
    th{background:#f5f5f5;font-weight:700;}
    .shift-kpi-row{display:flex;gap:16px;margin:16px 0;}
    .shift-kpi{flex:1;border:1px solid #ddd;border-radius:8px;padding:16px;text-align:center;}
    .shift-kpi-val{font-size:28px;font-weight:800;}
    .shift-kpi-lbl{font-size:11px;color:#666;margin-top:4px;}
    h2{margin:0 0 4px;}
    @media print{body{padding:0;}}
  </style></head><body>${area.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}



function showToast(type, msg) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const t = document.createElement('div'); t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i>${msg}`;
  c.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4000);
}
function showFormError(id, msg) { 
  const el = document.getElementById(id); 
  if (el) { 
    el.textContent = msg; 
    el.classList.add('show'); 
    setTimeout(() => { 
      el.classList.remove('show'); 
      el.textContent = ''; // ✅ เคลียร์ข้อความทิ้งเมื่อครบ 3 วินาที
    }, 3000); 
  } 
}

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

  const days = [];
  const start = new Date(from + 'T00:00:00');
  const end   = new Date(to   + 'T00:00:00');
  let cursor  = new Date(start);
  while (cursor <= end && days.length < 60) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  if (!days.length) {
    c.innerHTML = `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>${T('hist_chart_empty')}</p></div>`;
    return;
  }

  const data = days.map(day => {
    const outQty = transactions.filter(t => t.type === 'out' && t.time && t.time.startsWith(day)).reduce((s, t) => s + Number(t.qty || 0), 0);
    const inQty  = transactions.filter(t => t.type === 'in'  && t.time && t.time.startsWith(day)).reduce((s, t) => s + Number(t.qty || 0), 0);
    return { day: day.slice(5), outQty, inQty };
  });

  const max = Math.max(...data.map(d => Math.max(d.outQty, d.inQty)), 1);
  const BAR_H = 130;
  // Adaptive bar width: wider when fewer days, narrower when many
  const barW = days.length <= 14 ? 18 : days.length <= 30 ? 14 : 10;
  const groupW = barW * 2 + 10;

  const bars = data.map(d => {
    const outH = Math.max(Math.round(d.outQty / max * BAR_H), d.outQty > 0 ? 4 : 0);
    const inH  = Math.max(Math.round(d.inQty  / max * BAR_H), d.inQty  > 0 ? 4 : 0);
    return `<div class="hc-day-group" style="min-width:${groupW}px;">
      <div class="hc-bars">
        <div class="hc-bar hc-bar-out" style="height:${outH}px;width:${barW}px;" title="เบิกออก: ${d.outQty}"><span>${d.outQty || ''}</span></div>
        <div class="hc-bar hc-bar-in"  style="height:${inH}px;width:${barW}px;"  title="รับเข้า: ${d.inQty}"><span>${d.inQty  || ''}</span></div>
      </div>
      <div class="hc-day-label">${d.day}</div>
    </div>`;
  }).join('');

  c.innerHTML = `
    <div class="hc-legend">
      <span class="hc-legend-out">${T('hist_legend_out') || 'เบิกออก'}</span>
      <span class="hc-legend-in">${T('hist_legend_in') || 'รับเข้า'}</span>
    </div>
    <div class="hc-scroll-wrap">
      <div style="display:flex;align-items:flex-end;gap:8px;min-width:fit-content;padding:4px 4px 0;">
        ${bars}
      </div>
    </div>`;
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
  if (!stockSnapshots || stockSnapshots.length === 0) {
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
        <td class="product-name">${s.name || '-'}</td>
        <td>${s.sku || '-'}</td>
        <td><strong>${s.quantity || 0}</strong></td>
        <td>${diffLabel}</td>
      </tr>`;
    });
  });
  b.innerHTML = html;
}
// =========================================================
// ANALYTICS PAGE — สรุปภาพรวม
// =========================================================
// =========================================================
// ANALYTICS — Chart.js powered
// =========================================================

let _anPeriod = 14; // current period in days (default 14 to match first tab)
let _anCharts = {};  // keep chart instances to destroy on re-render

function setAnPeriod(days, btn) {
  _anPeriod = days;
  document.querySelectorAll('.an2-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Update panel title dynamically
  const titleEl = document.getElementById('anLinePeriodLabel');
  if (titleEl) titleEl.textContent = `${days} วัน`;
  renderAnalyticsLineChart();
}

function renderAnalytics() {
  renderAnalyticsKPI();
  renderAnalyticsLineChart();
  renderAnalyticsDonut();
  renderAnalyticsTopBar();
  renderAnalyticsUserBar();
  renderAnalyticsHeatmap();
  renderAnalyticsInsights();
  renderAnalyticsStockHealth();
}

// ── helpers ────────────────────────────────────────────
function destroyChart(key) {
  if (_anCharts[key]) { _anCharts[key].destroy(); delete _anCharts[key]; }
}

function getChartColors(n) {
  const palette = [
    '#7C3AED','#6366F1','#3B82F6','#10B981','#F59E0B',
    '#EF4444','#EC4899','#8B5CF6','#14B8A6','#F97316'
  ];
  return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
}

function isDark() { return false; } // Single light theme

function chartDefaults() {
  return {
    textColor: '#9EA8B5',
    gridColor: 'rgba(0,0,0,0.05)',
    tickColor: '#555C6B',
  };
}

// ── KPI ────────────────────────────────────────────────
function renderAnalyticsKPI() {
  const g = document.getElementById('analyticsKpiGrid');
  if (!g) return;
  const total    = products.reduce((s,p) => s + p.quantity, 0);
  const totalOut = transactions.filter(t=>t.type==='out').reduce((s,t)=>s+Number(t.qty||0),0);
  const totalIn  = transactions.filter(t=>t.type==='in' ).reduce((s,t)=>s+Number(t.qty||0),0);
  const low      = products.filter(p=>p.quantity<=p.minStock).length;
  const today    = getNow().slice(0,10);
  const todayOut = transactions.filter(t=>t.type==='out'&&t.time?.startsWith(today)).reduce((s,t)=>s+Number(t.qty||0),0);
  const todayIn  = transactions.filter(t=>t.type==='in' &&t.time?.startsWith(today)).reduce((s,t)=>s+Number(t.qty||0),0);
  // Week-over-week trend
  const w1start = new Date(Date.now()-14*864e5), w1end = new Date(Date.now()-7*864e5);
  const w2start = new Date(Date.now()-7*864e5);
  const weekOut1 = transactions.filter(t=>t.type==='out'&&t.time&&new Date(t.time)>=w1start&&new Date(t.time)<w1end).reduce((s,t)=>s+Number(t.qty||0),0);
  const weekOut2 = transactions.filter(t=>t.type==='out'&&t.time&&new Date(t.time)>=w2start).reduce((s,t)=>s+Number(t.qty||0),0);
  const trend = weekOut1 > 0 ? ((weekOut2-weekOut1)/weekOut1*100).toFixed(0) : null;
  const trendHtml = trend !== null
    ? `<div class="an2-kpi-trend ${Number(trend)>=0?'up':'down'}">${Number(trend)>=0?'▲':'▼'} ${Math.abs(trend)}% vs สัปดาห์ก่อน</div>`
    : '';

  const kpis = [
    { icon:'fa-boxes-stacked', label:'สต็อกรวม',       value:total.toLocaleString(),   sub:`${products.length} รายการ`,  color:'#7C3AED', accent:'var(--g-primary)' },
    { icon:'fa-arrow-right-from-bracket', label:'เบิกออกรวม', value:totalOut.toLocaleString(), sub:trendHtml||'ตลอดเวลา', color:'#EF4444', accent:'var(--g-danger)' },
    { icon:'fa-arrow-right-to-bracket',   label:'รับเข้ารวม',  value:totalIn.toLocaleString(),  sub:'ตลอดเวลา',           color:'#10B981', accent:'var(--g-success)' },
    { icon:'fa-sun', label:'วันนี้เบิก/รับ',  value:`${todayOut}/${todayIn}`, sub:'ชิ้น', color:'#F59E0B', accent:'var(--g-amber)' },
    { icon:'fa-triangle-exclamation', label:'สินค้าใกล้หมด', value:low, sub:'รายการ', color:'#F59E0B', accent:'var(--g-amber)' },
    { icon:'fa-percent', label:'อัตราหมุนเวียน', value: products.length ? (totalOut/Math.max(total,1)*100).toFixed(1)+'%' : '-', sub:'เบิก/สต็อกรวม', color:'#6366F1', accent:'var(--g-primary)' },
  ];
  g.innerHTML = kpis.map(k => `
    <div class="an2-kpi" style="--kc:${k.color};--ka:${k.accent}">
      <div class="an2-kpi-top">
        <div class="an2-kpi-icon"><i class="fas ${k.icon}"></i></div>
        <div class="an2-kpi-label">${k.label}</div>
      </div>
      <div class="an2-kpi-value">${k.value}</div>
      <div class="an2-kpi-sub">${k.sub}</div>
    </div>`).join('');
}

// ── Line chart: 30-day trend ───────────────────────────
function renderAnalyticsLineChart() {
  destroyChart('line');
  const canvas = document.getElementById('anLineChart');
  if (!canvas) return;
  const days = [];
  for (let i = _anPeriod-1; i >= 0; i--) {
    const d = new Date(Date.now() - i*864e5);
    days.push(d.toISOString().slice(0,10));
  }
  const outData = days.map(d => transactions.filter(t=>t.type==='out'&&t.time?.startsWith(d)).reduce((s,t)=>s+Number(t.qty||0),0));
  const inData  = days.map(d => transactions.filter(t=>t.type==='in' &&t.time?.startsWith(d)).reduce((s,t)=>s+Number(t.qty||0),0));
  const labels  = days.map(d => d.slice(5));
  const { textColor, gridColor, tickColor } = chartDefaults();

  _anCharts.line = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'เบิกออก',
          data: outData,
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239,68,68,0.10)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#EF4444',
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
        },
        {
          label: 'รับเข้า',
          data: inData,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.10)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#10B981',
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, font: { family: "'Plus Jakarta Sans','Noto Sans Thai',sans-serif", size: 12 }, boxWidth: 14, padding: 18 } },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#1A1D23',
          bodyColor: '#555C6B',
          borderColor: 'rgba(0,0,0,0.08)',
          borderWidth: 1, padding: 10, cornerRadius: 10,
        },
      },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: _anPeriod > 20 ? 10 : 14 }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor, font: { size: 11 } }, grid: { color: gridColor }, beginAtZero: true },
      },
    }
  });
}

// ── Doughnut: category ─────────────────────────────────
function renderAnalyticsDonut() {
  destroyChart('donut');
  const canvas = document.getElementById('anDonutChart');
  if (!canvas) return;
  const counts = {};
  transactions.filter(t=>t.type==='out').forEach(t => { const p = products.find(x=>x.name===t.product); const c = p?.category||t.product||'อื่นๆ'; counts[c]=(counts[c]||0)+Number(t.qty||0); });
  if (!Object.keys(counts).length) {
    // fallback: count by stock qty
    products.forEach(p => { const c = p.category||'อื่นๆ'; counts[c]=(counts[c]||0)+p.quantity; });
  }
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if (!entries.length) return;
  const colors = getChartColors(entries.length);
  const { textColor } = chartDefaults();

  _anCharts.donut = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(e=>e[0]),
      datasets: [{ data: entries.map(e=>e[1]), backgroundColor: colors, borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { family: "'Plus Jakarta Sans','Noto Sans Thai',sans-serif", size: 11 }, padding: 14, boxWidth: 12, usePointStyle: true, pointStyleWidth: 10 } },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#1A1D23',
          bodyColor:  '#555C6B',
          borderColor: 'rgba(0,0,0,0.08)',
          borderWidth: 1, cornerRadius: 10,
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${(ctx.parsed/ctx.dataset.data.reduce((a,b)=>a+b,0)*100).toFixed(1)}%)` }
        },
      }
    }
  });
}

// ── Horizontal bar: top 10 products ───────────────────
function renderAnalyticsTopBar() {
  destroyChart('bar');
  const canvas = document.getElementById('anBarChart');
  if (!canvas) return;
  const counts = {};
  transactions.filter(t=>t.type==='out').forEach(t => { counts[t.product]=(counts[t.product]||0)+Number(t.qty||0); });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).reverse();
  if (!sorted.length) return;
  const { textColor, gridColor, tickColor } = chartDefaults();

  _anCharts.bar = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(e=>e[0].length>16?e[0].slice(0,14)+'…':e[0]),
      datasets: [{
        label: 'จำนวนเบิก',
        data: sorted.map(e=>e[1]),
        backgroundColor: sorted.map((_,i) => `hsla(${240+i*15},65%,55%,0.75)`),
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#1A1D23',
          bodyColor: '#555C6B',
          borderColor: 'rgba(0,0,0,0.08)',
          borderWidth:1, cornerRadius:10,
        }
      },
      scales: {
        x: { ticks:{color:tickColor,font:{size:11}}, grid:{color:gridColor}, beginAtZero:true },
        y: { ticks:{color:textColor,font:{size:11}}, grid:{display:false} },
      }
    }
  });
}

// ── Bar: user activity ──────────────────────────────────
function renderAnalyticsUserBar() {
  destroyChart('user');
  const canvas = document.getElementById('anUserChart');
  if (!canvas) return;
  const counts = {};
  transactions.forEach(t => { if(t.user) counts[t.user]=(counts[t.user]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if (!sorted.length) return;
  const { textColor, gridColor, tickColor } = chartDefaults();

  _anCharts.user = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(e=>e[0]),
      datasets: [{
        label: 'จำนวน transaction',
        data: sorted.map(e=>e[1]),
        backgroundColor: '#10B981CC',
        borderRadius: 6,
        borderColor: '#10B981',
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#1A1D23',
          bodyColor: '#555C6B',
          borderColor: 'rgba(34,197,94,0.15)',
          borderWidth:1, cornerRadius:10,
        }
      },
      scales: {
        x: { ticks:{color:tickColor,font:{size:11}}, grid:{display:false} },
        y: { ticks:{color:tickColor,font:{size:11}}, grid:{color:gridColor}, beginAtZero:true },
      }
    }
  });
}

// ── Heatmap: hourly ────────────────────────────────────
function renderAnalyticsHeatmap() {
  const el = document.getElementById('anHeatmap');
  const lg = document.getElementById('anHeatLegend');
  if (!el) return;
  const hours = Array(24).fill(0);
  transactions.forEach(t => {
    if (!t.time) return;
    const h = parseInt(t.time.split(' ')[1]?.split(':')[0]);
    if (!isNaN(h) && h>=0 && h<24) hours[h]++;
  });
  const max = Math.max(...hours, 1);
  el.innerHTML = hours.map((count,h) => {
    const pct = count/max;
    const bg = count===0
      ? 'rgba(91,106,240,0.05)'
      : `rgba(91,106,240,${0.12+pct*0.72})`;
    const lbl = String(h).padStart(2,'0')+':00';
    return `<div class="an2-heat-cell" style="background:${bg}" title="${lbl} — ${count} รายการ">
      <div class="an2-heat-h">${String(h).padStart(2,'0')}</div>
      <div class="an2-heat-n">${count||''}</div>
    </div>`;
  }).join('');

  if (lg) lg.innerHTML = `<span style="font-size:11px;color:var(--txt3);">น้อย</span><div class="an2-heat-leg">${[0.05,0.25,0.5,0.75,1].map(p=>`<span style="background:rgba(91,106,240,${(0.12+p*0.72).toFixed(2)})"></span>`).join('')}</div><span style="font-size:11px;color:var(--txt3);">มาก</span>`;
}

// ── Stock health ──────────────────────────────────────
function renderAnalyticsStockHealth() {
  const el = document.getElementById('anStockHealth');
  if (!el) return;
  const total    = products.length;
  const critical = products.filter(p=>p.quantity===0).length;
  const low      = products.filter(p=>p.quantity>0&&p.quantity<=p.minStock).length;
  const ok       = total - critical - low;
  const pctOk    = total ? Math.round(ok/total*100) : 0;
  const pctLow   = total ? Math.round(low/total*100) : 0;
  const pctCrit  = total ? Math.round(critical/total*100) : 0;

  el.innerHTML = `
    <div class="an2-health-gauge">
      <div class="an2-gauge-ring">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(91,106,240,0.08)" stroke-width="14"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="#10B981" stroke-width="14"
            stroke-dasharray="${pctOk*3.14159} 314.159" stroke-dashoffset="78.54"
            stroke-linecap="round" style="transition:stroke-dasharray .8s ease"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="#F59E0B" stroke-width="14"
            stroke-dasharray="${pctLow*3.14159} 314.159" stroke-dashoffset="${78.54 - pctOk*3.14159}"
            stroke-linecap="round" style="transition:stroke-dasharray .8s ease"/>
        </svg>
        <div class="an2-gauge-center">
          <div class="an2-gauge-pct">${pctOk}%</div>
          <div class="an2-gauge-sub">ปกติ</div>
        </div>
      </div>
    </div>
    <div class="an2-health-legend">
      <div class="an2-health-item">
        <span class="an2-health-dot" style="background:#10B981"></span>
        <span class="an2-health-lbl">ปกติ</span>
        <span class="an2-health-count">${ok} รายการ</span>
      </div>
      <div class="an2-health-item">
        <span class="an2-health-dot" style="background:#F59E0B"></span>
        <span class="an2-health-lbl">ใกล้หมด</span>
        <span class="an2-health-count">${low} รายการ</span>
      </div>
      <div class="an2-health-item">
        <span class="an2-health-dot" style="background:#EF4444"></span>
        <span class="an2-health-lbl">หมดแล้ว</span>
        <span class="an2-health-count">${critical} รายการ</span>
      </div>
    </div>
    <div class="an2-health-bar">
      <div style="width:${pctOk}%;background:#10B981;border-radius:4px 0 0 4px"></div>
      <div style="width:${pctLow}%;background:#F59E0B"></div>
      <div style="width:${pctCrit}%;background:#EF4444;border-radius:0 4px 4px 0"></div>
    </div>`;
}

// ── Insights ──────────────────────────────────────────
function renderAnalyticsInsights() {
  const el = document.getElementById('anInsights');
  if (!el) return;
  const insights = [];

  // Most active day of week
  const dayCount = Array(7).fill(0);
  transactions.forEach(t => { if(t.time) dayCount[new Date(t.time).getDay()]++; });
  const maxDay = dayCount.indexOf(Math.max(...dayCount));
  const dayNames = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  if (Math.max(...dayCount)>0)
    insights.push({ icon:'fa-calendar-day', color:'#7C3AED', text:`วัน<strong>${dayNames[maxDay]}</strong>มีกิจกรรมมากที่สุด (${dayCount[maxDay]} รายการ)` });

  // Peak hour
  const hours = Array(24).fill(0);
  transactions.forEach(t => { if(t.time){ const h=parseInt(t.time.split(' ')[1]?.split(':')[0]); if(!isNaN(h)) hours[h]++; }});
  const peakH = hours.indexOf(Math.max(...hours));
  if (Math.max(...hours)>0)
    insights.push({ icon:'fa-clock', color:'#F59E0B', text:`ช่วงเวลา <strong>${String(peakH).padStart(2,'0')}:00–${String(peakH+1).padStart(2,'0')}:00</strong> มี transaction บ่อยที่สุด` });

  // Top product
  const pCounts = {};
  transactions.filter(t=>t.type==='out').forEach(t=>{pCounts[t.product]=(pCounts[t.product]||0)+Number(t.qty||0);});
  const topP = Object.entries(pCounts).sort((a,b)=>b[1]-a[1])[0];
  if (topP) insights.push({ icon:'fa-trophy', color:'#F59E0B', text:`สินค้าเบิกบ่อยที่สุด: <strong>${topP[0]}</strong> (${topP[1].toLocaleString()} ชิ้น)` });

  // Low stock warning
  const critItems = products.filter(p=>p.quantity===0);
  if (critItems.length)
    insights.push({ icon:'fa-circle-exclamation', color:'#EF4444', text:`มี <strong>${critItems.length} รายการ</strong> ที่สต็อกหมดแล้ว ควรสั่งเพิ่มด่วน` });

  // Balance ratio
  const totalOut = transactions.filter(t=>t.type==='out').reduce((s,t)=>s+Number(t.qty||0),0);
  const totalIn  = transactions.filter(t=>t.type==='in' ).reduce((s,t)=>s+Number(t.qty||0),0);
  if (totalOut && totalIn) {
    const ratio = (totalOut/totalIn).toFixed(2);
    insights.push({ icon:'fa-scale-balanced', color:'#6366F1', text:`อัตราส่วนเบิก/รับ = <strong>${ratio}</strong> — ${Number(ratio)>1.5?'เบิกสูงกว่ารับมาก ควรเพิ่มการรับเข้า':'อยู่ในระดับปกติ'}` });
  }

  if (!insights.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-lightbulb"></i><p>เพิ่มข้อมูลเพื่อดู insights</p></div>';
    return;
  }
  el.innerHTML = `<div class="an2-insights-grid">${insights.map(ins=>`
    <div class="an2-insight-card">
      <div class="an2-insight-icon" style="background:${ins.color}22;color:${ins.color}"><i class="fas ${ins.icon}"></i></div>
      <div class="an2-insight-text">${ins.text}</div>
    </div>`).join('')}</div>`;
}


// ===== MOBILE BOTTOM NAV =====
function mbnSetActive(el) {
  document.querySelectorAll('.mbn-item[data-page]').forEach(b => b.classList.remove('active'));
  if (el && el.dataset.page) el.classList.add('active');
}
// Sync bottom nav state whenever navigateTo fires
function syncMobileNav(page) {
  document.querySelectorAll('.mbn-item[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
}

// ===== UTILS =====
function getNow() { const d = new Date(); return `${d.getFullYear()}-${S(d.getMonth() + 1)}-${S(d.getDate())} ${S(d.getHours())}:${S(d.getMinutes())}:${S(d.getSeconds())}`; }
function S(n) { return String(n).padStart(2, '0'); }
function fmtTime(str) { if (!str) return '-'; try { const [date, time] = str.split(' '); const [y, m, d] = date.split('-'); return `${d}/${m} ${time ? time.slice(0, 5) : ''}`; } catch { return str; } }
