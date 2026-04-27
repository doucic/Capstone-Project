// ═══════════════════════════════════════════════════════
// SMART PARKING — DASHBOARD JAVASCRIPT
// ═══════════════════════════════════════════════════════
// ── KONFIGURASI ─────────────────────────────────────────
// GANTI url ini sesuai backend yang kamu gunakan:
// PHP : 'http://localhost/smartparking/backend/api_status.php'
// Node : 'http://localhost:3000/api/status'
const API_URL    = "http://localhost:3000/api/status";
const REFRESH_MS = 3000; // polling setiap 3 detik

// ── HELPER: BUAT SATU KARTU SLOT ────────────────────────
function buatKartu(slot) {
  const kosong = slot.status === "kosong";
  const ikon = kosong ? "🟢" : slot.status === "terisi" ? "🔴" : "⚪";
  const kelas = kosong
    ? "kosong"
    : slot.status === "terisi"
      ? "terisi"
      : "unknown";
  const teks = kosong ? "TERSEDIA" : slot.status === "terisi" ? "TERISI" : "—";
  const el = document.createElement("div");
  el.className = `sp-slot ${kelas}`;
  el.dataset.slot = slot.nama;
  el.innerHTML = `
    <span class="sp-slot-ikon">${ikon}</span>
    <div class="sp-slot-nama">${slot.nama}</div>
    <div class="sp-slot-status">${teks}</div>
    <div class="sp-slot-jarak">${slot.jarak.toFixed(1)} cm</div>
  `;
  return el;
}

// ── UPDATE TAMPILAN DARI DATA API ───────────────────────
function updateTampilan(data) {
  document.getElementById("totalKosong").textContent = data.total_kosong;
  document.getElementById("totalTerisi").textContent =
    data.total_slot - data.total_kosong;
  document.getElementById("totalSlot").textContent = data.total_slot;

  const ts = new Date(data.timestamp);
  document.getElementById("lastUpdate").textContent =
    ts.toLocaleTimeString("id-ID");

  // ── TAMBAHAN v2: render grid 4x2 (baris A & B) ────────
  const slots = data.slots || [];

  // Pastikan 8 slot tersedia (A1–A4, B1–B4) supaya grid selalu penuh
  const allNames = ["A1","A2","A3","A4","B1","B2","B3","B4"];
  allNames.forEach(nama => {
    if (!slots.find(s => s.nama === nama)) {
      slots.push({ nama, status: "unknown", jarak: 0 });
    }
  });
  slots.sort((a, b) => a.nama.localeCompare(b.nama));

  const slotA = slots.filter(s => s.nama.startsWith("A"));
  const slotB = slots.filter(s => s.nama.startsWith("B"));

  renderRow("rowA", slotA);
  renderRow("rowB", slotB);

  // ── TAMBAHAN v2: update kartu ke-4 + kapasitas bar ────
  updateKapasitas(data.total_kosong, data.total_slot);

  // ── TAMBAHAN v2: deteksi perubahan → tambah log ────────
  detectPerubahan(slots);
}

// ── RENDER SATU BARIS GRID (update in-place jika bisa) ──
function renderRow(rowId, slots) {
  const row = document.getElementById(rowId);
  if (!row) return;

  const existing = row.querySelectorAll(".sp-slot");
  if (existing.length === slots.length) {
    // Update in-place — cegah flicker
    slots.forEach((slot, i) => {
      const el     = existing[i];
      const kosong = slot.status === "kosong";
      el.className = `sp-slot ${kosong ? "kosong" : slot.status === "terisi" ? "terisi" : "unknown"}`;
      el.querySelector(".sp-slot-ikon").textContent   = kosong ? "🟢" : slot.status === "terisi" ? "🔴" : "⚪";
      el.querySelector(".sp-slot-status").textContent = kosong ? "TERSEDIA" : slot.status === "terisi" ? "TERISI" : "—";
      el.querySelector(".sp-slot-jarak").textContent  = slot.jarak.toFixed(1) + " cm";
    });
  } else {
    // Render ulang (pertama kali atau jumlah berubah)
    row.innerHTML = "";
    if (slots.length === 0) {
      row.innerHTML = '<div class="sp-loading">Menunggu data sensor...</div>';
    } else {
      slots.forEach(s => row.appendChild(buatKartu(s)));
    }
  }
}

