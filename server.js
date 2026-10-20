const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { db, initDb, fallbackStore } = require("./config/db");
const {
  processDoorEvent,
  triggerSecurityAlert,
  recordAuditLog,
  registerSseClient,
  removeSseClient,
  broadcastEvent
} = require("./services/securityEngine");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "public")));

// Direct Friendly Portal Routes
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/manager", (req, res) => res.sendFile(path.join(__dirname, "public", "manager.html")));
app.get("/owner", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ==========================================
// 1. Health & Status
// ==========================================
app.get("/api/health", async (req, res) => {
  res.json({
    status: "ONLINE",
    service: "The Ehelepola Hotel - Room Security & Booking Verification System",
    dbEngine: db.isMySQL() ? "MySQL / MariaDB (Active)" : "High-Speed Local Fallback Engine",
    isMySQLConnected: db.isMySQL(),
    time: new Date().toISOString(),
    ownerPhone: process.env.OWNER_PHONE || "+94770000000"
  });
});

// Real-Time Server-Sent Events for instant live alerts on Owner Dashboard
app.get("/api/events/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  registerSseClient(res);

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: "CONNECTED", message: "Live Security Stream Connected" })}\n\n`);

  req.on("close", () => {
    removeSseClient(res);
  });
});

// ==========================================
// 2. Rooms API (Room 01 - Room 05)
// ==========================================
app.get("/api/rooms", async (req, res) => {
  try {
    let rooms = [];
    if (db.isMySQL()) {
      const [rows] = await db.getPool().query("SELECT * FROM rooms ORDER BY id ASC");
      rooms = rows;
    } else {
      rooms = fallbackStore.rooms;
    }

    // Attach active booking and open alert counts to each room
    const enrichedRooms = await Promise.all(
      rooms.map(async room => {
        let activeBooking = null;
        let alertCount = 0;

        if (db.isMySQL()) {
          const [bookings] = await db.getPool().query(
            `SELECT * FROM bookings 
             WHERE room_id = ? AND status IN ('BOOKED', 'CHECKED_IN') 
             ORDER BY id DESC LIMIT 1`,
            [room.id]
          );
          activeBooking = bookings[0] || null;

          const [alerts] = await db.getPool().query(
            "SELECT COUNT(*) as cnt FROM security_alerts WHERE room_id = ? AND status = 'OPEN'",
            [room.id]
          );
          alertCount = alerts[0].cnt;
        } else {
          activeBooking = fallbackStore.bookings.find(
            b => b.room_id === room.id && ["BOOKED", "CHECKED_IN"].includes(b.status)
          ) || null;

          alertCount = fallbackStore.security_alerts.filter(
            a => a.room_id === room.id && a.status === "OPEN"
          ).length;
        }

        return {
          ...room,
          active_booking: activeBooking,
          open_alerts_count: alertCount
        };
      })
    );

    res.json(enrichedRooms);
  } catch (error) {
    console.error("Error loading rooms:", error);
    res.status(500).json({ error: "Unable to load rooms", details: error.message });
  }
});

// ==========================================
// 3. Door Sensor Events API (Hardware / Simulator)
// ==========================================
app.post("/api/door-events", async (req, res) => {
  try {
    const { room_id, door_status, source } = req.body;

    if (!room_id || !door_status) {
      return res.status(400).json({ error: "room_id and door_status ('OPEN' or 'CLOSED') are required" });
    }

    const result = await processDoorEvent(
      Number(room_id),
      door_status,
      source || "PST_G30_SENSOR"
    );

    res.status(200).json({
      success: true,
      message: `Door event processed for Room ID ${room_id}: ${door_status}`,
      data: result
    });
  } catch (error) {
    console.error("Error processing door event:", error);
    res.status(500).json({ error: "Failed to process door event", details: error.message });
  }
});

app.get("/api/door-events", async (req, res) => {
  try {
    if (db.isMySQL()) {
      const [rows] = await db.getPool().query(
        `SELECT de.*, r.room_name 
         FROM door_events de 
         JOIN rooms r ON de.room_id = r.id 
         ORDER BY de.id DESC LIMIT 50`
      );
      return res.json(rows);
    } else {
      const enriched = fallbackStore.door_events.slice(0, 50).map(de => {
        const room = fallbackStore.rooms.find(r => r.id === de.room_id);
        return { ...de, room_name: room ? room.room_name : `Room ${de.room_id}` };
      });
      return res.json(enriched);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to load door events", details: error.message });
  }
});

// ==========================================
// 4. Bookings API (Manager Actions)
// ==========================================
app.get("/api/bookings", async (req, res) => {
  try {
    if (db.isMySQL()) {
      const [rows] = await db.getPool().query(
        `SELECT b.*, r.room_name, p.amount, p.payment_method, p.payment_status 
         FROM bookings b
         JOIN rooms r ON b.room_id = r.id
         LEFT JOIN payments p ON p.booking_id = b.id
         ORDER BY b.id DESC`
      );
      return res.json(rows);
    } else {
      const result = fallbackStore.bookings.map(b => {
        const room = fallbackStore.rooms.find(r => r.id === b.room_id);
        const payment = fallbackStore.payments.find(p => p.booking_id === b.id);
        return {
          ...b,
          room_name: room ? room.room_name : `Room ${b.room_id}`,
          amount: payment ? payment.amount : 0,
          payment_method: payment ? payment.payment_method : "CASH",
          payment_status: payment ? payment.payment_status : "PENDING"
        };
      });
      return res.json(result);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to load bookings", details: error.message });
  }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const {
      room_id,
      customer_name,
      customer_nic,
      customer_phone,
      check_in,
      check_out,
      amount,
      payment_method,
      payment_status,
      created_by
    } = req.body;

    if (!room_id || !customer_name) {
      return res.status(400).json({ error: "room_id and customer_name are required" });
    }

    const bookingCode = "BK-" + Date.now().toString().slice(-6);
    const inTime = check_in ? new Date(check_in) : new Date();
    const outTime = check_out ? new Date(check_out) : new Date(Date.now() + 3 * 3600 * 1000); // 3 hours later

    let bookingId = null;

    if (db.isMySQL()) {
      const [bResult] = await db.getPool().query(
        `INSERT INTO bookings (booking_code, room_id, customer_name, customer_phone, check_in, check_out, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'BOOKED', ?)`,
        [bookingCode, room_id, customer_name, customer_phone || "", inTime, outTime, created_by || 2]
      );
      bookingId = bResult.insertId;

      // Update room status
      await db.getPool().query("UPDATE rooms SET room_status = 'BOOKED' WHERE id = ?", [room_id]);

      // Insert payment record
      if (amount) {
        await db.getPool().query(
          `INSERT INTO payments (booking_id, amount, payment_method, payment_status, recorded_by)
           VALUES (?, ?, ?, ?, ?)`,
          [bookingId, amount, payment_method || "CASH", payment_status || "PENDING", created_by || 2]
        );
      }
    } else {
      bookingId = fallbackStore.bookings.length + 1;
      const newBooking = {
        id: bookingId,
        booking_code: bookingCode,
        room_id: Number(room_id),
        customer_name,
        customer_nic: customer_nic || "",
        customer_phone: customer_phone || "",
        check_in: inTime,
        check_out: outTime,
        status: "BOOKED",
        created_by: created_by || 2,
        created_at: new Date()
      };
      fallbackStore.bookings.unshift(newBooking);

      const room = fallbackStore.rooms.find(r => r.id === Number(room_id));
      if (room) room.room_status = "BOOKED";

      if (amount) {
        fallbackStore.payments.unshift({
          id: fallbackStore.payments.length + 1,
          booking_id: bookingId,
          amount: Number(amount),
          payment_method: payment_method || "CASH",
          payment_status: payment_status || "PENDING",
          recorded_by: created_by || 2,
          created_at: new Date()
        });
      }
    }

    // Tamper-proof audit logging
    await recordAuditLog(created_by || 2, "BOOKING_CREATED", "BOOKING", bookingId, {
      bookingCode,
      roomId: room_id,
      customerName: customer_name,
      bookingType: req.body.booking_type || "WALK_IN",
      checkIn: inTime.toISOString(),
      checkOut: outTime.toISOString(),
      amount: amount || 0,
      paymentStatus: payment_status || "PENDING"
    });

    res.status(201).json({
      success: true,
      message: `Booking created successfully with Code: ${bookingCode}`,
      booking: { id: bookingId, booking_code: bookingCode }
    });
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ error: "Failed to create booking", details: error.message });
  }
});

// Check-in
app.patch("/api/bookings/:id/check-in", async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    let roomId = null;
    let customerName = "Guest";
    let bookingCode = "";
    let roomName = "";

    if (db.isMySQL()) {
      const [b] = await db.getPool().query("SELECT * FROM bookings WHERE id = ?", [bookingId]);
      if (!b.length) return res.status(404).json({ error: "Booking not found" });
      roomId = b[0].room_id;
      customerName = b[0].customer_name;
      bookingCode = b[0].booking_code;

      const [r] = await db.getPool().query("SELECT * FROM rooms WHERE id = ?", [roomId]);
      roomName = r.length ? r[0].room_name : `Room ${roomId}`;

      await db.getPool().query("UPDATE bookings SET status = 'CHECKED_IN' WHERE id = ?", [bookingId]);
      await db.getPool().query("UPDATE rooms SET room_status = 'OCCUPIED', door_status = 'CLOSED' WHERE id = ?", [roomId]);
      await db.getPool().query("INSERT INTO door_events (room_id, door_status, source) VALUES (?, 'CLOSED', 'FRONT_DESK_CHECKIN')", [roomId]);
    } else {
      const b = fallbackStore.bookings.find(item => item.id === bookingId);
      if (!b) return res.status(404).json({ error: "Booking not found" });
      b.status = "CHECKED_IN";
      roomId = b.room_id;
      customerName = b.customer_name;
      bookingCode = b.booking_code;

      const room = fallbackStore.rooms.find(r => r.id === roomId);
      if (room) {
        room.room_status = "OCCUPIED";
        room.door_status = "CLOSED";
        roomName = room.room_name;
      }
      fallbackStore.door_events.unshift({
        id: fallbackStore.door_events.length + 1,
        room_id: Number(roomId),
        door_status: "CLOSED",
        source: "FRONT_DESK_CHECKIN",
        event_time: new Date()
      });
    }

    // Audit log
    await recordAuditLog(2, "CUSTOMER_CHECKED_IN", "BOOKING", bookingId, { roomId, customerName });

    // 🔔 Send Alarm & SMS to Owner!
    const checkInMsg = `🔔 CHECK-IN ALARM: ${roomName} Checked-In by Manager & Door CLOSED! Guest: ${customerName} | Code: ${bookingCode}.`;
    await triggerSecurityAlert(roomId, "CHECK_IN_DOOR_CLOSED", checkInMsg, "INFO");

    // Broadcast room update to Owner Dashboard
    broadcastEvent("ROOM_UPDATE", {
      roomId,
      roomName,
      doorStatus: "CLOSED",
      roomStatus: "OCCUPIED"
    });

    res.json({ success: true, message: "Customer checked in and Door marked CLOSED. Owner alert sent." });
  } catch (error) {
    res.status(500).json({ error: "Check-in failed", details: error.message });
  }
});

// Check-out
app.patch("/api/bookings/:id/check-out", async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    let roomId = null;
    let customerName = "Guest";
    let roomName = "";

    if (db.isMySQL()) {
      const [b] = await db.getPool().query("SELECT * FROM bookings WHERE id = ?", [bookingId]);
      if (!b.length) return res.status(404).json({ error: "Booking not found" });
      roomId = b[0].room_id;
      customerName = b[0].customer_name;

      const [r] = await db.getPool().query("SELECT * FROM rooms WHERE id = ?", [roomId]);
      roomName = r.length ? r[0].room_name : `Room ${roomId}`;

      await db.getPool().query("UPDATE bookings SET status = 'CHECKED_OUT' WHERE id = ?", [bookingId]);
      await db.getPool().query("UPDATE rooms SET room_status = 'CLEANING', door_status = 'OPEN' WHERE id = ?", [roomId]);
      await db.getPool().query("INSERT INTO door_events (room_id, door_status, source) VALUES (?, 'OPEN', 'FRONT_DESK_CHECKOUT')", [roomId]);
    } else {
      const b = fallbackStore.bookings.find(item => item.id === bookingId);
      if (!b) return res.status(404).json({ error: "Booking not found" });
      b.status = "CHECKED_OUT";
      roomId = b.room_id;
      customerName = b.customer_name;

      const room = fallbackStore.rooms.find(r => r.id === roomId);
      if (room) {
        room.room_status = "CLEANING";
        room.door_status = "OPEN";
        roomName = room.room_name;
      }
      fallbackStore.door_events.unshift({
        id: fallbackStore.door_events.length + 1,
        room_id: Number(roomId),
        door_status: "OPEN",
        source: "FRONT_DESK_CHECKOUT",
        event_time: new Date()
      });
    }

    // Audit log
    await recordAuditLog(2, "CUSTOMER_CHECKED_OUT", "BOOKING", bookingId, { roomId, customerName });

    // 🚪 Send Alarm & SMS to Owner!
    const checkOutMsg = `🚪 CHECK-OUT ALARM: ${roomName} Checked-Out by Manager & Door OPENED! Guest (${customerName}) departed.`;
    await triggerSecurityAlert(roomId, "CHECK_OUT_DOOR_OPENED", checkOutMsg, "NOTICE");

    // Broadcast room update to Owner Dashboard
    broadcastEvent("ROOM_UPDATE", {
      roomId,
      roomName,
      doorStatus: "OPEN",
      roomStatus: "CLEANING"
    });

    // Automatically transition from CLEANING to AVAILABLE after 15 minutes if not manually marked
    setTimeout(async () => {
      try {
        let currentStatus = "CLEANING";
        if (db.isMySQL()) {
          const [cur] = await db.getPool().query("SELECT room_status FROM rooms WHERE id = ?", [roomId]);
          if (cur.length) currentStatus = cur[0].room_status;
        } else {
          const cur = fallbackStore.rooms.find(r => r.id === roomId);
          if (cur) currentStatus = cur.room_status;
        }
        if (currentStatus === "CLEANING") {
          if (db.isMySQL()) {
            await db.getPool().query("UPDATE rooms SET room_status = 'AVAILABLE', door_status = 'CLOSED' WHERE id = ?", [roomId]);
          } else {
            const rm = fallbackStore.rooms.find(r => r.id === roomId);
            if (rm) { rm.room_status = "AVAILABLE"; rm.door_status = "CLOSED"; }
          }
          broadcastEvent("ROOM_UPDATE", {
            roomId,
            roomName,
            doorStatus: "CLOSED",
            roomStatus: "AVAILABLE"
          });
        }
      } catch (err) {
        console.error("Auto clean timer error:", err);
      }
    }, 15 * 60 * 1000);

    res.json({ success: true, message: "Customer checked out and Door marked OPEN. Owner alert sent." });
  } catch (error) {
    res.status(500).json({ error: "Check-out failed", details: error.message });
  }
});

// Mark Room Available (After Housekeeping / Cleaning)
app.patch("/api/rooms/:id/mark-available", async (req, res) => {
  try {
    const roomId = Number(req.params.id);
    let roomName = `Room ${roomId}`;

    if (db.isMySQL()) {
      const [r] = await db.getPool().query("SELECT * FROM rooms WHERE id = ?", [roomId]);
      if (r.length) roomName = r[0].room_name;
      await db.getPool().query("UPDATE rooms SET room_status = 'AVAILABLE', door_status = 'CLOSED' WHERE id = ?", [roomId]);
    } else {
      const room = fallbackStore.rooms.find(r => r.id === roomId);
      if (room) {
        room.room_status = "AVAILABLE";
        room.door_status = "CLOSED";
        roomName = room.room_name;
      }
    }

    await recordAuditLog(2, "ROOM_CLEANING_COMPLETED", "ROOM", roomId, { roomName, status: "AVAILABLE" });

    broadcastEvent("ROOM_UPDATE", {
      roomId,
      roomName,
      doorStatus: "CLOSED",
      roomStatus: "AVAILABLE"
    });

    res.json({ success: true, message: `${roomName} is now marked AVAILABLE!` });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark room available", details: error.message });
  }
});

// Cancel Booking
app.patch("/api/bookings/:id/cancel", async (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const { reason } = req.body;
    let roomId = null;

    if (db.isMySQL()) {
      const [b] = await db.getPool().query("SELECT * FROM bookings WHERE id = ?", [bookingId]);
      if (!b.length) return res.status(404).json({ error: "Booking not found" });
      roomId = b[0].room_id;

      await db.getPool().query("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?", [bookingId]);
      await db.getPool().query("UPDATE rooms SET room_status = 'AVAILABLE' WHERE id = ?", [roomId]);
    } else {
      const b = fallbackStore.bookings.find(item => item.id === bookingId);
      if (!b) return res.status(404).json({ error: "Booking not found" });
      b.status = "CANCELLED";
      roomId = b.room_id;

      const room = fallbackStore.rooms.find(r => r.id === roomId);
      if (room) room.room_status = "AVAILABLE";
    }

    await recordAuditLog(2, "BOOKING_CANCELLED", "BOOKING", bookingId, {
      roomId,
      reason: reason || "Manager cancelled"
    });

    res.json({ success: true, message: "Booking cancelled and logged to Audit Trail." });
  } catch (error) {
    res.status(500).json({ error: "Cancellation failed", details: error.message });
  }
});

// ==========================================
// 5. Security Alerts API (Owner Inspection)
// ==========================================
app.get("/api/alerts", async (req, res) => {
  try {
    if (db.isMySQL()) {
      const [rows] = await db.getPool().query(
        `SELECT sa.*, r.room_name 
         FROM security_alerts sa 
         JOIN rooms r ON sa.room_id = r.id 
         ORDER BY sa.id DESC LIMIT 50`
      );
      return res.json(rows);
    } else {
      const enriched = fallbackStore.security_alerts.slice(0, 50).map(a => {
        const room = fallbackStore.rooms.find(r => r.id === a.room_id);
        return { ...a, room_name: room ? room.room_name : `Room ${a.room_id}` };
      });
      return res.json(enriched);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to load alerts", details: error.message });
  }
});

app.patch("/api/alerts/:id/resolve", async (req, res) => {
  try {
    const alertId = Number(req.params.id);
    const { action_taken } = req.body;

    if (db.isMySQL()) {
      await db.getPool().query(
        "UPDATE security_alerts SET status = 'RESOLVED' WHERE id = ?",
        [alertId]
      );
    } else {
      const alert = fallbackStore.security_alerts.find(a => a.id === alertId);
      if (alert) alert.status = "RESOLVED";
    }

    await recordAuditLog(1, "SECURITY_ALERT_RESOLVED", "ALERT", alertId, {
      actionTaken: action_taken || "Owner acknowledged and resolved alert"
    });

    res.json({ success: true, message: "Alert marked as RESOLVED by Owner." });
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve alert", details: error.message });
  }
});

// ==========================================
// 6. Audit Trail Logs API (Tamper-Proof)
// ==========================================
app.get("/api/audit-logs", async (req, res) => {
  try {
    if (db.isMySQL()) {
      const [rows] = await db.getPool().query(
        `SELECT al.*, u.username, u.role 
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ORDER BY al.id DESC LIMIT 100`
      );
      return res.json(rows);
    } else {
      const enriched = fallbackStore.audit_logs.slice(0, 100).map(l => {
        const user = fallbackStore.users.find(u => u.id === l.user_id);
        return {
          ...l,
          username: user ? user.username : (l.user_id === null ? "SYSTEM_SENSOR" : "Staff"),
          role: user ? user.role : "AUTOMATION"
        };
      });
      return res.json(enriched);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to load audit logs", details: error.message });
  }
});

// ==========================================
// 7. PST-G30 Panel Guide & Hardware Webhook Config
// ==========================================
app.get("/api/pst-g30-config", (req, res) => {
  const host = req.get("host");
  res.json({
    panelModel: "TURBOGEAR PST-G30 Wi-Fi / GSM Alarm Panel",
    roomsConfigured: 10,
    webhookUrl: `http://${host}/api/door-events`,
    formatSupported: "JSON POST",
    samplePayload: {
      room_id: 3,
      door_status: "CLOSED",
      source: "PST_G30_ZONE_3"
    },
    gsmSmsCommands: {
      statusQuery: "STATUS?",
      armRoomZone: "ARM 03",
      disarmRoomZone: "DISARM 03"
    },
    integrationNotes: [
      "Pair each magnetic door sensor to Zones 1 to 10 corresponding to Room 01 to Room 10.",
      "If PST-G30 firmware supports Wi-Fi HTTP push, configure Webhook URL above.",
      "If PST-G30 is GSM-only, connect an SMS gateway (Text.lk or GSM modem dongle) to relay incoming sensor SMS to this webhook."
    ]
  });
});

// ==========================================
// Server Initialization
// ==========================================
async function startServer() {
  console.log("\n=======================================================");
  console.log("🏨 THE EHELEPOLA HOTEL - Room Security & Verification System");
  console.log("=======================================================");

  // Initialize DB (MySQL or Fallback)
  await initDb();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on: http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
    console.log(`📊 Owner & Manager Web Interface: http://localhost:${PORT}`);
    console.log(`🔌 Door Event Webhook API: http://localhost:${PORT}/api/door-events`);
    console.log("=======================================================\n");
  });
}

startServer();
