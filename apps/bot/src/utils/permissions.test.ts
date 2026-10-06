import { describe, it, expect } from 'vitest';
import { PermissionFlagsBits, PermissionsBitField, Collection } from 'discord.js';
import type { GuildMember, Guild, Role } from 'discord.js';
import { hasManagementPermission, getManagementDenialMessage } from './permissions.js';

describe('Strict RBAC hasManagementPermission', () => {
  const fakeGuild = {
    id: 'guild-1',
    ownerId: 'owner-id',
  } as unknown as Guild;

  function createFakeMember(options: {
    id: string;
    permissions?: bigint[];
    roleIds?: string[];
  }): GuildMember {
    const bitfield = new PermissionsBitField(options.permissions ?? []);
    const rolesCollection = new Collection<string, Role>();

    for (const rId of options.roleIds ?? []) {
      rolesCollection.set(rId, { id: rId } as Role);
    }

    return {
      id: options.id,
      permissions: bitfield,
      roles: {
        cache: rolesCollection,
      },
    } as unknown as GuildMember;
  }

  describe('Mode A: Fallback (No custom management roles configured)', () => {
    const emptySettings = { adminRoleIds: [] };
    const undefinedSettings = { adminRoleIds: null as unknown as string[] };

    it('allows the Discord Server Owner even with no special roles or permissions', () => {
      const owner = createFakeMember({ id: 'owner-id' });
      expect(hasManagementPermission(owner, fakeGuild, emptySettings)).toBe(true);
      expect(hasManagementPermission(owner, fakeGuild, undefinedSettings)).toBe(true);
      expect(hasManagementPermission(owner, fakeGuild, null)).toBe(true);
    });

    it('allows members with native Discord Administrator permission', () => {
      const adminMember = createFakeMember({
        id: 'admin-id',
        permissions: [PermissionFlagsBits.Administrator],
      });
      expect(hasManagementPermission(adminMember, fakeGuild, emptySettings)).toBe(true);
    });

    it('DENIES members with ManageGuild (Manage Server) if they lack Administrator', () => {
      const managerMember = createFakeMember({
        id: 'manager-id',
        permissions: [PermissionFlagsBits.ManageGuild],
      });
      expect(hasManagementPermission(managerMember, fakeGuild, emptySettings)).toBe(false);
    });

    it('DENIES regular members', () => {
      const regularMember = createFakeMember({
        id: 'regular-id',
        permissions: [PermissionFlagsBits.SendMessages],
      });
      expect(hasManagementPermission(regularMember, fakeGuild, emptySettings)).toBe(false);
    });

    it('returns false for null or undefined member', () => {
      expect(hasManagementPermission(null, fakeGuild, emptySettings)).toBe(false);
      expect(hasManagementPermission(undefined, fakeGuild, emptySettings)).toBe(false);
    });
  });

  describe('Mode B: Strict Exclusivity (Management roles configured)', () => {
    const configuredSettings = { adminRoleIds: ['role-manager-1', 'role-lead-2'] };

    it('allows a member who holds a designated management role', () => {
      const roleMember = createFakeMember({
        id: 'user-with-role',
        roleIds: ['role-manager-1'],
      });
      expect(hasManagementPermission(roleMember, fakeGuild, configuredSettings)).toBe(true);
    });

    it('allows a member who holds another designated management role', () => {
      const roleMember2 = createFakeMember({
        id: 'user-with-lead-role',
        roleIds: ['role-lead-2'],
      });
      expect(hasManagementPermission(roleMember2, fakeGuild, configuredSettings)).toBe(true);
    });

    it('STRICTLY DENIES Discord Server Owner if they do NOT have the designated role', () => {
      const ownerWithoutRole = createFakeMember({
        id: 'owner-id',
        permissions: [PermissionFlagsBits.Administrator],
        roleIds: ['random-unrelated-role'],
      });
      expect(hasManagementPermission(ownerWithoutRole, fakeGuild, configuredSettings)).toBe(false);
    });

    it('STRICTLY DENIES Discord Administrator if they do NOT have the designated role', () => {
      const adminWithoutRole = createFakeMember({
        id: 'discord-admin-id',
        permissions: [PermissionFlagsBits.Administrator],
        roleIds: [],
      });
      expect(hasManagementPermission(adminWithoutRole, fakeGuild, configuredSettings)).toBe(false);
    });

    it('allows Discord Administrator if they also hold the designated role', () => {
      const adminWithRole = createFakeMember({
        id: 'discord-admin-id',
        permissions: [PermissionFlagsBits.Administrator],
        roleIds: ['role-manager-1'],
      });
      expect(hasManagementPermission(adminWithRole, fakeGuild, configuredSettings)).toBe(true);
    });

    it('DENIES regular member without the designated role', () => {
      const regularMember = createFakeMember({
        id: 'regular-id',
        roleIds: ['some-other-role'],
      });
      expect(hasManagementPermission(regularMember, fakeGuild, configuredSettings)).toBe(false);
    });
  });

  describe('getManagementDenialMessage', () => {
    it('returns fallback message when no roles are configured', () => {
      const msg = getManagementDenialMessage({ adminRoleIds: [] });
      expect(msg).toContain('Server Owner and Discord Administrators');
    });

    it('returns strict exclusivity message with role mentions when roles are configured', () => {
      const msg = getManagementDenialMessage({ adminRoleIds: ['123', '456'] });
      expect(msg).toContain('<@&123>');
      expect(msg).toContain('<@&456>');
      expect(msg).toContain('strictly restricted');
    });
  });
});
