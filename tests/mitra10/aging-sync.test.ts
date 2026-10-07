import { PGlite } from '@electric-sql/pglite';
import { computeM10 } from '../../lib/modules/m10/compute';
import type { Worksheet, AgingLine, Kwitansi } from '../../lib/local/datasets';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db: PGlite;
const query = async (sql: string) => (await db.query(sql)).rows;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema private; create role anon; create role authenticated;
    create table m10_worksheet(id bigint generated always as identity primary key,
      payment_group text,business_partner text,invoice_no text,invoice_date date,due_date date,
      open_amt numeric(18,2) not null default 0,branch text,no_po text,no_sj text not null,
      created_at timestamptz default now());
    create unique index m10_worksheet_sj_key on m10_worksheet(upper(no_sj));
    create table aging_source(id bigint, payment_group text,business_partner text,invoice_no text,
      invoice_date date,due_date date,open_amt numeric(18,2),branch text,no_po text,no_sj text,tax_name text);
    create view m10_aging as select * from aging_source where tax_name='M10';
    create table versions(n int); insert into versions values(0);
    create function private.bump() returns trigger language plpgsql as $$begin update public.versions set n=n+1; return null; end$$;
    create trigger bump after insert or update on m10_worksheet for each statement execute function private.bump();
    insert into m10_worksheet(invoice_no,no_sj,open_amt) values('OLD','SJ/150918/XXVI/TRA',2451712),('PAID','HISTORY',99);
    insert into aging_source(id,invoice_no,no_sj,open_amt,tax_name) values(1,'SI/125575/IX/XXVI/TRA',' sj/150918/xxvi/tra ',1144132,'M10');`);
  await db.exec(readFileSync('supabase/migrations/20261007143441_m10_aging_sync.sql','utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
it('backfills the same ID and SJ; stores only changed previous values', async () => {
  expect(await query('select id::int,invoice_no,no_sj,open_amt::float from m10_worksheet where id=1')).toEqual([
    {id:1,invoice_no:'SI/125575/IX/XXVI/TRA',no_sj:'SJ/150918/XXVI/TRA',open_amt:1144132}]);
  expect(await query('select previous_values from private.m10_aging_changes')).toEqual([
    {previous_values:{invoice_no:'OLD',open_amt:2451712}}]);
  expect(await query("select invoice_no,open_amt::int from m10_worksheet where no_sj='HISTORY'"))
    .toEqual([{invoice_no:'PAID',open_amt:99}]);
});
it('corrected SJ joins current Aging and kwitansi without hiding the real Rp5 difference',async()=>{
  const worksheet=(await db.query<Worksheet>('select * from m10_worksheet where id=1')).rows;
  const aging=(await db.query<AgingLine>('select *, id as line_no from m10_aging where id=1')).rows;
  const kwitansi=[{id:1,vendor_invoice_no:'SI/125575/IX/XXVI/TRA',total_net:1144127}] as Kwitansi[];
  const result=computeM10({worksheet,aging,kwitansi,gr:[],schedule:[],remarks:new Map([['SJ/150918/XXVI/TRA','keep note']])});
  expect(result.worksheet[0]).toMatchObject({id:1,open_amt:1144132,status:'Outstanding',tukar_faktur:'Done',selisih:5,keterangan:'keep note'});
});
it('unchanged retry does not write audit, worksheet, or cache versions', async () => {
  const version=await query('select * from versions');
  expect(await query('select private.m10_append_from_aging() n')).toEqual([{n:0}]);
  expect(await query('select * from versions')).toEqual(version);
  expect(await query('select count(*)::int n from private.m10_aging_changes')).toEqual([{n:1}]);
});
it('partial payment updates source fields and preserves inserted-count contract', async () => {
  await db.exec("update aging_source set open_amt=100, due_date='2026-12-01' where id=1");
  expect(await query('select private.m10_append_from_aging() n')).toEqual([{n:0}]);
  expect(await query('select open_amt::int from m10_worksheet where id=1')).toEqual([{open_amt:100}]);
  expect(await query('select previous_values from private.m10_aging_changes order by id desc limit 1'))
    .toEqual([{previous_values:{open_amt:1144132,due_date:null}}]);
});
it('deduplicates identical source rows, skips conflicting SJ and other tax names', async () => {
  await db.exec(`insert into aging_source(id,invoice_no,no_sj,open_amt,tax_name) values
    (2,'NEW','NEW',200,'M10'),(3,'NEW',' new ',200,'M10'),
    (4,'A','CONFLICT',1,'M10'),(5,'B','CONFLICT',2,'M10'),(6,'X','OTHER',10,'OTHER'),
    (7,null,'INVALID',10,'M10');`);
  expect(await query('select private.m10_append_from_aging() n')).toEqual([{n:1}]);
  expect(await query("select count(*)::int n from m10_worksheet where no_sj in ('CONFLICT','OTHER','INVALID')")).toEqual([{n:0}]);
});
it('ambiguous existing canonical keys are preserved',async()=>{
  await db.exec("insert into m10_worksheet(no_sj,invoice_no,open_amt) values(' new ','LEGACY',999); update aging_source set open_amt=150 where invoice_no='NEW'");
  expect(await query('select private.m10_append_from_aging() n')).toEqual([{n:0}]);
  expect(await query("select open_amt::int from m10_worksheet where no_sj='NEW'")).toEqual([{open_amt:200}]);
});
it('audit and updates roll back together',async()=>{
  const before=await query('select * from private.m10_aging_changes order by id');
  await db.exec('begin; update aging_source set open_amt=80 where id=1; select private.m10_append_from_aging(); rollback;');
  expect(await query('select * from private.m10_aging_changes order by id')).toEqual(before);
  expect(await query('select open_amt::int from m10_worksheet where id=1')).toEqual([{open_amt:100}]);
});
it('clients cannot execute sync or read the private audit',async()=>{
  await db.exec('grant usage on schema private to authenticated; set role authenticated');
  await expect(query('select private.m10_append_from_aging()')).rejects.toThrow(/permission denied/);
  await expect(query('select * from private.m10_aging_changes')).rejects.toThrow(/permission denied/);
  await db.exec('reset role');
});
