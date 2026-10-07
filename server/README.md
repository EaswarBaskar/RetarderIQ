# Retarder IQ API

This API keeps credentials and external webhook URLs off the browser. It stores each diagnostic case in PostgreSQL before forwarding it to configured reporting systems.

## Local setup

1. Install Node.js 18+ and PostgreSQL.
2. Create a database named `retarder_iq`.
3. Copy `.env.example` to `.env` and set a strong `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
4. Add the Google Apps Script and Power Automate URLs only to `.env`.
5. Install and start the API:

```powershell
cd server
npm install
npm start
```

Run the forwarding worker separately in production:

```powershell
npm run worker
```

The API serves the existing frontend at `http://localhost:3000`. The first configured admin account is created automatically on startup.

Diagnostic submissions are stored first and return immediately. A background worker forwards them to configured reporting destinations with exponential backoff, up to eight attempts. `forward_status`, `forward_attempts`, and `forward_error` remain visible for operational monitoring.

Guest technicians receive a signed, anonymous 12-hour session token. Guest sessions are not inserted into the `users` table; diagnostic ownership is retained with the session UUID while the token is valid.

Open `http://localhost:3000/admin` for the protected admin dashboard. It provides report search, report details, technician account creation, and account activation/deactivation.

## Create technician accounts

Run this while the database is configured:

```powershell
npm run create-user -- technician@example.com StrongPassword123 technician
```

Administrators can also use the protected `POST /api/users` endpoint. Users can be disabled with `PATCH /api/users/:id/active` without deleting their history.

## Production requirements

- Use HTTPS and a managed PostgreSQL instance.
- Store `.env` in the hosting provider's secret manager; never commit it.
- Replace the bootstrap admin flow with an invite/reset-password flow.
- Configure `FRONTEND_ORIGIN` to the exact deployed origin.
- Rotate any webhook signatures that were previously exposed in browser code.

## Frontend assets

Page-level CSS and JavaScript are served as external files. Translation dictionaries are split into `data/languages/*.json`; update the locale JSON files when translations change.
## Diagnostic catalog

The hosted application loads diagnostic questions and branches from `data/diagnosticSteps.v1.0.0.json`. Technical teams can update question text, branch targets, reasons, and badges in that JSON file without editing the application logic. Keep branch keys unique and run `npm test` after changes.

When publishing a new catalog version, update the version filename and `DIAGNOSTIC_DATA_VERSION` in `js/diagnosticSteps.js`, then run `npm run export-diagnostic-json` only when regenerating from the bundled fallback.
