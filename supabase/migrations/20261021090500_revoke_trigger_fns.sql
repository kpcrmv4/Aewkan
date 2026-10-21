-- Aewkan · P0 · advisor fix: trigger functions are not RPCs.
-- Triggers fire without the caller holding EXECUTE, so nobody needs it over /rest/v1/rpc.
revoke all on function public.bookings_before_insert(), public.bookings_log_status(),
  public.set_updated_at(), public.guard_app_settings(), public.guard_staff_owner(),
  public.guard_system_roles() from public, anon, authenticated;
