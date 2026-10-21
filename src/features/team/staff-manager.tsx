'use client';

import { Crown, Loader2, Lock, UserCog } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ListRow } from '@/components/ui/list-row';
import { Sheet } from '@/features/admin-ops/sheet';
import { TEAM_COPY as C } from '@/lib/copy/team';
import { postTeam } from './api-client';
import { ConfirmSheet } from './confirm';
import { staffLock, type RowLock, type StaffRow, type Viewer } from './model';

interface RoleOption {
  key: string;
  nameTh: string;
}

const LOCK_HINT: Record<Exclude<RowLock, null>, string> = { self: C.selfHint, owner: C.ownerHint, higher: C.higherHint };

export function StaffList({
  staff,
  viewer,
  ownerId,
  rolePerms,
  assignable,
}: {
  staff: StaffRow[];
  viewer: Viewer;
  ownerId: string | null;
  rolePerms: Record<string, string[]>;
  assignable: RoleOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [roleKey, setRoleKey] = useState('');
  const [toggleFor, setToggleFor] = useState<StaffRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function saveRole() {
    if (!editing) return;
    setBusy(true);
    setFormError(null);
    const res = await postTeam('/api/admin/team/staff', { staffId: editing.id, roleKey });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    toast.success(C.roleSaved);
    setEditing(null);
    router.refresh();
  }

  async function setActive(row: StaffRow, isActive: boolean) {
    setBusy(true);
    const res = await postTeam('/api/admin/team/staff', { staffId: row.id, isActive });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(isActive ? C.activated : C.deactivated);
    setToggleFor(null);
    router.refresh();
  }

  return (
    <section aria-labelledby="staff-head">
      <h2 id="staff-head" className="sec-head">
        {C.staffHead}
        <span className="count">{staff.length}</span>
      </h2>
      <div className="panel" data-testid="staff-list">
        {staff.map((s) => {
          const lock = staffLock(viewer, s, ownerId, rolePerms);
          const isOwnerRow = s.id === ownerId;
          return (
            <ListRow
              key={s.id}
              title={
                <>
                  {s.fullName || s.email}
                  {s.id === viewer.id && <span className="ml-1.5 font-normal text-muted-token">({C.you})</span>}
                </>
              }
              meta={`${s.email} · ${s.roleName}`}
              aside={
                <>
                  {isOwnerRow && (
                    <Badge tone="brand">
                      <Crown className="size-3.5" aria-hidden />
                      {C.owner}
                    </Badge>
                  )}
                  <Badge tone={s.isActive ? 'done' : 'pending'}>{s.isActive ? C.active : C.inactive}</Badge>
                  {lock ? (
                    <span className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-token">
                      <Lock className="size-3.5" aria-hidden />
                      {LOCK_HINT[lock]}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-secondary btn-sm min-h-11"
                        onClick={() => {
                          setFormError(null);
                          setRoleKey(s.roleKey);
                          setEditing(s);
                        }}
                        aria-label={C.changeRoleFor(s.fullName || s.email)}
                      >
                        <UserCog className="size-4" aria-hidden />
                        {C.changeRole}
                      </button>
                      {s.isActive ? (
                        <button type="button" className="btn-ghost min-h-11" onClick={() => setToggleFor(s)} aria-label={`${C.deactivate} ${s.fullName || s.email}`}>
                          {C.deactivate}
                        </button>
                      ) : (
                        <button type="button" className="btn-ghost min-h-11" disabled={busy} onClick={() => setActive(s, true)} aria-label={`${C.activate} ${s.fullName || s.email}`}>
                          {C.activate}
                        </button>
                      )}
                    </>
                  )}
                </>
              }
            />
          );
        })}
      </div>

      <Sheet open={editing !== null} onOpenChange={(o) => !o && !busy && setEditing(null)} title={editing ? C.changeRoleFor(editing.fullName || editing.email) : C.changeRole}>
        {editing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveRole();
            }}
          >
            <label className="block">
              <span className="label-base">{C.roleLabel}</span>
              <select className="input-base" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
                {!assignable.some((r) => r.key === editing.roleKey) && <option value={editing.roleKey}>{editing.roleName}</option>}
                {assignable.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.nameTh}
                  </option>
                ))}
              </select>
            </label>
            {formError && (
              <p role="alert" className="text-sm text-urgent">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary min-h-11" onClick={() => setEditing(null)} disabled={busy}>
                {C.cancel}
              </button>
              <button type="submit" className="btn-primary min-h-11" disabled={busy || roleKey === editing.roleKey}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {C.save}
              </button>
            </div>
          </form>
        )}
      </Sheet>

      <ConfirmSheet
        open={toggleFor !== null}
        title={toggleFor ? C.deactivateTitle(toggleFor.fullName || toggleFor.email) : C.deactivate}
        body={C.deactivateBody}
        confirmLabel={C.deactivate}
        danger
        busy={busy}
        onConfirm={() => toggleFor && setActive(toggleFor, false)}
        onCancel={() => setToggleFor(null)}
      />
    </section>
  );
}

/** owner only: pick an active staff member, type "โอน", confirm */
export function TransferOwnership({ candidates }: { candidates: StaffRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState(candidates[0]?.id ?? '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const chosen = candidates.find((c) => c.id === target) ?? null;

  async function transfer() {
    if (!chosen) return;
    setBusy(true);
    const res = await postTeam('/api/admin/team/transfer', { newOwnerId: chosen.id });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(C.transferDone);
    setConfirming(false);
    // the old owner just lost team.manage — the server sends them on
    router.refresh();
  }

  return (
    <section className="mt-8" aria-labelledby="transfer-head" data-testid="transfer-panel">
      <h2 id="transfer-head" className="sec-head">
        {C.transferHead}
      </h2>
      <p className="sec-sub">{C.transferHint}</p>
      {candidates.length === 0 ? (
        <p className="panel px-4 py-6 text-center text-sm text-muted-token">{C.transferNone}</p>
      ) : (
        <div className="card-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1">
            <span className="label-base">{C.transferPick}</span>
            <select className="input-base" value={target} onChange={(e) => setTarget(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.fullName || c.email) + ' · ' + c.roleName}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-danger min-h-11" disabled={!chosen} onClick={() => setConfirming(true)}>
            <Crown className="size-4" aria-hidden />
            {C.transferBtn}
          </button>
        </div>
      )}
      <ConfirmSheet
        open={confirming}
        title={chosen ? C.transferTitle(chosen.fullName || chosen.email) : C.transferHead}
        body={C.transferBody}
        confirmLabel={C.transferBtn}
        danger
        busy={busy}
        typeWord={C.transferWord}
        typeLabel={C.transferTypeLabel}
        onConfirm={transfer}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
