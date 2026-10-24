import { describe, expect, it } from 'vitest';
import { can, canManageMember, grantableRoles } from '@/lib/permissions';

describe('permissions', () => {
  it('owner has every permission', () => {
    expect(can('owner', 'org.manage')).toBe(true);
    expect(can('owner', 'export.csv')).toBe(true);
  });

  it('admin manages the business but not the organization itself', () => {
    expect(can('admin', 'inventory.manage')).toBe(true);
    expect(can('admin', 'leads.reassign')).toBe(true);
    expect(can('admin', 'org.manage')).toBe(false);
  });

  it('broker cannot reassign, export or see reports', () => {
    expect(can('broker', 'leads.reassign')).toBe(false);
    expect(can('broker', 'export.csv')).toBe(false);
    expect(can('broker', 'reports.view')).toBe(false);
    expect(can('broker', 'team.manage')).toBe(false);
  });

  it('viewer can read but not change anything', () => {
    expect(can('viewer', 'leads.view_all')).toBe(true);
    expect(can('viewer', 'reports.view')).toBe(true);
    expect(can('viewer', 'leads.edit_all')).toBe(false);
    expect(can('viewer', 'inventory.manage')).toBe(false);
  });

  it('no role means no permissions', () => {
    expect(can(null, 'team.view')).toBe(false);
    expect(can(undefined, 'team.view')).toBe(false);
  });

  it('grantable roles mirror the database rules', () => {
    expect(grantableRoles('owner')).toEqual(['owner', 'admin', 'broker', 'viewer']);
    expect(grantableRoles('admin')).toEqual(['broker', 'viewer']);
    expect(grantableRoles('broker')).toEqual([]);
    expect(grantableRoles('viewer')).toEqual([]);
  });

  it('admins cannot manage owners or other admins', () => {
    expect(canManageMember('admin', 'broker')).toBe(true);
    expect(canManageMember('admin', 'admin')).toBe(false);
    expect(canManageMember('admin', 'owner')).toBe(false);
    expect(canManageMember('owner', 'admin')).toBe(true);
    expect(canManageMember('broker', 'viewer')).toBe(false);
  });
});
