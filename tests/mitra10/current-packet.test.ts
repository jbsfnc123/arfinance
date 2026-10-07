import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
it('production packet migration excludes inactive rows, keeps anchors and permissions, and restores reappearing IDs',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create schema private;
      create table m10_worksheet(id bigint,payment_group text,business_partner text,invoice_no text,invoice_date date,due_date date,open_amt numeric,branch text,no_po text,no_sj text);
      create table m10_aging(no_sj text,invoice_no text);
      create table data_versions(key text,updated_at timestamptz);
      create function private.has_menu(text) returns boolean language sql as $$select coalesce(current_setting('test.allowed',true),'yes')='yes'$$;
      create function private.pack(p_sql text,p_cols text[]) returns jsonb language plpgsql as $$declare r jsonb; begin
        if position('m10_worksheet' in p_sql)=0 then return '{"preserved":true}'::jsonb; end if;
        execute 'select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from ('||p_sql||') t' into r; return r;
      end$$;
      insert into m10_worksheet(id,no_sj,invoice_no) values(1,'SJ/1','A'),(2,'SJ/2','B');
      insert into m10_aging values(' sj/1 ','A');`);
    const source=readFileSync('supabase/migrations/0019_invoice_remarks.sql','utf8');
    const start=source.indexOf('create or replace function public.pack_m10()');
    await db.exec(source.slice(start,source.indexOf('$$;',start)+3));
    await db.exec(readFileSync('supabase/migrations/20261007145618_m10_current_aging_projection.sql','utf8'));
    const pack=async()=> (await db.query<{p:{worksheet:{id:number}[];gr:unknown}}>('select pack_m10() p')).rows[0].p;
    expect((await pack()).worksheet.map(w=>w.id)).toEqual([1]);
    expect((await pack()).gr).toEqual({preserved:true});
    await db.exec('delete from m10_aging');expect((await pack()).worksheet).toEqual([]);
    expect((await db.query('select count(*)::int n from m10_worksheet')).rows).toEqual([{n:2}]);
    await db.exec("insert into m10_aging values('SJ/2','B')");expect((await pack()).worksheet.map(w=>w.id)).toEqual([2]);
    await db.exec("set test.allowed='no'");await expect(pack()).rejects.toThrow(/Akses ditolak/);
  } finally {await db.close();}
},30000);
