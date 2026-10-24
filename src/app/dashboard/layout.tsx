import { LogOut } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { switchOrganization } from '@/app/actions/organization';
import { DASHBOARD_NAV } from '@/components/dashboard/nav';
import { Sidebar } from '@/components/dashboard/sidebar';
import { brand } from '@/config/brand';
import { getMemberships, requireMembership } from '@/lib/auth';
import { can, ROLE_LABELS } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Workspace', robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, membership } = await requireMembership();
  const memberships = await getMemberships();
  const supabase = await createClient();
  const { count: unread } = await supabase.from('notification_logs').select('id', { count: 'exact', head: true })
    .eq('recipient_id', user.id).eq('org_id', membership.orgId).eq('channel', 'in_app').is('read_at', null);
  const items = DASHBOARD_NAV.filter((i) => !i.permission || can(membership.role, i.permission))
    .map((i) => (i.icon === 'reminders' ? { ...i, badge: unread ?? 0 } : i));
  const name = (user.user_metadata?.full_name as string | undefined) || user.email;

  const footer = (
    <div className="flex flex-col gap-3 px-3 text-sm">
      <div>
        <p className="truncate font-semibold text-ivory">{name}</p>
        <p className="text-xs text-stone-300">
          {ROLE_LABELS[membership.role]} · {membership.orgName}
        </p>
      </div>
      {memberships.length > 1 && (
        <form
          action={async (fd: FormData) => {
            'use server';
            await switchOrganization(String(fd.get('org')));
          }}
          className="flex gap-2"
        >
          <label htmlFor="org-switch" className="sr-only">Switch brokerage</label>
          <select id="org-switch" name="org" defaultValue={membership.orgId}
            className="h-9 min-w-0 flex-1 rounded-md border border-white/20 bg-navy-900 px-2 text-xs text-ivory">
            {memberships.map((m) => <option key={m.orgId} value={m.orgId}>{m.orgName}</option>)}
          </select>
          <button type="submit" className="rounded-md border border-white/20 px-2 text-xs text-ivory hover:bg-white/10">Go</button>
        </form>
      )}
      <form action={signOut}>
        <button type="submit" className="flex items-center gap-2 py-1 text-stone-300 hover:text-ivory">
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-svh bg-stone-100 lg:flex">
      <Sidebar items={items} brandName={brand.name} footer={footer} />
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
