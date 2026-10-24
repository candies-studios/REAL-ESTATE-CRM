'use client';

import { useState } from 'react';
import { createTask } from '@/app/actions/work';
import { Button } from '@/components/ui/button';
import { FormAlert, Input, Select } from '@/components/ui/field';
import { toLocalInput } from './format';
import { useAction } from './lead-panels';

export function NewTaskForm({ members }: { members: { id: string; name: string }[] }) {
  const a = useAction();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000)));
  const [assignedTo, setAssignedTo] = useState('');
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="sr-only" htmlFor="nt-title">New task</label>
        <Input id="nt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task, e.g. Collect documents from owner" />
        <label className="sr-only" htmlFor="nt-due">Due</label>
        <Input id="nt-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        {members.length > 0 ? (
          <>
            <label className="sr-only" htmlFor="nt-who">Assign to</label>
            <Select id="nt-who" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Me</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </>
        ) : <span />}
        <Button disabled={a.pending || title.trim().length < 2} onClick={() => a.run(() => createTask({ title, due, assignedTo }), (r) => r.ok && setTitle(''))}>Add task</Button>
      </div>
      {a.result?.message && <div className="mt-3"><FormAlert tone={a.result.ok ? 'success' : 'error'}>{a.result.message}</FormAlert></div>}
    </>
  );
}
