import { z } from 'zod';
import { ROLES } from './permissions';

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(72, 'Use at most 72 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/\d/, 'Include at least one number'),
});

export const organizationSchema = z.object({
  name: z.string().trim().min(2, 'Enter your brokerage name').max(120),
});

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(ROLES),
});

export const changeRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

export const removeMemberSchema = z.object({
  userId: z.string().uuid(),
});

/** Converts a Zod error into { field: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Maps Postgres/Supabase errors from our RPCs to messages safe to show users. */
export function friendlyDbError(message: string | undefined): string {
  const m = (message || '').toLowerCase();
  if (m.includes('already a member')) return 'That person is already on your team.';
  if (m.includes('ask them to sign up')) return 'No account uses that email yet. Ask them to sign up first, then add them.';
  if (m.includes('only owners can')) return 'Only an owner can grant or change owner and admin roles.';
  if (m.includes('only owners and admins')) return 'Only owners and admins can manage the team.';
  if (m.includes('at least one owner')) return 'Your organization must keep at least one owner.';
  if (m.includes('already created an organization')) return 'You have already created a brokerage. Ask its owner to add you instead.';
  if (m.includes('name is too short')) return 'Enter your brokerage name.';
  return 'Something went wrong. Please try again.';
}
