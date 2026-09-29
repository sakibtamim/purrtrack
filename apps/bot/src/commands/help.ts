import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const helpCommand = new SlashCommandBuilder()
  .setName('help')
  .setDescription('📖 View PurrTrack commands, features, and usage guide');

export async function handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🐱 PurrTrack • TimeTrack for Discord')
    .setDescription(
      'PurrTrack automatically logs your time whenever you connect to a voice channel. ' +
      'No manual check-ins needed!'
    )
    .addFields(
      {
        name: '⏱️ `/status [target]`',
        value: 'Inspect your active voice session, current channel, and live elapsed duration in real time.',
      },
      {
        name: '📊 `/report user <target> [format] [range]`',
        value: 'Export individual member timesheets in **Excel (.xlsx)**, **PDF**, **CSV**, **JSON**, or interactive **Discord Embed**.',
      },
      {
        name: '📈 `/report guild [format] [range]`',
        value: 'Admin tool to pull server-wide time tracking statistics, top voice channels, and team contributors.',
      },
      {
        name: '⚙️ `/config view` & `/config set`',
        value: 'Admin options to customize tracking rules, toggle AFK channel exclusions, or specify announcement channels.',
      }
    )
    .setFooter({ text: 'PurrTrack • Enterprise Voice Time Tracking' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
