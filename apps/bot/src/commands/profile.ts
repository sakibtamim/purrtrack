import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from 'discord.js';
import {
  VoiceSessionRepository,
  UserGoalsRepository,
  UserBadgesRepository,
} from '@purrtrack/db';
import {
  formatDuration,
  getBadge,
  getAllBadges,
  getBadgesByCategory,
  renderBadgePill,
  renderShowcaseRack,
  BadgeCategory,
} from '@purrtrack/shared';

export const profileCommand = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('👤 Member profiles, unlocked badges, and showcase equip system')
  .addSubcommand((sub) =>
    sub
      .setName('view')
      .setDescription('View your profile card or another member\'s profile')
      .addUserOption((opt) =>
        opt.setName('target').setDescription('Member to view profile for (defaults to you)').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('badges')
      .setDescription('Browse all unlocked and locked achievement badges')
      .addUserOption((opt) =>
        opt.setName('target').setDescription('Member to view badges for (defaults to you)').setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('category')
          .setDescription('Filter badges by category')
          .setRequired(false)
          .addChoices(
            { name: '🎯 Goals', value: 'goals' },
            { name: '🔥 Streaks', value: 'streaks' },
            { name: '⏱️ Lifetime Time', value: 'time' },
            { name: '🍅 Focus Sprints', value: 'focus' },
            { name: '📺 Collaboration & Media', value: 'media' },
            { name: '🌙 Special & Fun', value: 'special' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('equip')
      .setDescription('Equip an unlocked badge into your showcase trophy rack')
      .addStringOption((opt) =>
        opt
          .setName('badge')
          .setDescription('Select from your unlocked badges')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('slot')
          .setDescription('Showcase slot (1 = Primary Title, 2 or 3 = Showcase). Default: 1')
          .setMinValue(1)
          .setMaxValue(3)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('unequip')
      .setDescription('Unequip a badge from your showcase rack')
      .addIntegerOption((opt) =>
        opt
          .setName('slot')
          .setDescription('Showcase slot to clear (1, 2, or 3)')
          .setMinValue(1)
          .setMaxValue(3)
          .setRequired(true)
      )
  );

export async function handleProfileCommand(
  interaction: ChatInputCommandInteraction,
  sessionRepo: VoiceSessionRepository,
  goalsRepo: UserGoalsRepository,
  badgesRepo: UserBadgesRepository,
  badgeManager?: any
): Promise<void> {
  const { guildId } = interaction;
  if (!guildId) {
    await interaction.reply({ content: '❌ This command can only be used within a server.', ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  // --- SUBCOMMAND: VIEW ---
  if (subcommand === 'view') {
    const targetUser = interaction.options.getUser('target') || interaction.user;
    await interaction.deferReply();

    // Auto-evaluate badge eligibility dynamically (e.g. active stream or cumulative milestones)
    if (badgeManager) {
      await badgeManager.evaluateAndUnlock({ guildId, userId: targetUser.id }).catch(() => {});
    }

    const lifetime = await sessionRepo.getUserLifetimeStats(guildId, targetUser.id);
    const goal = await goalsRepo.getOrCreateGoal(guildId, targetUser.id);
    const unlockedRows = await badgesRepo.getUserBadges(guildId, targetUser.id);

    const equippedIds = goal.equippedBadgeIds || [];
    const primaryBadgeId = equippedIds[0];
    const primaryPill = primaryBadgeId ? renderBadgePill(primaryBadgeId) : '';

    const showcaseText = renderShowcaseRack(equippedIds);

    const totalHoursStr = formatDuration(lifetime.totalDurationSeconds);
    const mediaHoursStr = formatDuration(lifetime.totalMediaSeconds ?? (lifetime.totalStreamingSeconds + lifetime.totalVideoSeconds));

    const allBadges = getAllBadges();
    const unlockedCount = unlockedRows.length;
    const progressPercent = Math.round((unlockedCount / allBadges.length) * 100);

    const titleSuffix = primaryPill ? ` • ${primaryPill}` : '';
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`👤 ${targetUser.username}${titleSuffix}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        // Row 1: Featured Showcase
        {
          name: '🏅 Featured Showcase (Top 3 Badges)',
          value: showcaseText,
          inline: false,
        },

        // Row 2: Lifetime Voice Stats
        {
          name: '⏱️ Lifetime Voice Stats',
          value:
            `• **Total Time**: \`${totalHoursStr}\`\n` +
            `• **Sessions**: \`${lifetime.totalSessionsCount} sessions\`\n` +
            `• **Screen & Cam**: \`${mediaHoursStr}\``,
          inline: true,
        },

        // Row 3: Habits & Productivity
        {
          name: '🔥 Habits & Deep Work',
          value:
            `• **Daily Streak**: **${goal.currentStreakDays} consecutive days**\n` +
            `• **Goals Completed**: \`${goal.completedGoalsCount} weekly goals\`\n` +
            `• **Focus Sprints**: \`${goal.completedFocusSprints} Pomodoro sprints\``,
          inline: true,
        },

        // Row 4: Badges Summary
        {
          name: '🎖️ Badges Progression',
          value:
            `**${unlockedCount} / ${allBadges.length} Badges Unlocked** (${progressPercent}%)\n` +
            `Use \`/profile badges\` to view all locked/unlocked badges or \`/profile equip\` to set your title!`,
          inline: false,
        }
      )
      .setFooter({ text: 'PurrTrack Gamification' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // --- SUBCOMMAND: BADGES ---
  if (subcommand === 'badges') {
    const targetUser = interaction.options.getUser('target') || interaction.user;
    const categoryFilter = interaction.options.getString('category') as BadgeCategory | null;
    await interaction.deferReply();

    const unlockedRows = await badgesRepo.getUserBadges(guildId, targetUser.id);
    const unlockedMap = new Map(unlockedRows.map((r) => [r.badgeId, r.unlockedAt]));

    const categories: BadgeCategory[] = categoryFilter
      ? [categoryFilter]
      : ['goals', 'streaks', 'time', 'focus', 'media', 'special'];

    const categoryTitles: Record<BadgeCategory, string> = {
      goals: '🎯 Goals & Commitments',
      streaks: '🔥 Daily Streaks',
      time: '⏱️ Lifetime Voice Time',
      focus: '🍅 Deep Work & Focus Sprints',
      media: '📺 Collaboration & Media',
      special: '🌙 Special Milestones',
    };

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🎖️ Badge Showcase — ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
      .setDescription(
        `Total Unlocked: **${unlockedRows.length} / ${getAllBadges().length}**\n` +
          `Badges in **bold** are unlocked ✨; locked badges show their unlock criteria 🔒.`
      );

    for (const cat of categories) {
      const badges = getBadgesByCategory(cat);
      if (badges.length === 0) continue;

      const lines = badges.map((badge) => {
        const unlockedAt = unlockedMap.get(badge.id);
        if (unlockedAt) {
          const timestamp = Math.floor(new Date(unlockedAt).getTime() / 1000);
          return `✨ **[${badge.icon} ${badge.name}]** — *Unlocked <t:${timestamp}:R>*`;
        } else {
          return `🔒 \`[${badge.icon} ${badge.name}]\` — *${badge.requirementText}*`;
        }
      });

      embed.addFields({
        name: categoryTitles[cat] || cat,
        value: lines.join('\n'),
        inline: false,
      });
    }

    embed.setFooter({ text: 'Use /profile equip <badge> to showcase your badges!' });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // --- SUBCOMMAND: EQUIP ---
  if (subcommand === 'equip') {
    const badgeId = interaction.options.getString('badge', true);
    const slot = interaction.options.getInteger('slot') || 1;

    const badge = getBadge(badgeId);
    if (!badge) {
      await interaction.reply({
        content: `❌ Unknown badge: \`${badgeId}\`.`,
        ephemeral: true,
      });
      return;
    }

    const hasBadge = await badgesRepo.hasBadge(guildId, interaction.user.id, badgeId);
    if (!hasBadge) {
      await interaction.reply({
        content: `🔒 You have not unlocked the **[${badge.icon} ${badge.name}]** badge yet!\nRequirement: *${badge.requirementText}*.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const updated = await goalsRepo.equipBadge(guildId, interaction.user.id, badgeId, slot);
    const showcaseText = renderShowcaseRack(updated.equippedBadgeIds || []);

    const embed = new EmbedBuilder()
      .setColor(0x10B981)
      .setTitle('🏅 Showcase Badge Equipped!')
      .setDescription(
        `Successfully equipped **[${badge.icon} ${badge.name}]** into **Slot ${slot}**${slot === 1 ? ' (Primary Title)' : ''}!\n\n` +
          `• **Updated Showcase Rack**:\n${showcaseText}\n\n` +
          (slot === 1
            ? `Your Primary Title will now appear next to your name in \`/status\`, \`/profile\`, and leaderboards!`
            : `Your badge will now be showcased on your \`/profile\` card!`)
      )
      .setFooter({ text: 'PurrTrack Gamification' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // --- SUBCOMMAND: UNEQUIP ---
  if (subcommand === 'unequip') {
    const slot = interaction.options.getInteger('slot', true);
    await interaction.deferReply({ ephemeral: true });

    const updated = await goalsRepo.unequipBadge(guildId, interaction.user.id, slot);
    const showcaseText = renderShowcaseRack(updated.equippedBadgeIds || []);

    await interaction.editReply({
      content: `✅ Cleared showcase **Slot ${slot}**.\n\n• **Updated Showcase Rack**:\n${showcaseText}`,
    });
    return;
  }
}

/**
 * Handle autocomplete for /profile equip badge option
 */
export async function handleProfileAutocomplete(
  interaction: AutocompleteInteraction,
  badgesRepo: UserBadgesRepository
): Promise<void> {
  const { guildId, user } = interaction;
  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  const focusedValue = interaction.options.getFocused().toLowerCase();
  const unlocked = await badgesRepo.getUserBadges(guildId, user.id);

  const choices = unlocked
    .map((row) => getBadge(row.badgeId))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .filter((b) => b.name.toLowerCase().includes(focusedValue) || b.id.toLowerCase().includes(focusedValue))
    .slice(0, 25)
    .map((b) => ({
      name: `${b.icon} ${b.name} (${b.category})`,
      value: b.id,
    }));

  await interaction.respond(choices);
}
