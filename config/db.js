const mysql = require("mysql2/promise");
require("dotenv").config();

let pool = null;
let isConnected = false;
let dbMode = "DISCONNECTED"; // "MYSQL" or "MOCK_FALLBACK"

// In-memory data store as fallback in case MySQL is not running or credentials mismatch
const fallbackStore = {
  rooms: [
    { id: 1, room_name: "Room 01", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() },
    { id: 2, room_name: "Room 02", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() },
    { id: 3, room_name: "Room 03", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() },
    { id: 4, room_name: "Room 04", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() },
    { id: 5, room_name: "Room 05", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() },
    { id: 6, room_name: "Room 06", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() },
    { id: 7, room_name: "Room 07", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() },
    { id: 8, room_name: "Room 08", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() },
    { id: 9, room_name: "Room 09", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() },
    { id: 10, room_name: "Room 10", door_status: "OPEN", room_status: "AVAILABLE", updated_at: new Date() }
  ],
  users: [
    { id: 1, username: "owner", password_hash: "owner123", role: "OWNER", full_name: "Restaurant Owner" },
    { id: 2, username: "manager", password_hash: "manager123", role: "MANAGER", full_name: "Branch Manager" }
  ],
  bookings: [],
  payments: [],
  door_events: [],
  audit_logs: [],
  security_alerts: []
};

let autoIncrementIds = {
  bookings: 1,
  payments: 1,
  door_events: 1,
  audit_logs: 1,
  security_alerts: 1
};

async function initDb() {
  const host = process.env.DB_HOST || "localhost";
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "restaurant_security";
  const port = process.env.DB_PORT || 3306;

  try {
    // 1. First try connecting without database to ensure database exists
    const rootConn = await mysql.createConnection({
      host,
      user,
      password,
      port: Number(port)
    });
    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
    await rootConn.end();

    // 2. Create the connection pool with the database
    pool = mysql.createPool({
      host,
      user,
      password,
      database,
      port: Number(port),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test pool connection
    await pool.query("SELECT 1");

    // 3. Ensure tables exist
    await createTables(pool);

    isConnected = true;
    dbMode = "MYSQL";
    console.log(`✅ [MySQL] Connected to database '${database}' successfully on ${host}:${port}`);
    return true;
  } catch (error) {
    console.warn(`⚠️ [MySQL Notice] Direct MySQL connection failed: ${error.message}`);
    console.warn(`⚡ [Fallback] Enabling High-Speed Local In-Memory Fallback so the server runs smoothly without interruptions.`);
    console.warn(`👉 [Tip] To connect XAMPP MySQL, start Apache & MySQL from XAMPP Control Panel or configure .env DB_PASSWORD.`);
    isConnected = false;
    dbMode = "MOCK_FALLBACK";
    return false;
  }
}

async function createTables(p) {
  // Rooms
  await p.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_name VARCHAR(50) NOT NULL UNIQUE,
      door_status ENUM('OPEN', 'CLOSED', 'UNKNOWN') NOT NULL DEFAULT 'OPEN',
      room_status ENUM('AVAILABLE', 'BOOKED', 'OCCUPIED', 'CLEANING') NOT NULL DEFAULT 'AVAILABLE',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  // Users
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('OWNER', 'MANAGER') NOT NULL,
      full_name VARCHAR(150),
      phone VARCHAR(30),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Bookings
  await p.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_code VARCHAR(30) NOT NULL UNIQUE,
      room_id INT NOT NULL,
      customer_name VARCHAR(150) NOT NULL,
      customer_phone VARCHAR(30),
      check_in DATETIME NOT NULL,
      check_out DATETIME NOT NULL,
      status ENUM('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED') NOT NULL DEFAULT 'BOOKED',
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );
  `);

  // Payments
  await p.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_method VARCHAR(40) DEFAULT 'CASH',
      payment_status ENUM('PENDING', 'PAID', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
      recorded_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );
  `);

  // Door Events
  await p.query(`
    CREATE TABLE IF NOT EXISTS door_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      door_status ENUM('OPEN', 'CLOSED') NOT NULL,
      event_time TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      source VARCHAR(50) NOT NULL DEFAULT 'TEST',
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );
  `);

  // Audit Logs
  await p.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(100),
      details JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Security Alerts
  await p.query(`
    CREATE TABLE IF NOT EXISTS security_alerts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      alert_type VARCHAR(100) NOT NULL,
      message VARCHAR(500) NOT NULL,
      status ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );
  `);

  // Seed default 10 rooms using INSERT IGNORE
  await p.query(`
    INSERT IGNORE INTO rooms (id, room_name, door_status, room_status) VALUES
    (1, 'Room 01', 'OPEN', 'AVAILABLE'),
    (2, 'Room 02', 'OPEN', 'AVAILABLE'),
    (3, 'Room 03', 'OPEN', 'AVAILABLE'),
    (4, 'Room 04', 'OPEN', 'AVAILABLE'),
    (5, 'Room 05', 'OPEN', 'AVAILABLE'),
    (6, 'Room 06', 'OPEN', 'AVAILABLE'),
    (7, 'Room 07', 'OPEN', 'AVAILABLE'),
    (8, 'Room 08', 'OPEN', 'AVAILABLE'),
    (9, 'Room 09', 'OPEN', 'AVAILABLE'),
    (10, 'Room 10', 'OPEN', 'AVAILABLE')
  `);
  console.log("🌱 Ensured default Room 01 to Room 10 exist");

  // Seed default users if empty
  const [existingUsers] = await p.query("SELECT COUNT(*) as cnt FROM users");
  if (existingUsers[0].cnt === 0) {
    await p.query(`
      INSERT INTO users (id, username, password_hash, role, full_name, phone) VALUES
      (1, 'owner', 'owner123', 'OWNER', 'Restaurant Owner', '+94771234567'),
      (2, 'manager', 'manager123', 'MANAGER', 'Shift Manager', '+94779876543')
    `);
    console.log("🌱 Seeded default Owner & Manager accounts");
  }
}

// Wrapper for query that seamlessly uses MySQL if available, or fallbackStore
const db = {
  isMySQL: () => isConnected,
  getMode: () => dbMode,
  getPool: () => pool,
  fallbackStore,
  autoIncrementIds,

  async query(sql, params = []) {
    if (isConnected && pool) {
      return await pool.query(sql, params);
    }
    // Emulated query handler for basic operations in fallback mode
    return handleFallbackQuery(sql, params);
  }
};

function handleFallbackQuery(sql, params) {
  const s = sql.trim().toUpperCase();

  if (s.startsWith("SELECT * FROM ROOMS") || s.startsWith("SELECT * FROM `ROOMS`")) {
    return [fallbackStore.rooms, []];
  }
  if (s.includes("FROM ROOMS WHERE ID =")) {
    const id = params[0];
    const room = fallbackStore.rooms.find(r => r.id === Number(id));
    return [room ? [room] : [], []];
  }
  if (s.includes("FROM SECURITY_ALERTS")) {
    const sorted = [...fallbackStore.security_alerts].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return [sorted, []];
  }
  if (s.includes("FROM AUDIT_LOGS")) {
    const sorted = [...fallbackStore.audit_logs].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return [sorted, []];
  }
  if (s.includes("FROM BOOKINGS")) {
    const sorted = [...fallbackStore.bookings].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return [sorted, []];
  }
  if (s.includes("FROM DOOR_EVENTS")) {
    const sorted = [...fallbackStore.door_events].sort((a,b) => new Date(b.event_time) - new Date(a.event_time));
    return [sorted, []];
  }
  return [[], []];
}

module.exports = {
  db,
  initDb,
  fallbackStore
};
