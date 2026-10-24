import { Search } from 'lucide-react';
import { NAVI_MUMBAI_LOCALITIES, PROPERTY_TYPES } from '@/config/brand';

const BUDGETS = [
  { value: '', label: 'Any budget' },
  { value: '5000000', label: 'Up to ₹50 L' },
  { value: '10000000', label: 'Up to ₹1 Cr' },
  { value: '20000000', label: 'Up to ₹2 Cr' },
  { value: '50000000', label: 'Up to ₹5 Cr' },
];

const select =
  'h-12 w-full rounded-lg border border-stone-300 bg-white px-3 text-[15px] text-stone-900 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-300';

/** Plain GET form so search works without JavaScript and is shareable. */
export function SearchBar({ defaults = {} }: { defaults?: Record<string, string | undefined> }) {
  return (
    <form action="/properties" method="get" role="search" aria-label="Search properties"
      className="grid gap-3 rounded-2xl bg-white p-3 shadow-[var(--shadow-lift)] sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
      <label className="sr-only" htmlFor="s-transaction">Looking to</label>
      <select id="s-transaction" name="transaction" defaultValue={defaults.transaction ?? ''} className={select}>
        <option value="">Buy or rent</option>
        <option value="sale">Buy</option>
        <option value="rent">Rent</option>
        <option value="lease">Lease</option>
      </select>
      <label className="sr-only" htmlFor="s-locality">Locality</label>
      <select id="s-locality" name="locality" defaultValue={defaults.locality ?? ''} className={select}>
        <option value="">All Navi Mumbai</option>
        {NAVI_MUMBAI_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <label className="sr-only" htmlFor="s-type">Property type</label>
      <select id="s-type" name="type" defaultValue={defaults.type ?? ''} className={select}>
        <option value="">Any property type</option>
        <optgroup label="Residential">
          {PROPERTY_TYPES.residential.map((t) => <option key={t} value={t}>{t}</option>)}
        </optgroup>
        <optgroup label="Commercial">
          {PROPERTY_TYPES.commercial.map((t) => <option key={t} value={t}>{t}</option>)}
        </optgroup>
      </select>
      <label className="sr-only" htmlFor="s-budget">Budget</label>
      <select id="s-budget" name="maxBudget" defaultValue={defaults.maxBudget ?? ''} className={select}>
        {BUDGETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
      </select>
      <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gold-500 px-6 font-semibold text-navy-950 hover:bg-gold-300 sm:col-span-2 lg:col-span-1">
        <Search className="h-4 w-4" aria-hidden="true" /> Search
      </button>
    </form>
  );
}
