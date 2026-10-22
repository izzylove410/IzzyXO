import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('boomerang-dashboard')
    .setDescription('Get the secure Boomerang RP operations dashboard link')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  category:'RP Operations',
  async execute(interaction) {
    const base=String(process.env.RP_PUBLIC_URL||'').trim().replace(/\/$/,'');
    if(!base || !/^https:\/\//i.test(base)) {
      return interaction.reply({content:'The dashboard host has not been configured yet. Set RP_PUBLIC_URL to your deployed HTTPS base URL, then restart the bot.',ephemeral:true});
    }
    const url=base+'/boomerang';
    const embed=new EmbedBuilder().setColor(0x8b5cf6).setTitle('Boomerang RP • Operations Dashboard')
      .setDescription('Open the operations dashboard to review FiveM events and cargo balances. You will need the separate dashboard access token configured by the server owner.')
      .addFields({name:'Dashboard',value:url}).setTimestamp();
    return interaction.reply({embeds:[embed],ephemeral:true});
  }
};
