import { supabaseUrl } from './supabase/env';

export const MEDIA_BUCKET = 'property-media';

/** Public URL for a file in the property-media bucket. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path || !supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
