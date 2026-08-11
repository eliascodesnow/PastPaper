Deploying the frontend to Vercel

Steps (recommended for the provided Vercel account):

1. Sign in to Vercel and click "Import Project" → "Import Git Repository".
2. Connect your GitHub account and select the repository: iamnotelias/PastPaper.
3. Under "Root Directory" set: (leave blank) or set to / if prompted. Important: set the "Output Directory" to "frontend" so Vercel serves the static frontend files.
4. Framework Preset: choose "Other" or "Static Site". No build command is required because the frontend is plain HTML/CSS/JS.
5. Add Environment Variables (Settings → Environment Variables):
   - API_BASE = https://<your-backend-url>/api (production backend URL)
   - Optionally set NODE_ENV=production
6. Click Deploy.

Notes about API and auth:

- The frontend reads API_BASE (window.API_BASE) to contact the backend. Set API_BASE to your deployed backend URL (not the Vercel frontend URL).
- Backend should be deployed separately (Dockerfile provided). Ensure JWT_SECRET and SQLITE_DB_PATH are set in the backend environment.

Preview deployments and branches:

- Vercel will create preview deployments for PRs/branches. For preview testing, set API_BASE in the Preview/Development env settings to point at a staging backend or your local tunnelling URL (ngrok etc.).

Optional: proxy /api to external backend

- If you want the frontend and backend to share the same origin, add a rewrite in vercel.json to forward /api to your backend URL. Example (edit vercel.json):
  {
  "rewrites": [ { "source": "/api/(.*)", "destination": "https://api.example.com/api/$1" } ]
  }
  Replace "https://api.example.com" with your backend URL.

If you want, provide Vercel project access or the backend URL and I can finish environment variable suggestions or verify a preview deploy.
