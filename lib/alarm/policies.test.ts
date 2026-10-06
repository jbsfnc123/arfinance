import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
it("isolates receiver topics, rejects inactive users and disallows browser publishing", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth; create schema realtime; create schema private;
      create function auth.uid() returns uuid language sql as $$select current_setting('test.uid')::uuid$$;
      create function realtime.topic() returns text language sql as $$select current_setting('test.topic')$$;
      create function private.my_kind() returns text language sql as $$select nullif(current_setting('test.kind'), '')$$;
      create table realtime.messages (extension text, payload text);
      alter table realtime.messages enable row level security;
      grant usage on schema auth,realtime,private to authenticated;
      grant select,insert on realtime.messages to authenticated;
      insert into realtime.messages values ('broadcast','test');
      -- Broader unrelated feature policies must not bypass alarm isolation.
      create policy other_read on realtime.messages for select to authenticated using (true);
      create policy other_write on realtime.messages for insert to authenticated with check (true);
    `);
    await db.exec(readFileSync(new URL("../../supabase/migrations/20261006191613_ephemeral_alarm_access.sql", import.meta.url), "utf8"));
    const uid = "11111111-1111-4111-8111-111111111111";
    await db.exec(`set role authenticated; set test.uid='${uid}'; set test.kind='user'; set test.topic='alarm:${uid}';`);
    expect((await db.query("select * from realtime.messages")).rows).toHaveLength(1);
    await expect(db.exec("insert into realtime.messages values ('broadcast','forged')")).rejects.toThrow(/row-level security/);
    await db.exec("set test.topic='alarm:22222222-2222-4222-8222-222222222222'");
    expect((await db.query("select * from realtime.messages")).rows).toHaveLength(0);
    await db.exec(`set test.topic='alarm:${uid}'; set test.kind='';`);
    expect((await db.query("select * from realtime.messages")).rows).toHaveLength(0);
    await db.exec("set test.topic='other-feature';");
    expect((await db.query("select * from realtime.messages")).rows).toHaveLength(1);
  } finally { await db.close(); }
}, 30000);
