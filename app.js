// State
let rooms = [];
let alerts = [];
let bookings = [];
let auditLogs = [];
let soundEnabled = true;
let currentTone = localStorage.getItem('restro_alarm_tone') || 'voice_chime';
let audioCtx = null;
let activeTab = 'owner';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initToneSelector();
  initSse();
  loadAllData();
  checkHealth();
  const webhookUrl = `${window.location.origin}/api/door-events`;
  const el = document.getElementById('webhookDisplayUrl');
  if (el) el.innerText = webhookUrl;
});

// Clock
function initClock() {
  const clockEl = document.getElementById('liveClock');
  function update() {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString() + ' (SL Time)';
  }
  update();
  setInterval(update, 1000);
}

// Tone Selector Initialization
function initToneSelector() {
  const select = document.getElementById('alarmToneSelect');
  if (select) {
    select.value = currentTone;
  }
}

function changeAlarmTone() {
  const select = document.getElementById('alarmToneSelect');
  currentTone = select.value;
  localStorage.setItem('restro_alarm_tone', currentTone);
  playToneSample(currentTone, "Sample Test Tone");
}

function testCurrentTone() {
  playToneSample(currentTone, "Test Alarm Sound");
}

// ==========================================
// AUDIO SYNTHESIZER & VOICE ENGINE
// ==========================================
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Unlock audio immediately on first click anywhere
window.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}, { passive: true });

// 1. Luxury Hotel Ding-Dong (Two-tone Chime)
function playHotelChime() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Note 1: E5 (659.25 Hz)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(659.25, now);
  gain1.gain.setValueAtTime(0.4, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.8);

  // Note 2: C5 (523.25 Hz) after 0.28s
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(523.25, now + 0.28);
  gain2.gain.setValueAtTime(0.45, now + 0.28);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.28);
  osc2.stop(now + 1.2);
}

// 2. High-Tech Security Siren
function playSecuritySiren() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  // Siren pitch oscillation
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.linearRampToValueAtTime(1200, now + 0.3);
  osc.frequency.linearRampToValueAtTime(700, now + 0.6);
  osc.frequency.linearRampToValueAtTime(1200, now + 0.9);

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 1.0);
}

// 3. Digital Radar Triple Beep
function playDigitalRadar() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  [0, 0.14, 0.28].forEach(offset => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(950, now + offset);
    gain.gain.setValueAtTime(0.2, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.09);
  });
}

// 4. Smart Voice Speech Announcement
function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.lang = 'en-US';
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('SpeechSynthesis error:', e);
  }
}

// Play Tone Based on Choice
function playToneSample(toneType, voiceMsg = null) {
  if (!soundEnabled) return;
  try {
    switch (toneType) {
      case 'hotel_chime':
        playHotelChime();
        break;
      case 'digital_radar':
        playDigitalRadar();
        break;
      case 'security_siren':
        playSecuritySiren();
        break;
      case 'voice_chime':
      default:
        playHotelChime();
        if (voiceMsg) {
          setTimeout(() => speakText(voiceMsg), 400);
        }
        break;
    }
  } catch (e) {
    console.warn('Error playing tone:', e);
  }
}

