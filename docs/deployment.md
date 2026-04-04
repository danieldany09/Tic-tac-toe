# Production Deployment Guide

Target platform: **DigitalOcean Droplet** (Ubuntu 22.04 LTS)

---

## 1. Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 (build machine only) |
| Docker | ≥ 24 |
| Docker Compose | ≥ 2.20 (bundled with Docker Desktop) |
| Git | any |

---

## 2. Nakama configuration (no static YAML in repo)

Nakama is started with **command-line flags** in [`docker-compose.yml`](../docker-compose.yml) and [`docker-compose.prod.yml`](../docker-compose.prod.yml) (database URL, `--runtime.path`, console credentials, production `--runtime.http_key`). There is no separate `config.yml` mounted into the container for this project, so all tunables live in those compose files or in your orchestration layer.

---

## 3. Provision a DigitalOcean Droplet

### Recommended spec (minimum for production)

| Resource | Value |
|----------|-------|
| OS | Ubuntu 22.04 LTS x64 |
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 80 GB SSD |
| Price | ~$24 / month (Basic Droplet) |

### Steps

1. Log in to [DigitalOcean](https://cloud.digitalocean.com).
2. **Create → Droplets** → choose Ubuntu 22.04, Basic, 4 GB plan.
3. Add your SSH public key under **Authentication**.
4. Click **Create Droplet**.
5. Note the public IP address (e.g. `203.0.113.42`).

### Open firewall ports (DigitalOcean Firewall or ufw)

```
SSH        22    TCP   your-IP only (restrict access)
HTTP       80    TCP   0.0.0.0/0
HTTPS      443   TCP   0.0.0.0/0
Nakama gRPC 7349 TCP   0.0.0.0/0
Nakama HTTP 7350 TCP   0.0.0.0/0
```

Console port 7351 must **NOT** be open publicly. Access it via SSH tunnel when needed.

---

## 4. Server Setup

SSH into the droplet, then run:

```bash
# Update system packages
apt-get update && apt-get upgrade -y

# Install Docker (official script)
curl -fsSL https://get.docker.com | sh

# Add current user to docker group (so you don't need sudo for docker)
usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

---

## 5. Deploy the Application

### 5a. Clone the repository

```bash
git clone https://github.com/<your-org>/tictactoe-nakama.git
cd tictactoe-nakama
```

### 5b. Create the .env file

```bash
cp .env.example .env
nano .env
```

Fill in **all** values – especially the passwords. Example:

```env
DB_NAME=nakama
DB_USER=nakama_user
DB_PASSWORD=Xk9#mPqL2vRz          # use a strong random password
NAKAMA_HTTP_KEY=httpkey_abc123xyz   # used by server-to-server calls
NAKAMA_CONSOLE_USERNAME=admin
NAKAMA_CONSOLE_PASSWORD=Admin#Secure99
DOMAIN=203.0.113.42                 # your droplet IP (or domain if you have one)
```

### 5c. Install Node.js (build step only)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 5d. Build and start

```bash
make deploy
```

This command will:
1. `npm install` dependencies
2. Bundle the TypeScript module → `nakama-data/modules/index.js`
3. Run `docker compose -f docker-compose.prod.yml up -d`
4. Nakama auto-migrates the database on first start

Compose also passes `--session.token_expiry_sec 3600` and `--session.refresh_token_expiry_sec 2592000` so clients (including automated tests) do not hit “session lifetime too short” warnings from the SDK.

### 5e. Verify

```bash
# Check all containers are healthy
docker compose -f docker-compose.prod.yml ps

# Watch Nakama logs
make deploy-logs

# Quick API ping
curl http://<YOUR_SERVER_IP>:7350/
# Expected: {"error":"missing token","code":16}  (means Nakama is up)
```

---

## 6. (Optional) Nginx Reverse Proxy + SSL

If you have a domain name, set up HTTPS termination with Nginx and Let's Encrypt.

### Install Nginx + Certbot

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

### Create Nginx site config

```bash
nano /etc/nginx/sites-available/tictactoe
```

Paste the following (replace `your-domain.com`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ { root /var/www/html; }

    # Redirect all HTTP → HTTPS
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Nakama HTTP API + WebSocket
    location / {
        proxy_pass http://127.0.0.1:7350;
        proxy_http_version 1.1;

        # WebSocket upgrade headers
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/tictactoe /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Obtain SSL certificate
certbot --nginx -d your-domain.com
```

---

## 7. Accessing the Nakama Console

The console runs on port 7351 (not publicly exposed). Access via SSH tunnel:

```bash
# On your local machine:
ssh -L 7351:localhost:7351 root@<YOUR_SERVER_IP>
```

Then open `http://localhost:7351` in your browser and log in with the credentials from `.env`.

---

## 8. Updating the Server

To redeploy after code changes:

```bash
git pull
make deploy
```

Docker Compose will recreate only the changed containers.

---

## 9. Monitoring and Maintenance

```bash
# Live logs
make deploy-logs

# Container status
docker compose -f docker-compose.prod.yml ps

# Resource usage
docker stats

# Database shell
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U nakama_user -d nakama
```

### Backup PostgreSQL

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U nakama_user nakama > backup_$(date +%Y%m%d).sql
```

---

## 10. Architecture Summary

```
Internet
   │
   ├─► Static files :443 (React SPA from web/dist, optional CDN)
   │
   ▼
Nginx :443 (SSL termination)
   │
   ▼
Nakama :7350 (HTTP API + WebSocket)
   │  authoritative match handler
   │  RPC: find_match / create_match / list_open_matches
   ▼
PostgreSQL :5432 (user accounts, sessions, storage)
```

All game logic runs exclusively on Nakama. Clients connect via WebSocket and exchange messages using the op codes defined in the protocol table below.

---

## 11. Client Integration Reference

### Connection

```
ws://your-domain.com/ws?token=<session_token>&status=true
```

### RPC endpoints

| RPC | Direction | Description |
|-----|-----------|-------------|
| `find_match` | client → server | Quick-play: finds open match or creates one |
| `create_match` | client → server | Creates a private match; share the ID with a friend |
| `list_open_matches` | client → server | Discovery: JSON body optional `{ "limit": 1–50 }`; returns `{ "matches": [ { "match_id", "size" } ] }` for rooms waiting for an opponent |

### Op codes

| Code | Direction | Payload | Description |
|------|-----------|---------|-------------|
| 1 | C → S | `{ "position": 0-8 }` | Submit a move |
| 2 | S → C | `StateUpdatePayload` | Updated board after each move |
| 3 | S → C | `GameOverPayload` | Game ended (win / draw / forfeit) |
| 4 | S → C | `PlayerReadyPayload` | Both players joined; game starts |
| 5 | S → C | `PlayerLeftPayload` | Opponent disconnected |
| 6 | S → C | `ErrorPayload` | Move rejected with reason code |

### Board index mapping

```
0 │ 1 │ 2
──┼───┼──
3 │ 4 │ 5
──┼───┼──
6 │ 7 │ 8
```

---

## 12. Deploy the web client (React SPA)

The playable UI lives in [`web/`](../web/) (Vite + React). It talks to Nakama over HTTP/WebSocket using the same RPC and match op codes as the Node tests.

### Build

On any machine with Node.js ≥ 18:

```bash
cd web
cp .env.example .env
# Edit .env: set VITE_NAKAMA_HOST to your public IP or domain that reaches Nakama :7350
npm install
npm run build
```

Output is `web/dist/`. Serve those static files from **HTTPS** (or HTTP for local-only demos) via Nginx, S3 + CloudFront, Netlify, Vercel, etc.

### Nginx example (same host as game API)

If the API is proxied at `https://game.example.com` to Nakama, you can serve the SPA on the same origin and point the env vars at that host (port 443, `VITE_NAKAMA_USE_SSL=true`). Alternatively, serve `web/dist` from `/` and keep the existing `location /` proxy to Nakama so API + WebSocket share the domain (see section 6).

### CORS and sockets

Browsers require a correct WebSocket URL and, for cross-origin setups, Nakama must allow your SPA origin. The simplest production pattern is **one domain** for both static assets and proxied Nakama (Nginx `proxy_pass` to `127.0.0.1:7350` as in section 6).

### Local development

```bash
# Terminal 1 — backend
make dev

# Terminal 2 — UI
cd web && npm run dev
```

Open `http://localhost:5173` with defaults (`127.0.0.1:7350`, `defaultkey`).
