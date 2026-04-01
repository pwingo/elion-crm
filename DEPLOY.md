# Deploying Elion CRM to Cloud Run

## Prerequisites

- `gcloud` CLI authenticated (`gcloud auth login`)
- GCP project: `roi-intelligence`
- Region: `us-central1`
- Service name: `elion-crm`
- Service URL: https://elion-crm-884159837886.us-central1.run.app

## Deploy

From the project root:

```bash
gcloud run deploy elion-crm \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --env-vars-file .env.cloudrun.yaml
```

This builds the Docker image from source (using the Dockerfile), pushes to Artifact Registry, and deploys to Cloud Run in one command.

## Environment Variables

All env vars are stored in `.env.cloudrun.yaml` (gitignored). To update env vars without rebuilding:

```bash
gcloud run services update elion-crm \
  --region us-central1 \
  --env-vars-file .env.cloudrun.yaml
```

### Required variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string (pooled) |
| `NEXTAUTH_SECRET` | HMAC signing key for session cookies |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Must be `https://elion-crm-884159837886.us-central1.run.app/api/auth/callback` |
| `ANTHROPIC_API_KEY` | Claude API key for draft generation |
| `ALLOWED_EMAILS` | Comma-separated list of allowed Google emails |
| `NEXT_PUBLIC_APP_URL` | Must be `https://elion-crm-884159837886.us-central1.run.app` |

### Optional variables

| Variable | Description |
|----------|-------------|
| `ATTIO_API_KEY` | Attio CRM API key for email resolution |

## Google OAuth Setup

The Google OAuth client must have the production callback URL in its authorized redirect URIs:

1. Go to https://console.cloud.google.com/apis/credentials?project=roi-intelligence
2. Edit the OAuth 2.0 Client ID (`491330188687-...`)
3. Under **Authorized redirect URIs**, ensure this is listed:
   ```
   https://elion-crm-884159837886.us-central1.run.app/api/auth/callback
   ```
4. Keep `http://localhost:3000/api/auth/callback` for local dev
5. Save

## Architecture Notes

- **Dockerfile**: Multi-stage build (deps → build → standalone runtime)
- **Next.js standalone output**: Produces a self-contained `server.js` (~50MB vs full node_modules)
- **Dummy build-time env vars**: The Dockerfile sets placeholder env vars during `pnpm build` because Next.js page data collection imports server modules at build time. Real values come from Cloud Run at runtime.
- **Port**: Cloud Run expects 8080 (set in Dockerfile via `ENV PORT=8080`)
- **Database**: Supabase PostgreSQL (external, not in GCP) — accessible from Cloud Run without VPC config
- **Auth gate**: Only emails in `ALLOWED_EMAILS` can sign in. If the variable is empty/unset, the gate is open (local dev convenience).

## Troubleshooting

### Build fails

Check Cloud Build logs:
```bash
gcloud builds list --limit=1 --format="value(id)" --region=us-central1 | \
  xargs -I{} gcloud builds log {} --region=us-central1
```

Common causes:
- **TypeScript errors**: Run `pnpm build` locally first
- **Missing env vars at build time**: If a new module imports `lib/env.ts`, add the var to the Dockerfile's dummy env block

### OAuth redirect mismatch

If login fails with a redirect_uri_mismatch error, the production callback URL is missing from the Google OAuth console. See the Google OAuth Setup section above.

### View service logs

```bash
gcloud run services logs read elion-crm --region=us-central1 --limit=50
```