// Dispatch Alarm for an Event
function triggerAlarmForEvent(alert) {
  if (!soundEnabled) return;
  const isBreach = alert.severity === 'CRITICAL' || alert.alert_type === 'UNAUTHORIZED_DOOR_CLOSED';

  if (isBreach) {
    // High alert siren
    playSecuritySiren();
    const voiceMsg = `Warning! Room ${alert.room_id} door closed without booking!`;
    setTimeout(() => speakText(voiceMsg), 800);
  } else if (alert.alert_type === 'CHECK_IN_DOOR_CLOSED') {
    // Check-in chime
    playToneSample(currentTone, `Room ${alert.room_id} door closed. Customer check in.`);
  } else if (alert.alert_type === 'CHECK_OUT_DOOR_OPENED') {
    // Check-out chime
    playToneSample(currentTone, `Room ${alert.room_id} door opened. Customer departed.`);
  } else {
    playToneSample(currentTone, alert.message);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('soundToggleBtn');
  if (soundEnabled) {
    btn.innerHTML = '🔔 Sound: ON';
    btn.style.color = '#fff';
    playToneSample(currentTone, "Alarm sound activated");
  } else {
    btn.innerHTML = '🔕 Sound: OFF';
    btn.style.color = '#94a3b8';
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}

// ==========================================
// SERVER-SENT EVENTS (SSE)
// ==========================================
function initSse() {
  const streamStatusEl = document.getElementById('streamStatus');
  const evtSource = new EventSource('/api/events/stream');

  evtSource.onopen = () => {
    streamStatusEl.innerHTML = '<span class="indicator"></span><span>Live Alerts: Connected</span>';
    streamStatusEl.className = 'status-pill status-live';
  };

  evtSource.onerror = () => {
    streamStatusEl.innerHTML = '<span>Live Stream: Reconnecting...</span>';
    streamStatusEl.className = 'status-pill status-db';
  };

  evtSource.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.type === 'SECURITY_ALERT') {
        showSirenBanner(parsed.data);
        triggerAlarmForEvent(parsed.data);
        loadAlerts();
        loadRooms();
        loadAuditLogs();
        loadBookings();
      } else if (parsed.type === 'ROOM_UPDATE' || parsed.type === 'AUDIT_LOG_ADDED') {
        loadRooms();
        loadAuditLogs();
        loadBookings();
      }
    } catch (e) {
      console.error('Error handling SSE message:', e);
    }
  };
}

// Health check
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    await res.json();
  } catch (e) {
    console.error('Health check failed', e);
  }
}

// ==========================================
// TAB NAVIGATION
// ==========================================
function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tabOwnerBtn').classList.toggle('active', tab === 'owner');
  document.getElementById('tabExcelBtn').classList.toggle('active', tab === 'excel');
  document.getElementById('tabHardwareBtn').classList.toggle('active', tab === 'hardware');

  document.getElementById('sectionOwner').style.display = tab === 'owner' ? 'block' : 'none';
  document.getElementById('sectionExcel').style.display = tab === 'excel' ? 'block' : 'none';
  document.getElementById('sectionHardware').style.display = tab === 'hardware' ? 'block' : 'none';

  if (tab === 'hardware') {
    renderHardwareRack();
  } else if (tab === 'excel') {
    renderExcelTable(bookings);
  }
}

// Load All Data
async function loadAllData() {
  await Promise.all([
    loadRooms(),
    loadAlerts(),
    loadBookings(),
    loadAuditLogs()
  ]);
}

// ==========================================
// 1. ROOMS (OWNER VIEW - NO BOOKING BUTTONS)
// ==========================================
async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    rooms = await res.json();
    renderRooms();
    updateKpis();
    if (activeTab === 'hardware') renderHardwareRack();
  } catch (e) {
    console.error('Failed to load rooms', e);
  }
}

