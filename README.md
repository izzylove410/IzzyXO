# Boomerang RP

**Boomerang RP** is the Discord and FiveM community platform for Boomerang RP. This repository contains the Discord bot, web dashboard/API, PostgreSQL integration, and FiveM bridge.

## Core systems

- Discord moderation, administration, tickets, utilities, and community features retained from the existing codebase.
- RP cargo ledger with transactional balance changes and history.
- RP staff roster and finance accounts with audit records.
- Boomerang RP dashboard at `/boomerang`, with the read-only dashboard API protected by `RP_DASHBOARD_TOKEN`.
- FiveM event bridge at `POST /api/boomerang/events`, authenticated with a shared bearer secret.
- PostgreSQL schema and migrations, database backup/restore scripts, and Docker support.

## Requirements

- Node.js 20.10 or newer
- Discord application and bot token
- PostgreSQL for persistent production storage (the project may support a development memory fallback)
- FiveM server if using the bridge

## Configure

1. Copy `.env.example` to `.env`.
2. Configure the Discord token and application/client ID, and set the database connection values for your PostgreSQL instance.
3. Keep credentials in environment variables or host secrets. Never commit `.env`, bot tokens, database passwords, or bridge secrets.
4. Install dependencies with `npm install`.
5. Check migrations with `npm run migrate:check`.
6. Start the application with `npm start`.

See [Boomerang RP deployment notes](docs/BOOMERANG_RP_DEPLOYMENT.md) for bridge and dashboard configuration. Docker Compose is also available for local development with PostgreSQL.

## FiveM bridge

The resource is located at `fivem-resource/boomerang_bridge`. Configure the endpoint, shared secret, and allowed Discord guild ID using FiveM server convars, then add `ensure boomerang_bridge` to `server.cfg`. Never expose the shared secret to clients.

## Project status

This is an evolving Boomerang RP integration. Review the deployment notes and test the bot, database migrations, dashboard authentication, and FiveM event flow in a test environment before using it in a live server. Some advanced in-game synchronization and production integrations may require additional implementation.

## Development commands

- `npm start` — start the bot and web API
- `npm run migrate` — apply database migrations
- `npm run migrate:check` — check migration state
- `npm run migrate:status` — display migration status
- `npm run backup:db` — back up the database
- `npm run restore:db` — restore a database backup

## License

See [LICENSE](LICENSE) for the license that applies to this codebase.
