import { describe, it, expect } from 'vitest';
import {
  BADGE_CATALOG,
  getBadge,
  getAllBadges,
  getBadgesByCategory,
  renderBadgePill,
  renderShowcaseRack,
} from './badge-definitions.js';

describe('Badge Definitions Catalog', () => {
  it('should have all 26 badges defined with unique IDs and categories', () => {
    const badges = getAllBadges();
    expect(badges.length).toBe(26);

    const ids = new Set(badges.map((b) => b.id));
    expect(ids.size).toBe(26);

    for (const badge of badges) {
      expect(badge.id).toBeDefined();
      expect(badge.name).toBeTruthy();
      expect(badge.icon).toBeTruthy();
      expect(badge.tier).toMatch(/^(bronze|silver|gold|diamond)$/);
      expect(badge.category).toMatch(/^(goals|streaks|time|focus|media|special)$/);
      expect(badge.requirementText).toBeTruthy();
    }
  });

  it('should retrieve a badge by ID', () => {
    const flame = getBadge('streak_7');
    expect(flame).toBeDefined();
    expect(flame?.name).toBe('Flame');
    expect(flame?.icon).toBe('🔥');
    expect(flame?.tier).toBe('silver');
  });

  it('should filter badges by category', () => {
    const goalsBadges = getBadgesByCategory('goals');
    expect(goalsBadges.length).toBe(4);
    expect(goalsBadges.map((b) => b.id)).toContain('goal_crusher_1');
  });

  it('should render clean badge pills', () => {
    expect(renderBadgePill('streak_7')).toBe('[🔥 Flame]');
    expect(renderBadgePill('voice_100h')).toBe('[⚡ Century Club]');
    expect(renderBadgePill('unknown_badge')).toBe('');
  });

  it('should render showcase rack of up to 3 badges', () => {
    expect(renderShowcaseRack(['streak_7', 'goal_crusher_1', 'voice_100h'])).toBe(
      '[🔥 Flame] • [🏆 Goal Crusher] • [⚡ Century Club]'
    );
    expect(renderShowcaseRack([])).toBe('*No badges equipped*');
    expect(renderShowcaseRack([null, undefined])).toBe('*No badges equipped*');
    // Truncates to 3
    expect(renderShowcaseRack(['streak_7', 'goal_crusher_1', 'voice_100h', 'voice_500h'])).toBe(
      '[🔥 Flame] • [🏆 Goal Crusher] • [⚡ Century Club]'
    );
  });
});
