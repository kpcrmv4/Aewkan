'use client';

import { MapPin, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/states';
import { PLACES_COPY as C } from '@/lib/copy/settings';
import { PlaceForm, type PlaceRow } from './place-form';

type CategoryKey = keyof typeof C.categories;
const catLabel = (c: string) => C.categories[c as CategoryKey] ?? c;

/** list of places + the add / edit sheet; the filter toolbar arrives as `toolbar` (server-rendered links) */
export function PlacesManager({ rows, total, filtered, toolbar }: { rows: PlaceRow[]; total: number; filtered: boolean; toolbar: ReactNode }) {
  // null = closed · 'new' = add · row = edit
  const [target, setTarget] = useState<PlaceRow | 'new' | null>(null);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-token" data-testid="places-count">
          {C.count(total)}
        </p>
        <button type="button" className="btn-primary min-h-11" onClick={() => setTarget('new')} data-testid="place-add">
          <Plus className="size-4" />
          {C.add}
        </button>
      </div>
      {toolbar}

      {rows.length === 0 ? (
        <EmptyState
          icon={MapPin}
          message={filtered ? C.empty : C.emptyAll}
          action={
            filtered ? (
              <Link href="/admin/places" className="btn-secondary mx-auto">
                {C.clearFilters}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="panel" data-testid="places-list">
          {rows.map((p) => (
            <ListRow
              key={p.id}
              title={p.nameTh}
              meta={`${p.nameEn} · ${catLabel(p.category)} · ${C.dwell(p.defaultDwellMin)}`}
              aside={
                <>
                  {p.isHidden && <Badge tone="pending">{C.badges.hidden}</Badge>}
                  {p.isPickup && <Badge tone="info">{C.badges.pickup}</Badge>}
                  {p.isMountain && <Badge tone="progress">{C.badges.mountain}</Badge>}
                  <button type="button" className="btn-secondary btn-sm min-h-11" onClick={() => setTarget(p)} aria-label={`${C.edit} ${p.nameTh}`}>
                    <Pencil className="size-4" />
                    {C.edit}
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      <PlaceForm place={target === 'new' ? null : target} open={target !== null} onClose={() => setTarget(null)} />
    </>
  );
}
