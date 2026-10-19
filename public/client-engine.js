/**
 * Client-Side Engine for GitHub Pages
 * Enables full offline / static interactivity when hosted on GitHub Pages
 */
(function() {
  const isGitHubPages = window.location.hostname.includes("github.io") || window.location.protocol === "file:";

  if (!isGitHubPages) {
    return; // Use real backend on localhost/Render
  }

  console.log("🛡️ Running in GitHub Pages Interactive Mode - Local Browser Engine Activated");

  // In-Memory Data Store (Stored in localStorage for persistence)
  function getStore() {
    const saved = localStorage.getItem("hotel_security_data");
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }

    const initial = {
      rooms: [
        { id: 1, room_name: "Room 01", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null },
        { id: 2, room_name: "Room 02", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null },
        { id: 3, room_name: "Room 03", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null },
        { id: 4, room_name: "Room 04", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null },
        { id: 5, room_name: "Room 05", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null },
        { id: 6, room_name: "Room 06", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null },
        { id: 7, room_name: "Room 07", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null },
        { id: 8, room_name: "Room 08", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null },
        { id: 9, room_name: "Room 09", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null },
        { id: 10, room_name: "Room 10", door_status: "OPEN", room_status: "AVAILABLE", active_booking: null }
      ],
      bookings: [
        {
          id: 1,
          customer_name: "Kamal Perera",
          room_id: 2,
          room_name: "Room 02",
          check_in_time: new Date(Date.now() - 3600000).toISOString(),
          check_out_time: null,
          total_price: 6500,
          paid_amount: 6500,
          payment_status: "PAID",
          status: "CHECKED_IN"
        }
      ],
      payments: [
        { id: 1, booking_id: 1, amount: 6500, payment_method: "CASH", created_at: new Date(Date.now() - 3600000).toISOString() }
      ],
      alerts: [],
      auditLogs: [
        { id: 1, action: "SYSTEM_INITIALIZED", details: "Hotel security system loaded on GitHub Pages Cloud", created_at: new Date().toISOString() }
      ]
    };

    initial.rooms[1].active_booking = initial.bookings[0];
    initial.rooms[1].room_status = "OCCUPIED";
    initial.rooms[1].door_status = "CLOSED";
    saveStore(initial);
    return initial;
  }

  function saveStore(data) {
    localStorage.setItem("hotel_security_data", JSON.stringify(data));
  }

  // Mock EventSource
  const listeners = [];
  window.EventSource = function(url) {
    this.url = url;
    setTimeout(() => {
      if (typeof this.onopen === "function") this.onopen();
    }, 100);
    this.addEventListener = function(evt, cb) { listeners.push(cb); };
    this.removeEventListener = function() {};
    this.close = function() {};
  };

  function broadcast(type, data) {
    listeners.forEach(cb => {
      try { cb({ data: JSON.stringify({ type, data }) }); } catch(e) {}
    });
  }

  // Intercept Fetch
  const originalFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    const urlStr = url.toString();
    const method = (options.method || "GET").toUpperCase();

    if (!urlStr.includes("/api/")) {
      return originalFetch(url, options);
    }

    const store = getStore();

    // 1. Health
    if (urlStr.endsWith("/api/health")) {
      return new Response(JSON.stringify({
        status: "ONLINE",
        service: "The Ehelepola Hotel - GitHub Pages Cloud Edition",
        dbEngine: "Browser High-Speed Engine (Active)",
        isMySQLConnected: true,
        time: new Date().toISOString(),
        ownerPhone: "+94770000000"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 2. Rooms
    if (urlStr.endsWith("/api/rooms") && method === "GET") {
      return new Response(JSON.stringify(store.rooms), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Alerts
    if (urlStr.endsWith("/api/alerts") && method === "GET") {
      return new Response(JSON.stringify(store.alerts), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    // 4. Bookings
    if (urlStr.endsWith("/api/bookings") && method === "GET") {
      return new Response(JSON.stringify(store.bookings), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    // 5. Audit Logs
    if (urlStr.endsWith("/api/audit-logs") && method === "GET") {
      return new Response(JSON.stringify(store.auditLogs), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    // 6. Door Events
    if (urlStr.endsWith("/api/door-events") && method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const roomId = Number(body.roomId || body.room_id || 1);
      const action = body.action || (body.state === "OPEN" ? "DOOR_OPEN" : "DOOR_CLOSED");

      const room = store.rooms.find(r => r.id === roomId) || store.rooms[0];
      const isClosed = action === "DOOR_CLOSED" || action === "DOOR_CLOSE";
      room.door_status = isClosed ? "CLOSED" : "OPEN";

      let alertType = null;
      let severity = "INFO";
      let message = "";

      if (isClosed) {
        if (!room.active_booking) {
          // UNAUTHORIZED BREACH!
          alertType = "UNAUTHORIZED_DOOR_CLOSED";
          severity = "CRITICAL";
          message = `CRITICAL SECURITY BREACH: ${room.room_name} door closed with NO active booking!`;
        } else {
          alertType = "CHECK_IN_DOOR_CLOSED";
          severity = "INFO";
          message = `Normal Check-in: ${room.room_name} door closed by booked guest.`;
        }
      } else {
        alertType = room.active_booking ? "CHECK_OUT_DOOR_OPENED" : "DOOR_OPENED";
        message = `${room.room_name} door opened.`;
      }

      const alert = {
        id: store.alerts.length + 1,
        room_id: room.id,
        room_name: room.room_name,
        alert_type: alertType,
        severity: severity,
        message: message,
        is_acknowledged: false,
        created_at: new Date().toISOString()
      };

      if (severity === "CRITICAL" || isClosed) {
        store.alerts.unshift(alert);
      }

      store.auditLogs.unshift({
        id: store.auditLogs.length + 1,
        action: action,
        details: message,
        created_at: new Date().toISOString()
      });

      saveStore(store);
      broadcast("SECURITY_ALERT", alert);

      return new Response(JSON.stringify({ success: true, alert, room }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    // 7. Security Alert Reset
    if (urlStr.includes("/api/security/reset") && method === "POST") {
      store.alerts = store.alerts.map(a => ({ ...a, is_acknowledged: true }));
      saveStore(store);
      broadcast("ROOM_UPDATE", {});
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }

    // 8. Auth Login
    if (urlStr.includes("/api/auth/login") && method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const role = body.username === "manager" ? "MANAGER" : "OWNER";
      return new Response(JSON.stringify({
        success: true,
        user: { username: body.username, role: role, full_name: role === "OWNER" ? "Owner" : "Manager" }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Default fallback
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };
})();
