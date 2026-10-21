import { EmptyState } from '@/components/ui/states';
import { RefreshRetry } from '@/features/admin-ops/retry';
import type { StaffSession } from '@/lib/auth/staff';
import { TEAM_COPY as C } from '@/lib/copy/team';
import { loadTeam, type TeamData } from './data';
import { InviteButton, InvitesList } from './invite';
import { permsWithin, type Viewer } from './model';
import { RolesManager } from './roles-manager';
import { StaffList, TransferOwnership } from './staff-manager';

export type TeamTab = 'staff' | 'roles';

/** server view: load once, then the error / empty / success states */
export async function TeamView({ tab, staff }: { tab: TeamTab; staff: StaffSession }) {
  let data: TeamData | null = null;
  try {
    data = await loadTeam();
  } catch (e) {
    console.error('[team] load failed', e instanceof Error ? e.message : e);
  }
  if (!data) return <RefreshRetry message={C.loadError} />;

  const viewer: Viewer = { id: staff.id, isOwner: staff.isOwner, permissions: [...staff.permissions] };
  const rolePerms = Object.fromEntries(data.roles.map((r) => [r.key, r.permissions]));
  // roles this viewer may hand out (the database re-checks): never owner, never above them
  const assignable = data.roles
    .filter((r) => r.key !== 'owner' && permsWithin(viewer.permissions, r.permissions, viewer.isOwner))
    .map((r) => ({ key: r.key, nameTh: r.nameTh }));

  if (tab === 'roles') {
    return data.roles.length === 0 ? (
      <EmptyState message={C.rolesEmpty} />
    ) : (
      <RolesManager roles={data.roles} permissions={data.permissions} viewer={viewer} viewerRoleKey={staff.roleKey} />
    );
  }

  const candidates = data.staff.filter((s) => s.isActive && s.id !== staff.id);
  return (
    <>
      <div className="mb-4 flex justify-end">
        <InviteButton roles={assignable} />
      </div>
      {data.staff.length === 0 ? (
        <EmptyState message={C.staffEmpty} />
      ) : (
        <StaffList staff={data.staff} viewer={viewer} ownerId={data.ownerId} rolePerms={rolePerms} assignable={assignable} />
      )}
      <InvitesList invites={data.invites} assignableKeys={assignable.map((r) => r.key)} />
      {staff.isOwner && <TransferOwnership candidates={candidates} />}
    </>
  );
}
