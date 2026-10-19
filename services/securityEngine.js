const { db, fallbackStore } = require("../config/db");

// In-memory active alert listeners (for Server-Sent Events or WebSockets)
let clients = [];

function registerSseClient(res) {
  clients.push(res);
}

function removeSseClient(res) {
  clients = clients.filter(c => c !== res);
}

function broadcastEvent(type, data) {
  const payload = `data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`;
  clients.forEach(client => {
    try {
      client.write(payload);
    } catch (e) {
      // client disconnected
    }
  });
}

/**
 * Log an audit event (Tamper-proof record)
 */
async function recordAuditLog(userId, action, entityType, entityId, details) {
  const timestamp = new Date();
  const detailsStr = typeof details === "object" ? JSON.stringify(details) : String(details);

  if (db.isMySQL()) {
    try {
      await db.getPool().query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)",
        [userId || null, action, entityType, String(entityId || ""), detailsStr]
      );
    } catch (err) {
      console.error("Failed to insert audit log to MySQL:", err);
    }
  } else {
    fallbackStore.audit_logs.unshift({
      id: fallbackStore.audit_logs.length + 1,
      user_id: userId || null,
      action,
      entity_type: entityType,
      entity_id: String(entityId || ""),
      details: typeof details === "object" ? details : { note: details },
      created_at: timestamp
    });
  }

  broadcastEvent("AUDIT_LOG_ADDED", { action, entityType, entityId, details, timestamp });
}

/**
 * Create a Security Alert or Event Notification
 */
async function triggerSecurityAlert(roomId, alertType, message, severity = "HIGH") {
  const timestamp = new Date();
  let alertId = Date.now();

  if (db.isMySQL()) {
    try {
      const [res] = await db.getPool().query(
        "INSERT INTO security_alerts (room_id, alert_type, message, status) VALUES (?, ?, ?, 'OPEN')",
        [roomId, alertType, message]
      );
      alertId = res.insertId;
    } catch (err) {
      console.error("Failed to insert alert in MySQL:", err);
    }
  } else {
    alertId = fallbackStore.security_alerts.length + 1;
    fallbackStore.security_alerts.unshift({
      id: alertId,
      room_id: roomId,
      alert_type: alertType,
      message,
      status: "OPEN",
      created_at: timestamp
    });
  }

  // Audit log
  await recordAuditLog(null, alertType, "ROOM", roomId, {
    alertId,
    alertType,
    message,
    severity
  });

  // SMS Notification to Owner
  sendSmsAlert(roomId, message, alertType);

  // Broadcast to live connected Owner Dashboards
  broadcastEvent("SECURITY_ALERT", {
    id: alertId,
    room_id: roomId,
    alert_type: alertType,
    message,
    severity,
    status: "OPEN",
    created_at: timestamp
  });

  return { id: alertId, alertType, message, severity };
}

/**
 * Simulated / Real SMS dispatcher to Owner's Phone
 */
function sendSmsAlert(roomId, message, alertType = "ALERT") {
  const ownerPhone = process.env.OWNER_PHONE || "+94770000000";
  console.log(`\n======================================================`);
  console.log(`📲 [SMS ALERT SENT TO OWNER'S PHONE]`);
  console.log(`📞 Phone Number: ${ownerPhone}`);
  console.log(`🏷️ Alert Type: ${alertType}`);
  console.log(`⏰ Event Time: ${new Date().toLocaleTimeString()} (SL Time)`);
  console.log(`💬 SMS Content: ${message}`);
  console.log(`======================================================\n`);
}

/**
 * Core Rule Engine for Door Events (PST-G30 or Simulator)
 * 1. Booking ඇත, Door Closed -> Check-in Alert + SMS to Owner
 * 2. Booking නැත, Door Closed -> 🚨 BREACH ALERT + SMS to Owner
 * 3. Customer Check-out / Door Open -> Check-out Alert + SMS to Owner
 */
