'use client';

import { markNotificationsRead } from '@/app/actions/work';
import { Button } from '@/components/ui/button';
import { useAction } from './lead-panels';

export function MarkAllRead() {
  const a = useAction();
  return <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => markNotificationsRead('all'))}>Mark all as read</Button>;
}
