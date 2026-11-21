# Deploying INFINITE

INFINITE has two runtime pieces that need to coexist:

| Piece | Requirement |
| --- | --- |
| **Web app** (Next.js) | Long-running Node process (not a static export) |
| **Agent worker** | A process that outlives requests, plus a writable disk |
| **State** | `./data/infinite.db` (SQLite) and `./storage/media` (generated webp variants) |

That means **a persistent volume and a non-serverless host**, unless you do the Postgres migration described at the end.

---

## 1 · Docker (recommended)

```bash
cp .env.example .env.local     # add IMAGE_PROVIDER + key
docker compose up --build
```

`docker-compose.yml` mounts `./data` and `./storage` as volumes and runs the web server with the agent inside it. Podman works identically.

The image also contains the worker CLI if you prefer splitting roles:

```bash
docker compose run --rm web npx tsx scripts/agent.ts
```

## 2 · Render / Railway / Fly.io

1. Deploy this repository as a **web service** (Dockerfile build, or native Node with `npm run build` + `npm start`).
2. Attach a **persistent disk** and mount it at `/app/data` (or set `DATA_DIR` to the mount path).
3. Mount a second disk (or the same one) for media and set `MEDIA_DIR=/app/storage/media`.
4. Set the environment variables from `.env.example`, including `AGENT_AUTOSTART=true`.
5. For a dedicated worker, create a second service from the same image with the command `npx tsx scripts/agent.ts`, `AGENT_AUTOSTART=false`, and the same disk mounts.

## 3 · VPS / systemd

```ini
# /etc/systemd/system/infinite.service
[Unit]
Description=INFINITE web
After=network.target

[Service]
WorkingDirectory=/srv/infinite
EnvironmentFile=/srv/infinite/.env.local
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

Put Caddy or nginx in front for TLS. Because generation costs money and `/studio` can spend it, protect the studio:

```caddy
handle /studio* {
  basic_auth { admin <bcrypt-hash> }
  reverse_proxy 127.0.0.1:3000
}
handle {
  reverse_proxy 127.0.0.1:3000
}
```

Also set `AGENT_TICK_TOKEN` if you expose `/api/agent/tick`.

---

## 4 · Vercel — what it needs

Vercel's filesystem is read-only apart from `/tmp`, `/tmp` is per-instance and ephemeral, and functions are not long-lived. A direct deploy of this build would therefore lose saved collections and publish nothing, so it is **not** deployed there by default.

To run INFINITE on Vercel you need three changes, in this order:

1. **Postgres data adapter.** Apply `supabase/migrations/0001_init.sql`, then move `src/lib/repo/*` and the pipeline's SQL from SQLite to Postgres (the schema already carries `tsvector` search, GIN indexes, RLS and feed functions). SQLite-specific bits to replace: `FTS5` → `search_vector @@ websearch_to_tsquery`, `rowid` random sort → `md5(id)`, `julianday()` → `extract(epoch …)`.
2. **Supabase Storage** for media: `STORAGE_DRIVER=supabase` + `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_MEDIA_BUCKET` + `SUPABASE_SERVICE_ROLE_KEY` (server only). The driver already writes `<image-id>/full|medium|thumb.webp` and returns public bucket URLs.
3. **External worker.** Set `AGENT_AUTOSTART=false` on Vercel and run `npm run agent` on a small always-on machine (or a Render/Fly container) pointed at the same database, or drive ticks from Vercel Cron:

   ```json
   { "crons": [{ "path": "/api/agent/tick", "schedule": "*/5 * * * *" }] }
   ```

   Protect it with `AGENT_TICK_TOKEN` and send `Authorization: Bearer <token>`.

Until the adapter lands, the supported hosts are the container-based ones above. Deploying the SQLite build to Vercel is deliberately not offered, because a demo that silently drops saves would misrepresent the product.

---

## 5 · Operations

**Backups**

```bash
sqlite3 data/infinite.db ".backup 'backup-$(date +%F).db'"
tar czf media-$(date +%F).tar.gz storage/media
```

**Cost control**

* `Studio → Budget` pauses the agent automatically when spend reaches the limit.
* `IMAGE_QUALITY=low` (OpenAI) and `fal-ai/flux/schnell` are the cheapest paths.
* `IMAGE_COST_CENTS` overrides the per-image estimate used for budgeting.
* Concurrency and frequency bound the request rate; the queue is never unbounded.

**Scaling the library**

* Raise `batchSize` and `concurrency` as the budget allows.
* The feed stays fast because queries are paginated and indexed, and the grid only ever requests 512/960/1600 webp variants.
* `POST /api/agent/tick` is idempotent and safe to schedule from cron.

**Storage growth**

A 1600/960/512 webp set averages ~250–400 KB per image, so 10k images ≈ 3–4 GB. Point `STORAGE_DRIVER` at a bucket before you get there.

**Multi-user**

Collections currently belong to the single local profile (`owner_id = 'local'`) and the Supabase policies open them for the demo. Add authentication and scope the policies to `auth.uid()` before exposing writes to the public.
