const express = require("express")
const serverless = require("serverless-http")
const axios = require("axios")
const fs = require("fs")

const app = express()
app.set("trust proxy", true)

// ===== CONFIG =====
const APIKEY = "donz"
const MOVANEST_TOKEN = "movanest-keyLH0W2NBE99"
const COOLDOWN = 20 * 60 * 1000
const DB_FILE = "/tmp/ipdb.json"

// ===== INIT DB =====
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ ips: {} }))
}
const loadDB = () => JSON.parse(fs.readFileSync(DB_FILE))
const saveDB = (d) => fs.writeFileSync(DB_FILE, JSON.stringify(d))

// ===== REAL IP (NETLIFY) =====
function getClientIP(req) {
  let ip =
    req.headers["x-nf-client-connection-ip"] ||
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    ""

  ip = ip.replace("::ffff:", "").trim()

  if (
    !ip ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.")
  ) return null

  return ip
}

// ===== MIDDLEWARE =====
app.use(async (req, res, next) => {
  let ip = getClientIP(req)
  const db = loadDB()

  if (!ip) {
    try {
      const auto = await axios.get("https://ipwho.is/")
      if (auto.data?.success) ip = auto.data.ip
    } catch {
      ip = "unknown"
    }
  }

  if (!db.ips[ip]) {
    let info = {}
    try {
      const r = await axios.get(`https://ipwho.is/${ip}`)
      if (r.data?.success) info = r.data
    } catch {}

    db.ips[ip] = {
      ip,
      country: info.country || "-",
      isp: info.connection?.isp || "-",
      last_request: 0
    }
    saveDB(db)
  }

  req.clientIP = ip
  next()
})

// ===== ENDPOINT FINAL =====
app.get("/api/reactch", async (req, res) => {
  const { url, emoji, apikey } = req.query
  const ip = req.clientIP
  const db = loadDB()

  if (apikey !== APIKEY) {
    return res.status(401).json({
      status: false,
      message: "Invalid apikey"
    })
  }

  if (!url || !emoji) {
    return res.status(400).json({
      status: false,
      message: "url & emoji wajib"
    })
  }

  const now = Date.now()
  const last = db.ips[ip].last_request || 0

  if (now - last < COOLDOWN) {
    return res.status(429).json({
      status: false,
      retry_after: Math.ceil((COOLDOWN - (now - last)) / 1000)
    })
  }

  db.ips[ip].last_request = now
  saveDB(db)

  try {
    const r = await axios.get("https://movanest.zone.id/user-coin", {
      params: {
        user_api_key: MOVANEST_TOKEN,
        postUrl: url,
        emojis: emoji
      }
    })

    res.json({
      status: true,
      creator: "Donzy",
      ip,
      remainingCoins: r.data.remainingCoins
    })
  } catch (e) {
    res.status(500).json({
      status: false,
      error: e.message
    })
  }
})

// 🚨 WAJIB EXPORT HANDLER
module.exports.handler = serverless(app)
