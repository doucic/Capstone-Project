// ═══════════════════════════════════════════════════════════════
// SMART PARKING — API SERVER (Node.js + Express)
// Versi update: tambah endpoint riwayat parkir untuk dashboard petugas
// ═══════════════════════════════════════════════════════════════

const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ── INISIALISASI FIREBASE ADMIN SDK ─────────────────────────────
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL:
    "https://smart-parking-cap-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = admin.database();

// ── STATE LOKAL: lacak status slot sebelumnya ────────────────────
// Digunakan untuk mendeteksi KAPAN slot berubah dari kosong→terisi
// dan terisi→kosong, agar bisa mencatat riwayat masuk/keluar.
let statusSebelumnya = {}; // { A1: 'kosong', A2: 'terisi', ... }
let waktuMasuk = {}; // { A1: ISOString, ... }

// ── HELPER: catat event riwayat ke Firebase ──────────────────────
async function catatRiwayat(namaSlot, event, waktu) {
  // Struktur di Firebase: /riwayat/<push-key>
  //   { slot, event: 'masuk'|'keluar', waktu: ISO, tanggal: 'YYYY-MM-DD' }
  const tanggal = waktu.toISOString().split("T")[0];
  await db.ref("riwayat").push({
    slot: namaSlot,
    event, // 'masuk' atau 'keluar'
    waktu: waktu.toISOString(),
    tanggal,
    label: `Slot ${namaSlot} — ${event === "masuk" ? "Kendaraan Masuk" : "Kendaraan Keluar"}`,
  });
}

// ── POLLING FIREBASE: deteksi perubahan status slot ─────────────
// Setiap 4 detik server membaca /parkir dan membandingkan dengan
// status sebelumnya. Jika ada perubahan, riwayat dicatat otomatis.
setInterval(async () => {
  try {
    const snap = await db.ref("parkir").once("value");
    const data = snap.val();
    if (!data) return;

    const sekarang = new Date();

    for (const [key, val] of Object.entries(data)) {
      const namaSlot = key.replace("slot", ""); // 'slotA1' → 'A1'
      const statusBaru = val.status || "unknown";
      const statusLama = statusSebelumnya[namaSlot];

      if (statusLama === undefined) {
        // Inisialisasi pertama — simpan status tanpa mencatat event
        statusSebelumnya[namaSlot] = statusBaru;
        if (statusBaru === "terisi") waktuMasuk[namaSlot] = sekarang;
        continue;
      }

      if (statusLama !== statusBaru) {
        if (statusBaru === "terisi") {
          // Slot baru saja terisi → catat "masuk"
          waktuMasuk[namaSlot] = sekarang;
          await catatRiwayat(namaSlot, "masuk", sekarang);
        } else if (statusBaru === "kosong") {
          // Slot baru saja kosong → catat "keluar"
          await catatRiwayat(namaSlot, "keluar", sekarang);
          delete waktuMasuk[namaSlot];
        }
        statusSebelumnya[namaSlot] = statusBaru;
      }
    }
  } catch (err) {
    console.error("[Polling] Error:", err.message);
  }
}, 4000);

