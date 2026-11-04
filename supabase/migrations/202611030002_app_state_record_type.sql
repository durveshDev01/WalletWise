alter table public.user_data drop constraint if exists user_data_record_type_check;
alter table public.user_data add constraint user_data_record_type_check
  check (record_type in ('app_state','holding','profile','goal','spend','preference','aura_history'));
