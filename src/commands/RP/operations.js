import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { pgDb } from '../../utils/database.js';

const cleanLabel = (value, max = 80) => String(value ?? '').trim().replace(/[\r\n\t]/g, ' ').slice(0, max);
const keyOf = (value) => cleanLabel(value, 80).toLowerCase().replace(/\s+/g, '-');

async function withTransaction(fn) {
    if (!pgDb.isAvailable() || !pgDb.pool) throw new Error('PostgreSQL is unavailable. Try again after the database reconnects.');
    const client = await pgDb.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

function buildEmbed(title, description, color = 0x5865F2) {
    return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}

export default {
    data: new SlashCommandBuilder()
        .setName('rp-cargo')
        .setDescription('Boomerang RP persistent cargo ledger')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName('add').setDescription('Add cargo to an account')
            .addStringOption(o => o.setName('account').setDescription('Warehouse or account name').setRequired(true).setMaxLength(80))
            .addStringOption(o => o.setName('item').setDescription('Cargo item').setRequired(true).setMaxLength(80))
            .addIntegerOption(o => o.setName('quantity').setDescription('Whole units to add').setRequired(true).setMinValue(1).setMaxValue(1000000))
            .addStringOption(o => o.setName('reason').setDescription('Audit reason').setRequired(false).setMaxLength(250)))
        .addSubcommand(sub => sub.setName('remove').setDescription('Remove cargo from an account')
            .addStringOption(o => o.setName('account').setDescription('Warehouse or account name').setRequired(true).setMaxLength(80))
            .addStringOption(o => o.setName('item').setDescription('Cargo item').setRequired(true).setMaxLength(80))
            .addIntegerOption(o => o.setName('quantity').setDescription('Whole units to remove').setRequired(true).setMinValue(1).setMaxValue(1000000))
            .addStringOption(o => o.setName('reason').setDescription('Audit reason').setRequired(true).setMaxLength(250)))
        .addSubcommand(sub => sub.setName('transfer').setDescription('Transfer cargo between accounts')
            .addStringOption(o => o.setName('from').setDescription('Source account').setRequired(true).setMaxLength(80))
            .addStringOption(o => o.setName('to').setDescription('Destination account').setRequired(true).setMaxLength(80))
            .addStringOption(o => o.setName('item').setDescription('Cargo item').setRequired(true).setMaxLength(80))
            .addIntegerOption(o => o.setName('quantity').setDescription('Whole units to transfer').setRequired(true).setMinValue(1).setMaxValue(1000000))
            .addStringOption(o => o.setName('reason').setDescription('Audit reason').setRequired(true).setMaxLength(250)))
        .addSubcommand(sub => sub.setName('check').setDescription('Check cargo balance')
            .addStringOption(o => o.setName('account').setDescription('Warehouse or account name').setRequired(true).setMaxLength(80))
            .addStringOption(o => o.setName('item').setDescription('Optional item to filter').setRequired(false).setMaxLength(80)))
        .addSubcommand(sub => sub.setName('history').setDescription('Review recent cargo ledger entries')
            .addStringOption(o => o.setName('account').setDescription('Optional account filter').setRequired(false).setMaxLength(80))
            .addIntegerOption(o => o.setName('limit').setDescription('Number of entries (1–20)').setRequired(false).setMinValue(1).setMaxValue(20))),

    category: 'RP Operations',

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const guildId = interaction.guildId;
        const actorId = interaction.user.id;
        const sub = interaction.options.getSubcommand();
        const account = interaction.options.getString('account');
        const item = interaction.options.getString('item');
        const quantity = interaction.options.getInteger('quantity');
        const reason = cleanLabel(interaction.options.getString('reason') || 'No reason supplied', 250);

        try {
            if (sub === 'add' || sub === 'remove') {
                const accountKey = keyOf(account);
                const itemKey = keyOf(item);
                if (!accountKey || !itemKey) throw new Error('Account and item names are required.');
                const result = await withTransaction(async client => {
                    await client.query('INSERT INTO rp_cargo_balances(guild_id,account_key,item_key,account_name,item_name,quantity,updated_by) VALUES($1,$2,$3,$4,$5,0,$6) ON CONFLICT(guild_id,account_key,item_key) DO NOTHING',[guildId,accountKey,itemKey,cleanLabel(account),cleanLabel(item),actorId]);
                    const current = await client.query(
                        'SELECT quantity FROM rp_cargo_balances WHERE guild_id=$1 AND account_key=$2 AND item_key=$3 FOR UPDATE',
                        [guildId, accountKey, itemKey]
                    );
                    const oldQty = Number(current.rows[0]?.quantity ?? 0);
                    const nextQty = sub === 'add' ? oldQty + quantity : oldQty - quantity;
                    if (sub === 'remove' && nextQty < 0) throw new Error(`Insufficient stock. Current balance: ${oldQty}.`);
                    await client.query(
                        'INSERT INTO rp_cargo_balances(guild_id,account_key,item_key,account_name,item_name,quantity,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(guild_id,account_key,item_key) DO UPDATE SET quantity=EXCLUDED.quantity, account_name=EXCLUDED.account_name, item_name=EXCLUDED.item_name, updated_by=EXCLUDED.updated_by, updated_at=now()',
                        [guildId,accountKey,itemKey,cleanLabel(account),cleanLabel(item),nextQty,actorId]
                    );
                    await client.query(
                        'INSERT INTO rp_cargo_ledger(guild_id,action,account_key,account_name,item_key,item_name,quantity,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                        [guildId,sub,accountKey,cleanLabel(account),itemKey,cleanLabel(item),quantity,actorId,reason]
                    );
                    return {oldQty,nextQty};
                });
                await interaction.editReply({embeds:[buildEmbed('Cargo ledger updated',`**Action:** ${sub}\n**Account:** ${cleanLabel(account)}\n**Item:** ${cleanLabel(item)}\n**Change:** ${sub==='add'?'+':'−'}${quantity}\n**Balance:** ${result.oldQty} → **${result.nextQty}**\n**Reason:** ${reason}`,0x2ECC71)]});
                return;
            }

            if (sub === 'transfer') {
                const from = interaction.options.getString('from');
                const to = interaction.options.getString('to');
                const fromKey = keyOf(from), toKey = keyOf(to), itemKey = keyOf(item);
                if (!fromKey || !toKey || !itemKey || fromKey === toKey) throw new Error('Choose different valid source and destination accounts.');
                const result = await withTransaction(async client => {
                    const source = await client.query('SELECT quantity, item_name FROM rp_cargo_balances WHERE guild_id=$1 AND account_key=$2 AND item_key=$3 FOR UPDATE',[guildId,fromKey,itemKey]);
                    const oldQty = Number(source.rows[0]?.quantity ?? 0);
                    if (oldQty < quantity) throw new Error(`Insufficient stock in ${cleanLabel(from)}. Current balance: ${oldQty}.`);
                    const nextQty = oldQty - quantity;
                    await client.query('UPDATE rp_cargo_balances SET quantity=$4,updated_by=$5,updated_at=now() WHERE guild_id=$1 AND account_key=$2 AND item_key=$3',[guildId,fromKey,itemKey,nextQty,actorId]);
                    await client.query('INSERT INTO rp_cargo_balances(guild_id,account_key,item_key,account_name,item_name,quantity,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(guild_id,account_key,item_key) DO UPDATE SET quantity=rp_cargo_balances.quantity+EXCLUDED.quantity, account_name=EXCLUDED.account_name, item_name=EXCLUDED.item_name,updated_by=EXCLUDED.updated_by,updated_at=now()',[guildId,toKey,itemKey,cleanLabel(to),source.rows[0]?.item_name || cleanLabel(item),quantity,actorId]);
                    await client.query('INSERT INTO rp_cargo_ledger(guild_id,action,account_key,account_name,to_account_key,to_account_name,item_key,item_name,quantity,actor_id,reason) VALUES($1,\'transfer\',$2,$3,$4,$5,$6,$7,$8,$9,$10)',[guildId,fromKey,cleanLabel(from),toKey,cleanLabel(to),itemKey,cleanLabel(item),quantity,actorId,reason]);
                    return {remaining:nextQty};
                });
                await interaction.editReply({embeds:[buildEmbed('Cargo transferred',`**Item:** ${cleanLabel(item)} × ${quantity}\n**From:** ${cleanLabel(from)} (remaining: ${result.remaining})\n**To:** ${cleanLabel(to)}\n**Reason:** ${reason}`,0x2ECC71)]});
                return;
            }

            if (sub === 'check') {
                const accountKey = keyOf(account);
                const itemFilter = item ? keyOf(item) : null;
                if (!accountKey) throw new Error('Account name is required.');
                const result = await pgDb.pool.query(
                    `SELECT item_name, quantity FROM rp_cargo_balances WHERE guild_id=$1 AND account_key=$2 ${itemFilter ? 'AND item_key=$3' : ''} ORDER BY item_name LIMIT 30`,
                    itemFilter ? [guildId,accountKey,itemFilter] : [guildId,accountKey]
                );
                const description = result.rows.length ? result.rows.map(row => `• **${cleanLabel(row.item_name)}** — ${row.quantity}`).join('\n') : 'No cargo records found for that account.';
                await interaction.editReply({embeds:[buildEmbed(`Cargo: ${cleanLabel(account)}`,description)]});
                return;
            }

            if (sub === 'history') {
                const accountFilter = interaction.options.getString('account');
                const limit = interaction.options.getInteger('limit') || 10;
                const result = await pgDb.pool.query(
                    `SELECT action,account_name,to_account_name,item_name,quantity,actor_id,reason,created_at FROM rp_cargo_ledger WHERE guild_id=$1 ${accountFilter ? 'AND (account_key=$2 OR to_account_key=$2)' : ''} ORDER BY id DESC LIMIT ${limit}`,
                    accountFilter ? [guildId,keyOf(accountFilter)] : [guildId]
                );
                const description = result.rows.length ? result.rows.map(row => `• **${row.action.toUpperCase()}** ${row.item_name} × ${row.quantity} — ${row.account_name}${row.to_account_name ? ` → ${row.to_account_name}` : ''}\n  <t:${Math.floor(new Date(row.created_at).getTime()/1000)}:R> · by <@${row.actor_id}> · ${cleanLabel(row.reason,120)}`).join('\n') : 'No ledger entries found.';
                await interaction.editReply({embeds:[buildEmbed('Cargo history',description)]});
            }
        } catch (error) {
            await interaction.editReply({embeds:[buildEmbed('Cargo operation failed',error.message || 'Unexpected error.',0xE74C3C)]});
        }
    }
};
