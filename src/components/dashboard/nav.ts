import type { Permission } from '@/lib/permissions';

export type NavItem = {
  href: string;
  label: string;
  icon: 'overview' | 'leads' | 'pipeline' | 'properties' | 'visits' | 'tasks' | 'reports' | 'team' | 'reminders' | 'settings';
  /** Hide the item unless the role has this permission. */
  permission?: Permission;
  badge?: number;
};

export const DASHBOARD_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: 'overview' },
  { href: '/dashboard/reminders', label: 'Reminders', icon: 'reminders' },
  { href: '/dashboard/leads', label: 'Leads', icon: 'leads' },
  { href: '/dashboard/pipeline', label: 'Pipeline', icon: 'pipeline' },
  { href: '/dashboard/tasks', label: 'Tasks', icon: 'tasks' },
  { href: '/dashboard/site-visits', label: 'Site visits', icon: 'visits' },
  { href: '/dashboard/properties', label: 'Properties', icon: 'properties' },
  { href: '/dashboard/reports', label: 'Reports', icon: 'reports', permission: 'reports.view' },
  { href: '/dashboard/team', label: 'Team', icon: 'team', permission: 'team.view' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'settings', permission: 'pipeline.configure' },
];
