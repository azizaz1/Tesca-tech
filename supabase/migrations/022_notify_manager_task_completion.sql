create or replace function public.notify_task_creator_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status and new.status = 'completed' then
    insert into public.technician_task_notifications (task_id, recipient_id, title, message)
    values (new.id, new.created_by, 'Tâche terminée', 'Le technicien a terminé la tâche : ' || new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_task_creator_on_completion on public.technician_tasks;
create trigger notify_task_creator_on_completion
  after update of status on public.technician_tasks
  for each row execute function public.notify_task_creator_on_completion();
