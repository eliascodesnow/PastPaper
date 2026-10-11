# Deploying to Supabase + Vercel

This guide covers deploying the PastPaper application using Supabase for database and file storage, and Vercel for hosting.

## Prerequisites

- Supabase account (https://supabase.com)
- Vercel account (https://vercel.com)
- GitHub repository access

## Step 1: Set up Supabase

### 1.1 Create a Supabase Project

1. Go to https://supabase.com and sign in
2. Create a new project
3. Note your project URL and anon key from the project settings

### 1.2 Create Tables

Run the following SQL in the Supabase SQL editor:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Papers table
CREATE TABLE papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_size INT,
  file_type VARCHAR(50),
  unit_code VARCHAR(50),
  unit_name VARCHAR(255),
  exam_type VARCHAR(50),
  year INT,
  extracted_text TEXT,
  screening_report JSONB,
  screening_status VARCHAR(50) DEFAULT 'pending',
  is_visible BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_papers_user_id ON papers(user_id);
CREATE INDEX idx_papers_screening_status ON papers(screening_status);
CREATE INDEX idx_papers_created_at ON papers(created_at DESC);
```

### 1.3 Enable RLS (Row Level Security) - Optional but recommended

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;
```

### 1.4 Set up Storage Bucket

1. Go to Storage in Supabase dashboard
2. Create a new bucket named `papers`
3. Set it to public (for download access)
4. Configure CORS if needed

## Step 2: Update Environment Variables

Create a `.env.local` file in the root directory:

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_jwt_secret_here
NODE_ENV=production
```

In the `backend/` directory, create `.env`:

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_jwt_secret_here
PORT=3000
```

## Step 3: Deploy to Vercel

### 3.1 Connect Repository

1. Go to https://vercel.com/dashboard
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Select "PastPaper"

### 3.2 Configure Environment Variables

In Vercel project settings → Environment Variables, add:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anon key
- `JWT_SECRET`: A strong random secret

### 3.3 Set Root Directory

In the project settings:
- Set "Root Directory" to `./` (or leave as default)
- The build command and output directory are already configured in `vercel.json`

### 3.4 Deploy

Click "Deploy" — Vercel will:
1. Install dependencies
2. Build the backend
3. Deploy the frontend as static files
4. Route `/api/*` requests to the backend

## Step 4: Update Frontend Configuration

In `frontend/js/api.js`, update the API base URL to your Vercel deployment:

```javascript
const API_BASE = window.API_BASE || 'https://your-vercel-deployment.vercel.app/api';
```

Or set it via environment variable in Vercel.

## Important Notes

- **File Uploads**: Files are now uploaded to Supabase Storage bucket `papers/`, not the filesystem
- **Database**: PostgreSQL via Supabase replaces SQLite
- **Serverless**: Vercel Serverless Functions mean no persistent local disk
- **Backups**: Supabase handles automatic backups
- **Scaling**: Automatically scales with Vercel + Supabase

## Monitoring & Logs

- **Vercel Logs**: https://vercel.com/dashboard → Your Project → Deployments
- **Supabase Logs**: Supabase Dashboard → Logs
- **Database Queries**: Use Supabase Studio query explorer

## Troubleshooting

### 401/403 Errors
- Verify SUPABASE_ANON_KEY is correct
- Check RLS policies if enabled

### File Upload Fails
- Confirm Supabase Storage bucket `papers` exists and is public
- Check bucket size limits (Supabase free tier: 1GB)

### Database Connection Issues
- Verify SUPABASE_URL format (should be https://xxx.supabase.co)
- Check firewall/IP restrictions in Supabase settings

## Next Steps

- Implement Supabase Auth for OAuth (Google, GitHub, etc.)
- Add automated backups to cloud storage
- Set up monitoring alerts
- Implement CDN caching for files
