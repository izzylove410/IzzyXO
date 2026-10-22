# Boomerang RP deployment checklist (IzzyXO)

## 0. Choose where the bot will run and create PostgreSQL

The existing repository already includes Docker Compose with a persistent PostgreSQL service. If you have a computer or VPS that can stay online, this is the simplest self-hosted path:

1. Install Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux).
2. Copy `.env.example` to `.env`.
3. Fill in the existing TitanBot values: `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`.
4. Set a unique strong `POSTGRES_PASSWORD` in `.env`. Do not leave the example password in place.
5. Generate two different random secrets (PowerShell examples):

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Put the first into `RP_BRIDGE_SECRET` and the second into `RP_DASHBOARD_TOKEN`. Set `RP_GUILD_ID` to your Discord server ID and `RP_LOG_CHANNEL_ID` to the channel where you want FiveM events logged. The `RP_PUBLIC_URL` must be the public HTTPS URL of the bot web server; do not leave the example URL.

6. Start the existing bot and database together from the repository root:

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f bot
```

The Compose file keeps PostgreSQL data in the named `postgres_data` volume. Do not delete that volume if you want to keep your database. Keep `.env` private and out of GitHub.

If you don't have an always-on computer/VPS, use a managed host such as Railway instead: create a service from the existing GitHub repository and a PostgreSQL database, then copy the provider's private database connection URL into `POSTGRES_URL` (or `DATABASE_URL`) and add the same RP variables in the service's environment settings. Do not publish the database URL or any secrets.

This integration lives in the existing TitanBot/IzzyXO application. Do not create a second bot deployment for Boomerang RP.

## 1. Bot host environment

Set these variables in the hosting provider's private environment settings (do not commit real values):

- `RP_GUILD_ID`: numeric Discord server ID that is allowed to send FiveM events.
- `RP_LOG_CHANNEL_ID`: numeric Discord text channel ID where events should be posted.
- `RP_BRIDGE_SECRET`: random secret, at least 32 characters.
- `RP_DASHBOARD_TOKEN`: a different random secret, at least 32 characters.
- `RP_PUBLIC_URL`: public HTTPS base URL for this running bot's Express app, without a trailing slash.

Use the same `RP_BRIDGE_SECRET` in FiveM's `boomerang_secret` convar. Never reuse the Discord bot token as either secret.

## 2. FiveM server.cfg

Copy `fivem-resource/boomerang_bridge` into your server's resources directory. Add these lines to server.cfg, replacing placeholders with your real values:

```cfg
set boomerang_endpoint "https://YOUR-BOT-HOST.example.com"
set boomerang_secret "YOUR_LONG_RANDOM_BRIDGE_SECRET"
set boomerang_guild_id "YOUR_DISCORD_SERVER_ID"
ensure boomerang_bridge
```

The bridge accepts either the base URL or the complete `/api/boomerang/events` endpoint. Ensure your host is reachable from the FiveM server.

## 3. Deploy and verify

1. Redeploy/restart IzzyXO so the updated code and PostgreSQL schema are loaded.
2. Check host logs for successful database connection and command loading.
3. Confirm `RP_PUBLIC_URL` uses HTTPS and open `https://YOUR-BOT-HOST.example.com/boomerang`.
4. In Discord, run `/boomerang-dashboard`, then enter the dashboard token into the page.
5. Connect to FiveM and verify the player event appears in the dashboard and configured Discord log channel.
6. Test `/rp-staff set`, `/rp-staff list`, `/rp-staff history`, and the `/rp-finance` credit/debit/transfer/balance/history commands in a test server first.
7. Test cargo using `/rp-cargo`.

## Current integration boundaries

- The dashboard is read-only; staff, finance, and cargo mutations happen through Discord slash commands.
- The optional framework adapter forwards QBCore/ESX lifecycle and job events. Custom inventory, vehicle, and in-game cash resources must call the bridge export explicitly; this does not automatically synchronize arbitrary framework data.
- Tebex, web dashboard user accounts/role-based access control, and live end-to-end verification are not included yet.
