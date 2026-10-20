// Front Desk Manager App
let managerRooms = [];
let managerBookings = [];

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  loadManagerData();
  initManagerSse();
  setInterval(loadManagerData, 8000); // Poll updates every 8 seconds fallback
});

function initManagerSse() {
  try {
    const evtSource = new EventSource('/api/events/stream');
    evtSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'ROOM_UPDATE' || parsed.type === 'SECURITY_ALERT' || parsed.type === 'AUDIT_LOG_ADDED') {
          loadManagerData();
        }
      } catch (e) {}
    };
  } catch (e) {}
}

function initClock() {
  const clockEl = document.getElementById('managerClock');
  function update() {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString() + ' (Front Desk)';
  }
  update();
  setInterval(update, 1000);
}

async function loadManagerData() {
  await Promise.all([
    loadRooms(),
    loadBookings()
  ]);
}

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    managerRooms = await res.json();
    renderRooms();
    updateCounters();
  } catch (e) {
    console.error('Failed to load rooms', e);
  }
}

function renderRooms() {
  const container = document.getElementById('managerRoomsContainer');
  if (!container || !managerRooms.length) return;

  container.innerHTML = managerRooms.map(room => {
    const hasBooking = !!room.active_booking;
    let badgeClass = 'badge-available';
    if (room.room_status === 'OCCUPIED') badgeClass = 'badge-occupied';
    else if (room.room_status === 'BOOKED') badgeClass = 'badge-booked';
    else if (room.room_status === 'CLEANING') badgeClass = 'badge-cleaning';

    return `
      <div class="room-card" style="border: 1px solid rgba(255, 255, 255, 0.08);">
        <div>
          <div class="room-header">
            <span class="room-number-tag">${room.room_name}</span>
            <span class="room-status-badge ${badgeClass}">${room.room_status}</span>
          </div>

          <div style="background: rgba(0,0,0,0.25); border-radius: 8px; padding: 12px; margin-bottom: 1rem;">
            <div style="font-size: 0.82rem; color: #94a3b8; margin-bottom: 4px;">Current Guest Status:</div>
            ${hasBooking ? `
              <div style="font-weight: 700; color: #f8fafc; font-size: 0.95rem;">
                ${room.active_booking.customer_name}
                ${room.active_booking.customer_nic ? `<span style="font-size: 0.72rem; color: #94a3b8; font-weight: 500;"> (NIC: ${room.active_booking.customer_nic})</span>` : ''}
              </div>
              <div style="font-size: 0.78rem; color: #818cf8; margin-top: 2px;">Invoice: ${room.active_booking.booking_code}</div>
              <div style="font-size: 0.75rem; color: #34d399; margin-top: 4px;">Status: ${room.active_booking.status}</div>
            ` : `
              <div style="color: #64748b; font-size: 0.85rem; font-style: italic;">Room Ready / Vacant</div>
            `}
          </div>
        </div>

        <div class="room-actions">
          ${room.room_status === 'CLEANING' ? `
            <button class="btn btn-primary" style="flex: 1; background: #059669; border-color: #10b981; font-weight: 700;" onclick="markRoomAvailable(${room.id})">
              ✔ Cleaning Done (Make Available)
            </button>
            <button class="btn btn-secondary" style="font-size: 0.8rem;" onclick="openBookingForRoom(${room.id})">
              + Bill
            </button>
          ` : !hasBooking ? `
            <button class="btn btn-primary" style="flex: 1;" onclick="openBookingForRoom(${room.id})">
              + Reserve & Bill
            </button>
          ` : `
            ${room.active_booking.status === 'BOOKED' ? `
              <button class="btn btn-primary" style="flex: 1;" onclick="checkInBooking(${room.active_booking.id})">
                Check-In Guest
              </button>
            ` : `
              <button class="btn btn-secondary" style="flex: 1;" onclick="checkOutBooking(${room.active_booking.id})">
                Check-Out & Free Room
              </button>
            `}
          `}
        </div>
      </div>
    `;
  }).join('');
}

function updateCounters() {
  const avail = managerRooms.filter(r => r.room_status === 'AVAILABLE').length;
  const occ = managerRooms.filter(r => r.room_status === 'OCCUPIED').length;
  const booked = managerRooms.filter(r => r.room_status === 'BOOKED').length;
  const clean = managerRooms.filter(r => r.room_status === 'CLEANING').length;

  document.getElementById('kpiManagerAvailable').innerText = avail;
  document.getElementById('kpiManagerOccupied').innerText = occ;
  document.getElementById('kpiManagerBooked').innerText = booked;
  document.getElementById('kpiManagerCleaning').innerText = clean;
}

async function loadBookings() {
  try {
    const res = await fetch('/api/bookings');
    managerBookings = await res.json();
    renderBookings();
  } catch (e) {
    console.error('Failed to load bookings', e);
  }
}

