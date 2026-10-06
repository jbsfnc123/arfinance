-- Alarm payloads are HTTP Broadcast only: no message/schedule tables or SQL send.
-- Sender grants use the existing app_settings key alarm_senders_v1 (SA-only writes).
-- Receiver can subscribe only to their own private topic while active.
create policy alarm_receive_own on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'alarm:' || (select auth.uid())::text
  and (select private.my_kind()) is not null
);

-- Restrictive guards keep alarm channels private even if other features later
-- add broader policies. Client publishing cannot impersonate the server sender.
create policy alarm_topic_isolation on realtime.messages as restrictive
for select to authenticated
using (
  realtime.topic() not like 'alarm:%'
  or (realtime.topic() = 'alarm:' || (select auth.uid())::text
      and (select private.my_kind()) is not null)
);
create policy alarm_server_publish_only on realtime.messages as restrictive
for insert to authenticated
with check (realtime.topic() not like 'alarm:%');
