export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';
export type BadgeCategory = 'goals' | 'streaks' | 'time' | 'focus' | 'media' | 'special';

export interface BadgeDefinition {
  id: string;
  name: string;
  icon: string;
  category: BadgeCategory;
  tier: BadgeTier;
  description: string;
  requirementText: string;
}

export const BADGE_CATALOG: Record<string, BadgeDefinition> = {
  // --- Goals ---
  goal_starter: {
    id: 'goal_starter',
    name: 'First Step',
    icon: '🎯',
    category: 'goals',
    tier: 'bronze',
    description: 'Committed to personal voice productivity',
    requirementText: 'Set your first weekly voice goal with /goal set',
  },
  goal_crusher_1: {
    id: 'goal_crusher_1',
    name: 'Goal Crusher',
    icon: '🏆',
    category: 'goals',
    tier: 'silver',
    description: 'Fully conquered a weekly voice target',
    requirementText: 'Complete 100% of an active weekly goal',
  },
  goal_crusher_5: {
    id: 'goal_crusher_5',
    name: 'Consistent Achiever',
    icon: '🌟',
    category: 'goals',
    tier: 'gold',
    description: 'Proven long-term consistency',
    requirementText: 'Successfully complete 5 weekly goals',
  },
  goal_overtime: {
    id: 'goal_overtime',
    name: 'Beyond Limits',
    icon: '🚀',
    category: 'goals',
    tier: 'gold',
    description: 'Shattered target expectations with extreme overtime',
    requirementText: 'Exceed a weekly target by 5+ overtime hours',
  },

  // --- Streaks ---
  streak_3: {
    id: 'streak_3',
    name: 'Spark',
    icon: '🥉',
    category: 'streaks',
    tier: 'bronze',
    description: 'Started a positive daily voice habit',
    requirementText: 'Maintain an active 3-day daily voice streak',
  },
  streak_7: {
    id: 'streak_7',
    name: 'Flame',
    icon: '🔥',
    category: 'streaks',
    tier: 'silver',
    description: 'Completed a full week of daily voice participation',
    requirementText: 'Maintain an active 7-day daily voice streak',
  },
  streak_14: {
    id: 'streak_14',
    name: 'Blaze',
    icon: '⚡',
    category: 'streaks',
    tier: 'gold',
    description: 'Two unbroken weeks of daily voice presence',
    requirementText: 'Maintain an active 14-day daily voice streak',
  },
  streak_30: {
    id: 'streak_30',
    name: 'Unstoppable',
    icon: '💎',
    category: 'streaks',
    tier: 'diamond',
    description: 'An entire month of daily voice consistency',
    requirementText: 'Maintain an active 30-day daily voice streak',
  },

  // --- Cumulative Time ---
  voice_10h: {
    id: 'voice_10h',
    name: 'Voice Novice',
    icon: '🎙️',
    category: 'time',
    tier: 'bronze',
    description: 'Taking the first deep steps in the voice lounge',
    requirementText: 'Log 10 cumulative hours in voice channels',
  },
  voice_50h: {
    id: 'voice_50h',
    name: 'Voice Regular',
    icon: '🎧',
    category: 'time',
    tier: 'bronze',
    description: 'A familiar and trusted voice in the server',
    requirementText: 'Log 50 cumulative hours in voice channels',
  },
  voice_100h: {
    id: 'voice_100h',
    name: 'Century Club',
    icon: '⚡',
    category: 'time',
    tier: 'silver',
    description: 'Crossed the triple-digit milestone',
    requirementText: 'Log 100 cumulative hours in voice channels',
  },
  voice_250h: {
    id: 'voice_250h',
    name: 'Voice Veteran',
    icon: '🎖️',
    category: 'time',
    tier: 'gold',
    description: 'An anchor of the community and team',
    requirementText: 'Log 250 cumulative hours in voice channels',
  },
  voice_500h: {
    id: 'voice_500h',
    name: 'Voice Legend',
    icon: '👑',
    category: 'time',
    tier: 'diamond',
    description: 'Legendary voice dedication and leadership',
    requirementText: 'Log 500 cumulative hours in voice channels',
  },

  // --- Focus Sprints ---
  focus_1: {
    id: 'focus_1',
    name: 'Focus Initiate',
    icon: '🍅',
    category: 'focus',
    tier: 'bronze',
    description: 'Started the journey into distraction-free deep work',
    requirementText: 'Complete your first Pomodoro sprint with /focus start',
  },
  focus_10: {
    id: 'focus_10',
    name: 'Deep Worker',
    icon: '🧠',
    category: 'focus',
    tier: 'silver',
    description: 'Built a disciplined deep work routine',
    requirementText: 'Complete 10 Pomodoro focus sprints',
  },
  focus_50: {
    id: 'focus_50',
    name: 'Zen Master',
    icon: '🧘',
    category: 'focus',
    tier: 'gold',
    description: 'Mastery over distractions and intense concentration',
    requirementText: 'Complete 50 Pomodoro focus sprints',
  },
  focus_marathon: {
    id: 'focus_marathon',
    name: 'Marathoner',
    icon: '🏃',
    category: 'focus',
    tier: 'silver',
    description: 'Endurance sprint without breaking focus',
    requirementText: 'Complete a focus sprint lasting 2 hours or longer',
  },

  // --- Collaboration & Media ---
  stream_1h: {
    id: 'stream_1h',
    name: 'Screen Sharer',
    icon: '📺',
    category: 'media',
    tier: 'bronze',
    description: 'Shared visual work with colleagues',
    requirementText: 'Stream your screen for at least 1 cumulative hour',
  },
  stream_10h: {
    id: 'stream_10h',
    name: 'The Presenter',
    icon: '📽️',
    category: 'media',
    tier: 'silver',
    description: 'Frequent presenter and visual collaborator',
    requirementText: 'Stream your screen for at least 10 cumulative hours',
  },
  camera_10h: {
    id: 'camera_10h',
    name: 'Face to Face',
    icon: '🎥',
    category: 'media',
    tier: 'silver',
    description: 'High camera engagement in team video meetings',
    requirementText: 'Turn on webcam video for at least 10 cumulative hours',
  },

  // --- Special & Fun ---
  night_owl: {
    id: 'night_owl',
    name: 'Night Owl',
    icon: '🦉',
    category: 'special',
    tier: 'bronze',
    description: 'Active when the rest of the world is asleep',
    requirementText: 'Accumulate 5+ hours between 12:00 AM and 05:00 AM',
  },
  early_bird: {
    id: 'early_bird',
    name: 'Early Bird',
    icon: '🌅',
    category: 'special',
    tier: 'bronze',
    description: 'Early morning focus and productivity',
    requirementText: 'Accumulate 5+ hours between 05:00 AM and 08:00 AM',
  },
  weekend_warrior: {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    icon: '⚔️',
    category: 'special',
    tier: 'silver',
    description: 'Grinding hard on Saturdays and Sundays',
    requirementText: 'Accumulate 10+ hours strictly across Saturday & Sunday',
  },

  // --- Monthly Leaderboard Champions ---
  monthly_champion_1st: {
    id: 'monthly_champion_1st',
    name: 'Monthly Champion',
    icon: '🥇',
    category: 'special',
    tier: 'diamond',
    description: 'Crowned 1st Place on the monthly server leaderboard',
    requirementText: 'Finish in 1st place on the server monthly leaderboard at month-end',
  },
  monthly_champion_2nd: {
    id: 'monthly_champion_2nd',
    name: 'Monthly Runner-Up',
    icon: '🥈',
    category: 'special',
    tier: 'gold',
    description: 'Finished 2nd Place on the monthly server leaderboard',
    requirementText: 'Finish in 2nd place on the server monthly leaderboard at month-end',
  },
  monthly_champion_3rd: {
    id: 'monthly_champion_3rd',
    name: 'Monthly Podium',
    icon: '🥉',
    category: 'special',
    tier: 'silver',
    description: 'Finished 3rd Place on the monthly server leaderboard',
    requirementText: 'Finish in 3rd place on the server monthly leaderboard at month-end',
  },
};

/**
 * Get badge definition by ID
 */
export function getBadge(badgeId: string): BadgeDefinition | undefined {
  return BADGE_CATALOG[badgeId];
}

/**
 * List all badges
 */
export function getAllBadges(): BadgeDefinition[] {
  return Object.values(BADGE_CATALOG);
}

/**
 * Filter badges by category
 */
export function getBadgesByCategory(category: BadgeCategory): BadgeDefinition[] {
  return Object.values(BADGE_CATALOG).filter((b) => b.category === category);
}

/**
 * Format badge as a clean Discord pill string: "[🔥 Flame]"
 */
export function renderBadgePill(badgeId: string): string {
  const badge = getBadge(badgeId);
  if (!badge) return '';
  return `[${badge.icon} ${badge.name}]`;
}

/**
 * Render up to 3 showcase badges side-by-side
 */
export function renderShowcaseRack(badgeIds: (string | null | undefined)[]): string {
  const validPills = badgeIds
    .filter((id): id is string => Boolean(id && getBadge(id)))
    .slice(0, 3)
    .map((id) => renderBadgePill(id));

  if (validPills.length === 0) {
    return '*No badges equipped*';
  }

  return validPills.join(' • ');
}
