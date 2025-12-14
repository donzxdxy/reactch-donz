const express = require("express")
const serverless = require("serverless-http")
const axios = require("axios")
const fs = require("fs")

const app = express()
app.set("trust proxy", true)

// ================= CONFIG =================
const OWNER_APIKEY = "DonzyDevTzy"
const USER_APIKEY = "donzfree"
const USER_LIMIT = 25
const COOLDOWN = 20 * 60 * 1000
const MOVANEST_TOKEN = "movanest-keyLH0W2NBE99"
const DB_FILE = "/tmp/ipdb.json"
// =========================================

// INIT DB
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    ips: {},
    blocked: {},
    users: {}
  }))
}
const loadDB = () => JSON.parse(fs.readFileSync(DB_FILE))
const saveDB = d => fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2))

// REAL IP
function getIP(req) {
  return (
    req.headers["x-nf-client-connection-ip"] ||
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "unknown"
  ).replace("::ffff:", "")
}

// ================= MIDDLEWARE =================
app.use(async (req, res, next) => {
  const ip = getIP(req)
  const db = loadDB()

  if (db.blocked[ip]) {
    return res.status(403).json({
      status: false,
      message: "YOUR IP BLOCKED",
      ip
    })
  }

  if (!db.ips[ip]) {
    let geo = {}
    try {
      const r = await axios.get(`https://ipwho.is/${ip}`)
      if (r.data?.success) geo = r.data
    } catch {}

    db.ips[ip] = {
      ip,
      country: geo.country || "-",
      isp: geo.connection?.isp || "-",
      last_request: 0
    }
    saveDB(db)
  }

  req.clientIP = ip
  next()
})

// ================= REACTCH =================
app.get("/api/reactch", async (req, res) => {
  const { url, emoji, apikey } = req.query
  const ip = req.clientIP
  const db = loadDB()

  if (!apikey || (apikey !== OWNER_APIKEY && apikey !== USER_APIKEY)) {
    return res.status(401).json({ status:false, message:"Invalid apikey" })
  }

  // LIMIT USER
  if (apikey === USER_APIKEY) {
    db.users[apikey] ??= { used: 0 }
    if (db.users[apikey].used >= USER_LIMIT) {
      return res.json({
        status:false,
        message:"Limit apikey habis"
      })
    }
  }

  // COOLDOWN
  const now = Date.now()
  const last = db.ips[ip].last_request || 0
  if (now - last < COOLDOWN) {
    return res.status(429).json({
      status:false,
      message:"HARAP JEDA 20 MENIT YA CUYY :)",
      retry_after: Math.ceil((COOLDOWN-(now-last))/1000)
    })
  }

  db.ips[ip].last_request = now
  if (apikey === USER_APIKEY) db.users[apikey].used++
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
      status:true, 
      creator: "DonzyTzy", 
      message: "React Channel Successfully By Donzy", 
      ip,
      emoji,
      remainingcoins:r.data.remainingCoins
    })
  } catch(e) {
    res.status(500).json({ status:false, error:e.message })
  }
})

// ================= OWNER =================
app.get("/api/listip", (req,res)=>{
  if(req.query.apikey!==OWNER_APIKEY)
    return res.status(401).json({status:false})
  res.json(loadDB().ips)
})

app.get("/api/blockip",(req,res)=>{
  if(req.query.apikey!==OWNER_APIKEY)
    return res.status(401).json({status:false})
  const db=loadDB()
  db.blocked[req.query.ip]=true
  saveDB(db)
  res.json({status:true,blocked:req.query.ip})
})

app.get("/api/unblockip",(req,res)=>{
  if(req.query.apikey!==OWNER_APIKEY)
    return res.status(401).json({status:false})
  const db=loadDB()
  delete db.blocked[req.query.ip]
  saveDB(db)
  res.json({status:true,unblocked:req.query.ip})
})

module.exports.handler = serverless(app)
