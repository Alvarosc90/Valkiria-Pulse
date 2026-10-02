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
chmod +x bootstrap-env.sh deploy.sh security-preflight.sh restore-smoke-test.sh
./bootstrap-env.sh
nano .env
./deploy.sh
curl -I http://127.0.0.1:8081
curl http://127.0.0.1:8081/health
```

The bootstrap script generates independent database passwords, JWT secrets, the 32-byte base64 credential-encryption key and the TrainIA/PULSE SSO secret. It refuses to overwrite an existing `.env`. Fill only the provider OAuth credentials and optional model-gateway settings afterward. Never reuse database, JWT or provider secrets for SSO.

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


## Backups

Production Compose includes a dedicated backup container. It creates:
- a compressed MySQL dump;
- a compressed media-library archive;
- a SHA-256 manifest;
- a `.last_success` health marker.

Defaults:
- interval: 24 hours;
- retention: 14 days;
- host directory: `/opt/valkiria-pulse/backups`.

Validate a backup without touching production:

```bash
cd deploy/production
chmod +x restore-smoke-test.sh security-preflight.sh
./restore-smoke-test.sh /opt/valkiria-pulse/backups/pulse-YYYYMMDDTHHMMSSZ.sql.gz
```

## Security preflight

Before exposing the service publicly:

```bash
cd deploy/production
chmod 600 .env
./security-preflight.sh .env
```

The check validates secret strength, independent JWT/encryption keys, HTTPS public URLs, CORS, loopback-only web exposure, private MySQL/API ports and backup freshness.

## TrainIA SSO

PULSE and TrainIA must share one independent random SSO secret, stored only in runtime environment files:

PULSE:
```text
TRAINIA_SSO_SECRET=<same-random-value>
TRAINIA_SSO_ISSUER=trainia
TRAINIA_SSO_AUDIENCE=valkiria-pulse
```

TrainIA:
```text
PULSE_SSO_SECRET=<same-random-value>
PULSE_SSO_ISSUER=trainia
PULSE_SSO_AUDIENCE=valkiria-pulse
PULSE_BASE_URL=https://pulse.valkiria.tech
```

Do not reuse JWT, database, provider or credential-encryption secrets for this value.