function renderRooms() {
  const container = document.getElementById('roomsContainer');
  if (!rooms.length) {
    container.innerHTML = '<p>No rooms found</p>';
    return;
  }

  container.innerHTML = rooms.map(room => {
    const isDoorClosed = room.door_status === 'CLOSED';
    const hasBooking = !!room.active_booking;
    const isBreach = isDoorClosed && !hasBooking;

    let cardClass = 'room-card';
    if (isBreach) {
      cardClass += ' state-danger';
    } else if (hasBooking) {
      cardClass += ' state-occupied';
    } else {
      cardClass += ' state-safe';
    }

    let badgeClass = 'badge-available';
    if (room.room_status === 'OCCUPIED') badgeClass = 'badge-occupied';
    else if (room.room_status === 'BOOKED') badgeClass = 'badge-booked';
    else if (room.room_status === 'CLEANING') badgeClass = 'badge-cleaning';

    return `
      <div class="${cardClass}">
        <div>
          <div class="room-header">
            <span class="room-number-tag">${room.room_name}</span>
            <span class="room-status-badge ${badgeClass}">${room.room_status}</span>
          </div>

          <!-- Door State -->
          <div class="door-state-box ${isDoorClosed ? 'door-closed-state' : 'door-open-state'}">
            <div style="display: flex; align-items: center; gap: 0.8rem;">
              <div class="door-icon-wrap">
                ${isDoorClosed ? '🔒' : '🚪'}
              </div>
              <div>
                <div class="door-label-title">
                  ${isDoorClosed ? 'DOOR CLOSED' : 'DOOR OPEN'}
                </div>
                <div class="door-label-sub">
                  ${isBreach 
                    ? '<strong style="color: #f43f5e;">⚠️ UNAUTHORIZED CLOSED (NO BOOKING!)</strong>' 
                    : (hasBooking ? 'Authorized Occupancy (Check-in)' : 'Normal / Vacant')}
                </div>
              </div>
            </div>
            ${room.open_alerts_count > 0 ? `<span class="tag-badge tag-alert">${room.open_alerts_count} ALERT</span>` : ''}
          </div>

          <!-- Active Booking Info -->
          <div class="room-booking-details">
            ${hasBooking ? `
              <div class="booking-field">
                <span class="booking-label">Guest:</span>
                <span class="booking-val">${room.active_booking.customer_name}</span>
              </div>
              <div class="booking-field">
                <span class="booking-label">Code:</span>
                <span class="booking-val" style="color: #818cf8;">${room.active_booking.booking_code}</span>
              </div>
              <div class="booking-field">
                <span class="booking-label">Status:</span>
                <span class="booking-val" style="color: #34d399;">${room.active_booking.status}</span>
              </div>
            ` : `
              <div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 4px 0;">
                No Active Booking (Vacant)
              </div>
            `}
          </div>

          <!-- Pure Sensor Live Status Tag -->
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.72rem; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
            <span>Zone ${room.id} Sensor:</span>
            <span style="font-weight: 700; color: ${isDoorClosed ? '#f43f5e' : '#34d399'};">
              ${isDoorClosed ? '● CONTACT CLOSED' : '○ CONTACT OPEN'}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 2. EXCEL SPREADSHEET VIEW & EXPORT
// ==========================================
async function loadBookings() {
  try {
    const res = await fetch('/api/bookings');
    bookings = await res.json();
    renderBookings();
    renderExcelTable(bookings);
  } catch (e) {
    console.error('Failed to load bookings', e);
  }
}

function renderExcelTable(dataToRender) {
  const tbody = document.getElementById('excelTableBody');
  if (!tbody) return;

  // Calculate summary stats
  const totalCount = dataToRender.length;
  let totalRev = 0;
  let paidRev = 0;
  let pendingRev = 0;

  dataToRender.forEach(b => {
    const amt = Number(b.amount || 0);
    totalRev += amt;
    if (b.payment_status === 'PAID') paidRev += amt;
    else pendingRev += amt;
  });

  document.getElementById('excelTotalCount').innerText = totalCount;
  document.getElementById('excelTotalRevenue').innerText = `Rs. ${totalRev.toLocaleString()}`;
  document.getElementById('excelPaidRevenue').innerText = `Rs. ${paidRev.toLocaleString()}`;
  document.getElementById('excelPendingRevenue').innerText = `Rs. ${pendingRev.toLocaleString()}`;

  if (!dataToRender.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 2rem; color: var(--text-muted);">No records found matching criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = dataToRender.map((b, idx) => {
    return `
      <tr>
        <td style="color: var(--text-muted); text-align: center;">${idx + 1}</td>
        <td><strong style="color: #818cf8;">${b.booking_code}</strong></td>
        <td><strong>${b.room_name}</strong></td>
        <td>${b.customer_name}</td>
        <td>${b.customer_phone || '-'}</td>
        <td>${new Date(b.check_in).toLocaleString()}</td>
        <td>${new Date(b.check_out).toLocaleString()}</td>
        <td style="font-weight: 700; color: #34d399;">Rs. ${Number(b.amount || 0).toLocaleString()}</td>
        <td><span class="tag-badge tag-booking">${b.payment_method || 'CASH'}</span></td>
        <td>
          <span class="tag-badge ${b.payment_status === 'PAID' ? 'tag-success' : 'tag-alert'}">
            ${b.payment_status || 'PENDING'}
          </span>
        </td>
        <td><span class="tag-badge tag-booking">${b.status}</span></td>
        <td style="color: var(--text-muted);">${b.created_by === 1 ? 'Owner' : 'Manager'}</td>
      </tr>
    `;
  }).join('');
}

function filterExcelTable() {
  const query = (document.getElementById('excelSearchInput').value || '').toLowerCase();
  if (!query) {
    renderExcelTable(bookings);
    return;
  }
  const filtered = bookings.filter(b => 
    (b.booking_code && b.booking_code.toLowerCase().includes(query)) ||
    (b.customer_name && b.customer_name.toLowerCase().includes(query)) ||
    (b.customer_phone && b.customer_phone.toLowerCase().includes(query)) ||
    (b.room_name && b.room_name.toLowerCase().includes(query)) ||
    (b.payment_method && b.payment_method.toLowerCase().includes(query)) ||
    (b.payment_status && b.payment_status.toLowerCase().includes(query))
  );
  renderExcelTable(filtered);
}

// Download Excel CSV File
function exportBookingsToCSV() {
  if (!bookings.length) {
    alert("No bookings available to export.");
    return;
  }

  const headers = [
    "No",
    "Booking Code",
    "Room Name",
    "Customer Name",
    "Customer Phone",
    "Check-in Time",
    "Check-out Time",
    "Amount (LKR)",
    "Payment Method",
    "Payment Status",
    "Booking Status",
    "Created Date"
  ];

  const rows = bookings.map((b, i) => [
    i + 1,
    `"${b.booking_code}"`,
    `"${b.room_name}"`,
    `"${b.customer_name}"`,
    `"${b.customer_phone || ''}"`,
    `"${new Date(b.check_in).toLocaleString()}"`,
    `"${new Date(b.check_out).toLocaleString()}"`,
    b.amount || 0,
    `"${b.payment_method || 'CASH'}"`,
    `"${b.payment_status || 'PENDING'}"`,
    `"${b.status}"`,
    `"${new Date(b.created_at || Date.now()).toLocaleString()}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Manager_Bookings_Audit_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==========================================
// 3. HARDWARE RACK (PST-G30 SIMULATOR)
// ==========================================
function renderHardwareRack() {
  const rack = document.getElementById('sensorRackContainer');
  if (!rooms.length || !rack) return;

  rack.innerHTML = rooms.map(room => {
    const isClosed = room.door_status === 'CLOSED';
    return `
      <div class="room-card" style="border: 1px dashed rgba(255,255,255,0.15);">
        <div class="room-header">
          <span class="room-number-tag">${room.room_name} Sensor</span>
          <span class="tag-badge ${isClosed ? 'tag-alert' : 'tag-success'}">
            Zone ${room.id}
          </span>
        </div>
        <div class="door-state-box ${isClosed ? 'door-closed-state' : 'door-open-state'}">
          <div style="display:flex; align-items:center; gap:0.8rem;">
            <div class="door-icon-wrap">${isClosed ? '🔒' : '🚪'}</div>
            <div>
              <div class="door-label-title">Magnetic Contact: ${isClosed ? 'CLOSED' : 'OPEN'}</div>
              <div class="door-label-sub">PST-G30 Wireless 433MHz</div>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
          <button class="btn btn-secondary" style="flex:1;" onclick="toggleDoorSensor(${room.id}, 'OPEN')">
            Send OPEN 🚪
          </button>
          <button class="btn btn-danger" style="flex:1;" onclick="toggleDoorSensor(${room.id}, 'CLOSED')">
            Send CLOSED 🔒
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Toggle Door Sensor (Simulated event or Webhook)
async function toggleDoorSensor(roomId, status) {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }

    const res = await fetch('/api/door-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: roomId,
        door_status: status,
        source: 'PST_G30_SIMULATOR'
      })
    });
    const result = await res.json();
    if (result.data && result.data.isAlertTriggered) {
      showSirenBanner(result.data.alertDetails);
      triggerAlarmForEvent(result.data.alertDetails);
    } else if (status === 'OPEN') {
      dismissBanner();
    }
    await loadAllData();
    if (activeTab === 'hardware') {
      renderHardwareRack();
    }
  } catch (e) {
    console.error('Sensor trigger failed', e);
  }
}

// ==========================================
// 4. ALERTS TABLE
// ==========================================
async function loadAlerts() {
  try {
    const res = await fetch('/api/alerts');
    alerts = await res.json();
    renderAlerts();
    updateKpis();
  } catch (e) {
    console.error('Failed to load alerts', e);
  }
}

function renderAlerts() {
  const tbody = document.getElementById('alertsTableBody');
  if (!tbody) return;

  if (!alerts.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No alerts recorded. Everything is peaceful!</td></tr>';
    return;
  }

  tbody.innerHTML = alerts.map(a => {
    const isOpen = a.status === 'OPEN';
    const isCritical = a.alert_type === 'UNAUTHORIZED_DOOR_CLOSED';
    const isCheckin = a.alert_type === 'CHECK_IN_DOOR_CLOSED';

    let severityClass = 'tag-notice';
    if (isCritical) severityClass = 'tag-critical';
    else if (isCheckin) severityClass = 'tag-info';

    return `
      <tr>
        <td>#${a.id}</td>
        <td>${new Date(a.created_at).toLocaleTimeString()}</td>
        <td><strong>${a.room_name}</strong></td>
        <td>
          <span class="tag-badge ${severityClass}">${a.alert_type}</span>
        </td>
        <td style="max-width: 380px;">${a.message}</td>
        <td>
          <span class="tag-badge ${isOpen ? 'tag-alert' : 'tag-success'}">
            ${a.status}
          </span>
        </td>
        <td>
          ${isOpen ? `
            <button class="btn btn-secondary btn-sm" onclick="resolveAlert(${a.id})">
              Acknowledge
            </button>
          ` : `
            <span style="color: var(--text-muted); font-size: 0.75rem;">Resolved</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

async function resolveAlert(alertId) {
  try {
    await fetch(`/api/alerts/${alertId}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_taken: 'Owner acknowledged.' })
    });
    dismissBanner();
    await loadAllData();
  } catch (e) {
    console.error('Failed to resolve alert', e);
  }
}

// ==========================================
// 5. MANAGER BOOKINGS (MANAGER VIEW)
// ==========================================
function renderBookings() {
  const tbody = document.getElementById('bookingsTableBody');
  if (!tbody) return;

  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No bookings placed yet. Click "+ New Customer Booking" above.</td></tr>';
    return;
  }

  tbody.innerHTML = bookings.map(b => {
    return `
      <tr>
        <td><strong style="color: #818cf8;">${b.booking_code}</strong></td>
        <td>${b.room_name}</td>
        <td><strong>${b.customer_name}</strong></td>
        <td>${b.customer_phone || '-'}</td>
        <td style="font-size: 0.78rem;">
          In: ${new Date(b.check_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}<br>
          Out: ${new Date(b.check_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </td>
        <td>Rs. ${Number(b.amount || 0).toLocaleString()}</td>
        <td>
          <span class="tag-badge ${b.payment_status === 'PAID' ? 'tag-success' : 'tag-alert'}">
            ${b.payment_status} (${b.payment_method || 'CASH'})
          </span>
        </td>
        <td>
          <span class="tag-badge tag-booking">${b.status}</span>
        </td>
        <td>
          <div style="display: flex; gap: 4px;">
            ${b.status === 'BOOKED' ? `
              <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.72rem;" onclick="checkInBooking(${b.id})">In</button>
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.72rem; color: #f43f5e;" onclick="cancelBooking(${b.id})">Cancel</button>
            ` : ''}
            ${b.status === 'CHECKED_IN' ? `
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.72rem;" onclick="checkOutBooking(${b.id})">Out</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// 6. AUDIT LOGS
// ==========================================
async function loadAuditLogs() {
  try {
    const res = await fetch('/api/audit-logs');
    auditLogs = await res.json();
    renderAuditLogs();
  } catch (e) {
    console.error('Failed to load audit logs', e);
  }
}

function renderAuditLogs() {
  const tbody = document.getElementById('auditTableBody');
  if (!tbody) return;

  if (!auditLogs.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Audit log empty.</td></tr>';
    return;
  }

  tbody.innerHTML = auditLogs.map(l => {
    const isAlert = l.action.includes('ALERT');
    const detailsStr = typeof l.details === 'object' ? JSON.stringify(l.details) : l.details;
    return `
      <tr>
        <td style="font-size: 0.75rem; color: var(--text-muted);">${new Date(l.created_at).toLocaleTimeString()}</td>
        <td><strong>${l.username || 'SYSTEM'}</strong> <span style="font-size: 0.7rem; color: var(--text-subtle);">(${l.role || 'CORE'})</span></td>
        <td>
          <span class="tag-badge ${isAlert ? 'tag-alert' : 'tag-booking'}">
            ${l.action}
          </span>
        </td>
        <td>${l.entity_type}</td>
        <td>#${l.entity_id}</td>
        <td style="max-width: 320px; font-size: 0.78rem; font-family: monospace; color: #cbd5e1;">${detailsStr}</td>
        <td><span style="color: #34d399; font-size: 0.75rem;">🔒 Immutable</span></td>
      </tr>
    `;
  }).join('');
}

// Update KPI Counters
function updateKpis() {
  document.getElementById('kpiTotalRooms').innerText = rooms.length;
  document.getElementById('kpiOpenDoors').innerText = rooms.filter(r => r.door_status === 'OPEN').length;
  document.getElementById('kpiClosedDoors').innerText = rooms.filter(r => r.door_status === 'CLOSED').length;
  const openAlerts = alerts.filter(a => a.status === 'OPEN').length;
  document.getElementById('kpiActiveAlerts').innerText = openAlerts;
}

// Siren Banner
function showSirenBanner(alert) {
  const banner = document.getElementById('securitySirenBanner');
  const icon = document.getElementById('sirenIcon');
  if (alert.severity === 'CRITICAL' || alert.alert_type === 'UNAUTHORIZED_DOOR_CLOSED') {
    icon.innerText = '🚨';
    document.getElementById('sirenTitle').innerText = `🚨 SECURITY ALERT: Unauthorized Door Closed!`;
  } else if (alert.alert_type === 'CHECK_IN_DOOR_CLOSED') {
    icon.innerText = '🔔';
    document.getElementById('sirenTitle').innerText = `🔔 CHECK-IN ALARM: Door Closed (Customer Arrived)`;
  } else {
    icon.innerText = '🚪';
    document.getElementById('sirenTitle').innerText = `🚪 CHECK-OUT ALARM: Door Opened (Customer Departed)`;
  }
  document.getElementById('sirenDesc').innerText = alert.message || 'Door event detected.';
  banner.style.display = 'flex';
}

function dismissBanner() {
  document.getElementById('securitySirenBanner').style.display = 'none';
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function viewLatestAlert() {
  switchTab('owner');
  const alertSection = document.getElementById('alertsTableBody');
  if (alertSection) alertSection.scrollIntoView({ behavior: 'smooth' });
}

// Modal Handlers (Manager Only)
function openNewBookingModal() {
  document.getElementById('bookingModal').classList.add('active');
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
  document.getElementById('bookingForm').reset();
}

async function submitBooking(event) {
  event.preventDefault();
  const roomId = document.getElementById('bookRoomSelect').value;
  const customerName = document.getElementById('bookCustomerName').value;
  const customerPhone = document.getElementById('bookCustomerPhone').value;
  const amount = document.getElementById('bookAmount').value;
  const paymentMethod = document.getElementById('bookPaymentMethod').value;
  const paymentStatus = document.getElementById('bookPaymentStatus').value;

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: roomId,
        customer_name: customerName,
        customer_phone: customerPhone,
        amount,
        payment_method: paymentMethod,
        payment_status: paymentStatus
      })
    });
    const data = await res.json();
    if (data.success) {
      closeBookingModal();
      await loadAllData();
      switchTab('excel'); // show in excel sheet!
    } else {
      alert('Error: ' + data.error);
    }
  } catch (e) {
    alert('Failed to create booking: ' + e.message);
  }
}

async function checkInBooking(bookingId) {
  try {
    await fetch(`/api/bookings/${bookingId}/check-in`, { method: 'PATCH' });
    await loadAllData();
  } catch (e) {
    console.error('Check-in error', e);
  }
}

async function checkOutBooking(bookingId) {
  try {
    await fetch(`/api/bookings/${bookingId}/check-out`, { method: 'PATCH' });
    await loadAllData();
  } catch (e) {
    console.error('Check-out error', e);
  }
}

async function cancelBooking(bookingId) {
  const reason = prompt('Please enter cancellation reason for audit log:');
  if (reason === null) return;
  try {
    await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    await loadAllData();
  } catch (e) {
    console.error('Cancellation error', e);
  }
}
