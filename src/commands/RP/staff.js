import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { pgDb } from '../../utils/database.js';

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
        await interaction.editReply({embeds:[embed('Staff roster updated',`**Member:** <@${member.id}>\n**Rank:** ${rank}\n**Status:** ${status}\n**Notes:** ${notes||"None"}`,0x22c55e)]});
        return;
      }
      if(sub==='remove') {
        const member=interaction.options.getUser('member');
        const result=await pgDb.pool.query('DELETE FROM rp_staff_roster WHERE guild_id=$1 AND user_id=$2',[guild,member.id]);
        await interaction.editReply({embeds:[embed('Staff roster',result.rowCount?'Removed <@'+member.id+'> from the roster.':'That member was not on the roster.',result.rowCount?0xf97316:0x64748b)]});
        return;
      }
      const status=interaction.options.getString('status');
      const result=await pgDb.pool.query(`SELECT user_id,staff_rank,staff_status,notes,updated_at FROM rp_staff_roster WHERE guild_id=$1 ${status?'AND staff_status=$2':''} ORDER BY CASE staff_status WHEN 'active' THEN 1 WHEN 'loa' THEN 2 ELSE 3 END,staff_rank,user_id LIMIT 50`,status?[guild,status]:[guild]);
      const description=result.rows.length?result.rows.map(r=>`• <@${r.user_id}> — **${clean(r.staff_rank,50)}** · ${r.staff_status.toUpperCase()}${r.notes?"\n  "+clean(r.notes,100):""}`).join('\n'):'No staff roster entries yet. Use /rp-staff set to add one.';
      await interaction.editReply({embeds:[embed('Boomerang RP • Staff roster',description)]});
    } catch(error) { await interaction.editReply({embeds:[embed('Staff roster failed',error.message||'Unexpected error.',0xef4444)]}); }
  }
};
