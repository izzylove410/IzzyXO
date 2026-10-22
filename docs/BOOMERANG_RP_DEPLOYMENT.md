# Boomerang RP deployment checklist (IzzyXO)

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
