/**
 * Full journey through the product with real sign-ins and data:
 * owner onboarding → listing → visitor enquiry → CRM work → pipeline →
 * visits → reports → automation → team → export → broker access rules.
 */
import { expect, test, type Page } from '@playwright/test';

const run = Date.now().toString(36);
const owner = { name: 'Asha Owner', email: `owner.${run}@example.test`, password: 'harbourview24' };
const broker = { name: 'Bina Broker', email: `broker.${run}@example.test`, password: 'harbourview24' };
const shots = process.env.E2E_SCREENSHOT_DIR;
const shot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };

async function signUp(page: Page, u: typeof owner) {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill(u.name);
  await page.getByLabel('Work email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/onboarding|\/dashboard/);
}

async function signIn(page: Page, u: typeof owner) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard|\/onboarding/);
}

test.describe.serial('brokerage journey', () => {
  let propertyUrl = '';
  let leadUrl = '';

  test('owner signs up and creates the brokerage', async ({ page }) => {
    await signUp(page, owner);
    await expect(page.getByRole('heading', { name: 'Set up your brokerage' })).toBeVisible();
    await page.getByLabel('Brokerage name').fill(`Harbour Homes ${run}`);
    await page.getByRole('button', { name: 'Create brokerage' }).click();
    await page.waitForURL('**/dashboard');
    await expect(page.getByText('Setup checklist')).toBeVisible();
    await shot(page, '01-overview-empty');
  });

  test('owner adds, verifies and publishes a listing', async ({ page }) => {
    await signIn(page, owner);
    await page.goto('/dashboard/properties/new');
    await page.getByLabel('Title', { exact: true }).fill('Test 2 BHK near Central Park');
    await page.getByLabel('Listing ID').fill(`KHR-${run}`);
    await page.getByLabel('Locality').selectOption('Kharghar');
    await page.getByLabel('Configuration').fill('2 BHK');
    await page.getByLabel('Price (₹)').fill('9500000');
    await page.getByLabel('Carpet area', { exact: true }).fill('780');
    await page.getByLabel('Status').selectOption('available');
    await page.getByRole('button', { name: 'Lift' }).click();
    await page.getByLabel('Description (public)').fill('Sunny corner flat, five minutes from the park.');
    await page.getByRole('button', { name: 'Create listing' }).click();
    await page.waitForURL(/\/dashboard\/properties\/[0-9a-f-]{36}/);
    await expect(page.getByText('Listing created.')).toBeVisible();

    // Publishing is refused until verified (UI guards, DB enforces).
    await page.getByRole('button', { name: 'Mark verified today' }).click();
    await expect(page.getByText('Marked as verified today.')).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published on the website.')).toBeVisible();
    propertyUrl = page.url().split('?')[0].replace('/dashboard/properties/', '/properties/');
    await shot(page, '02-property-admin');
  });

  test('a visitor finds the listing and books a visit', async ({ page }) => {
    await page.goto('/properties?locality=Kharghar');
    await page.getByRole('link', { name: 'Test 2 BHK near Central Park' }).click();
    await expect(page).toHaveURL(new RegExp(propertyUrl.split('/properties/')[1]));
    await expect(page.getByRole('heading', { name: 'Test 2 BHK near Central Park' })).toBeVisible();
    await expect(page.getByText('₹95 L').first()).toBeVisible();

    const form = page.locator('#enquire');
    await form.getByLabel('Full name').fill('Test Buyer Ananya');
    await form.getByLabel('Mobile number').fill('98200 11111');
    await form.getByLabel(/Minimum budget/).fill('8000000');
    await form.getByLabel(/Maximum budget/).fill('10000000');
    await form.getByLabel('Timeline').selectOption({ label: 'Within 30 days' });
    await form.getByLabel('I’d like to schedule a site visit').check();
    await form.getByLabel(/I agree to be contacted/).check();
    await form.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(page.getByText('Thank you, we’ve received your enquiry.')).toBeVisible();
    await expect(page.getByText(/Your reference is [0-9A-F]{8}/)).toBeVisible();
    await shot(page, '03-enquiry-sent');
  });

  test('the visitor cannot submit without consent', async ({ page }) => {
    await page.goto('/enquire/buy');
    await page.getByLabel('Full name').fill('No Consent');
    await page.getByLabel('Mobile number').fill('9820022222');
    await page.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(page.getByText('Please agree so we can respond to your enquiry')).toBeVisible();
  });

  test('owner works the lead: score, contact, visit', async ({ page }) => {
    await signIn(page, owner);
    await page.goto('/dashboard/leads');
    await page.getByRole('link', { name: 'Test Buyer Ananya' }).click();
    await page.waitForURL(/\/dashboard\/leads\/[0-9a-f-]{36}/);
    leadUrl = page.url();

    // Transparent score from the configurable rules
    await expect(page.getByText(/Hot · 100/)).toBeVisible();
    await page.getByText(/Why this score/).click();
    await expect(page.getByText('Budget fits at least one available property')).toBeVisible();
    // Match with explained reasons, and the automatic first-contact task
    await expect(page.getByText(/Within budget · Preferred locality: Kharghar/)).toBeVisible();
    await expect(page.getByText('First contact: Test Buyer Ananya')).toBeVisible();
    await shot(page, '04-lead-detail');

    // Logging a call records contact and moves the stage forward
    await page.getByRole('button', { name: 'Call', exact: true }).click();
    await page.getByLabel('Details').fill('Spoke to Ananya, prefers Saturday morning.');
    await page.getByRole('button', { name: 'Log contact' }).click();
    await expect(page.getByText(/Contact logged/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Contacted ·/).first()).toBeVisible();
    await expect(page.getByText('First contact: Test Buyer Ananya')).toHaveCount(0);

    // Schedule a site visit tomorrow at 11:00 IST
    const tomorrow = new Date(Date.now() + 5.5 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
    await page.getByRole('button', { name: 'Schedule a visit' }).click();
    await page.getByLabel('Property').selectOption({ index: 1 });
    await page.getByLabel('Date and time (IST)').fill(`${tomorrow}T11:00`);
    await page.getByLabel('Meeting point').fill('Project sales office');
    await page.getByRole('button', { name: 'Schedule visit' }).click();
    await expect(page.getByText(/Visit scheduled/)).toBeVisible();
    await page.reload();
    await expect(page.getByText('Confirm site visit with Test Buyer Ananya')).toBeVisible();
    await expect(page.getByText(/Site Visit Scheduled ·/).first()).toBeVisible();
  });

  test('pipeline move needs a reason for Lost, and allows Negotiation', async ({ page }) => {
    await signIn(page, owner);
    await page.goto('/dashboard/pipeline');
    const card = page.getByLabel('Move Test Buyer Ananya to');
    await card.selectOption({ label: 'Lost' });
    await expect(page.getByRole('heading', { name: 'Why was this lead lost?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await card.selectOption({ label: 'Negotiation' });
    await expect(page.getByRole('region', { name: 'Negotiation' }).getByRole('link', { name: 'Test Buyer Ananya' })).toBeVisible();
    await shot(page, '05-pipeline');
    await page.goto(leadUrl);
    await expect(page.getByText('Negotiation follow-up: Test Buyer Ananya')).toBeVisible();
  });

  test('reports, automation and settings work', async ({ page }) => {
    await signIn(page, owner);
    await page.goto('/dashboard/reports');
    await expect(page.getByText('New leads', { exact: true })).toBeVisible();
    await expect(page.getByText('Qualified-lead rate')).toBeVisible();
    await shot(page, '06-reports');
    await page.goto('/dashboard/settings');
    await page.getByRole('button', { name: 'Run reminders now' }).click();
    await expect(page.getByText(/^Done: /)).toBeVisible();
    await page.goto('/dashboard/reminders');
    await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible();
  });

  test('team: broker joins and sees only their own leads', async ({ page, browser }) => {
    const ctx = await browser.newContext();
    const bp = await ctx.newPage();
    await signUp(bp, broker);
    await expect(bp.getByText(broker.email)).toBeVisible(); // "ask the owner to add …"

    await signIn(page, owner);
    await page.goto('/dashboard/team');
    await page.getByLabel('Email').fill(broker.email);
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByText(`${broker.email} has been added.`)).toBeVisible();

    // Still signed in from sign-up; now a member, so the workspace opens.
    await bp.goto('/dashboard/leads');
    await expect(bp.getByText('No leads match.')).toBeVisible(); // lead is not assigned to them
    await bp.goto(leadUrl);
    await expect(bp.getByRole('heading', { name: 'This page could not be found.' })).toBeVisible();
    await bp.goto('/dashboard/reports');
    await expect(bp).toHaveURL(/\/dashboard$/);
    await ctx.close();
  });

  test('owner exports CSV; the cron endpoint is protected', async ({ page, request }) => {
    await signIn(page, owner);
    const res = await page.request.get('/dashboard/leads/export');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('Test Buyer Ananya');
    expect((await request.get('/api/cron/reminders')).status()).toBe(401);
    if (process.env.E2E_CRON_SECRET) {
      const ok = await request.get('/api/cron/reminders', { headers: { Authorization: `Bearer ${process.env.E2E_CRON_SECRET}` } });
      expect(ok.status()).toBe(200);
      expect(await ok.json()).toHaveProperty('automation');
    }
  });
});
