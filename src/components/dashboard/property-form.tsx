'use client';

import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { propertyOperation, saveProperty } from '@/app/actions/properties';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert, Input, Select } from '@/components/ui/field';
import { NAVI_MUMBAI_LOCALITIES, PROPERTY_TYPES } from '@/config/brand';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { useAction } from './lead-panels';

const lbl = 'mb-1 block text-xs font-semibold text-stone-700';
const AMENITIES = ['Lift', 'Parking', 'Gym', 'Swimming pool', 'Power backup', 'Security', 'Club house', 'Garden', 'Play area', 'Intercom', 'Gas pipeline', 'Rainwater harvesting'];

type P = Record<string, unknown> | undefined;

function F({ k, label, error, children }: { k: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={lbl} htmlFor={`pf-${k}`}>{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-danger-700">{error}</p>}
    </div>
  );
}

export function PropertyForm({ members, property }: { members: { id: string; name: string }[]; property?: P }) {
  const a = useAction();
  const s = (k: string) => (property?.[k] == null ? '' : String(property[k]));
  const [v, setV] = useState({
    id: property?.id as string | undefined,
    ref_code: s('ref_code'), title: s('title'), transaction_type: s('transaction_type') || 'sale', category: s('category') || 'residential',
    property_type: s('property_type') || 'Apartment', configuration: s('configuration'), locality: s('locality'), project_name: s('project_name'),
    address_private: s('address_private'), public_location: s('public_location'), price: s('price'),
    price_on_request: Boolean(property?.price_on_request), carpet_area: s('carpet_area'), area_unit: s('area_unit') || 'sq_ft',
    furnishing: s('furnishing'), possession_status: s('possession_status'), possession_date: s('possession_date'),
    amenities: (property?.amenities as string[] | undefined) ?? [], description: s('description'), status: s('status') || 'draft',
    is_demo: Boolean(property?.is_demo), assigned_broker: s('assigned_broker'), listing_source: s('listing_source'),
    rera_number: s('rera_number'), rera_project_name: s('rera_project_name'), internal_notes: s('internal_notes'),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV({ ...v, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const err = (k: string) => a.result?.errors?.[k];
  const types = v.category === 'commercial' ? PROPERTY_TYPES.commercial : PROPERTY_TYPES.residential;

  return (
    <Card className="p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <F k="title" error={err('title')} label="Title"><Input id="pf-title" value={v.title} onChange={set('title')} placeholder="2 BHK with park view near Central Park" /></F>
        <F k="ref_code" error={err('ref_code')} label="Listing ID"><Input id="pf-ref_code" value={v.ref_code} onChange={set('ref_code')} placeholder="KHR-101" /></F>
        <F k="transaction_type" error={err('transaction_type')} label="Transaction">
          <Select id="pf-transaction_type" value={v.transaction_type} onChange={set('transaction_type')}>
            <option value="sale">Sale</option><option value="rent">Rent</option><option value="lease">Lease</option>
          </Select></F>
        <F k="category" error={err('category')} label="Category">
          <Select id="pf-category" value={v.category} onChange={set('category')}>
            <option value="residential">Residential</option><option value="commercial">Commercial</option>
          </Select></F>
        <F k="property_type" error={err('property_type')} label="Property type">
          <Select id="pf-property_type" value={v.property_type} onChange={set('property_type')}>
            {[...types, ...(types.includes(v.property_type as never) ? [] : [v.property_type])].map((t) => <option key={t} value={t}>{t}</option>)}
          </Select></F>
        <F k="configuration" error={err('configuration')} label="Configuration"><Input id="pf-configuration" value={v.configuration} onChange={set('configuration')} placeholder="2 BHK" /></F>
        <F k="locality" error={err('locality')} label="Locality">
          <Select id="pf-locality" value={v.locality} onChange={set('locality')}>
            <option value="">Choose…</option>
            {NAVI_MUMBAI_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select></F>
        <F k="project_name" error={err('project_name')} label="Project / building"><Input id="pf-project_name" value={v.project_name} onChange={set('project_name')} /></F>
        <F k="price" error={err('price')} label={v.transaction_type === 'sale' ? 'Price (₹)' : 'Monthly rent (₹)'}><Input id="pf-price" inputMode="numeric" value={v.price} onChange={set('price')} /></F>
        <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.price_on_request} onChange={set('price_on_request')} className="h-4 w-4 accent-navy-900" /> Price on request</label></div>
        <F k="carpet_area" error={err('carpet_area')} label="Carpet area"><Input id="pf-carpet_area" inputMode="numeric" value={v.carpet_area} onChange={set('carpet_area')} /></F>
        <F k="area_unit" error={err('area_unit')} label="Area unit">
          <Select id="pf-area_unit" value={v.area_unit} onChange={set('area_unit')}><option value="sq_ft">sq ft</option><option value="sq_m">sq m</option></Select></F>
        <F k="furnishing" error={err('furnishing')} label="Furnishing">
          <Select id="pf-furnishing" value={v.furnishing} onChange={set('furnishing')}>
            <option value="">Not specified</option><option value="unfurnished">Unfurnished</option><option value="semi_furnished">Semi-furnished</option><option value="fully_furnished">Fully furnished</option>
          </Select></F>
        <F k="possession_status" error={err('possession_status')} label="Possession">
          <Select id="pf-possession_status" value={v.possession_status} onChange={set('possession_status')}>
            <option value="">Not specified</option><option value="ready_to_move">Ready to move</option><option value="under_construction">Under construction</option>
          </Select></F>
        <F k="possession_date" error={err('possession_date')} label="Possession date"><Input id="pf-possession_date" type="date" value={v.possession_date} onChange={set('possession_date')} /></F>
        <F k="status" error={err('status')} label="Status">
          <Select id="pf-status" value={v.status} onChange={set('status')}>
            {['draft', 'available', 'reserved', 'sold', 'rented', 'inactive'].map((x) => <option key={x} value={x}>{x}</option>)}
          </Select></F>
        <F k="public_location" error={err('public_location')} label="Public location (shown on website)"><Input id="pf-public_location" value={v.public_location} onChange={set('public_location')} placeholder="Sector 20, near station" /></F>
        <F k="address_private" error={err('address_private')} label="Full address (private)"><Input id="pf-address_private" value={v.address_private} onChange={set('address_private')} /></F>
        <F k="assigned_broker" error={err('assigned_broker')} label="Listing broker">
          <Select id="pf-assigned_broker" value={v.assigned_broker} onChange={set('assigned_broker')}>
            <option value="">None</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select></F>
        <F k="listing_source" error={err('listing_source')} label="Listing source"><Input id="pf-listing_source" value={v.listing_source} onChange={set('listing_source')} placeholder="Owner, developer, co-broker" /></F>
        <F k="rera_number" error={err('rera_number')} label="MahaRERA registration no."><Input id="pf-rera_number" value={v.rera_number} onChange={set('rera_number')} /></F>
        <F k="rera_project_name" error={err('rera_project_name')} label="RERA project name"><Input id="pf-rera_project_name" value={v.rera_project_name} onChange={set('rera_project_name')} /></F>
      </div>
      <fieldset className="mt-5">
        <legend className={lbl}>Amenities</legend>
        <div className="flex flex-wrap gap-1.5">
          {AMENITIES.map((am) => {
            const on = v.amenities.includes(am);
            return <button key={am} type="button" aria-pressed={on} onClick={() => setV({ ...v, amenities: on ? v.amenities.filter((x) => x !== am) : [...v.amenities, am] })}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? 'border-navy-900 bg-navy-900 text-ivory' : 'border-stone-300 bg-white'}`}>{am}</button>;
          })}
        </div>
      </fieldset>
      <div className="mt-4 grid gap-4">
        <F k="description" error={err('description')} label="Description (public)"><textarea id="pf-description" rows={4} value={v.description} onChange={set('description')} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" /></F>
        <F k="internal_notes" error={err('internal_notes')} label="Internal notes (private)"><textarea id="pf-internal_notes" rows={2} value={v.internal_notes} onChange={set('internal_notes')} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" /></F>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.is_demo} onChange={set('is_demo')} className="h-4 w-4 accent-navy-900" /> Demo listing (labelled “Demo listing — not a real offer” on the website)</label>
      </div>
      <div className="mt-5">
        <Button disabled={a.pending} onClick={() => a.run(() => saveProperty({ ...v, id: v.id }))}>{a.pending ? 'Saving…' : v.id ? 'Save listing' : 'Create listing'}</Button>
        {a.result?.message && <div className="mt-3"><FormAlert tone={a.result.ok ? 'success' : 'error'}>{a.result.message}</FormAlert></div>}
      </div>
    </Card>
  );
}

export function PublishControls({ id, published, status, verified }: { id: string; published: boolean; status: string; verified: boolean }) {
  const a = useAction();
  const live = ['available', 'reserved'].includes(status);
  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => propertyOperation({ op: 'verify', id }))}>Mark verified today</Button>
        {published ? (
          <Button size="sm" variant="outline" disabled={a.pending} onClick={() => a.run(() => propertyOperation({ op: 'publish', id, published: false }))}>Unpublish</Button>
        ) : (
          <Button size="sm" disabled={a.pending || !live} onClick={() => a.run(() => propertyOperation({ op: 'publish', id, published: true }))}>Publish</Button>
        )}
      </div>
      {!live && <p className="text-xs text-stone-500">Set status to Available or Reserved to publish.</p>}
      {live && !verified && <p className="text-xs text-stone-500">Verify availability before publishing.</p>}
      {a.result?.message && <FormAlert tone={a.result.ok ? 'success' : 'error'}>{a.result.message}</FormAlert>}
    </div>
  );
}

export function MediaManager({ orgId, propertyId, media }: { orgId: string; propertyId: string; media: { id: string; url: string; alt: string; isCover: boolean }[] }) {
  const a = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string>();
  const [error, setError] = useState<string>();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(undefined);
    const supabase = createBrowserSupabase();
    for (const file of Array.from(files).slice(0, 10)) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) { setError(`${file.name}: use JPG, PNG, WebP or AVIF.`); continue; }
      if (file.size > 8 * 1024 * 1024) { setError(`${file.name} is larger than 8 MB.`); continue; }
      setUploading(file.name);
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${orgId}/${propertyId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('property-media').upload(path, file, { cacheControl: '31536000', contentType: file.type });
      if (upErr) { setError(`Upload failed for ${file.name}. Check the storage migration ran.`); continue; }
      const res = await propertyOperation({ op: 'add_media', id: propertyId, path, alt: '' });
      if (!res.ok) setError(res.message);
    }
    setUploading(undefined);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="mt-3">
      {media.length === 0 && <p className="mb-3 text-sm text-stone-600">No photos yet. Only upload photos you own or are licensed to use.</p>}
      <ul className="grid grid-cols-2 gap-3">
        {media.map((m) => <MediaTile key={m.id} m={m} propertyId={propertyId} />)}
      </ul>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" id="media-upload" onChange={(e) => upload(e.target.files)} />
      <label htmlFor="media-upload" className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-navy-900 hover:border-navy-700">
        <ImagePlus className="h-4 w-4" aria-hidden="true" /> {uploading ? `Uploading ${uploading}…` : 'Add photos'}
      </label>
      {error && <div className="mt-3"><FormAlert>{error}</FormAlert></div>}
      {a.result?.message && <div className="mt-3"><FormAlert tone={a.result.ok ? 'success' : 'error'}>{a.result.message}</FormAlert></div>}
    </div>
  );
}

function MediaTile({ m, propertyId }: { m: { id: string; url: string; alt: string; isCover: boolean }; propertyId: string }) {
  const a = useAction();
  const [alt, setAlt] = useState(m.alt);
  return (
    <li className="overflow-hidden rounded-lg border border-stone-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.url} alt={m.alt || 'Property photo'} className="aspect-[4/3] w-full object-cover" />
      <div className="flex flex-col gap-1.5 p-2">
        <label className="sr-only" htmlFor={`alt-${m.id}`}>Photo description</label>
        <input id={`alt-${m.id}`} value={alt} onChange={(e) => setAlt(e.target.value)} onBlur={() => alt !== m.alt && a.run(() => propertyOperation({ op: 'alt', id: propertyId, mediaId: m.id, alt }))}
          placeholder="Describe the photo" className="h-8 rounded border border-stone-200 px-2 text-xs" />
        <div className="flex justify-between">
          <button type="button" disabled={m.isCover || a.pending} onClick={() => a.run(() => propertyOperation({ op: 'cover', id: propertyId, mediaId: m.id }))}
            className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800 disabled:text-gold-700">
            <Star className={`h-3.5 w-3.5 ${m.isCover ? 'fill-current' : ''}`} aria-hidden="true" /> {m.isCover ? 'Cover' : 'Make cover'}
          </button>
          <button type="button" aria-label="Remove photo" disabled={a.pending} onClick={() => a.run(() => propertyOperation({ op: 'remove_media', id: propertyId, mediaId: m.id }))}
            className="text-danger-700"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </li>
  );
}
