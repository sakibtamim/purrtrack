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
        name: '🎯 `/goal view` • `/goal set` • `/goal reset`',
        value: 'Commit to a weekly voice goal with active guardrail protection, monitor ASCII progress bars, and build daily active streaks.',
      },
      {
        name: '🍅 `/focus start [timer] [break] [task]`',
        value: 'Run Pomodoro focus sprints while in voice channels (default: 25m work, 5m break) with automated notifications and distraction-free tracking.',
      },
      {
        name: '👤 `/profile view` • `/profile badges` • `/profile equip` • `/profile unequip`',
        value: 'View your profile card, inspect 26 achievement badges across 6 categories, and equip a 3-badge showcase (Slot 1 Title, Slots 2-3 Trophy Rack).',
      },
      {
        name: '🏆 `/leaderboard [period] [metric] [page]`',
        value: 'Interactive server leaderboard with Top 3 podiums (🥇🥈🥉), equipped titles, and button navigation (◀️ Prev, Next ▶️, 🎯 My Rank).',
      },
      {
        name: '⏱️ `/time add` • `/time subtract` • `/time history` (Admins & Managers)',
        value: 'Execute manual voice time adjustments with transparent business reasons, and inspect complete member audit histories.',
      },
      {
        name: '⚙️ `/config` (Server Admins & Managers)',
        value: 'Configure tracking rules, set contractor billing rates (`/config rate_set`), configure AFK sleep guard, designate management roles, or manage ignored channels.',
      }
    )
    .setFooter({ text: 'PurrTrack • Enterprise Voice Time Tracking' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
