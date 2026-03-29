// =====================================================
// RFID Factory — Language / i18n System
// =====================================================

let currentLang = 'th';

const LANG = {
    // ===== LOGIN =====
    login_title: { th: 'RFID Factory', en: 'RFID Factory' },
    login_subtitle: { th: 'Conveyor Belt Inventory System v3.0', en: 'Conveyor Belt Inventory System v3.0' },
    login_username_label: { th: 'ชื่อผู้ใช้', en: 'Username' },
    login_username_ph: { th: 'ชื่อผู้ใช้งาน', en: 'Enter username' },
    login_password_label: { th: 'รหัสผ่าน', en: 'Password' },
    login_password_ph: { th: 'รหัสผ่าน', en: 'Enter password' },
    login_btn: { th: 'เข้าสู่ระบบ', en: 'Login' },
    login_error: { th: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', en: 'Invalid username or password' },
    login_demo: { th: '🏭 บัญชีทดลองใช้', en: '🏭 Demo Accounts' },
    login_demo_admin: { th: 'Admin', en: 'Admin' },
    login_demo_warehouse: { th: 'คลัง', en: 'Warehouse' },
    login_demo_staff: { th: 'พนักงาน', en: 'Staff' },
    login_demo_pw: { th: 'รหัสผ่านทุกบัญชี: 1234', en: 'Password for all accounts: 1234' },

    // ===== SIDEBAR =====
    sidebar_brand: { th: 'RFID Factory', en: 'RFID Factory' },
    sidebar_brand_sub: { th: 'Conveyor Belt v3.0', en: 'Conveyor Belt v3.0' },
    conveyor_waiting: { th: 'สายพาน — รอเชื่อมต่อ', en: 'Conveyor — Waiting' },
    conveyor_online: { th: 'สายพาน — ออนไลน์', en: 'Conveyor — Online' },
    nav_main: { th: 'เมนูหลัก', en: 'Main Menu' },
    nav_dashboard: { th: 'แดชบอร์ด', en: 'Dashboard' },
    nav_products: { th: 'สินค้าทั้งหมด', en: 'All Products' },
    nav_rfid_section: { th: 'RFID & สายพาน', en: 'RFID & Conveyor' },
    nav_withdraw: { th: 'เบิกสินค้า', en: 'Withdraw' },
    nav_receive: { th: 'รับสินค้าเข้า', en: 'Receive Stock' },
    nav_reports: { th: 'รายงาน', en: 'Reports' },
    nav_transactions: { th: 'ประวัติเบิกจ่าย', en: 'Transaction History' },
    nav_history: { th: 'ข้อมูลย้อนหลัง', en: 'Historical Data' },
    nav_userlog: { th: 'Log ผู้ใช้งาน', en: 'User Logs' },
    nav_system: { th: 'จัดการระบบ', en: 'System' },
    nav_usermgmt: { th: 'จัดการผู้ใช้', en: 'User Management' },

    // ===== TOPBAR =====
    topbar_search_ph: { th: 'ค้นหาสินค้า...', en: 'Search products...' },
    topbar_theme: { th: 'เลือกธีม', en: 'Select Theme' },

    // ===== PAGE TITLES =====
    page_dashboard: { th: 'แดชบอร์ด', en: 'Dashboard' },
    page_dashboard_bread: { th: 'หน้าหลัก / ภาพรวม', en: 'Home / Overview' },
    page_products: { th: 'สินค้าทั้งหมด', en: 'All Products' },
    page_products_bread: { th: 'คลังสินค้า / รายการ', en: 'Inventory / List' },
    page_withdraw: { th: 'เบิกสินค้า', en: 'Withdraw Products' },
    page_withdraw_bread: { th: 'สายพาน / เบิกจ่าย', en: 'Conveyor / Withdraw' },
    page_receive: { th: 'รับสินค้าเข้า', en: 'Receive Stock' },
    page_receive_bread: { th: 'สายพาน / รับเข้า', en: 'Conveyor / Receive' },
    page_transactions: { th: 'ประวัติเบิกจ่าย', en: 'Transaction History' },
    page_transactions_bread: { th: 'รายงาน / ธุรกรรม', en: 'Reports / Transactions' },
    page_history: { th: 'ข้อมูลย้อนหลัง', en: 'Historical Data' },
    page_history_bread: { th: 'รายงาน / ข้อมูลย้อนหลัง', en: 'Reports / History' },
    page_userlog: { th: 'Log ผู้ใช้งาน', en: 'User Logs' },
    page_userlog_bread: { th: 'รายงาน / ประวัติ', en: 'Reports / Logs' },
    page_usermgmt: { th: 'จัดการผู้ใช้', en: 'User Management' },
    page_usermgmt_bread: { th: 'ระบบ / ผู้ใช้งาน', en: 'System / Users' },

    // ===== DASHBOARD =====
    dash_total_products: { th: 'สินค้าทั้งหมด', en: 'Total Products' },
    dash_items: { th: 'รายการ', en: 'items' },
    dash_low_stock: { th: 'สินค้าใกล้หมด', en: 'Low Stock' },
    dash_below_min: { th: 'ต่ำกว่าจุดสั่งซื้อ', en: 'Below reorder point' },
    dash_total_out: { th: 'เบิกออกทั้งหมด', en: 'Total Withdrawn' },
    dash_total_in: { th: 'รับเข้าทั้งหมด', en: 'Total Received' },
    dash_conveyor_title: { th: 'สายพานลำเลียง — RFID Gate', en: 'Conveyor Belt — RFID Gate' },
    dash_conveyor_running: { th: 'กำลังทำงาน', en: 'Running' },
    dash_conveyor_waiting: { th: 'รอเชื่อมต่อ', en: 'Waiting' },
    dash_today_out: { th: 'วันนี้เบิกออก:', en: 'Today Out:' },
    dash_today_in: { th: 'วันนี้รับเข้า:', en: 'Today In:' },
    dash_last_scan: { th: 'สแกนล่าสุด:', en: 'Last Scan:' },
    dash_live_feed: { th: 'Live Scan Feed', en: 'Live Scan Feed' },
    dash_live_wait: { th: 'รอสแกน RFID...', en: 'Waiting for RFID scan...' },
    dash_live_sub: { th: 'สินค้าที่ผ่านสายพานจะแสดงที่นี่', en: 'Products passing the conveyor will appear here' },
    dash_recent: { th: 'กิจกรรมล่าสุด', en: 'Recent Activity' },
    dash_view_all: { th: 'ดูทั้งหมด', en: 'View All' },
    dash_no_activity: { th: 'ยังไม่มีกิจกรรม', en: 'No activity yet' },
    dash_start_scan: { th: 'เริ่มสแกน RFID เพื่อเพิ่มสินค้า', en: 'Start scanning RFID to add products' },
    dash_chart_title: { th: 'กราฟการเบิกสินค้า (7 วัน)', en: 'Withdrawal Chart (7 Days)' },
    dash_low_stock_title: { th: 'สินค้าใกล้หมด', en: 'Low Stock Items' },
    dash_no_low_stock: { th: 'ไม่มีสินค้าใกล้หมด 🎉', en: 'No low stock items 🎉' },
    dash_top_withdraw: { th: 'สินค้าที่ถูกเบิกบ่อย', en: 'Most Withdrawn Products' },
    dash_no_withdraw_data: { th: 'ยังไม่มีข้อมูลการเบิก', en: 'No withdrawal data yet' },
    dash_withdrawn: { th: 'เบิก', en: 'Withdrawn' },
    dash_pieces: { th: 'ชิ้น', en: 'pcs' },

    // ===== PRODUCTS =====
    prod_search_ph: { th: 'ค้นหาสินค้า...', en: 'Search products...' },
    prod_all: { th: 'ทั้งหมด', en: 'All' },
    prod_add: { th: 'เพิ่มสินค้า', en: 'Add Product' },
    prod_no_items: { th: 'ยังไม่มีสินค้า — เพิ่มสินค้าที่เมนู "รับสินค้าเข้า"', en: 'No products — Add products via "Receive Stock"' },
    prod_th_sku: { th: 'รหัส', en: 'SKU' },
    prod_th_name: { th: 'สินค้า', en: 'Product' },
    prod_th_category: { th: 'หมวดหมู่', en: 'Category' },
    prod_th_location: { th: 'ที่เก็บ', en: 'Location' },
    prod_th_stock: { th: 'คงเหลือ', en: 'Stock' },
    prod_th_unit: { th: 'หน่วย', en: 'Unit' },
    prod_th_status: { th: 'สถานะ', en: 'Status' },
    prod_th_action: { th: 'จัดการ', en: 'Actions' },
    status_ok: { th: 'ปกติ', en: 'OK' },
    status_low: { th: 'ใกล้หมด', en: 'Low' },
    status_critical: { th: 'หมด', en: 'Out' },

    // ===== WITHDRAW =====
    withdraw_scan_title: { th: 'สแกน RFID เพื่อเบิกสินค้า', en: 'Scan RFID to Withdraw' },
    withdraw_scan_hint: { th: 'แตะบัตร RFID เพื่อเบิกสินค้า', en: 'Tap RFID card to withdraw' },
    withdraw_form_title: { th: 'ข้อมูลการเบิก', en: 'Withdrawal Details' },
    withdraw_qty: { th: 'จำนวนที่เบิก', en: 'Quantity' },
    withdraw_user: { th: 'ผู้เบิก', en: 'Requester' },
    withdraw_reason: { th: 'เหตุผล (ไม่บังคับ)', en: 'Reason (optional)' },
    withdraw_confirm: { th: 'ยืนยันเบิกสินค้า', en: 'Confirm Withdrawal' },
    withdraw_recent: { th: 'รายการเบิกล่าสุด', en: 'Recent Withdrawals' },
    withdraw_no_items: { th: 'ยังไม่มีรายการเบิก', en: 'No withdrawal records' },
    withdraw_th_time: { th: 'เวลา', en: 'Time' },
    withdraw_th_rfid: { th: 'RFID', en: 'RFID' },
    withdraw_th_product: { th: 'สินค้า', en: 'Product' },
    withdraw_th_qty: { th: 'จำนวน', en: 'Quantity' },
    withdraw_th_user: { th: 'ผู้เบิก', en: 'Requester' },
    withdraw_th_reason: { th: 'เหตุผล', en: 'Reason' },

    // ===== RECEIVE =====
    receive_scan_title: { th: 'สแกน RFID รับสินค้าเข้า', en: 'Scan RFID to Receive Stock' },
    receive_scan_hint: { th: 'แตะบัตร RFID เพื่อรับสินค้าเข้า', en: 'Tap RFID card to receive' },
    receive_qty: { th: 'จำนวนที่รับเข้า', en: 'Receive Quantity' },
    receive_confirm: { th: 'ยืนยันรับสินค้าเข้า', en: 'Confirm Receive' },
    receive_bind_title: { th: 'ผูก RFID กับสินค้าใหม่', en: 'Bind RFID to New Product' },
    receive_bind_uid: { th: 'RFID UID ที่สแกนได้:', en: 'Scanned RFID UID:' },
    receive_bind_wait: { th: 'รอสแกนบัตร...', en: 'Waiting for scan...' },
    receive_sku: { th: 'รหัสสินค้า (SKU)', en: 'Product Code (SKU)' },
    receive_name: { th: 'ชื่อสินค้า', en: 'Product Name' },
    receive_category: { th: 'หมวดหมู่', en: 'Category' },
    receive_unit: { th: 'หน่วย', en: 'Unit' },
    receive_location: { th: 'ที่เก็บ', en: 'Location' },
    receive_init_qty: { th: 'จำนวนเริ่มต้น', en: 'Initial Quantity' },
    receive_min_stock: { th: 'จุดสั่งซื้อ (Min)', en: 'Reorder Point (Min)' },
    receive_add_bind: { th: 'เพิ่มสินค้า + ผูก RFID', en: 'Add Product + Bind RFID' },
    receive_recent: { th: 'รายการรับเข้าล่าสุด', en: 'Recent Received' },
    receive_no_items: { th: 'ยังไม่มีรายการรับเข้า', en: 'No receive records' },

    // ===== TRANSACTIONS =====
    tx_search_ph: { th: 'ค้นหา...', en: 'Search...' },
    tx_all: { th: 'ทั้งหมด', en: 'All' },
    tx_out: { th: 'เบิกออก', en: 'Withdrawn' },
    tx_in: { th: 'รับเข้า', en: 'Received' },
    tx_export: { th: 'ส่งออก CSV', en: 'Export CSV' },
    tx_th_time: { th: 'เวลา', en: 'Time' },
    tx_th_type: { th: 'ประเภท', en: 'Type' },
    tx_th_rfid: { th: 'RFID UID', en: 'RFID UID' },
    tx_th_product: { th: 'สินค้า', en: 'Product' },
    tx_th_qty: { th: 'จำนวน', en: 'Qty' },
    tx_th_user: { th: 'ผู้ทำรายการ', en: 'User' },
    tx_th_note: { th: 'หมายเหตุ', en: 'Note' },
    tx_no_items: { th: 'ไม่พบรายการ', en: 'No records found' },
    tx_type_in: { th: 'รับเข้า', en: 'Received' },
    tx_type_out: { th: 'เบิกออก', en: 'Withdrawn' },
    tx_export_success: { th: 'ส่งออก CSV สำเร็จ', en: 'CSV exported successfully' },

    // ===== HISTORY =====
    hist_from: { th: 'จาก', en: 'From' },
    hist_to: { th: 'ถึง', en: 'To' },
    hist_all: { th: 'ทั้งหมด', en: 'All' },
    hist_out: { th: 'เบิกออก', en: 'Withdrawn' },
    hist_in: { th: 'รับเข้า', en: 'Received' },
    hist_search_ph: { th: 'ค้นหาสินค้า...', en: 'Search products...' },
    hist_export: { th: 'ส่งออก CSV', en: 'Export CSV' },
    hist_chart_title: { th: 'กราฟเปรียบเทียบรายวัน', en: 'Daily Comparison Chart' },
    hist_table_title: { th: 'รายการธุรกรรมย้อนหลัง', en: 'Historical Transactions' },
    hist_total_out: { th: 'เบิกออกรวม', en: 'Total Withdrawn' },
    hist_total_in: { th: 'รับเข้ารวม', en: 'Total Received' },
    hist_tx_count: { th: 'จำนวนรายการ', en: 'Total Records' },
    hist_top_product: { th: 'สินค้าเบิกมากสุด', en: 'Most Withdrawn' },
    hist_no_data: { th: 'ไม่พบรายการในช่วงเวลาที่เลือก', en: 'No records in selected period' },
    hist_chart_empty: { th: 'เลือกช่วงวันที่เพื่อดูกราฟ', en: 'Select date range to view chart' },
    hist_legend_out: { th: '■ เบิกออก', en: '■ Withdrawn' },
    hist_legend_in: { th: '■ รับเข้า', en: '■ Received' },
    hist_no_export: { th: 'ไม่มีข้อมูลให้ส่งออก', en: 'No data to export' },
    hist_export_success: { th: 'ส่งออก CSV สำเร็จ', en: 'CSV exported successfully' },
    hist_items: { th: 'รายการ', en: 'records' },
    hist_th_date: { th: 'วันที่', en: 'Date' },
    hist_th_time: { th: 'เวลา', en: 'Time' },
    hist_th_type: { th: 'ประเภท', en: 'Type' },
    hist_th_rfid: { th: 'RFID', en: 'RFID' },
    hist_th_product: { th: 'สินค้า', en: 'Product' },
    hist_th_qty: { th: 'จำนวน', en: 'Qty' },
    hist_th_user: { th: 'ผู้ทำรายการ', en: 'User' },
    hist_th_note: { th: 'หมายเหตุ', en: 'Note' },
    hist_snapshot_title: { th: 'สต็อกสินค้าย้อนหลัง (Snapshot)', en: 'Stock History (Snapshot)' },
    hist_snapshot_btn: { th: 'บันทึก Snapshot ตอนนี้', en: 'Save Snapshot Now' },
    hist_snapshot_empty: { th: 'ยังไม่มี Snapshot', en: 'No snapshots yet' },
    hist_snapshot_hint: { th: 'กด "บันทึก Snapshot" เพื่อเก็บข้อมูลสต็อกปัจจุบัน', en: 'Click "Save Snapshot" to capture current stock' },
    hist_snap_th_date: { th: 'วันที่', en: 'Date' },
    hist_snap_th_product: { th: 'สินค้า', en: 'Product' },
    hist_snap_th_sku: { th: 'รหัส', en: 'SKU' },
    hist_snap_th_qty: { th: 'คงเหลือ ณ วันนั้น', en: 'Stock on that day' },
    hist_snap_th_diff: { th: 'เทียบปัจจุบัน', en: 'vs Current' },

    // ===== USER LOG =====
    ulog_th_time: { th: 'เวลา', en: 'Time' },
    ulog_th_user: { th: 'ผู้ใช้', en: 'User' },
    ulog_th_role: { th: 'บทบาท', en: 'Role' },
    ulog_th_action: { th: 'การกระทำ', en: 'Action' },
    ulog_th_detail: { th: 'รายละเอียด', en: 'Details' },
    ulog_no_items: { th: 'ยังไม่มีบันทึก', en: 'No logs yet' },

    // ===== USER MANAGEMENT =====
    umgmt_add: { th: 'เพิ่มผู้ใช้', en: 'Add User' },
    umgmt_th_name: { th: 'ชื่อ', en: 'Name' },
    umgmt_th_username: { th: 'Username', en: 'Username' },
    umgmt_th_role: { th: 'บทบาท', en: 'Role' },
    umgmt_th_dept: { th: 'แผนก', en: 'Department' },
    umgmt_th_status: { th: 'สถานะ', en: 'Status' },
    umgmt_th_action: { th: 'จัดการ', en: 'Actions' },
    umgmt_active: { th: 'ใช้งาน', en: 'Active' },
    umgmt_inactive: { th: 'ปิดใช้งาน', en: 'Inactive' },

    // ===== MODALS =====
    modal_add_product: { th: 'เพิ่มสินค้าใหม่', en: 'Add New Product' },
    modal_edit_product: { th: 'แก้ไขสินค้า', en: 'Edit Product' },
    modal_sku: { th: 'รหัสสินค้า (SKU)', en: 'Product Code (SKU)' },
    modal_name: { th: 'ชื่อสินค้า', en: 'Product Name' },
    modal_rfid: { th: 'RFID UID', en: 'RFID UID' },
    modal_category: { th: 'หมวดหมู่', en: 'Category' },
    modal_unit: { th: 'หน่วย', en: 'Unit' },
    modal_location: { th: 'ที่เก็บ', en: 'Location' },
    modal_quantity: { th: 'จำนวนคงเหลือ', en: 'Current Stock' },
    modal_min_stock: { th: 'จุดสั่งซื้อ (Min Stock)', en: 'Reorder Point (Min Stock)' },
    modal_cancel: { th: 'ยกเลิก', en: 'Cancel' },
    modal_save: { th: 'บันทึก', en: 'Save' },
    modal_select_location: { th: '— เลือกที่เก็บ —', en: '— Select Location —' },
    modal_cat_ph: { th: 'เลือกหรือพิมพ์หมวดหมู่ใหม่', en: 'Select or type category' },
    modal_add_user: { th: 'เพิ่ม/แก้ไขผู้ใช้', en: 'Add/Edit User' },
    modal_user_name: { th: 'ชื่อ-สกุล', en: 'Full Name' },
    modal_user_username: { th: 'Username', en: 'Username' },
    modal_user_password: { th: 'รหัสผ่าน', en: 'Password' },
    modal_user_role: { th: 'บทบาท', en: 'Role' },
    modal_user_dept: { th: 'แผนก', en: 'Department' },
    modal_select: { th: '— เลือก —', en: '— Select —' },
    modal_theme_title: { th: 'เลือกธีม', en: 'Select Theme' },

    // ===== ROLES & DEPTS =====
    role_admin: { th: 'ผู้ดูแลระบบ', en: 'Admin' },
    role_warehouse: { th: 'เจ้าหน้าที่คลัง', en: 'Warehouse Staff' },
    role_staff: { th: 'ผู้เบิกสินค้า', en: 'Requester' },
    dept_warehouse: { th: 'คลังสินค้า', en: 'Warehouse' },
    dept_production: { th: 'ฝ่ายผลิต', en: 'Production' },
    dept_logistics: { th: 'โลจิสติกส์', en: 'Logistics' },
    dept_it: { th: 'ไอที', en: 'IT' },
    dept_general: { th: 'ทั่วไป', en: 'General' },

    // ===== CATEGORIES =====
    cat_electronics: { th: 'อิเล็กทรอนิกส์', en: 'Electronics' },
    cat_mechanical: { th: 'เครื่องกล', en: 'Mechanical' },
    cat_material: { th: 'วัสดุสิ้นเปลือง', en: 'Consumables' },
    cat_safety: { th: 'Safety', en: 'Safety' },

    // ===== TOASTS / MESSAGES =====
    msg_fill_all: { th: 'กรุณากรอกข้อมูลให้ครบ', en: 'Please fill in all required fields' },
    msg_product_added: { th: 'เพิ่มสินค้าสำเร็จ', en: 'Product added successfully' },
    msg_product_edited: { th: 'แก้ไขสินค้าสำเร็จ', en: 'Product updated successfully' },
    msg_product_deleted: { th: 'ลบสินค้าสำเร็จ', en: 'Product deleted successfully' },
    msg_confirm_delete: { th: 'ลบสินค้า', en: 'Delete product' },
    msg_specify_qty: { th: 'กรุณาระบุจำนวน', en: 'Please specify quantity' },
    msg_insufficient: { th: 'สินค้าคงเหลือไม่เพียงพอ', en: 'Insufficient stock' },
    msg_remaining: { th: 'เหลือ', en: 'remaining' },
    msg_specify_user: { th: 'กรุณาระบุผู้เบิก', en: 'Please specify requester' },
    msg_withdraw_success: { th: 'สำเร็จ', en: 'Success' },
    msg_receive_success: { th: 'เข้าคลังสำเร็จ', en: 'received successfully' },
    msg_rfid_dup: { th: 'RFID UID นี้ถูกผูกกับสินค้าอื่นแล้ว', en: 'This RFID UID is already bound' },
    msg_rfid_new: { th: 'RFID ใหม่! กรอกข้อมูลเพื่อเพิ่มสินค้า', en: 'New RFID! Fill in product details' },
    msg_rfid_not_found: { th: 'ไม่พบสินค้าสำหรับ RFID', en: 'No product found for RFID' },
    msg_user_dup: { th: 'ชื่อผู้ใช้ซ้ำ', en: 'Username already exists' },
    msg_user_added: { th: 'เพิ่มผู้ใช้สำเร็จ', en: 'User added successfully' },
    msg_user_edited: { th: 'แก้ไขสำเร็จ', en: 'User updated successfully' },
    msg_theme_changed: { th: 'เปลี่ยนธีมเป็น', en: 'Theme changed to' },
    msg_snapshot_saved: { th: 'บันทึก Snapshot สต็อกวันที่', en: 'Stock snapshot saved for' },
    msg_snapshot_items: { th: 'สินค้า', en: 'products' },
    msg_scan_found: { th: 'สแกนพบ', en: 'Scan found' },
    msg_scan_stock: { th: 'คงเหลือ', en: 'Stock' },
    msg_found: { th: 'พบ', en: 'Found' },
    msg_not_found_in_system: { th: 'ไม่พบในระบบ, เพิ่มสินค้าใหม่ด้านล่าง', en: 'Not found, add new product below' },
    msg_searching: { th: 'กำลังค้นหา...', en: 'Searching...' },
    msg_receiving_signal: { th: 'กำลังรับสัญญาณ...', en: 'Receiving signal...' },
    msg_scan_rfid: { th: 'รอสแกน...', en: 'Waiting for scan...' },

    // ===== ANALYTICS =====
    nav_analytics: { th: 'สรุปภาพรวม', en: 'Analytics' },
    page_analytics: { th: 'สรุปภาพรวม', en: 'Analytics Overview' },
    page_analytics_bread: { th: 'รายงาน / สรุปภาพรวม', en: 'Reports / Analytics' },
    an_daily_title: { th: 'เบิกออก vs รับเข้า (14 วัน)', en: 'Withdrawn vs Received (14 Days)' },
    an_cat_title: { th: 'สัดส่วนหมวดหมู่', en: 'Category Distribution' },
    an_top_title: { th: 'Top 10 สินค้าเบิกมากสุด', en: 'Top 10 Most Withdrawn' },
    an_user_title: { th: 'กิจกรรมตามผู้ใช้', en: 'Activity by User' },
    an_hourly_title: { th: 'ความถี่ตามช่วงเวลา', en: 'Activity by Hour' },
    an_kpi_stock: { th: 'สต็อกทั้งหมด', en: 'Total Stock' },
    an_kpi_products: { th: 'รายการสินค้า', en: 'Product Items' },
    an_kpi_out: { th: 'เบิกออกรวม', en: 'Total Withdrawn' },
    an_kpi_in: { th: 'รับเข้ารวม', en: 'Total Received' },
    an_kpi_low: { th: 'สินค้าใกล้หมด', en: 'Low Stock' },
    an_kpi_today: { th: 'ธุรกรรมวันนี้', en: "Today's Transactions" },
    an_donut_total: { th: 'ทั้งหมด', en: 'Total' },
    an_user_txs: { th: 'รายการ', en: 'transactions' },
    an_no_data: { th: 'ยังไม่มีข้อมูล', en: 'No data yet' },

    // ===== MISC =====
    btn_logout: { th: 'ออกจากระบบ', en: 'Logout' },
    received: { th: 'รับเข้า', en: 'Received' },
    withdrawn: { th: 'เบิกออก', en: 'Withdrawn' },
    product_added_new: { th: 'เพิ่มสินค้าใหม่', en: 'New product added' },
    lang_btn: { th: 'EN', en: 'TH' },
    lang_tooltip_th: { th: 'Switch to English', en: 'เปลี่ยนเป็นภาษาไทย' },
};

// Translation helper
function T(key) {
    const entry = LANG[key];
    if (!entry) return key;
    return entry[currentLang] || entry['th'] || key;
}

// Get roleLabel/deptLabel using current language
function getRoleLabel(role) {
    const map = { admin: 'role_admin', warehouse: 'role_warehouse', staff: 'role_staff' };
    return map[role] ? T(map[role]) : role;
}
function getDeptLabel(dept) {
    const map = { warehouse: 'dept_warehouse', production: 'dept_production', logistics: 'dept_logistics', it: 'dept_it', general: 'dept_general' };
    return map[dept] ? T(map[dept]) : dept || '-';
}

// Set language and refresh all UI
function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('rfid_lang', lang);
    document.documentElement.setAttribute('lang', lang === 'th' ? 'th' : 'en');
    applyStaticTranslations();
    if (currentUser) {
        updateUserDisplay();
        syncAllViews();
    }
    // Update lang button
    const langBtn = document.getElementById('langBtn');
    if (langBtn) {
        langBtn.textContent = T('lang_btn');
        langBtn.title = T('lang_tooltip_th');
    }
    const langBtnSidebar = document.getElementById('langBtnSidebar');
    if (langBtnSidebar) {
        langBtnSidebar.textContent = currentLang === 'th' ? 'EN' : 'TH';
    }
}

function toggleLanguage() {
    setLanguage(currentLang === 'th' ? 'en' : 'th');
}

function loadLanguage() {
    const saved = localStorage.getItem('rfid_lang') || 'th';
    currentLang = saved;
    document.documentElement.setAttribute('lang', saved === 'th' ? 'th' : 'en');
}

// Apply translations to HTML elements with data-i18n attribute
function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = T(key);
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
        } else if (el.tagName === 'OPTION') {
            el.textContent = text;
        } else {
            // Preserve child elements (like <i> icons)
            const icon = el.querySelector('i.fas, i.fab, i.far');
            const badge = el.querySelector('.badge');
            if (icon) {
                const iconClone = icon.cloneNode(true);
                el.textContent = ' ' + text;
                el.prepend(iconClone);
                if (badge) el.appendChild(badge);
            } else {
                el.textContent = text;
            }
        }
    });
    // Update placeholders with data-i18n-ph
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.placeholder = T(el.getAttribute('data-i18n-ph'));
    });
    // Update title attributes with data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = T(el.getAttribute('data-i18n-title'));
    });
}
