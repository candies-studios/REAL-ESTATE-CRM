import type { Permission } from '@/lib/permissions';

export type NavItem = {
  href: string;
  label: string;
  icon: 'overview' | 'leads' | 'pipeline' | 'properties' | 'visits' | 'tasks' | 'reports' | 'team';
  /** Hide the item unless the role has this permission. */
  permission?: Permission;
  /** Build phase that delivers the screen (shown on placeholder pages). */
  phase?: number;
};

export const DASHBOARD_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: 'overview' },
  { href: '/dashboard/leads', label: 'Leads', icon: 'leads', phase: 3 },
  { href: '/dashboard/pipeline', label: 'Pipeline', icon: 'pipeline', phase: 3 },
  { href: '/dashboard/properties', label: 'Properties', icon: 'properties', phase: 4 },
  { href: '/dashboard/site-visits', label: 'Site visits', icon: 'visits', phase: 4 },
  { href: '/dashboard/tasks', label: 'Tasks', icon: 'tasks', phase: 5 },
  { href: '/dashboard/reports', label: 'Reports', icon: 'reports', permission: 'reports.view', phase: 6 },
  { href: '/dashboard/team', label: 'Team', icon: 'team', permission: 'team.view' },
];
