// =====================================================
// RFID Factory — Express Server
// =====================================================
const express = require('express');
const cors = require('cors');
const path = require('path');
const { dao } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== AUTH =====
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        const user = await dao.getUserByCredentials(username, password);
        if (!user) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PRODUCTS =====
app.get('/api/products', async (req, res) => {
    try { res.json(await dao.getAllProducts()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/products', async (req, res) => {
    try {
        const { sku, name, rfid, category, unit, location, quantity, minStock, updatedAt } = req.body;
        if (!sku || !name) return res.status(400).json({ error: 'กรุณากรอกรหัสและชื่อสินค้า' });
        res.json(await dao.insertProduct({ sku, name, rfid: rfid || '', category: category || '', unit: unit || 'ชิ้น', location: location || '', quantity: quantity || 0, minStock: minStock || 0, updatedAt: updatedAt || '' }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/products/:id', async (req, res) => {
    try {
        const result = await dao.updateProduct(parseInt(req.params.id), req.body);
        if (!result) return res.status(404).json({ error: 'ไม่พบสินค้า' });
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/products/:id/quantity', async (req, res) => {
    try {
        const { quantity, updatedAt } = req.body;
        if (quantity === undefined) return res.status(400).json({ error: 'กรุณาระบุจำนวน' });
        res.json(await dao.updateProductQty(parseInt(req.params.id), quantity, updatedAt || ''));
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/products/:id', async (req, res) => {
    try { await dao.deleteProduct(parseInt(req.params.id)); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== TRANSACTIONS =====
app.get('/api/transactions', async (req, res) => {
    try { res.json(await dao.getAllTransactions()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/transactions', async (req, res) => {
    try {
        const { type, rfid, product, sku, qty, user, time, reason } = req.body;
        res.json(await dao.insertTransaction({ type: type || 'out', rfid: rfid || '', product: product || '', sku: sku || '', qty: qty || 0, user: user || '', time: time || '', reason: reason || '' }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== USERS =====
app.get('/api/users', async (req, res) => {
    try { res.json(await dao.getAllUsers()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/users', async (req, res) => {
    try {
        const { name, username, password, role, dept } = req.body;
        if (!name || !username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
        const users = await dao.getAllUsers();
        if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Username ซ้ำ' });
        res.json(await dao.insertUser({ name, username, password, role: role || 'staff', dept: dept || 'general', active: true }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/users/:id', async (req, res) => {
    try {
        const result = await dao.updateUser(parseInt(req.params.id), req.body);
        if (!result) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/users/:id/toggle', async (req, res) => {
    try {
        const result = await dao.toggleUserActive(parseInt(req.params.id));
        res.json({ success: true, active: result?.active });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== LOGS =====
app.get('/api/logs', async (req, res) => {
    try { res.json(await dao.getAllLogs()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/logs', async (req, res) => {
    try {
        const { time, user, role, action, detail } = req.body;
        await dao.insertLog({ time: time || '', user: user || '', role: role || '', action: action || '', detail: detail || '' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SNAPSHOTS =====
app.get('/api/snapshots', async (req, res) => {
    try { res.json(await dao.getAllSnapshots()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/snapshots', async (req, res) => {
    try {
        const { date, data } = req.body;
        if (!date) return res.status(400).json({ error: 'กรุณาระบุวันที่' });
        res.json(await dao.upsertSnapshot(date, data || []));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SPA FALLBACK =====
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START =====
app.listen(PORT, () => {
    console.log(`🏭 RFID Factory server running at http://localhost:${PORT}`);
});
