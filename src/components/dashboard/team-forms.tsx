'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { addMember, changeMemberRole, removeMember } from '@/app/actions/team';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FormAlert, Input, Select } from '@/components/ui/field';
import type { Role } from '@/lib/permissions';
import { addMemberSchema } from '@/lib/validation';

type Option = { value: Role; label: string };
type Values = z.infer<typeof addMemberSchema>;

export function AddMemberForm({ roles }: { roles: Option[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string }>();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { role: 'broker' },
  });

  const onSubmit = (values: Values) =>
    start(async () => {
      const res = await addMember(values);
      setResult(res);
      if (res.ok) reset({ email: '', role: values.role });
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
      <Field label="Email" error={errors.email?.message}>
        {(a) => <Input {...a} type="email" autoComplete="off" {...register('email')} />}
      </Field>
      <Field label="Role" error={errors.role?.message}>
        {(a) => (
          <Select {...a} {...register('role')}>
            {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        )}
      </Field>
      <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add member'}</Button>
      {result?.message && (
        <div className="md:col-span-3"><FormAlert tone={result.ok ? 'success' : 'error'}>{result.message}</FormAlert></div>
      )}
    </form>
  );
}

export function MemberRow({
  member, isSelf, editable, roleOptions, roleLabel,
}: {
  member: { userId: string; role: Role; name: string | null; email: string | null };
  isSelf: boolean;
  editable: boolean;
  roleOptions: Option[];
  roleLabel: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const onRole = (role: Role) =>
    start(async () => {
      setError(undefined);
      const res = await changeMemberRole({ userId: member.userId, role });
      if (!res.ok) setError(res.message);
    });

  const onRemove = () =>
    start(async () => {
      setError(undefined);
      const res = await removeMember({ userId: member.userId });
      if (!res.ok) setError(res.message);
      setConfirming(false);
    });

  return (
    <tr className="align-middle">
      <td className="px-5 py-3.5 font-medium text-stone-900">
        {member.name ?? '—'} {isSelf && <Badge tone="gold" className="ml-1.5">You</Badge>}
      </td>
      <td className="px-5 py-3.5 text-stone-700">{member.email ?? '—'}</td>
      <td className="px-5 py-3.5">
        {editable ? (
          <>
            <label htmlFor={`role-${member.userId}`} className="sr-only">Role for {member.email}</label>
            <select
              id={`role-${member.userId}`}
              defaultValue={member.role}
              disabled={pending}
              onChange={(e) => onRole(e.target.value as Role)}
              className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm"
            >
              {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </>
        ) : (
          <Badge tone={member.role === 'owner' ? 'navy' : 'neutral'}>{roleLabel}</Badge>
        )}
        {error && <p role="alert" className="mt-1 text-xs text-danger-700">{error}</p>}
      </td>
      <td className="px-5 py-3.5 text-right">
        {editable && !confirming && (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} disabled={pending}>Remove</Button>
        )}
        {editable && confirming && (
          <span className="inline-flex items-center gap-2">
            <span className="text-xs text-stone-600">Remove from team?</span>
            <Button variant="danger" size="sm" onClick={onRemove} disabled={pending}>Yes, remove</Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={pending}>Cancel</Button>
          </span>
        )}
      </td>
    </tr>
  );
}
