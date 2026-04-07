// ═══════════════════════════════════════════════════════
// SMART PARKING — DASHBOARD JAVASCRIPT
// ═══════════════════════════════════════════════════════
// ── KONFIGURASI ─────────────────────────────────────────
// GANTI url ini sesuai backend yang kamu gunakan:
// PHP : 'http://localhost/smartparking/backend/api_status.php'
// Node : 'http://localhost:3000/api/status'
const API_URL = "http://localhost:3000/api/status";
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
 <div class="sp-slot-nama">Slot ${slot.nama}</div>
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
  const grid = document.getElementById("slotGrid");
  const existing = grid.querySelectorAll(".sp-slot");
  if (existing.length === data.slots.length) {
    // Update in-place (tanpa re-render, mencegah flicker)
    data.slots.forEach((slot, i) => {
      const el = existing[i];
      const kosong = slot.status === "kosong";
      el.className = `sp-slot ${
        kosong ? "kosong" : slot.status === "terisi" ? "terisi" : "unknown"
      }`;
      el.querySelector(".sp-slot-ikon").textContent = kosong
        ? "🟢"
        : slot.status === "terisi"
          ? "🔴"
          : "⚪";
      el.querySelector(".sp-slot-status").textContent = kosong
        ? "TERSEDIA"
        : slot.status === "terisi"
          ? "TERISI"
          : "—";
      el.querySelector(".sp-slot-jarak").textContent =
        slot.jarak.toFixed(1) + " cm";
    });
  } else {
    // Render ulang (pertama kali atau jumlah slot berubah)
    grid.innerHTML = "";
    if (data.slots.length === 0) {
      grid.innerHTML =
        '<div class="sp-loading">Menunggu data dari sensor...</div>';
    } else {
      data.slots.forEach((s) => grid.appendChild(buatKartu(s)));
    }
  }
}
// ── FETCH DATA DARI BACKEND ──────────────────────────────
async function ambilData() {
  const dot = document.getElementById("connDot");
  const info = document.getElementById("connText");
  try {
    const res = await fetch(API_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.sukses) {
      updateTampilan(data);
      dot.className = "sp-conn-dot conn-ok";
      info.textContent = "Terhubung — data sensor aktif";
    } else {
      throw new Error(data.pesan || "Data tidak valid");
    }
  } catch (err) {
    dot.className = "sp-conn-dot conn-error";
    info.textContent = "Koneksi terputus — " + err.message;
  }
}
