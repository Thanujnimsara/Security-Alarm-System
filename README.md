# 🏨 Restaurant Room Security & Booking Verification System
**කාමර 10 සඳහා ආරක්ෂක හා වෙන්කිරීම් තහවුරු කිරීමේ පද්ධතිය**

මෙම පද්ධතිය මඟින් Restaurant Room 10 (Room 01 — Room 10) හි සිදුවන සියලුම Door Sensor සංඥා (Open/Closed), Manager විසින් සිදුකරන Bookings, Payments සහ Audit Logs එකිනෙක සසඳා බලා අනවසර කාමර භාවිතය (හොර වැඩ) Owner වෙත ක්ෂණිකව Alert කරයි.

---

## 🌟 ප්රධාන අංග (Key Features)

1. **Door Monitoring (කාමර 10 සඳහා)**:
   - Door Open: සාමාන්ය තත්ත්වය (Normal / Vacant).
   - Door Closed (With Booking): අනුමත පාරිභෝගික භාවිතය (Authorized Occupancy).
   - **Door Closed (WITHOUT Booking)**: 🚨 **SECURITY ALERT!** Owner වෙත ක්ෂණික ශබ්ද අනතුරු ඇඟවීම් (Audio Siren), Visual Alert Banner සහ SMS/Call Dispatch.
2. **Manager Booking Desk**:
   - Booking දැමීම, Customer Check-in, Check-out සහ Cleaning තත්ත්වයන් කළමනාකරණය.
   - Payment මුදල් (Cash / Card) සහ ගෙවීම් තත්ත්වය (PAID / PENDING) සටහන් කිරීම.
3. **Owner Security Center**:
   - Real-time Live Stream (Server-Sent Events) මඟින් පිටුව Refresh නොකරම ක්ෂණික alerts ලැබීම.
   - Manager හට වෙනස් කළ නොහැකි **Tamper-Proof Audit Trail** (කවුරුන් කවදා කුමක් කළේද යන්න සටහන් වේ).
4. **TURBOGEAR PST-G30 Sensor Lab**:
   - Webhook API (`POST /api/door-events`) මඟින් සැබෑ PST-G30 panel හෝ Wireless magnetic door sensors සම්බන්ධ කිරීමේ පහසුකම.
   - Browser එකෙන්ම තත්පරයකින් Sensor Open/Close කර බැලිය හැකි Interactive Simulator.

---

## 🛡️ රහසිගත පද්ධති සැලැස්ම (Covert Dual-Portal Architecture)

Manager මෙම ආරක්ෂක පද්ධතිය ගැන නොදැන සිටිය යුතු බැවින් පද්ධතිය කොටස් 2කට වෙන් කර ඇත:

1. **👔 Restaurant Cashier / Front Desk PC එක සඳහා (`/manager`)**:
   - URL: `http://localhost:5000/manager`
   - පෙනුම: සාමාන්ය **"Green Valley Restaurant - Front Desk & Billing Desk"**.
   - කිසිදු Sensor, Door Status, Alarms, හෝ Security විස්තරයක් මෙහි **නොපෙන්වයි**.
   - Manager හට කළ හැක්කේ කාමර Book කිරීම, Check-in / Check-out කිරීම සහ Bill එක සෑදීම පමණි.

2. **👑 Ownerගේ Personal Laptop / Phone එක සඳහා (`/owner`)**:
   - URL: `http://localhost:5000/owner`
   - ආරක්ෂිත **Owner Security & Door Alarm Command Center**.
   - කාමර 10යේම Door Sensors සජීවීව දැකීම.
   - Check-in, Check-out සහ Breach (හොර වැඩ) සයිරන් Alarms සහ Voice announcements.
   - Manager දාපු Bookings වල Excel Sheet View එක සහ Download Excel (.csv).
   - Tamper-proof Audit logs.

---

```text
security Alarm system/
├── config/
│   └── db.js                 # MySQL Connection Pool & Auto Schema Initializer
├── services/
│   └── securityEngine.js     # Rule Engine (Breach Detection, Siren, Audit Logs)
├── public/
│   ├── index.html            # Owner & Manager Modern Web Dashboard
│   ├── style.css             # Glassmorphism Dark Theme & Animations
│   └── app.js                # Live SSE, Web Audio API Siren & Controls
├── .env                      # Database & Server Settings
├── package.json              # Express, MySQL2, Dotenv, CORS
├── schema.sql                # Complete MySQL Schema (7 Tables)
└── server.js                 # Main Backend Application Server
```

---

## 🚀 ධාවනය කරන ආකාරය (How to Run)

### පියවර 1: XAMPP MySQL Start කරන්න
1. XAMPP Control Panel විවෘත කරන්න.
2. **MySQL** ඉදිරියෙන් ඇති **Start** බොත්තම ඔබන්න.
3. `http://localhost/phpmyadmin` වෙත ගොස් `schema.sql` file එකේ ඇති SQL code එක run කර `restaurant_security` database එක සාදාගත හැක (හෝ system එක මඟින් ස්වයංක්රීයවම මෙය සකස් කරනු ලබයි).

### පියවර 2: Backend Server එක Start කරන්න
VS Code Terminal එකේ පහත command එක run කරන්න:
```bash
npm run dev
# හෝ
npm start
```

### පියවර 3: Web Dashboard එක බලන්න
ඕනෑම Web Browser එකකින් පහත link එක විවෘත කරන්න:
👉 **http://localhost:5000**

---

## 🔌 PST-G30 Sensor Integration (සැබෑ Sensor එක සම්බන්ධ කිරීම)

1. **Zone Setup**:
   - Zone 1 = Room 01
   - Zone 2 = Room 02
   - Zone 3 = Room 03
   - Zone 4 = Room 04
   - Zone 5 = Room 05
2. **Webhook API Endpoint**:
   - `POST http://<YOUR_IP>:5000/api/door-events`
3. **JSON Payload**:
   ```json
   {
     "room_id": 3,
     "door_status": "CLOSED",
     "source": "PST_G30_ZONE_3"
   }
   ```