// ════════════════════════════════════════════════════════════════
// ENDPOINT: GET /api/status
// Digunakan oleh dashboard utama (monitor pintu masuk)
// ════════════════════════════════════════════════════════════════
app.get("/api/status", async (req, res) => {
  try {
    const snap = await db.ref("parkir").once("value");
    const data = snap.val();

    if (!data) {
      return res.json({
        sukses: true,
        slots: [],
        total_kosong: 0,
        total_slot: 0,
        timestamp: new Date().toISOString(),
        pesan: "Belum ada data dari sensor.",
      });
    }

    const slots = Object.entries(data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        nama: key.replace("slot", ""),
        status: val.status || "unknown",
        jarak: parseFloat((val.jarak_cm || 0).toFixed(1)),
      }));

    const total_kosong = slots.filter((s) => s.status === "kosong").length;

    res.json({
      sukses: true,
      slots,
      total_kosong,
      total_slot: slots.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Firebase error:", err.message);
    res.status(500).json({ sukses: false, pesan: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ENDPOINT: GET /api/riwayat
// Digunakan oleh dashboard petugas
//
// Query params (opsional):
//   ?tanggal=2026-04-07       → filter per tanggal (YYYY-MM-DD)
//   ?slot=A1                  → filter per slot
//   ?event=masuk              → filter per event (masuk / keluar)
//   ?limit=50                 → jumlah data (default 100, max 500)
// ════════════════════════════════════════════════════════════════
app.get("/api/riwayat", async (req, res) => {
  try {
    const { tanggal, slot, event: ev, limit: limitParam } = req.query;
    const limit = Math.min(parseInt(limitParam) || 100, 500);

    // Ambil riwayat terbaru (ordered by key = push timestamp ascending)
    const snap = await db
      .ref("riwayat")
      .orderByKey()
      .limitToLast(limit * 3) // ambil lebih banyak sebelum filter
      .once("value");

    const raw = snap.val();
    if (!raw) {
      return res.json({ sukses: true, riwayat: [], total: 0 });
    }

    // Ubah objek Firebase → array, urutkan terbaru di atas
    let list = Object.entries(raw)
      .map(([id, v]) => ({ id, ...v }))
      .reverse(); // terbaru pertama

    // Filter opsional
    if (tanggal) list = list.filter((r) => r.tanggal === tanggal);
    if (slot) list = list.filter((r) => r.slot === slot.toUpperCase());
    if (ev) list = list.filter((r) => r.event === ev);

    // Potong sesuai limit
    list = list.slice(0, limit);

    // Format tampilan (waktu lokal WIB untuk ditampilkan)
    const riwayat = list.map((r) => {
      const dt = new Date(r.waktu);
      const wib = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(dt);

      // Pisah tanggal & jam dari format id-ID
      const [tgl, jam] = wib.split(", ");

      return {
        id: r.id,
        slot: r.slot,
        event: r.event,
        label: r.label,
        tanggal: tgl, // DD/MM/YYYY
        jam: jam, // HH:MM:SS
        waktu_iso: r.waktu,
      };
    });

    res.json({
      sukses: true,
      riwayat,
      total: riwayat.length,
      filter: { tanggal, slot, event: ev, limit },
    });
  } catch (err) {
    console.error("Riwayat error:", err.message);
    res.status(500).json({ sukses: false, pesan: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ENDPOINT: GET /api/riwayat/ringkasan
// Statistik per slot: total masuk hari ini, minggu ini, bulan ini
// ════════════════════════════════════════════════════════════════
app.get("/api/riwayat/ringkasan", async (req, res) => {
  try {
    const snap = await db
      .ref("riwayat")
      .orderByKey()
      .limitToLast(2000)
      .once("value");

    const raw = snap.val() || {};
    const list = Object.values(raw);

    const now = new Date();
    const hariIni = now.toISOString().split("T")[0];
    const startMinggu = new Date(now);
    startMinggu.setDate(now.getDate() - now.getDay());
    const startBulan = new Date(now.getFullYear(), now.getMonth(), 1);

    const hitung = (filterFn) =>
      list.filter((r) => r.event === "masuk" && filterFn(new Date(r.waktu)))
        .length;

    res.json({
      sukses: true,
      hari_ini: hitung((d) => d.toISOString().split("T")[0] === hariIni),
      minggu_ini: hitung((d) => d >= startMinggu),
      bulan_ini: hitung((d) => d >= startBulan),
      total_all: list.filter((r) => r.event === "masuk").length,
    });
  } catch (err) {
    res.status(500).json({ sukses: false, pesan: err.message });
  }
});

// ── GET /api/health ─────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", waktu: new Date().toISOString() });
});

// ── START SERVER ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[OK] Server berjalan  : http://localhost:${PORT}`);
  console.log(`     Status slot      : http://localhost:${PORT}/api/status`);
  console.log(`     Riwayat parkir   : http://localhost:${PORT}/api/riwayat`);
  console.log(
    `     Ringkasan        : http://localhost:${PORT}/api/riwayat/ringkasan`,
  );
  console.log(`     Dashboard petugas: buka frontend/petugas.html di browser`);
  console.log(
    `[INFO] Polling Firebase setiap 4 detik untuk deteksi perubahan slot...`,
  );
});