function renderBookings() {
  const tbody = document.getElementById('managerBookingsTableBody');
  if (!tbody) return;

  if (!managerBookings.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 2rem; color: #64748b;">No customer bookings recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = managerBookings.map((b, idx) => {
    const rawCheckIn = b.check_in || b.check_in_time || b.created_at;
    const rawCheckOut = b.check_out || b.check_out_time;
    const inDate = rawCheckIn && !isNaN(new Date(rawCheckIn)) ? new Date(rawCheckIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A';
    const outDate = rawCheckOut && !isNaN(new Date(rawCheckOut)) ? new Date(rawCheckOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Active';
    const rowAmt = Number(b.amount || b.total_price || b.paid_amount || 0);
    const rName = b.room_name || `Room ${String(b.room_id || 1).padStart(2, '0')}`;
    const bCode = b.booking_code || `BK-${String(842100 + (b.id || idx + 1))}`;

    return `
      <tr>
        <td><strong style="color: #818cf8;">${bCode}</strong></td>
        <td><strong>${rName}</strong></td>
        <td>
          <strong>${b.customer_name || 'Guest'}</strong>
          ${b.customer_nic ? `<br><span style="font-size: 0.72rem; color: #94a3b8; font-weight: 500;">NIC: ${b.customer_nic}</span>` : ''}
        </td>
        <td>${b.customer_phone || '-'}</td>
        <td style="font-size: 0.78rem;">${inDate}</td>
        <td style="font-size: 0.78rem;">${outDate}</td>
        <td style="font-weight: 700; color: #34d399;">Rs. ${rowAmt.toLocaleString()}</td>
        <td>
          <span class="tag-badge ${b.payment_status === 'PAID' ? 'tag-success' : 'tag-alert'}">
            ${b.payment_status || 'PAID'} (${b.payment_method || 'CASH'})
          </span>
        </td>
        <td><span class="tag-badge tag-booking">${b.status || 'BOOKED'}</span></td>
        <td>
          <div style="display: flex; gap: 4px;">
            ${b.status === 'BOOKED' ? `
              <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.72rem;" onclick="checkInBooking(${b.id})">Check In</button>
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.72rem; color: #f43f5e;" onclick="cancelBooking(${b.id})">Cancel</button>
            ` : ''}
            ${b.status === 'CHECKED_IN' ? `
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.72rem;" onclick="checkOutBooking(${b.id})">Check Out</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function formatLocalDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Modal Handlers
function openNewBookingModal() {
  document.getElementById('bookingModal').classList.add('active');
  const now = new Date();
  const later = new Date(Date.now() + 3 * 3600 * 1000); // 3 hours later
  document.getElementById('bookCheckIn').value = formatLocalDateTime(now);
  document.getElementById('bookCheckOut').value = formatLocalDateTime(later);
}

function handleBookingTypeChange() {
  const type = document.getElementById('bookType').value;
  if (type === 'WALK_IN') {
    const now = new Date();
    const later = new Date(Date.now() + 3 * 3600 * 1000);
    document.getElementById('bookCheckIn').value = formatLocalDateTime(now);
    document.getElementById('bookCheckOut').value = formatLocalDateTime(later);
  }
}

function openBookingForRoom(roomId) {
  document.getElementById('bookRoomSelect').value = roomId;
  openNewBookingModal();
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
  document.getElementById('bookingForm').reset();
}

async function submitManagerBooking(event) {
  event.preventDefault();
  const roomId = document.getElementById('bookRoomSelect').value;
  const customerName = document.getElementById('bookCustomerName').value;
  const customerNic = document.getElementById('bookCustomerNic') ? document.getElementById('bookCustomerNic').value.trim() : '';
  const customerPhone = document.getElementById('bookCustomerPhone').value;
  const amount = document.getElementById('bookAmount').value;
  const paymentMethod = document.getElementById('bookPaymentMethod').value;
  const paymentStatus = document.getElementById('bookPaymentStatus').value;
  const bookingType = document.getElementById('bookType').value;
  const checkIn = document.getElementById('bookCheckIn').value;
  const checkOut = document.getElementById('bookCheckOut').value;

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: roomId,
        customer_name: customerName,
        customer_nic: customerNic,
        customer_phone: customerPhone,
        check_in: checkIn,
        check_out: checkOut,
        booking_type: bookingType,
        amount,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        created_by: 2 // Manager ID
      })
    });
    const data = await res.json();
    if (data.success) {
      closeBookingModal();
      await loadManagerData();
      alert(`✅ Reservation Created & Bill Generated!\nCode: ${data.booking.booking_code}\nGuest: ${customerName}${customerNic ? ` (NIC: ${customerNic})` : ''}\nCheck-in: ${new Date(checkIn).toLocaleString()}\nCheck-out: ${new Date(checkOut).toLocaleString()}\nAmount: Rs. ${Number(amount).toLocaleString()}`);
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
    await loadManagerData();
  } catch (e) {
    console.error('Check-in error', e);
  }
}

async function checkOutBooking(bookingId) {
  try {
    await fetch(`/api/bookings/${bookingId}/check-out`, { method: 'PATCH' });
    await loadManagerData();
  } catch (e) {
    console.error('Check-out error', e);
  }
}

async function cancelBooking(bookingId) {
  const reason = prompt('Please enter cancellation reason for invoice record:');
  if (reason === null) return;
  try {
    await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    await loadManagerData();
  } catch (e) {
    console.error('Cancellation error', e);
  }
}

async function markRoomAvailable(roomId) {
  try {
    const res = await fetch(`/api/rooms/${roomId}/mark-available`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      await loadManagerData();
    } else {
      alert(data.error || 'Failed to update room');
    }
  } catch (e) {
    console.error('Error marking room available', e);
  }
}