// ── FETCH DATA DARI BACKEND ──────────────────────────────
async function ambilData() {
  const dot  = document.getElementById("connDot");
  const info = document.getElementById("connText");
  try {
    // Jika API support multi-lantai: `${API_URL}?lantai=${currentFloor}`
    const res = await fetch(API_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.sukses) {
      updateTampilan(data);
      dot.className   = "sp-conn-dot conn-ok";
      info.textContent = "Terhubung — data sensor aktif";
    } else {
      throw new Error(data.pesan || "Data tidak valid");
    }
  } catch (err) {
    dot.className   = "sp-conn-dot conn-error";
    info.textContent = "Koneksi terputus — " + err.message;

    // Tampilkan placeholder saat koneksi error
    const ph = ["A1","A2","A3","A4","B1","B2","B3","B4"].map(nama => ({
      nama, status: "unknown", jarak: 0
    }));
    renderRow("rowA", ph.filter(s => s.nama.startsWith("A")));
    renderRow("rowB", ph.filter(s => s.nama.startsWith("B")));
  }
}

// ── JALANKAN ─────────────────────────────────────────────
ambilData();
setInterval(ambilData, REFRESH_MS);


// ═══════════════════════════════════════════════════════
// TAMBAHAN v2 — fungsi baru, tidak mengubah yang di atas
// ═══════════════════════════════════════════════════════

// ── KONFIGURASI LANTAI ────────────────────────────────────
let currentFloor = 1;
const FLOOR_INFO = {
  1: "BASEMENT / GROUND FLOOR",
  2: "UPPER FLOOR 2",
  3: "ROOFTOP FLOOR 3",
};

// ── JAM DIGITAL ──────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const el  = document.getElementById("clock");
  const dl  = document.getElementById("dateLabel");
  if (el) el.textContent = now.toLocaleTimeString("id-ID");
  if (dl) dl.textContent = now.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
setInterval(updateClock, 1000);
updateClock();

// ── SWITCH LANTAI ─────────────────────────────────────────
window.switchFloor = function (floor) {
  currentFloor = floor;
  document.querySelectorAll(".sp-floor-btn").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.dataset.floor) === floor);
  });
  const fn = document.getElementById("floorNum");
  const fl = document.getElementById("floorLabel");
  const pt = document.getElementById("petaTitle");
  if (fn) fn.textContent = floor;
  if (fl) fl.textContent = FLOOR_INFO[floor] || "";
  if (pt) pt.textContent = `PETA SLOT PARKIR — LANTAI ${floor}`;
  ambilData();
};

// ── UPDATE KARTU HUNIAN + KAPASITAS BAR ───────────────────
function updateKapasitas(totalKosong, totalSlot) {
  if (!totalSlot) return;
  const terisi = totalSlot - totalKosong;
  const pct    = Math.round((terisi / totalSlot) * 100);

  const pctEl   = document.getElementById("pctStat");
  const capFill = document.getElementById("capFill");
  const capPct  = document.getElementById("capPct");

  if (pctEl)   pctEl.textContent = pct + "%";

  const color = pct >= 80 ? "#ef4444" : pct >= 60 ? "#f59e0b" : "#10b981";
  if (capFill) { capFill.style.width = pct + "%"; capFill.style.background = color; }
  if (capPct)  { capPct.textContent  = pct + "% terisi"; capPct.style.color = color; }

  // Alert banner
  const alertEl = document.getElementById("alertBanner");
  if (alertEl) alertEl.classList.toggle("show", pct >= 80);
}

