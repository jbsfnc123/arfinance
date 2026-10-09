import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closingReport, type ClosingPreview, type CollectionPeriod } from "../../lib/modules/collection/closing";

let db:PGlite;
const sql=(s:string,args:unknown[]=[])=>db.query(s,args);
async function value<T>(s:string,args:unknown[]=[]):Promise<T>{return (await sql(s,args)).rows[0] as T;}
async function preview(){return (await value<{v:ClosingPreview}>("select public.collection_closing_preview('2026-09','2026-09-30') v")).v;}
async function close(p:ClosingPreview){return sql("select public.collection_close('2026-09','2026-09-30',$1,$2,true)",[p.token,p.revision]);}
async function get(month="2026-09"){return (await value<{v:CollectionPeriod}>("select public.collection_period_get($1) v",[month])).v;}
async function upload(month:string,date:string,open:number){
 const id="00000000-0000-0000-0000-000000000099";
 await sql("insert into private.upload_batches values($1,'aging','test.xlsx','hash',$2)",[id,JSON.stringify({collectionMonth:month,reportDate:date})]);
 await sql("insert into private.upload_rows values($1,1,$2)",[id,JSON.stringify({invoice_no:"INV1",invoice_date:"2026-08-10",tax_name:"tax",open_amt:open,no_sj:"SJ/1/XXVI/TRA",due_date:"2026-09-10"})]);
 try{return await sql("select public.aging_commit($1)",[id]);}finally{await sql("delete from private.upload_batches where id=$1",[id]);}
}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(readFileSync("tests/closing/schema.sql","utf8"));
 await db.exec(readFileSync("tests/closing/production-functions.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/20261004095247_collection_monthly_closing.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/20261004151000_collection_source_payment_join.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/20261004154911_collection_aging_upload_reference.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/20261009190000_collection_source_fast.sql","utf8"));
 await db.exec(`insert into ar_targets values('2026-09','INV1',1000,'M','C','BP','2026-09-10','JKT','SJ/1/XXVI/TRA'),('2026-10','INV1',600,'M','C','BP','2026-09-10','JKT','SJ/1/XXVI/TRA');
 insert into erp_payments values('INV1','2026-09-15',400),('OTHER','2026-09-15',50);
 insert into payment_promises values(1,'INV1','2026-09-28');`);
 await upload('2026-09','2026-09-30',600);
},30000);
afterAll(async()=>{await db?.close();});

