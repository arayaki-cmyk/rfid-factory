// =====================================================
// Tome & Tag - API Bridge
// =====================================================

async function initDashboard() {
    try {
        // 1. ดึงข้อมูลสินค้าและ Transaction จาก Backend
        const products = await api('GET', '/products');
        const transactions = await api('GET', '/transactions');
        const logs = await api('GET', '/logs');

        updateKPIs(products, transactions);
        renderLogs(logs);
        renderTrend(transactions);
        
    } catch (err) {
        console.error("Dashboard Load Error:", err);
    }
}

// อัปเดตตัวเลข 4 ช่องด้านบน
function updateKPIs(products, transactions) {
    const today = new Date().toISOString().split('T')[0];
    
    // Total Products
    document.getElementById('kpi-total-products').innerText = products.length.toLocaleString();
    
    // Low Stock (สมมติว่าน้อยกว่า 10 คือ Low)
    const lowStock = products.filter(p => Number(p.quantity) < 10).length;
    document.getElementById('kpi-low-stock').innerText = lowStock;

    // Today's In/Out
    const todayTX = transactions.filter(t => t.date === today);
    const totalIn = todayTX.filter(t => t.type === 'in').reduce((sum, t) => sum + Number(t.qty), 0);
    const totalOut = todayTX.filter(t => t.type === 'out').reduce((sum, t) => sum + Number(t.qty), 0);

    document.getElementById('kpi-today-in').innerText = totalIn;
    document.getElementById('kpi-today-out').innerText = totalOut;
}

// อัปเดต System Log (Terminal ด้านขวา)
function renderLogs(logs) {
    const container = document.getElementById('system-log-container');
    if (!container) return;

    container.innerHTML = logs.slice(0, 10).map(log => `
        <div class="flex gap-3">
            <span class="text-primary-fixed opacity-60">[${log.time || '00:00'}]</span>
            <span class="${log.event.includes('Error') ? 'text-error' : 'text-secondary-fixed'}">
                ${log.event}: ${log.details}
            </span>
        </div>
    `).join('');
}

// ฟังก์ชันจำลองการสแกน RFID (เมื่อกดปุ่ม New Scan หรือ FAB)
async function simulateScan() {
    const mockTag = "RFID-" + Math.floor(1000 + Math.random() * 9000);
    console.log("Scanning...", mockTag);
    
    // ส่งข้อมูลไปที่ Backend (ถ้ามี Endpoint รองรับ)
    // ในที่นี้เราจะแค่ Alert และ Refresh ข้อมูล
    alert(`พบ Tag ใหม่: ${mockTag}`);
    initDashboard(); 
}

// ผูก Event กับปุ่ม
document.querySelectorAll('button').forEach(btn => {
    if (btn.innerText.includes('New Scan') || btn.innerText.includes('Quick RFID Ping')) {
        btn.onclick = simulateScan;
    }
});

// เริ่มทำงานเมื่อโหลดหน้าจอ
document.addEventListener('DOMContentLoaded', initDashboard);
