Backend deployment (Docker / docker-compose)

This project provides a small Express backend that can be deployed with Docker.

Quick run (on the server):

1. Install Docker & docker-compose.
2. Create a directory for persistent data (same folder as repo):
   mkdir data uploads
3. Set a secure JWT secret before starting (required):
   export JWT_SECRET='a-very-secure-value'

4. Build & run:
   docker-compose up -d --build

What the compose file does

- Builds the image from the repository Dockerfile.
- Mounts ./uploads to /app/uploads so uploaded files persist.
- Mounts ./data to /app so dev.db persists across restarts (DATABASE_URL=/app/dev.db).
- Exposes port 4000.

Production recommendations

- Use a proper managed database (Postgres) in production. To switch, set DATABASE_URL to a Postgres DSN and update backend/db.js to use a Postgres client or Prisma.
- Ensure JWT_SECRET is set to a long, random secret and not checked into source control.
- Run behind a reverse proxy (nginx) or load balancer with TLS.
- Use a process manager or orchestrator for scaling/rollbacks (Kubernetes, Docker Swarm, or a PaaS like Render).

CI/CD

- The repo includes a Dockerfile and GitHub Actions workflow (ci.yml) that builds the image — adapt it to push images to your registry (Docker Hub, GitHub Packages) and deploy to your host.
