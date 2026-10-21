'use client';

import { Loader2, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Sheet } from '@/features/admin-ops/sheet';
import { TEAM_COPY as C } from '@/lib/copy/team';
import { postTeam } from './api-client';
import { ConfirmSheet } from './confirm';
import { groupPermissions, newRoleKey, roleLock, type PermissionDef, type RoleLock, type RoleRow, type Viewer } from './model';

interface Form {
  key: string;
  isNew: boolean;
  nameTh: string;
  description: string;
  permissions: Set<string>;
}

const LOCK_HINT: Record<Exclude<RoleLock, null>, string> = {
  locked: C.roleLocked,
  owner_only: C.roleOwnerOnly,
  own: C.roleOwnHint,
  higher: C.higherHint,
};

export function RolesManager({
  roles,
  permissions,
  viewer,
  viewerRoleKey,
}: {
  roles: RoleRow[];
  permissions: PermissionDef[];
  viewer: Viewer;
  viewerRoleKey: string;
}) {
  const router = useRouter();
  const groups = useMemo(() => groupPermissions(permissions), [permissions]);
  const permName = useMemo(() => new Map(permissions.map((p) => [p.key, p.nameTh])), [permissions]);
  const mine = useMemo(() => new Set(viewer.permissions), [viewer.permissions]);
  const [form, setForm] = useState<Form | null>(null);
  const [archiveFor, setArchiveFor] = useState<RoleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const open = (r: RoleRow | null) => {
    setFormError(null);
    setForm(
      r
        ? { key: r.key, isNew: false, nameTh: r.nameTh, description: r.description, permissions: new Set(r.permissions) }
        : { key: newRoleKey(), isNew: true, nameTh: '', description: '', permissions: new Set() },
    );
  };

  function toggle(key: string, on: boolean) {
    setForm((f) => {
      if (!f) return f;
      const next = new Set(f.permissions);
      if (on) next.add(key);
      else next.delete(key);
      return { ...f, permissions: next };
    });
  }

  async function save(f: Form) {
    if (!f.nameTh.trim()) {
      setFormError(C.roleNameRequired);
      return;
    }
    setFormError(null);
    setBusy(true);
    const res = await postTeam<{ result: 'created' | 'updated' }>('/api/admin/team/roles', {
      key: f.key,
      nameTh: f.nameTh,
      description: f.description,
      permissions: [...f.permissions],
    });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    toast.success(res.data.result === 'created' ? C.roleSavedNew : C.roleSavedEdit);
    setForm(null);
    router.refresh();
  }

  async function archive() {
    if (!archiveFor) return;
    setBusy(true);
    const res = await postTeam('/api/admin/team/roles/archive', { key: archiveFor.key });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      setArchiveFor(null);
      return;
    }
    toast.success(C.roleArchived);
    setArchiveFor(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" className="btn-primary min-h-11" onClick={() => open(null)}>
          <Plus className="size-4" aria-hidden />
          {C.roleAdd}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2" data-testid="roles-list">
        {roles.map((r) => {
          const lock = roleLock(viewer, r, viewerRoleKey);
          return (
            <article key={r.key} className="card-surface flex flex-col gap-3 p-4" data-role={r.key} aria-label={r.nameTh}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">{r.nameTh}</h3>
                  {r.description && <p className="text-sm text-muted-token">{r.description}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.isSystem && <Badge tone="info">{C.roleSystem}</Badge>}
                  <Badge tone="pending">{C.roleMembers(r.members)}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.key === 'owner' ? (
                  <span className="text-sm text-ink-2">{C.ownerAllPerms}</span>
                ) : r.permissions.length === 0 ? (
                  <span className="text-sm text-muted-token">{C.roleNoPerms}</span>
                ) : (
                  r.permissions.map((p) => (
                    <span key={p} className="chip bg-surface-2 text-ink-2 ring-1 ring-inset ring-line">
                      {permName.get(p) ?? p}
                    </span>
                  ))
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {lock ? (
                  <span className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-token">
                    <Lock className="size-3.5" aria-hidden />
                    {LOCK_HINT[lock]}
                  </span>
                ) : (
                  <>
                    <button type="button" className="btn-secondary btn-sm min-h-11" onClick={() => open(r)} aria-label={`${C.roleEdit} ${r.nameTh}`}>
                      <Pencil className="size-4" aria-hidden />
                      {C.roleEdit}
                    </button>
                    {!r.isSystem && (
                      <button type="button" className="btn-ghost min-h-11" onClick={() => setArchiveFor(r)} aria-label={`${C.roleArchive} ${r.nameTh}`}>
                        <Trash2 className="size-4" aria-hidden />
                        {C.roleArchive}
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <Sheet open={form !== null} onOpenChange={(o) => !o && !busy && setForm(null)} title={form?.isNew ? C.roleFormAdd : C.roleFormEdit(form?.nameTh ?? '')}>
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save(form);
            }}
          >
            <label className="block">
              <span className="label-base">{C.roleName}</span>
              <input className="input-base" maxLength={60} value={form.nameTh} onChange={(e) => setForm({ ...form, nameTh: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-base">{C.roleDesc}</span>
              <input className="input-base" maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <fieldset>
              <legend className="label-base">{C.rolePerms}</legend>
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.group} className="rounded-md border border-line-soft p-3">
                    <div className="mb-1 text-sm font-semibold text-ink">{g.group}</div>
                    {g.items.map((p) => {
                      const allowed = viewer.isOwner || mine.has(p.key);
                      return (
                        <label key={p.key} className={`flex min-h-11 items-center gap-3 ${allowed ? 'cursor-pointer' : 'opacity-60'}`} title={allowed ? undefined : C.permNotYours}>
                          <input
                            type="checkbox"
                            className="size-5 shrink-0 accent-[var(--brand)]"
                            checked={form.permissions.has(p.key)}
                            disabled={!allowed}
                            onChange={(e) => toggle(p.key, e.target.checked)}
                          />
                          <span className="min-w-0 text-sm text-ink-2">{p.nameTh}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </fieldset>
            {formError && (
              <p role="alert" className="text-sm text-urgent">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary min-h-11" onClick={() => setForm(null)} disabled={busy}>
                {C.cancel}
              </button>
              <button type="submit" className="btn-primary min-h-11" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {C.save}
              </button>
            </div>
          </form>
        )}
      </Sheet>

      <ConfirmSheet
        open={archiveFor !== null}
        title={archiveFor ? C.roleArchiveTitle(archiveFor.nameTh) : C.roleArchive}
        body={C.roleArchiveBody}
        confirmLabel={C.roleArchive}
        danger
        busy={busy}
        onConfirm={archive}
        onCancel={() => setArchiveFor(null)}
      />
    </>
  );
}
