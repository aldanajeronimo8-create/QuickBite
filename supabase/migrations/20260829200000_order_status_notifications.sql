create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  status_title text;
  status_body text;
begin
  if new.status is distinct from old.status then
    status_title := case new.status
      when 'confirmed' then 'Pedido confirmado'
      when 'preparing' then 'Tu pedido está en preparación'
      when 'ready' then 'Tu pedido está listo'
      when 'delivered' then 'Pedido entregado'
      when 'cancelled' then 'Pedido cancelado'
      else 'Actualización de tu pedido'
    end;

    status_body := case new.status
      when 'confirmed' then 'Tu pedido fue confirmado por la cafetería.'
      when 'preparing' then 'La cafetería ya está preparando tu pedido.'
      when 'ready' then 'Tu pedido está listo para recoger.'
      when 'delivered' then 'Tu pedido fue marcado como entregado.'
      when 'cancelled' then 'Tu pedido fue cancelado. Revisa el detalle del pedido para más información.'
      else format('El estado de tu pedido cambió a %s.', new.status)
    end;

    insert into public.notifications (id, user_id, order_id, type, title, body, created_at)
    values (
      gen_random_uuid(),
      new.user_id,
      new.id,
      'order_status',
      status_title,
      status_body,
      now()
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_order_status_change() from public;

drop trigger if exists trg_order_status_notification on public.orders;

create trigger trg_order_status_notification
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.notify_order_status_change();
