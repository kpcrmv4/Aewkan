'use client';

import { Copy, Loader2, MailPlus, RotateCw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ListRow } from '@/components/ui/list-row';
import { Sheet } from '@/features/admin-ops/sheet';
import { TEAM_COPY as C } from '@/lib/copy/team';
import { formatDeadline } from '@/lib/format';
import { copyText, postTeam } from './api-client';
import { ConfirmSheet } from './confirm';
import { inviteMessage, type InviteRow } from './model';

export interface InviteResult {
  path: string;
  expiresAt: string;
  company: string;
  roleName: string;
}

interface RoleOption {
  key: string;
  nameTh: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function createInvite(email: string, roleKey: string) {
  return postTeam<InviteResult & { inviteId: string }>('/api/admin/team/invite', { email, roleKey });
}

function CopyField({ label, value, multiline, testId }: { label: string; value: string; multiline?: boolean; testId: string }) {
  async function copy() {
    if (await copyText(value)) toast.success(C.copied);
    else toast.error(C.copyFailed);
  }
  return (
    <div>
      <span className="label-base">{label}</span>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea readOnly className="input-base min-h-28 flex-1 text-sm" value={value} data-testid={testId} onFocus={(e) => e.currentTarget.select()} />
        ) : (
          <input readOnly className="input-base min-w-0 flex-1 font-mono text-sm" value={value} data-testid={testId} onFocus={(e) => e.currentTarget.select()} />
        )}
        <button type="button" className="btn-secondary min-h-11 shrink-0" onClick={copy} aria-label={`${C.copy} ${label}`}>
          <Copy className="size-4" aria-hidden />
          {C.copy}
        </button>
      </div>
    </div>
  );
}

/** the one moment the raw link exists outside the URL bar — shown once, never stored */
export function InviteResultSheet({ result, onClose }: { result: InviteResult | null; onClose: () => void }) {
  const url = result && typeof window !== 'undefined' ? `${window.location.origin}${result.path}` : (result?.path ?? '');
  const message = result ? inviteMessage({ company: result.company, roleName: result.roleName, url, expiresAt: result.expiresAt }) : '';
  return (
    <Sheet open={result !== null} onOpenChange={(o) => !o && onClose()} title={C.inviteDone} description={C.inviteOnce}>
      {result && (
        <div className="space-y-3">
          <CopyField label={C.inviteLink} value={url} testId="invite-link" />
          <CopyField label={C.inviteMessage} value={message} multiline testId="invite-message" />
          <p className="text-sm text-muted-token">{C.expires(formatDeadline(result.expiresAt, 'th'))}</p>
          <div className="flex justify-end">
            <button type="button" className="btn-primary min-h-11" onClick={onClose}>
              {C.close}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** page action: email + role → a link to copy */
export function InviteButton({ roles }: { roles: RoleOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState(roles[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function submit() {
    if (!EMAIL_RE.test(email.trim())) {
      setFormError(C.emailInvalid);
      return;
    }
    setFormError(null);
    setBusy(true);
    const res = await createInvite(email.trim(), roleKey);
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    setOpen(false);
    setEmail('');
    setResult(res.data);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="btn-primary min-h-11"
        disabled={roles.length === 0}
        onClick={() => {
          setFormError(null);
          setRoleKey((k) => (roles.some((r) => r.key === k) ? k : (roles[0]?.key ?? '')));
          setOpen(true);
        }}
      >
        <MailPlus className="size-4" aria-hidden />
        {C.invite}
      </button>
      <Sheet open={open} onOpenChange={(o) => !o && !busy && setOpen(false)} title={C.inviteTitle} description={C.inviteHint}>
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="block">
            <span className="label-base">{C.email}</span>
            <input className="input-base" type="email" autoComplete="off" inputMode="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="label-base">{C.roleLabel}</span>
            <select className="input-base" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              {roles.map((r) => (
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
            <button type="button" className="btn-secondary min-h-11" onClick={() => setOpen(false)} disabled={busy}>
              {C.cancel}
            </button>
            <button type="submit" className="btn-primary min-h-11" disabled={busy || !roleKey}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {C.inviteCreate}
            </button>
          </div>
        </form>
      </Sheet>
      <InviteResultSheet result={result} onClose={() => setResult(null)} />
    </>
  );
}

/** pending invites: a new link (old one dies) or revoke */
export function InvitesList({ invites, assignableKeys }: { invites: InviteRow[]; assignableKeys: string[] }) {
  const canIssue = (roleKey: string) => assignableKeys.includes(roleKey);
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [revokeFor, setRevokeFor] = useState<InviteRow | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function reissue(i: InviteRow) {
    setWorking(i.id);
    const res = await createInvite(i.email, i.roleKey);
    setWorking(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setResult(res.data);
    router.refresh();
  }

  async function revoke() {
    if (!revokeFor) return;
    setWorking(revokeFor.id);
    const res = await postTeam('/api/admin/team/invite/revoke', { inviteId: revokeFor.id });
    setWorking(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(C.revoked);
    setRevokeFor(null);
    router.refresh();
  }

  return (
    <section className="mt-8" aria-labelledby="invites-head">
      <h2 id="invites-head" className="sec-head">
        {C.invitesHead}
        <span className="count">{invites.length}</span>
      </h2>
      {invites.length === 0 ? (
        <p className="panel px-4 py-6 text-center text-sm text-muted-token">{C.invitesEmpty}</p>
      ) : (
        <div className="panel" data-testid="invites-list">
          {invites.map((i) => (
            <ListRow
              key={i.id}
              title={i.email}
              meta={`${i.roleName} · ${C.expires(formatDeadline(i.expiresAt, 'th'))}`}
              aside={
                <>
                  <Badge tone={i.expired ? 'urgent' : 'progress'}>{i.expired ? C.expired : C.pending}</Badge>
                  {canIssue(i.roleKey) && (
                    <button type="button" className="btn-secondary btn-sm min-h-11" disabled={working === i.id} onClick={() => reissue(i)} aria-label={`${C.reissue} ${i.email}`}>
                      {working === i.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
                      {C.reissue}
                    </button>
                  )}
                  <button type="button" className="btn-ghost min-h-11" disabled={working === i.id} onClick={() => setRevokeFor(i)} aria-label={`${C.revoke} ${i.email}`}>
                    <X className="size-4" aria-hidden />
                    {C.revoke}
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}
      <ConfirmSheet
        open={revokeFor !== null}
        title={revokeFor ? C.revokeTitle(revokeFor.email) : C.revoke}
        body={C.revokeBody}
        confirmLabel={C.revoke}
        danger
        busy={working !== null}
        onConfirm={revoke}
        onCancel={() => setRevokeFor(null)}
      />
      <InviteResultSheet result={result} onClose={() => setResult(null)} />
    </section>
  );
}

