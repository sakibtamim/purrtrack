import { PermissionFlagsBits } from 'discord.js';
import type { GuildMember, Guild } from 'discord.js';
import type { GuildSetting } from '@purrtrack/db';

/**
 * Strict Role-Based Access Control (RBAC) permission evaluation for PurrTrack management.
 *
 * Rules:
 * 1. Mode B: Strict Role Exclusivity (when settings?.adminRoleIds has 1+ configured role):
 *    - Only members possessing at least one of the configured management roles are authorized.
 *    - Discord Server Owner and Discord Administrator permissions are strictly ignored and denied if they lack the role.
 *
 * 2. Mode A: Default Fallback (when settings?.adminRoleIds is empty or null/undefined):
 *    - Only the Discord Server Owner and members with Discord's native Administrator permission are authorized.
 *    - Discord ManageGuild (Manage Server) or other roles do NOT grant management access.
 */
export function hasManagementPermission(
  member: GuildMember | null | undefined,
  guild: Guild,
  settings?: Pick<GuildSetting, 'adminRoleIds'> | null
): boolean {
  if (!member) return false;

  const adminRoles = settings?.adminRoleIds ?? [];
  if (Array.isArray(adminRoles) && adminRoles.length > 0) {
    // Mode B: Strict Role Exclusivity
    return adminRoles.some((roleId) => member.roles.cache.has(roleId));
  }

  // Mode A: Default Fallback (Server Owner or Discord Administrator)
  const isOwner = guild.ownerId === member.id;
  const isDiscordAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

  return isOwner || isDiscordAdmin;
}

/**
 * Returns a human-friendly denial message explaining why access was rejected.
 */
export function getManagementDenialMessage(
  settings?: Pick<GuildSetting, 'adminRoleIds'> | null
): string {
  const adminRoles = settings?.adminRoleIds ?? [];
  if (Array.isArray(adminRoles) && adminRoles.length > 0) {
    const rolesList = adminRoles.map((rId) => `<@&${rId}>`).join(', ');
    return `⛔ Management access is strictly restricted to members with configured Management role(s): ${rolesList}`;
  }
  return '⛔ Only the Server Owner and Discord Administrators have management access.';
}