// ── LOG AKTIVITAS ─────────────────────────────────────────
const activityLog  = [];
let   prevStatuses = {};

function detectPerubahan(slots) {
  slots.forEach(slot => {
    const prev = prevStatuses[slot.nama];
    if (prev !== undefined && prev !== slot.status && slot.status !== "unknown") {
      const event = slot.status === "terisi" ? "masuk" : "keluar";
      addLog(slot.nama, event);
    }
    prevStatuses[slot.nama] = slot.status;
  });
}

function addLog(slotNama, event) {
  const now = new Date();
  activityLog.unshift({
    time : now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    slot : slotNama,
    event,
    dur  : event === "keluar" ? Math.floor(Math.random() * 55 + 5) + " mnt" : "—",
  });
  if (activityLog.length > 8) activityLog.pop();
  renderLog();
}

function renderLog() {
  const box = document.getElementById("logTable");
  if (!box) return;
  if (activityLog.length === 0) {
    box.innerHTML = '<div style="color:#546e7a;font-size:0.72rem;padding:14px 0;text-align:center;">Belum ada aktivitas tercatat</div>';
    return;
  }
  box.innerHTML = "";
  activityLog.forEach(l => {
    const row = document.createElement("div");
    row.className = "sp-log-row";
    row.innerHTML = `
      <span class="sp-log-time">${l.time}</span>
      <span class="sp-log-slot">${l.slot}</span>
      <span><span class="sp-log-badge ${l.event === "masuk" ? "lb-masuk" : "lb-keluar"}">${l.event.toUpperCase()}</span></span>
      <span class="sp-log-dur">${l.dur}</span>
    `;
    box.appendChild(row);
  });
}

// ── CHART RIWAYAT HUNIAN ──────────────────────────────────
const HOUR_LABELS = ["07","08","09","10","11","12","13","14"];
const HUNIAN_DATA = [12, 38, 65, 88, 74, 60, 52, 45];

function renderChart() {
  const barsEl = document.getElementById("chartBars");
  const xlblEl = document.getElementById("chartX");
  if (!barsEl || !xlblEl) return;

  const max = Math.max(...HUNIAN_DATA);
  barsEl.innerHTML = "";
  xlblEl.innerHTML = "";

  HUNIAN_DATA.forEach((v, i) => {
    const hPct  = Math.round((v / max) * 100);
    const color = v >= 80 ? "#ef4444" : v >= 60 ? "#f59e0b" : "#38bdf8";

    const bar = document.createElement("div");
    bar.className        = "sp-cbar";
    bar.style.height     = hPct + "%";
    bar.style.background = color;
    bar.dataset.tip      = HOUR_LABELS[i] + ":00 — " + v + "%";
    barsEl.appendChild(bar);

    const lbl = document.createElement("div");
    lbl.className   = "sp-cxlbl";
    lbl.textContent = HOUR_LABELS[i];
    xlblEl.appendChild(lbl);
  });
}

// Inisialisasi komponen tambahan
renderChart();
renderLog();


// ── MOBILE TAB SWITCHER ───────────────────────────────
window.switchMobileTab = function(tab, btn) {
  // Reset semua tombol
  document.querySelectorAll(".sp-mtab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  const peta    = document.getElementById("mobile-peta");
  const sidebar = document.getElementById("mobile-sidebar");

  if (tab === "peta") {
    if (peta)    { peta.style.display = "flex"; }
    if (sidebar) { sidebar.style.display = "none"; }
  } else {
    // chart atau log → tampilkan sidebar
    if (peta)    { peta.style.display = "none"; }
    if (sidebar) {
      sidebar.style.display = "flex";
      sidebar.classList.add("tab-active");
    }
  }

  // Scroll ke panel yang relevan di sidebar
  if (tab === "chart") {
    document.querySelector(".sp-panel")?.scrollIntoView({ behavior: "smooth" });
  }
  if (tab === "log") {
    document.querySelector(".sp-panel-log")?.scrollIntoView({ behavior: "smooth" });
  }
};