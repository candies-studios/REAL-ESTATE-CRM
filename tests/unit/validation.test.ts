import { describe, expect, it } from 'vitest';
import { formatINR, normalizeIndianPhone } from '@/lib/utils';
import { addMemberSchema, fieldErrors, friendlyDbError, signUpSchema } from '@/lib/validation';

describe('normalizeIndianPhone', () => {
  it.each([
    ['98200 12345', '+919820012345'],
    ['+91 98200-12345', '+919820012345'],
    ['09820012345', '+919820012345'],
    ['919820012345', '+919820012345'],
    ['0091 9820012345', '+919820012345'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  it.each(['12345', '5820012345', 'abc', '', null])('rejects %s', (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
  });
});

describe('formatINR', () => {
  it('uses lakh and crore', () => {
    expect(formatINR(8500000)).toBe('₹85 L');
    expect(formatINR(12500000)).toBe('₹1.25 Cr');
    expect(formatINR(45000)).toBe('₹45,000');
    expect(formatINR(null)).toBe('—');
  });
});

describe('signUpSchema', () => {
  it('accepts a valid sign-up and lower-cases the email', () => {
    const r = signUpSchema.parse({ fullName: ' Priya Shah ', email: 'Priya@Example.COM ', password: 'harbourview24' });
    expect(r.email).toBe('priya@example.com');
    expect(r.fullName).toBe('Priya Shah');
  });

  it('rejects weak passwords with a helpful message', () => {
    const r = signUpSchema.safeParse({ fullName: 'Priya', email: 'p@example.com', password: 'short' });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).password).toMatch(/10 characters/);
  });
});

describe('addMemberSchema', () => {
  it('only allows known roles', () => {
    expect(addMemberSchema.safeParse({ email: 'a@b.co', role: 'superuser' }).success).toBe(false);
    expect(addMemberSchema.safeParse({ email: 'a@b.co', role: 'broker' }).success).toBe(true);
  });
});

describe('friendlyDbError', () => {
  it('translates known database errors and hides unknown ones', () => {
    expect(friendlyDbError('an organization must keep at least one owner')).toMatch(/at least one owner/);
    expect(friendlyDbError('duplicate key value violates unique constraint "x"')).toBe('Something went wrong. Please try again.');
  });
});
