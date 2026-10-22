import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { pgDb } from '../../utils/postgresDatabase.js';

const clean = (v, n=250) => String(v ?? '').trim().replace(/[\r\n\t]/g, ' ').slice(0,n);
const embed = (title, description, color=0x8b5cf6) => new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();

export default {
  data: new SlashCommandBuilder().setName('rp-staff').setDescription('Manage the Boomerang RP staff roster')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s=>s.setName('set').setDescription('Add staff or update their rank/status')
      .addUserOption(o=>o.setName('member').setDescription('Staff member').setRequired(true))
      .addStringOption(o=>o.setName('rank').setDescription('Staff rank').setRequired(true).setMaxLength(50))
      .addStringOption(o=>o.setName('status').setDescription('Roster status').setRequired(true)
        .addChoices({name:'Active',value:'active'},{name:'Leave of absence',value:'loa'},{name:'Suspended',value:'suspended'}))
      .addStringOption(o=>o.setName('notes').setDescription('Internal staff note').setMaxLength(1000)))
    .addSubcommand(s=>s.setName('remove').setDescription('Remove a member from the staff roster')
      .addUserOption(o=>o.setName('member').setDescription('Staff member').setRequired(true)))
    .addSubcommand(s=>s.setName('history').setDescription('Review recent staff roster changes'))
    .addSubcommand(s=>s.setName('list').setDescription('List current staff roster')
      .addStringOption(o=>o.setName('status').setDescription('Optional status filter')
        .addChoices({name:'Active',value:'active'},{name:'Leave of absence',value:'loa'},{name:'Suspended',value:'suspended'}))),
  category:'RP Operations',
  async execute(interaction) {
    await interaction.deferReply({ephemeral:true});
    try {
      if(!pgDb.isAvailable() || !pgDb.pool) throw new Error('PostgreSQL is unavailable.');
      const sub=interaction.options.getSubcommand(), guild=interaction.guildId;
      if(sub==='set') {
        const member=interaction.options.getUser('member'), rank=clean(interaction.options.getString('rank'),50);
        const status=interaction.options.getString('status'), notes=clean(interaction.options.getString('notes')||'',1000);
        await pgDb.pool.query(`INSERT INTO rp_staff_roster(guild_id,user_id,staff_rank,staff_status,notes,updated_by)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(guild_id,user_id) DO UPDATE SET staff_rank=EXCLUDED.staff_rank,
          staff_status=EXCLUDED.staff_status,notes=EXCLUDED.notes,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [guild,member.id,rank,status,notes,interaction.user.id]);
        await pgDb.pool.query('INSERT INTO rp_staff_audit(guild_id,action,target_user_id,actor_id,details) VALUES($1,$2,$3,$4,$5)',[guild,'set',member.id,interaction.user.id,`Rank: ${rank}; status: ${status}; notes: ${notes}`]);
        await interaction.editReply({embeds:[embed('Staff roster updated',`**Member:** <@${member.id}>\n**Rank:** ${rank}\n**Status:** ${status}\n**Notes:** ${notes||"None"}`,0x22c55e)]});
        return;
      }
      if(sub==='remove') {
        const member=interaction.options.getUser('member');
        const result=await pgDb.pool.query('DELETE FROM rp_staff_roster WHERE guild_id=$1 AND user_id=$2',[guild,member.id]);
        if(result.rowCount) await pgDb.pool.query('INSERT INTO rp_staff_audit(guild_id,action,target_user_id,actor_id,details) VALUES($1,$2,$3,$4,$5)',[guild,'remove',member.id,interaction.user.id,'Removed from staff roster']);
        await interaction.editReply({embeds:[embed('Staff roster',result.rowCount?'Removed <@'+member.id+'> from the roster.':'That member was not on the roster.',result.rowCount?0xf97316:0x64748b)]});
        return;
      }
      if(sub==='history') {
        const history=await pgDb.pool.query('SELECT action,target_user_id,actor_id,details,created_at FROM rp_staff_audit WHERE guild_id=$1 ORDER BY id DESC LIMIT 15',[guild]);
        const desc=history.rows.length?history.rows.map(r=>`• **${r.action.toUpperCase()}** <@${r.target_user_id}> by <@${r.actor_id}>\n  ${clean(r.details,120)} · <t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>`).join('\n'):'No staff changes recorded yet.';
        await interaction.editReply({embeds:[embed('Boomerang RP • Staff audit history',desc)]});
        return;
      }
      const status=interaction.options.getString('status');
      const result=await pgDb.pool.query(`SELECT user_id,staff_rank,staff_status,notes,updated_at FROM rp_staff_roster WHERE guild_id=$1 ${status?'AND staff_status=$2':''} ORDER BY CASE staff_status WHEN 'active' THEN 1 WHEN 'loa' THEN 2 ELSE 3 END,staff_rank,user_id LIMIT 50`,status?[guild,status]:[guild]);
      const description=result.rows.length?result.rows.map(r=>`• <@${r.user_id}> — **${clean(r.staff_rank,50)}** · ${r.staff_status.toUpperCase()}${r.notes?"\n  "+clean(r.notes,100):""}`).join('\n'):'No staff roster entries yet. Use /rp-staff set to add one.';
      await interaction.editReply({embeds:[embed('Boomerang RP • Staff roster',description)]});
    } catch(error) { await interaction.editReply({embeds:[embed('Staff roster failed',error.message||'Unexpected error.',0xef4444)]}); }
  }
};
