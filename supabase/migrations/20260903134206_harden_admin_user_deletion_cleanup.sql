CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
declare
  v_email text;
  v_auth_exists boolean := false;
  v_profile_exists boolean := false;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot_delete_self';
  end if;

  select exists(select 1 from public.profiles where id = p_user_id)
    into v_profile_exists;

  select lower(email)
    into v_email
  from auth.users
  where id = p_user_id
    and deleted_at is null;

  if v_email is not null then
    v_auth_exists := true;
  elsif v_profile_exists then
    select lower(email) into v_email from public.profiles where id = p_user_id;
  else
    raise exception 'user_not_found';
  end if;

  if v_email is not null and public.is_protected_admin_email(v_email) then
    raise exception 'protected_account_cannot_be_deleted';
  end if;

  update public.orders
     set user_id = null
   where user_id = p_user_id;

  update public.audit_logs
     set actor_id = null
   where actor_id = p_user_id;

  update public.system_audit_logs
     set actor_user_id = null
   where actor_user_id = p_user_id;

  update public.wallet_topup_requests
     set reviewed_by = null
   where reviewed_by = p_user_id;

  update public.order_cancellation_requests
     set reviewed_by = null
   where reviewed_by = p_user_id;

  delete from public.order_cancellation_requests where user_id = p_user_id;
  delete from public.loyalty_redemptions where user_id = p_user_id;
  delete from public.student_data_consents where user_id = p_user_id;

  if v_profile_exists then
    delete from public.profiles where id = p_user_id;
  end if;

  if v_auth_exists then
    delete from auth.users where id = p_user_id;
    if not found then
      raise exception 'user_not_found';
    end if;
  end if;

  if exists(select 1 from public.profiles where id = p_user_id)
     or exists(select 1 from auth.users where id = p_user_id) then
    raise exception 'user_delete_incomplete';
  end if;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO service_role;
