import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { pgDb } from '../../utils/database.js';

const clean=(v,n=100)=>String(v??'').trim().replace(/[\r\n\t]/g,' ').slice(0,n);
const key=(v)=>clean(v,100).toLowerCase().replace(/\s+/g,'-');
const emb=(title,description,color=0x22d3ee)=>new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
async function transaction(fn){if(!pgDb.isAvailable()||!pgDb.pool)throw new Error('PostgreSQL is unavailable.');const c=await pgDb.pool.connect();try{await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export default {
 data:new SlashCommandBuilder().setName('rp-finance').setDescription('Manage audited Boomerang RP community/business accounts')
 .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addSubcommand(s=>s.setName('credit').setDescription('Add funds to an account').addStringOption(o=>o.setName('account').setDescription('Account name').setRequired(true).setMaxLength(100)).addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1).setMaxValue(1000000000)).addStringOption(o=>o.setName('reason').setDescription('Audit reason').setRequired(true).setMaxLength(250)))
 .addSubcommand(s=>s.setName('debit').setDescription('Remove funds from an account').addStringOption(o=>o.setName('account').setDescription('Account name').setRequired(true).setMaxLength(100)).addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1).setMaxValue(1000000000)).addStringOption(o=>o.setName('reason').setDescription('Audit reason').setRequired(true).setMaxLength(250)))
 .addSubcommand(s=>s.setName('transfer').setDescription('Transfer funds between accounts').addStringOption(o=>o.setName('from').setDescription('Source account').setRequired(true).setMaxLength(100)).addStringOption(o=>o.setName('to').setDescription('Destination account').setRequired(true).setMaxLength(100)).addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1).setMaxValue(1000000000)).addStringOption(o=>o.setName('reason').setDescription('Audit reason').setRequired(true).setMaxLength(250)))
 .addSubcommand(s=>s.setName('balance').setDescription('Check one account or list account balances').addStringOption(o=>o.setName('account').setDescription('Optional account name').setRequired(false).setMaxLength(100)))
 .addSubcommand(s=>s.setName('history').setDescription('View recent finance ledger').addIntegerOption(o=>o.setName('limit').setDescription('Entries 1–20').setMinValue(1).setMaxValue(20))),
 category:'RP Operations',
 async execute(i){await i.deferReply({ephemeral:true});try{
  if(!pgDb.isAvailable()||!pgDb.pool)throw new Error('PostgreSQL is unavailable.');
  const sub=i.options.getSubcommand(),guild=i.guildId,actor=i.user.id,amount=i.options.getInteger('amount'),reason=clean(i.options.getString('reason')||'No reason supplied',250);
  if(['credit','debit'].includes(sub)){
   const name=i.options.getString('account'),k=key(name);if(!k)throw new Error('Account name is required.');
   const result=await transaction(async c=>{
    await c.query('INSERT INTO rp_finance_accounts(guild_id,account_key,account_name,balance,updated_by) VALUES($1,$2,$3,0,$4) ON CONFLICT DO NOTHING',[guild,k,clean(name),actor]);
    const lock=await c.query('SELECT balance FROM rp_finance_accounts WHERE guild_id=$1 AND account_key=$2 FOR UPDATE',[guild,k]);
    const old=Number(lock.rows[0].balance),next=sub==='credit'?old+amount:old-amount;if(next<0)throw new Error('Insufficient account balance: '+old);
    await c.query('UPDATE rp_finance_accounts SET balance=$3,updated_by=$4,updated_at=now() WHERE guild_id=$1 AND account_key=$2',[guild,k,next,actor]);
    await c.query('INSERT INTO rp_finance_ledger(guild_id,action,account_key,account_name,amount,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[guild,sub,k,clean(name),amount,actor,reason]);return {old,next};
   });
   await i.editReply({embeds:[emb('Finance ledger updated',`**Action:** ${sub}\n**Account:** ${clean(name)}\n**Change:** ${sub==="credit"?"+":"−"}${amount.toLocaleString()}\n**Balance:** ${result.old.toLocaleString()} → **${result.next.toLocaleString()}**\n**Reason:** ${reason}`,0x22c55e)]});return;
  }
  if(sub==='transfer'){
   const from=i.options.getString('from'),to=i.options.getString('to'),fk=key(from),tk=key(to);if(!fk||!tk||fk===tk)throw new Error('Choose two different valid account names.');
   const result=await transaction(async c=>{
    const source=await c.query('SELECT balance FROM rp_finance_accounts WHERE guild_id=$1 AND account_key=$2 FOR UPDATE',[guild,fk]);
    if(!source.rows.length||Number(source.rows[0].balance)<amount)throw new Error('Source account has insufficient funds.');
    await c.query('UPDATE rp_finance_accounts SET balance=balance-$3,updated_by=$4,updated_at=now() WHERE guild_id=$1 AND account_key=$2',[guild,fk,amount,actor]);
    await c.query('INSERT INTO rp_finance_accounts(guild_id,account_key,account_name,balance,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(guild_id,account_key) DO UPDATE SET balance=rp_finance_accounts.balance+EXCLUDED.balance,updated_by=EXCLUDED.updated_by,updated_at=now()',[guild,tk,clean(to),amount,actor]);
    await c.query('INSERT INTO rp_finance_ledger(guild_id,action,account_key,account_name,to_account_key,to_account_name,amount,actor_id,reason) VALUES($1,\'transfer\',$2,$3,$4,$5,$6,$7,$8)',[guild,fk,clean(from),tk,clean(to),amount,actor,reason]);
    const dest=await c.query('SELECT balance FROM rp_finance_accounts WHERE guild_id=$1 AND account_key=$2',[guild,tk]);return {from:Number(source.rows[0].balance)-amount,to:Number(dest.rows[0].balance)};
   });
   await i.editReply({embeds:[emb('Funds transferred',`**Amount:** ${amount.toLocaleString()}\n**From:** ${clean(from)} · balance ${result.from.toLocaleString()}\n**To:** ${clean(to)} · balance ${result.to.toLocaleString()}\n**Reason:** ${reason},0x22c55e)]});return;
  }
  if(sub==='balance'){
   const name=i.options.getString('account');
   const rows=await pgDb.pool.query(`SELECT account_name,balance FROM rp_finance_accounts WHERE guild_id=$1 ${name?'AND account_key=$2':''} ORDER BY account_name LIMIT 40`,name?[guild,key(name)]:[guild]);
   await i.editReply({embeds:[emb('RP finance balances',rows.rows.length?rows.rows.map(r=>`• **${clean(r.account_name)}** — ${Number(r.balance).toLocaleString()}`).join('\n'):'No finance accounts yet.') ]});return;
  }
  const limit=i.options.getInteger('limit')||10;
  const rows=await pgDb.pool.query('SELECT action,account_name,to_account_name,amount,actor_id,reason,created_at FROM rp_finance_ledger WHERE guild_id=$1 ORDER BY id DESC LIMIT $2',[guild,limit]);
  await i.editReply({embeds:[emb('RP finance history',rows.rows.length?rows.rows.map(r=>`• **${r.action.toUpperCase()}** ${clean(r.account_name)}${r.to_account_name?" → "+clean(r.to_account_name):""} — ${Number(r.amount).toLocaleString()}\n  by <@${r.actor_id}> · ${clean(r.reason,120)}`).join('\n'):'No finance ledger entries yet.') ]});
 }catch(e){await i.editReply({embeds:[emb('Finance operation failed',e.message||'Unexpected error.',0xef4444)]});}}
};
