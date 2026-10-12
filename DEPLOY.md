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

The API serves the frontend locally at `http://localhost:3000`. Run `npm run worker` in a second terminal when testing forwarding.
