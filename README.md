# Retarder IQ — Smart Diagnostic Assistant

Retarder IQ is a web application and diagnostic assistant designed for heavy vehicle technicians servicing electro-magnetic and hydraulic retarders (such as Ashok Leyland BS-VI HB1200 and TML systems).

---

## 🚀 Deployment Overview

The project is structured into two parts:
1. **Frontend (Static PWA)** — Ready for **Vercel**, GitHub Pages, or any static web host.
2. **Backend API (`server/`)** — Node.js / Express REST API with PostgreSQL, ready for **Render** (blueprint included) or any Node host.

---

## ⚡ Quick Deployment Guide

### 1. GitHub
1. Create a new repository on [GitHub](https://github.com/new).
2. Upload or push this project codebase.
3. The `.gitignore` automatically excludes `node_modules`, `.env`, logs, and temporary files.

### 2. Vercel (Frontend)
1. Go to [Vercel](https://vercel.com/) and click **Add New > Project**.
2. Import your GitHub repository.
3. Settings:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./` (leave default)
   - **Build Command**: None (leave empty)
   - **Output Directory**: None (leave empty)
4. Click **Deploy**.
5. Once deployed, if you are running a separate API, update `js/config.js` with your deployed API URL:
   ```js
   window.RIQ_API_BASE_URL = 'https://your-api.onrender.com';
   ```

### 3. Render (Backend API & Database)
1. In [Render Dashboard](https://dashboard.render.com/), choose **New > Blueprint**.
2. Select your GitHub repository.
3. Render will detect `render.yaml` and configure:
   - PostgreSQL Database (`retarder_iq_db`)
   - Web API Service (`server`)
   - Async Forwarding Worker (`worker`)
4. Fill in the required environment variables:
   - `JWT_SECRET`: Random 32+ character string
   - `ADMIN_EMAIL`: Admin email address
   - `ADMIN_PASSWORD`: Strong password
   - `FRONTEND_ORIGIN`: Your deployed Vercel URL (e.g., `https://retarder-iq.vercel.app`)

For detailed step-by-step instructions, see [`DEPLOY.md`](file:///DEPLOY.md).

---

## 💻 Local Development

### Frontend
You can open `index.html` directly in a browser, or run a local static web server:
```powershell
npx serve .
```

### Backend API
```powershell
cd server
Copy-Item .env.example .env
npm install
npm start
```

Access:
- Frontend: `http://localhost:3000`
- Admin Dashboard: `http://localhost:3000/admin`
- API Health Check: `http://localhost:3000/api/health`

---

## 📁 Project Structure

```text
├── admin.html               # Admin dashboard interface
├── index.html               # Main diagnostic application
├── manifest.json            # PWA manifest
├── service-worker.js        # Offline PWA service worker
├── vercel.json              # Vercel routing configuration
├── render.yaml              # Render blueprint deployment config
├── DEPLOY.md                # In-depth deployment guide
├── asset/                   # Images, diagrams, logos, and audio
├── css/                     # Application stylesheets
├── data/                    # Multilingual catalogs & diagnostic steps JSON
├── js/                      # Frontend JavaScript modules
└── server/                  # Backend Node.js Express API & PostgreSQL
    ├── migrations/          # Versioned SQL migrations
    ├── scripts/             # Admin & maintenance scripts
    ├── src/                 # Server routes, controllers, middleware
    ├── schema.sql           # Database bootstrap schema
    ├── package.json         # Server dependencies & scripts
    └── .env.example         # Template for environment variables
```
