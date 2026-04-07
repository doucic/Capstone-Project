// ═══════════════════════════════════════════════════════
// SMART PARKING — API SERVER
// Node.js + Express + Firebase Realtime Database
// ═══════════════════════════════════════════════════════

const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
const PORT = 3000;

/* ── MIDDLEWARE ───────────────────────────────────── */

app.use(cors()); // Mengizinkan akses dari semua origin (development)
app.use(express.json());

/* ── INISIALISASI FIREBASE ADMIN SDK ───────────────── */

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),

  // Ganti dengan URL Firebase Realtime Database kamu
  databaseURL:
    "https://smart-parking-cap-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = admin.database();

/* ── API: STATUS PARKIR ──────────────────────────────
   Endpoint: GET /api/status
   Mengambil status semua slot parkir dari Firebase
*/

app.get("/api/status", async (req, res) => {
  try {
    const snapshot = await db.ref("parkir").once("value");
    const data = snapshot.val();

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

    // Mengubah data Firebase menjadi array slot
    const slots = Object.entries(data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        // contoh: slotA1 → A1
        nama: key.replace("slot", ""),

        status: val.status || "unknown",

        jarak: parseFloat((val.jarak_cm || 0).toFixed(1)),
      }));

    // Hitung jumlah slot kosong
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

    res.status(500).json({
      sukses: false,
      pesan: err.message,
    });
  }
});

/* ── API: HEALTH CHECK ──────────────────────────────
   Endpoint: GET /api/health
   Untuk mengecek apakah server berjalan
*/

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    waktu: new Date().toISOString(),
  });
});

/* ── START SERVER ─────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`\n[OK] Server berjalan`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`API Status: http://localhost:${PORT}/api/status\n`);
});