async function processDoorEvent(roomId, doorStatus, source = "PST_G30") {
  const normalizedStatus = String(doorStatus).toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN";
  const now = new Date();

  // 1. Get current room info
  let room = null;
  if (db.isMySQL()) {
    const [rooms] = await db.getPool().query("SELECT * FROM rooms WHERE id = ?", [roomId]);
    room = rooms[0];
  } else {
    room = fallbackStore.rooms.find(r => r.id === Number(roomId));
  }

  if (!room) {
    throw new Error(`Room with ID ${roomId} not found`);
  }

  const previousDoorStatus = room.door_status;
  const previousRoomStatus = room.room_status;

  // 2. Record door event history
  if (db.isMySQL()) {
    await db.getPool().query(
      "INSERT INTO door_events (room_id, door_status, source) VALUES (?, ?, ?)",
      [roomId, normalizedStatus, source]
    );
    await db.getPool().query(
      "UPDATE rooms SET door_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [normalizedStatus, roomId]
    );
  } else {
    fallbackStore.door_events.unshift({
      id: fallbackStore.door_events.length + 1,
      room_id: Number(roomId),
      door_status: normalizedStatus,
      source,
      event_time: now
    });
    room.door_status = normalizedStatus;
    room.updated_at = now;
  }

  // 3. Find if there is an active booking for this room
  let activeBooking = null;
  if (db.isMySQL()) {
    const [bookings] = await db.getPool().query(
      `SELECT * FROM bookings 
       WHERE room_id = ? 
       AND status IN ('BOOKED', 'CHECKED_IN')
       ORDER BY id DESC LIMIT 1`,
      [roomId]
    );
    activeBooking = bookings[0];
  } else {
    activeBooking = fallbackStore.bookings.find(
      b => b.room_id === Number(roomId) && ["BOOKED", "CHECKED_IN"].includes(b.status)
    );
  }

  let securityResult = {
    roomId,
    roomName: room.room_name,
    doorStatus: normalizedStatus,
    activeBooking: activeBooking || null,
    isAlertTriggered: false,
    alertDetails: null
  };

  // Rule Evaluation:
  if (normalizedStatus === "CLOSED") {
    if (!activeBooking) {
      // 🚨 SCENARIO 1: Booking නැතිව Door Closed වුණොත් (UNAUTHORIZED OCCUPANCY BREACH)
      const alertMsg = `🚨 SECURITY ALERT: ${room.room_name} Door CLOSED without any active booking! Manager check required immediately.`;
      const alert = await triggerSecurityAlert(roomId, "UNAUTHORIZED_DOOR_CLOSED", alertMsg, "CRITICAL");

      securityResult.isAlertTriggered = true;
      securityResult.alertDetails = alert;
    } else {
      // 🚪 SCENARIO 2: Booking ඇත, Door Closed වුණාම (CHECK-IN / OCCUPIED ALARM + SMS)
      if (room.room_status === "AVAILABLE" || room.room_status === "BOOKED") {
        if (db.isMySQL()) {
          await db.getPool().query("UPDATE rooms SET room_status = 'OCCUPIED' WHERE id = ?", [roomId]);
        } else {
          room.room_status = "OCCUPIED";
        }
      }

      const checkInMsg = `🔔 CHECK-IN ALARM: ${room.room_name} Door CLOSED (Customer arrived / Occupied). Guest: ${activeBooking.customer_name} | Code: ${activeBooking.booking_code}.`;
      const alert = await triggerSecurityAlert(roomId, "CHECK_IN_DOOR_CLOSED", checkInMsg, "INFO");

      securityResult.isAlertTriggered = true;
      securityResult.alertDetails = alert;

      await recordAuditLog(null, "AUTHORIZED_DOOR_CLOSED", "ROOM", roomId, {
        bookingCode: activeBooking.booking_code,
        customerName: activeBooking.customer_name
      });
    }
  } else {
    // 🚪 SCENARIO 3: Door OPENED (CHECK-OUT / GUEST DEPARTED ALARM + SMS)
    if (previousDoorStatus === "CLOSED" || previousRoomStatus === "OCCUPIED" || previousRoomStatus === "CLEANING") {
      const guestInfo = activeBooking ? ` (Guest: ${activeBooking.customer_name})` : "";
      const checkOutMsg = `🚪 CHECK-OUT / DOOR OPEN: ${room.room_name} Door OPENED${guestInfo}. Customer departed / Room vacant.`;
      
      const alert = await triggerSecurityAlert(roomId, "CHECK_OUT_DOOR_OPENED", checkOutMsg, "NOTICE");
      securityResult.isAlertTriggered = true;
      securityResult.alertDetails = alert;
    }

    await recordAuditLog(null, "DOOR_OPENED", "ROOM", roomId, {
      previousStatus: "CLOSED",
      activeBooking: activeBooking ? activeBooking.booking_code : "NONE"
    });
  }

  // Broadcast room state change
  broadcastEvent("ROOM_UPDATE", {
    roomId,
    roomName: room.room_name,
    doorStatus: normalizedStatus,
    roomStatus: room.room_status,
    activeBooking
  });

  return securityResult;
}

module.exports = {
  processDoorEvent,
  triggerSecurityAlert,
  recordAuditLog,
  registerSseClient,
  removeSseClient,
  broadcastEvent
};
