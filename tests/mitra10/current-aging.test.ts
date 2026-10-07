import { describe, expect, it } from 'vitest';
import { m10Of } from '../../lib/local/derived';
import { DATASETS, type AgingLine, type Datasets, type Worksheet } from '../../lib/local/datasets';
import { m10Dashboard, invoicesByUsername } from '../../lib/modules/m10/compute';

const w: Worksheet = {id:5204,no_sj:'SJ/1',invoice_no:'OLD',invoice_date:'2026-09-19',due_date:'2026-11-18',open_amt:2451712,
  payment_group:'Old Pengu111',business_partner:'Old Store',branch:'Old',no_po:'OLD PO'};
const a: AgingLine = {line_no:1,no_sj:'SJ/1',invoice_no:'NEW',invoice_date:'2026-09-19',due_date:'2026-11-20',open_amt:1144132,
  payment_group:'New Pengu338',business_partner:'New Store',branch:'New',no_po:'NEW PO',tax_name:'M10',
  marketing:null,collection_name:null,sales_name:null,bp_key:null,days:18,cur_0_30:1144132,cur_31_60:0,
  due_1_7:0,due_8_30:0,due_31_60:0,due_61_90:0,due_90:0};
const data: Datasets['m10']={worksheet:[w,{...w,id:2,no_sj:'GONE',invoice_no:'PAID'}],gr:[],kwitansi:[{
  id:1,username:null,invoice_no:'PORTAL',vendor_invoice_no:'NEW',invoice_date:null,kuitansi_no:'KW1',
  kuitansi_date:'2026-09-30',accepted_date:null,pfi_no:null,gr_no:null,po_no:null,total_net:1144127}],
  schedule:[{no_kw:'KW1',spp:null,nilai_kw:1144127,tgl_tukar_faktur:'2026-09-30',jadwal_transfer:'2026-10-15',notes:'keep'}]};
const remarks=new Map([['SJ/1','retain manual note']]);
const opt={month:'2026-09',today:'2026-10-07',lastAging:null,activeInvoices:true};

describe('Mitra10 active Aging replacement',()=>{
  it('replaces source fields even with an older browser worksheet packet and retains linked TF/remarks',()=>{
    const before=JSON.stringify(data);
    const c=m10Of(data,[a],remarks);
    expect(c.worksheet).toHaveLength(1);
    expect(c.worksheet[0]).toMatchObject({id:5204,invoice_no:'NEW',invoice_date:'2026-09-19',due_date:'2026-11-20',open_amt:1144132,business_partner:'New Store',branch:'New',no_po:'NEW PO',no_sj:'SJ/1',username:'Pengu338',keterangan:'retain manual note',tf_date:'2026-09-30',jadwal_bayar:'2026-10-15',selisih:5,status:'Outstanding'} satisfies Partial<Worksheet> & Record<string,unknown>);
    expect(JSON.stringify(data)).toBe(before);
    expect(c.kwitansi).toHaveLength(1);
  });
  it('removes absent invoices from daily/monthly/total, without a paid count',()=>{
    const c=m10Of(data,[a],remarks);const d=m10Dashboard(c,[a],data.schedule,opt);
    expect(d.summary.total).toBe(1);expect(d.summary).not.toHaveProperty('lunas');
    expect(d.daily.find(x=>x.date==='2026-09-19')?.invoice).toBe(1);
    expect(d.monthly).toHaveLength(1);expect(d.monthly[0].invoice).toBe(1);
  });
  it('empty replacement clears active rows but leaves annotations and receipts for reappearance',()=>{
    const absent=m10Of(data,[],remarks);
    expect(absent.worksheet).toEqual([]);expect(absent.kwitansi).toHaveLength(1);
    const restored=m10Of(data,[a],remarks);
    expect(restored.worksheet[0]).toMatchObject({id:5204,keterangan:'retain manual note',tf_date:'2026-09-30'});
    // Colors are keyed by this unchanged worksheet ID.
    const colors=new Map([[5204,'mint']]);expect(colors.get(restored.worksheet[0].id)).toBe('mint');
  });
  it('counts unique invoices consistently with the worksheet KPI across multiple SJ',()=>{
    const source=[a,{...a,line_no:2,no_sj:'SJ/2'}];
    const c=m10Of({...data,worksheet:[w,{...w,id:3,no_sj:'SJ/2'}]},source,remarks);
    const d=m10Dashboard(c,source,data.schedule,opt);
    expect(c.worksheet).toHaveLength(2);
    expect(d.summary.total).toBe(invoicesByUsername(c.worksheet).total);
    expect(d.summary.total).toBe(1);expect(d.aging.count).toBe(1);
    expect(d.daily.find(x=>x.date==='2026-09-19')).toMatchObject({invoice:1,done:1});
  });
  it('does not keep a stale source value when the latest field is null or zero',()=>{
    const c=m10Of(data,[{...a,no_po:null,due_date:null,open_amt:0}],remarks);
    expect(c.worksheet[0]).toMatchObject({no_po:null,due_date:null,open_amt:0});
  });
  it('keeps legacy shared dashboard behavior unless Mitra10 opts in',()=>{
    const d=m10Dashboard({worksheet:[{...w,status:'Lunas',keterangan:null,gr:'Pending',tukar_faktur:'Pending',selisih:0,jadwal_bayar:null,lama_tf:null}],gr:[]},[],[],{...opt,activeInvoices:false});
    expect(d.summary).toMatchObject({total:1,lunas:1});
  });
  it('invalidates the packed active worksheet on Aging changes, including removal-only uploads',()=>{
    expect(DATASETS.m10.deps).toContain('aging');
  });
});
