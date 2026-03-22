# 🏭 RFID Factory — Conveyor Belt Inventory System v3.0

## 🚀 Deploy on Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select this repo — Railway auto-detects Node.js
4. Go to **Settings → Networking → Generate Domain**
5. Done! ✅

## 🚀 Deploy on Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect repo and set:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Deploy ✅

## 🔐 Default Login Accounts

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `1234` |
| Warehouse | `warehouse` | `1234` |
| Staff | `staff` | `1234` |

## ⚠️ Note on Data Persistence

This app uses JSON files for storage (`data/` folder).
On Railway/Render, files reset on every redeploy.
For permanent storage, migrate to MongoDB Atlas (free tier).

## Local Development

```bash
npm install
node server.js
# Open http://localhost:3000
```
