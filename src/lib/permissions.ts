/**
 * Role capabilities, mirrored from the database policies so the UI can hide
 * actions a user can't take. The database (RLS + RPC checks) is the real
 * enforcement; this file only shapes the interface.
 */
export const ROLES = ['owner', 'admin', 'broker', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  broker: 'Broker',
  viewer: 'Read-only manager',
};

export type Permission =
  | 'org.manage'
  | 'team.view'
  | 'team.manage'
  | 'leads.view_all'
  | 'leads.edit_all'
  | 'leads.reassign'
  | 'leads.override_score'
  | 'inventory.manage'
  | 'pipeline.configure'
  | 'reports.view'
  | 'audit.view'
  | 'export.csv';

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: [
    'org.manage', 'team.view', 'team.manage', 'leads.view_all', 'leads.edit_all',
    'leads.reassign', 'leads.override_score', 'inventory.manage', 'pipeline.configure',
    'reports.view', 'audit.view', 'export.csv',
  ],
  admin: [
    'team.view', 'team.manage', 'leads.view_all', 'leads.edit_all', 'leads.reassign',
    'leads.override_score', 'inventory.manage', 'pipeline.configure', 'reports.view',
    'audit.view', 'export.csv',
  ],
  broker: ['team.view'],
  viewer: ['team.view', 'leads.view_all', 'reports.view'],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role].includes(permission);
}

/** Roles the given role may grant to others (mirrors add_member_by_email). */
export function grantableRoles(role: Role | null | undefined): Role[] {
  if (role === 'owner') return ['owner', 'admin', 'broker', 'viewer'];
  if (role === 'admin') return ['broker', 'viewer'];
  return [];
}

/** Whether `actor` may change or remove a member who currently has `target`. */
export function canManageMember(actor: Role | null | undefined, target: Role): boolean {
  if (actor === 'owner') return true;
  if (actor === 'admin') return target === 'broker' || target === 'viewer';
  return false;
}
