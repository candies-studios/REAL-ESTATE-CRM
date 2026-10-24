'use client';

import { Check, Heart, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const KEY = 'shortlist:v1';

export function readShortlist(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeShortlist(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 50)));
    window.dispatchEvent(new Event('shortlist-change'));
  } catch {
    /* storage unavailable: shortlist just won't persist */
  }
}

/** Saves a property to the visitor's shortlist in their own browser. */
export function ShortlistButton({ id, className }: { id: string; className?: string }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const sync = () => setSaved(readShortlist().includes(id));
    sync();
    window.addEventListener('shortlist-change', sync);
    return () => window.removeEventListener('shortlist-change', sync);
  }, [id]);

  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => {
        const list = readShortlist();
        writeShortlist(saved ? list.filter((x) => x !== id) : [id, ...list]);
      }}
      className={cn('inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
        saved ? 'border-gold-500 bg-gold-100 text-gold-700' : 'border-stone-300 bg-white text-navy-900 hover:border-navy-700', className)}
    >
      <Heart className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden="true" />
      {saved ? 'Shortlisted' : 'Shortlist'}
    </button>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = window.location.href;
        if (navigator.share) {
          try { await navigator.share({ title, url }); } catch { /* cancelled */ }
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard blocked */ }
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-navy-900 hover:border-navy-700"
    >
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
