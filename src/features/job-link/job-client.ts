'use client';

import imageCompression from 'browser-image-compression';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { JobViewJson } from '@/lib/contracts/job';
import { catalogFromJson, type Catalog, type PublicCatalogJson } from '@/lib/pricing';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { jobPhotoPath, mapJobView, type JobModel, type PhotoKind } from './model';

const BUCKET = 'job-photos';

/** rpc('get_job_view') with the publishable key; null = unknown / revoked link */
export async function fetchJob(token: string): Promise<JobViewJson | null> {
  const { data, error } = await getSupabaseBrowser().rpc('get_job_view', { p_token: token });
  if (error) throw new Error(error.message);
  return (data as unknown as JobViewJson | null) ?? null;
}

export type JobRpc = 'job_start' | 'job_checkin' | 'job_commission' | 'job_finish' | 'job_return_dismiss' | 'job_record_photo';

/** call a job_* function; resolves to the PostgREST message (the error code) or null on success */
export async function callJob(fn: JobRpc, args: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await getSupabaseBrowser().rpc(fn as never, args as never);
  return { error: error ? error.message : null };
}

/** the live job with a refresh() that re-reads the view after every action */
export function useJob(token: string, initial: JobViewJson) {
  const [job, setJob] = useState<JobModel>(() => mapJobView(initial));
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const j = await fetchJob(token);
      if (j) {
        setJob(mapJobView(j));
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  return { job, refresh, refreshing, failed };
}

export function useNow(initial: number, everyMs = 1000): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** the public catalog (places + rule set), cached for the page */
export function useCatalog() {
  return useQuery({
    queryKey: ['public-catalog'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ json: PublicCatalogJson; catalog: Catalog }> => {
      const { data, error } = await getSupabaseBrowser().rpc('get_public_catalog');
      if (error) throw new Error(error.message);
      const json = data as unknown as PublicCatalogJson;
      return { json, catalog: catalogFromJson(json) };
    },
  });
}

export class PhotoError extends Error {
  constructor(readonly kind: 'not_image' | 'upload' | 'compress') {
    super(kind);
  }
}

/** compress to <= 1600 px JPEG, upload with the anon storage client, then record it in the database */
export async function uploadJobPhoto(token: string, bookingId: string, kind: PhotoKind, file: File): Promise<{ error: string | null }> {
  if (!file.type.startsWith('image/')) throw new PhotoError('not_image');
  let blob: Blob;
  try {
    blob = await imageCompression(file, {
      maxWidthOrHeight: 1600,
      maxSizeMB: 1.5,
      fileType: 'image/jpeg',
      initialQuality: 0.8,
      useWebWorker: false, // the worker script would be fetched from a CDN
    });
  } catch {
    throw new PhotoError('compress');
  }
  const path = jobPhotoPath(bookingId, kind, crypto.randomUUID());
  const up = await getSupabaseBrowser().storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw new PhotoError('upload');
  return callJob('job_record_photo', { p_token: token, p_kind: kind, p_path: path });
}

/** signed URL for a driver-visible photo (storage policy allows it for that booking path) */
export function usePhotoUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!path) {
      setUrl(null);
      return;
    }
    getSupabaseBrowser()
      .storage.from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (live) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      live = false;
    };
  }, [path]);
  return url;
}
