# Deploying to Supabase + Vercel

This is the **official deployment guide** for PastPaper. The application is built to run on **Supabase** (database & storage) and **Vercel** (frontend & serverless API).

## Prerequisites

- Supabase account (https://supabase.com)
- Vercel account (https://vercel.com)
- GitHub repository access

## Step 1: Set up Supabase

### 1.1 Create a Supabase Project

1. Go to https://supabase.com and sign in
2. Create a new project
3. Note your project URL and anon key from the project settings

### 1.2 Create Database Tables

Run the following SQL in the Supabase SQL editor:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  reg_number VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  course VARCHAR(100),
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Papers table
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  unit_code VARCHAR(50),
  unit_name VARCHAR(255),
  course VARCHAR(100),
  exam_type VARCHAR(50),
  year INT,
  file_name VARCHAR(255),
  file_path VARCHAR(255),
  file_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'PENDING',
  rejection_reason TEXT,
  screening_report JSONB,
  download_count INT DEFAULT 0,
  uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);
CREATE INDEX IF NOT EXISTS idx_papers_uploader_id ON papers(uploader_id);
CREATE INDEX IF NOT EXISTS idx_papers_course_year_exam ON papers(course, year, exam_type);
CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_created_at ON papers(created_at DESC);
```

### 1.3 Set up Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. Create a new bucket named `papers`
3. Make it **public** (for download access)
4. Configure CORS in Storage settings if needed:
   ```
   ["GET", "POST", "PUT", "DELETE"]
   ```

### 1.4 (Optional) Enable RLS

For production, enable Row Level Security:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;
```

## Step 2: Deploy to Vercel

### 2.1 Connect Repository

1. Go to https://vercel.com/dashboard
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository (`eliascodesnow/PastPaper`)
4. Select the repository and click **Import**

### 2.2 Configure Environment Variables

In Vercel project settings → **Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase project URL (from Step 1.1) |
| `SUPABASE_ANON_KEY` | Your Supabase anon key (from Step 1.1) |
| `JWT_SECRET` | A strong random secret (generate with: `openssl rand -base64 32`) |

### 2.3 Deployment Settings

The following are already configured in `vercel.json`:

- **Build Command**: `cd backend && npm install`
- **Output Directory**: `frontend`
- **Root Directory**: `./` (default)

### 2.4 Deploy

Click **"Deploy"** — Vercel will automatically:
1. Install backend dependencies
2. Route `/api/*` requests to the Express backend
3. Serve frontend static files
4. Set environment variables

## Step 3: Update Frontend Configuration

In your frontend code, ensure the API base URL points to your Vercel deployment:

```javascript
const API_BASE = window.API_BASE || '/api';
```

The frontend will automatically use relative URLs (`/api/*`), which works perfectly with Vercel's routing.

## Important Notes

- **Database**: PostgreSQL via Supabase (no local SQLite)
- **File Storage**: Supabase Storage bucket (no local filesystem)
- **Serverless**: Vercel Serverless Functions — no persistent disk
- **Automatic Backups**: Supabase handles daily backups
- **Scaling**: Automatically scales with usage

## Monitoring & Logs

### Vercel Logs
- Dashboard: https://vercel.com/dashboard → Your Project → Deployments
- Click on any deployment to see build and runtime logs

### Supabase Logs
- Dashboard: https://app.supabase.com → Your Project → Logs
- Monitor database queries and API requests

## Troubleshooting

### 401/403 Errors
- Verify `SUPABASE_ANON_KEY` is correct in Vercel environment variables
- Check Supabase project settings for the correct anon key

### File Upload Fails
- Confirm Supabase Storage bucket `papers` exists and is public
- Check bucket size (Supabase free tier: 1GB)

### Database Connection Issues
- Verify `SUPABASE_URL` format (should be `https://xxx.supabase.co`)
- Check Supabase project is active and not paused

### API 404 Errors
- Ensure `/api/health` returns `{"ok": true, "service": "pastpaper-api"}`
- Check Vercel build logs for errors
- Verify backend dependencies installed correctly

## Rollback / Redeploy

To redeploy after fixes:
1. Push changes to GitHub
2. Go to Vercel dashboard → Your Project
3. Click **"Redeploy"** on the latest commit
4. Or enable automatic deployments on push

## Next Steps

- Implement Supabase Auth for OAuth (Google, GitHub, etc.)
- Add automated backups to cloud storage
- Set up monitoring alerts in Supabase
- Implement CDN caching for static files
- Consider upgrading Supabase tier for production usage
