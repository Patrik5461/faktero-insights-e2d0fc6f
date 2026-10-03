/*
  Doplnenie `timeout_milliseconds` dvom posledným cronom, ktorým chýbal.

  pg_net má predvolený strop 5 sekúnd. Keď hook beží dlhšie, pg_net spojenie
  preruší, ale `cron.job_run_details` zapíše úspech — úloha sa teda tvári, že
  prebehla, hoci poslala len časť upomienok. Ostatné hooky strop už majú;
  `faktero-prune-logs` a `faktero-reservations-expire-hourly` ho nepotrebujú,
  sú to čisté SQL úlohy bez volania von.

  Hodnota 300000 (5 minút) je tá istá ako pri ostatných hookoch.

  Príkaz sa prepisuje cez `replace`, aby v migrácii nemusel byť znovu
  vypísaný cron token, ktorý je v ňom uložený.
*/
do $$
declare j record;
begin
  for j in
    select jobid, jobname, command
    from cron.job
    where jobname in ('faktero-reminders-daily', 'faktero-trial-lifecycle')
      and command not ilike '%timeout_milliseconds%'
  loop
    perform cron.alter_job(
      job_id := j.jobid,
      command := replace(
        j.command,
        'body := ''{}''::jsonb',
        'body := ''{}''::jsonb,
    timeout_milliseconds := 300000'
      )
    );
    raise notice 'timeout doplnený: %', j.jobname;
  end loop;
end $$;
