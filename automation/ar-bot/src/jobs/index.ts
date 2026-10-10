// Registri job: id → fungsi. Job EDI Mitra 10 ada di jobs/edi.
import type { JobId, JobParams } from "~/shared/types";
import type { RunContext } from "~/runner/ctx";
import { agingJob, invoiceByDateJob, sendInvoiceJob, sjJob, type JobOut } from "./jasper/jobs";
import { ediGrJob, ediKwitansiJob, ediUploadFakturJob } from "./edi/jobs";

export type JobFn = (ctx: RunContext, p: JobParams) => Promise<JobOut>;

export const JOB_FNS: Record<JobId, JobFn> = {
  "jasper.aging": agingJob,
  "jasper.send-invoice": sendInvoiceJob,
  "jasper.sj": sjJob,
  "jasper.invoice-by-date": invoiceByDateJob,
  "edi.gr": ediGrJob,
  "edi.kwitansi": ediKwitansiJob,
  "edi.upload-faktur": ediUploadFakturJob,
};
