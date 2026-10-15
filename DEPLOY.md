# Retarder IQ deployment

## 1. Upload to GitHub

Create a new GitHub repository and upload the contents of this folder. Do not upload `server/.env` or any password/API key. The included `.gitignore` excludes environment files and dependencies.

## 2. Deploy the API and database on Render

1. In Render, choose **New > Blueprint** and select the GitHub repository.
2. Set the blueprint file to `render.yaml`.
3. Fill in `FRONTEND_ORIGIN`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` when Render asks for secret values.
4. Add the Google Apps Script and Power Automate URLs if those integrations are required.
5. Copy the deployed API URL, for example `https://retarder-iq-api.onrender.com`.

The Render blueprint creates the PostgreSQL database, API, and forwarding worker. The API health check is `/api/health`.

## 3. Deploy the frontend on Vercel

1. In `js/config.js`, replace the empty value with the Render API URL:

   ```js
   window.RIQ_API_BASE_URL = 'https://retarder-iq-api.onrender.com';
   ```

2. Commit that change to GitHub.
3. In Vercel, choose **Add New > Project**, import the repository, and deploy it with the project root set to the repository root.
4. No build command or output directory is required; this is a static frontend.

After deployment, set Render's `FRONTEND_ORIGIN` to the exact Vercel URL and redeploy the API. Then open the Vercel URL and test a guest diagnostic and `/admin`.

## Local run

```powershell
cd server
Copy-Item .env.example .env
npm install
npm start
```

## Database migrations and security

The API keeps a compatibility bootstrap for existing deployments, but production schema changes are versioned in `server/migrations/`. Apply `001-technician-security.sql` with the same PostgreSQL connection used by the API before deploying the new server. It adds phone uniqueness, account statuses, GPS consent fields, audit logs, single-use password-reset tokens, and technician OEM/model assignments without deleting diagnostic data. Existing technicians with no assigned model must be reassigned by an admin before submitting new diagnostics.

Set `NODE_ENV=production`, use a random `JWT_SECRET` of at least 32 characters, set `FRONTEND_ORIGIN` to the exact HTTPS frontend origin, and keep all administrator passwords and forwarding URLs in the hosting provider's secret store. Never commit `.env` or expose reset tokens outside local development.

Technician registration stores GPS coordinates only when the technician explicitly consents. If permission is denied, city and state remain manually editable and the registration continues without coordinates. Admin users can review status, registration time, last login, and permitted inspection location from the dashboard.

The API serves the frontend locally at `http://localhost:3000`. Run `npm run worker` in a second terminal when testing forwarding.
