-- Customer e-mail through Resend (orchestrator, after P4).
-- `email` becomes an integration like the others: config (from address, name,
-- reply-to) in integrations.config, the Resend API key in Vault through the
-- existing set_integration_secret (single secret = plain string, R-001).
-- The key list check is replaced (the only way to widen a CHECK); data is untouched.
alter table public.integrations drop constraint integrations_key_check;
alter table public.integrations add constraint integrations_key_check
  check (key in ('line', 'stripe', 'beam', 'slip', 'routing', 'promptpay', 'email'));

insert into public.integrations (key) values ('email') on conflict (key) do nothing;
