# Deploying MBI Opportunities Hub to Vercel

This project is deployable to Vercel with a hosted PostgreSQL database.

## Required environment variables

Set these in **Vercel > Project > Settings > Environment Variables**:

- `DATABASE_URL` = your hosted Postgres connection string
- `JWT_SECRET` = a long random secret for signing tokens
- `PGSSLMODE=require` or `DB_SSL=true` = enable SSL for hosted Postgres providers like Neon
- `DB_SSL_REJECT_UNAUTHORIZED=false` = use this only if your provider requires it
- `ALLOWED_ORIGIN=https://your-app.vercel.app` = optional, for tighter CORS
- `SEED_ADMIN_EMAIL=admin@mindbridge.in` = optional, first admin login email
- `SEED_ADMIN_PASSWORD=your-strong-admin-password` = optional, first admin password

## Production behavior

- In production, the app requires `DATABASE_URL`.
- The local JSON fallback is for development only.
- The database layer seeds the first admin account automatically if it does not already exist.
- Do **not** depend on the local fallback store for Vercel production. It is not durable.

## Deployment steps

1. Create or choose a hosted Postgres database, such as Neon.
2. Add the environment variables above in Vercel.
3. Push the repo and deploy on Vercel.
4. Visit `/api/env-check` after deployment to verify:
   - `DATABASE_URL` is present
   - `JWT_SECRET` is present
   - the database connection succeeds
5. Log in with the seeded admin account and verify the dashboard loads.

## Local testing

You can test locally with the same env vars:

```powershell
$env:DATABASE_URL = 'postgres://username:password@host:5432/dbname'
$env:JWT_SECRET = 'replace-with-a-long-random-secret'
$env:DB_SSL = 'true'
$env:DB_SSL_REJECT_UNAUTHORIZED = 'false'
$env:ALLOWED_ORIGIN = 'http://localhost:3000'
npm run dev
```

Then open:

- `http://localhost:3000` or `http://localhost:3001`
- `/api/env-check`

## Notes

- If your Postgres provider needs SSL, keep `DB_SSL=true` or `PGSSLMODE=require`.
- For production, use a strong `JWT_SECRET`.
- The app exposes a preserved legacy API contract, so the UI and routes remain compatible with the current dashboard.
