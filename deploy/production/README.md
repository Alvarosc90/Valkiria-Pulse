# Valkiria PULSE production deployment

PULSE is isolated from TrainIA at runtime. TrainIA will consume it as a module/client.

## Target

- Public URL: `https://pulse.valkiria.tech`
- Host-bound container port: `127.0.0.1:8081`
- MySQL: private Docker network only
- API and worker: private Docker network only

## First deployment

```bash
git clone https://github.com/Alvarosc90/Valkiria-Pulse.git
cd Valkiria-Pulse
git checkout feature/pulse-mvp
cd deploy/production
cp .env.example .env
nano .env
docker compose build
docker compose up -d
docker compose ps
curl -I http://127.0.0.1:8081
curl http://127.0.0.1:8081/health
```

Generate independent random values for the database passwords, both auth secrets and the 32-byte base64 credential encryption key. Never reuse TrainIA application secrets unless the provider app is intentionally shared.

## Bootstrap first tenant

For a non-production demo only, set `PULSE_DEV_OWNER_EMAIL` and `PULSE_DEV_OWNER_PASSWORD` temporarily and run:

```bash
docker compose exec api npm run db:seed:dev --workspace @pulse/api
```

Then remove those bootstrap variables from `.env`.

## Reverse proxy / Cloudflare

Point `pulse.valkiria.tech` to the VPS and proxy HTTPS traffic to `127.0.0.1:8081`.

Before enabling each OAuth button, register these exact callback URLs in the corresponding developer portal:

- `https://pulse.valkiria.tech/api/v1/connections/instagram/callback`
- `https://pulse.valkiria.tech/api/v1/connections/tiktok/callback`
- `https://pulse.valkiria.tech/api/v1/connections/linkedin/callback`

## Upgrade

```bash
git pull
docker compose build
docker compose up -d
docker compose ps
```

The API container runs checksum-protected SQL migrations before starting.
