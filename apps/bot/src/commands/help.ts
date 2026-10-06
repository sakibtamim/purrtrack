import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { APP_VERSION } from '@purrtrack/shared';

export const helpCommand = new SlashCommandBuilder()
  .setName('help')
  .setDescription('📖 View PurrTrack commands, features, and usage guide');

export async function handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🐱 PurrTrack v${APP_VERSION} • TimeTrack for Discord`)
    .setDescription(
      'PurrTrack automatically logs your time whenever you connect to a voice channel. ' +
      'No manual check-ins needed!'
    )
    .addFields(
      {
        name: '🩺 `/health` • 🏓 `/ping`',
        value: 'Inspect bot health, version `v1.0.0`, process uptime, gateway latency, and memory metrics.',
      },
      {
        name: '⏱️ `/status [target]`',
        value: 'Inspect your active voice session, current channel, and live elapsed duration in real time.',
      },
      {
        name: '📊 `/report user` • `/report guild` • `/report payroll`',
        value: 'Export member timesheets, server activity, or master contractor payroll ledgers in **Excel (.xlsx with live formulas)**, **PDF**, **CSV**, or **Embed**.',
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
        value: 'View your profile card, inspect achievement badges across 6 categories, and equip a 3-badge showcase (Slot 1 Title, Slots 2-3 Trophy Rack).',
      },
      {
        name: '🏆 `/leaderboard` • `/leaderboard announce`',
        value: 'Interactive server leaderboard with Top 3 podiums (🥇🥈🥉), equipped titles, and manual or midnight automated Hall of Fame championship coronation.',
      },
      {
        name: '⏱️ `/time add` • `/time subtract` • `/time history` (Managers)',
        value: 'Execute manual voice time adjustments with transparent business reasons, and inspect complete member audit histories.',
      },
      {
        name: '⚙️ `/config` (Managers)',
        value: 'Configure tracking rules, set contractor billing rates (`/config set_rate`), configure midnight automated reports (`/config auto_report`), designate management roles, or manage ignored channels.',
      }
    )
    .setFooter({ text: `PurrTrack v${APP_VERSION} • Enterprise Voice Time Tracking` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
