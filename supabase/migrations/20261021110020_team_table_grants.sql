-- Aewkan · P5 · the team tables become read-only for signed-in users: every write
-- goes through create_staff_invite / revoke_staff_invite / accept_staff_invite /
-- update_staff / upsert_role / archive_role / transfer_ownership, which check the
-- caller themselves. The P0 write policies stay as a second fence.
revoke all on public.roles, public.role_permissions, public.staff_invites, public.staff from authenticated;
grant select on public.roles, public.role_permissions, public.staff_invites, public.staff to authenticated;