describe("database closing with actual production upload functions",()=>{
 it("creates preview with explicit report date and all-month allocation",async()=>{
  const p=await preview();const r=closingReport(p.source);
  expect(p.source.aging?.verified).toBe(true);expect(r.data.target).toBe(1000);expect(r.data.sisa).toBe(600);
  expect(r.alloc.totalAlloc).toBe(450);expect(r.alloc.totalAllocT).toBe(400);
 });
 it("rejects stale preview after a payment change",async()=>{
  const p=await preview();await sql("insert into erp_payments values('INV1','2026-09-20',10)");
  await expect(close(p)).rejects.toThrow(/Data berubah/);
  expect((await get()).status).toBe('open');await sql("delete from erp_payments where amount=10");
 });
 it("closes atomically, retries idempotently, rejects target replace/direct write/truncate",async()=>{
  const p=await preview();await close(p);await close(p);
  expect((await value<{n:number}>("select count(*)::int n from collection_closings")).n).toBe(1);
  expect((await get()).status).toBe('closed');
  await expect(sql("select ar_target_replace('2026-09','[]','bad')")).rejects.toThrow(/Closed/);
  await expect(sql("update ar_targets set target=1 where month='2026-09'")).rejects.toThrow(/Closed/);
  await expect(sql("delete from ar_targets where month='2026-09'")).rejects.toThrow(/Closed/);
  await expect(sql("truncate ar_targets")).rejects.toThrow(/TRUNCATE/);
 });
 it("rejects aging upload to closed month with no partial aging replacement",async()=>{
  const before=await value("select jsonb_agg(to_jsonb(s)) v from ar_aging_snapshots s");
  await expect(upload('2026-09','2026-09-30',0)).rejects.toThrow(/Closed/);
  expect(await value("select jsonb_agg(to_jsonb(s)) v from ar_aging_snapshots s")).toEqual(before);
 });
 it("October upload, late ERP correction, aging cleanup and promises cannot alter September",async()=>{
  const frozen=await get();const before=closingReport(frozen.source);
  await upload('2026-10','2026-10-01',200);
  const pointer=await value<{data:{snapshotId:number;lines?:unknown[]}}>("select aging_data data from collection_periods where month='2026-10'");
  expect(pointer.data.snapshotId).toBeTruthy();expect(pointer.data.lines).toBeUndefined();
  await db.exec("update erp_payments set amount=999; update payment_promises set promise_date='2026-11-30'; delete from ar_aging_snapshots where month='2026-09';");
  expect((await get('2026-10')).source.aging?.asOf).toBe('2026-10-01');
  await db.exec("insert into ar_aging_snapshots(month,as_of,file_name) values('2026-07','2026-07-31','July'),('2026-08','2026-08-31','August'); insert into collection_periods(month,aging_data) values('2026-07',jsonb_build_object('snapshotId',(select id from ar_aging_snapshots where month='2026-07')));");
  await upload('2026-10','2026-10-01',200);
  expect((await value<{n:number}>("select count(*)::int n from ar_aging_snapshots where month='2026-07'")).n).toBe(1);
  expect((await get('2026-10')).source.aging?.asOf).toBe('2026-10-01');
  expect(closingReport((await get()).source)).toEqual(before);
  expect((await get()).source).toEqual(frozen.source);
 });
 it("checks source date, invalid month, missing target and future cutoff",async()=>{
  await expect(sql("select collection_closing_preview('2026-10','2026-09-30')")).rejects.toThrow(/Cut off/);
  await expect(sql("select collection_period_get('2026-13')")).rejects.toThrow(/Bulan/);
  await expect(sql("select collection_closing_preview('2025-09','2025-09-30')")).rejects.toThrow(/Target/);
  await expect(sql("select collection_closing_preview('2099-09','2099-09-30')")).rejects.toThrow(/Cut off/);
 });
 it("enforces anonymous/read-only roles and denies direct snapshot mutation",async()=>{
  await db.exec("select set_config('test.role','reader',false)");
  expect((await get()).canManage).toBe(false);
  await expect(sql("select collection_reopen('2026-09',1,'koreksi laporan')")).rejects.toThrow(/Super Admin/);
  await expect(preview()).rejects.toThrow(/Akses/);
  await db.exec("select set_config('test.uid','',false)");
  await expect(get()).rejects.toThrow(/Akses/);
  await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);select set_config('test.role','sa',false)");
  await expect(sql("delete from collection_closings")).rejects.toThrow(/permanen/);
  await db.exec("set role authenticated");
  await expect(sql("update collection_periods set status='open'")).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
 });
 it("reopens with reason, preserves original aging, closes revision 2 and retains revision 1",async()=>{
  await expect(sql("select collection_reopen('2026-09',1,'x')")).rejects.toThrow(/alasan/);
  await sql("select collection_reopen('2026-09',1,'Koreksi pembayaran ERP')");
  expect((await get()).source.aging?.asOf).toBe('2026-09-30');
  await expect(sql("select collection_reopen('2026-09',1,'Koreksi pembayaran ERP')")).rejects.toThrow(/Status/);
  const p=await preview();await close(p);
  expect((await get()).revision).toBe(2);
  expect((await value<{n:number}>("select count(*)::int n from collection_closings")).n).toBe(2);
 });
 it("retains revision source exports and joins multi-SJ replacements without duplicate sums",async()=>{
  const first=(await value<{v:CollectionPeriod["source"]}>("select collection_closing_source('2026-09',1) v")).v;
  expect(closingReport(first).alloc.totalAllocT).toBe(400);
  await db.exec(readFileSync("supabase/migrations/20261004151000_collection_source_payment_join.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261009190000_collection_source_fast.sql","utf8"));
 await db.exec(`insert into ar_targets values('2026-07','OLD',2000,'M','C','BP','2026-07-10','JKT','SJ/A-SJ/B');
    insert into ar_aging_snapshots(month,as_of,file_name,report_date) values('2026-07','2026-07-31','July','2026-07-31') on conflict (month) do update set report_date=excluded.report_date;
    insert into ar_aging_lines(snapshot_id,line_no,invoice_no,no_sj,open_amt,due_date)
    select id,1,'NEW','SJ/A-SJ/B',500,'2026-07-10'::date from ar_aging_snapshots where month='2026-07';
    update collection_periods set aging_data=private.collection_aging((select id from ar_aging_snapshots where month='2026-07')) where month='2026-07';`);
  const report=closingReport((await get('2026-07')).source);
  expect(report.data.sisa).toBe(500);
  expect(report.recon.categories.find(c=>c.category==='revisi')?.rows[0].pengganti).toBe('NEW');
 });
 it("handles monthly volume with compact source projection",async()=>{
  await db.exec(readFileSync("supabase/migrations/20261004151000_collection_source_payment_join.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20261009190000_collection_source_fast.sql","utf8"));
 await db.exec(`insert into ar_targets(month,invoice_no,target,no_sj) select '2026-06','I'||g,10000,'SJ/'||g from generate_series(1,9000) g;
    insert into ar_aging_snapshots(month,as_of,file_name,report_date) values('2026-06','2026-06-30','June','2026-06-30');
    insert into ar_aging_lines(snapshot_id,line_no,invoice_no,no_sj,open_amt,due_date)
    select s.id,g,'I'||g,'SJ/'||g,4000,'2026-06-15'::date from ar_aging_snapshots s cross join generate_series(1,22000) g where s.month='2026-06';
    update collection_periods set aging_data=private.collection_aging((select id from ar_aging_snapshots where month='2026-06')) where month='2026-06';`);
  const start=performance.now();const p=await get('2026-06');const ms=performance.now()-start;
  expect(p.source.targets.length).toBe(9000);expect(p.source.aging?.lines.length).toBe(9000);
  expect(closingReport(p.source).data.sisa).toBe(36000000);
  console.info(`Closing volume: 9000 targets / 22000 aging; read ${Math.round(ms)}ms; source ${JSON.stringify(p.source).length} chars`);
 },30000);
 it("fast source (Fase 59) is byte-identical to v1 for snapshot pointers incl. multi-SJ and payments outside month",async()=>{
  await db.exec(`update collection_periods set aging_data=jsonb_build_object('snapshotId',(select id from ar_aging_snapshots where month='2026-06')) where month='2026-06';
    update collection_periods set aging_data=jsonb_build_object('snapshotId',(select id from ar_aging_snapshots where month='2026-07')) where month='2026-07';
    insert into erp_payments values('I5','2026-05-02',100),('I6','2026-06-03',200),('NEW','2026-08-01',50),('ZZZ','2026-06-20',70),('I7',null,5);`);
  for(const m of ['2026-06','2026-07','2026-09','2026-10']) for(const d of ['2026-06-30','2026-10-01']){
   const same=await value<{ok:boolean}>("select md5(private.collection_source($1,$2::date)::text)=md5(private.collection_source_v1($1,$2::date)::text) ok",[m,d]);
   expect(same.ok,`${m} ${d}`).toBe(true);
  }
  const p=await get('2026-06');expect(p.source.aging?.lines.length).toBe(9000);expect(closingReport(p.source).data.sisa).toBe(36000000);
 },30000);
 it("caches open-month source per data version and rebuilds after a change",async()=>{
  const a=await get('2026-10');
  const built=await value<{b:string}>("select built_at::text b from private.collection_source_cache where month='2026-10'");
  expect((await get('2026-10')).source).toEqual(a.source);
  expect((await value<{b:string}>("select built_at::text b from private.collection_source_cache where month='2026-10'")).b).toBe(built.b);
  await sql("insert into payment_promises values(99,'INV1','2026-10-25')");
  const b=await get('2026-10');
  expect(b.source.promises.find((x)=>x.invoice_no==='INV1')?.promise_date).toBe('2026-10-25');
  expect((await value<{b:string}>("select built_at::text b from private.collection_source_cache where month='2026-10'")).b).not.toBe(built.b);
 });

});
