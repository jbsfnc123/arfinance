import { describe, expect, it } from "vitest";
import { parseMasterCsv } from "./schedule";

function report(delimiter = ",", date = "05-09-2026", partner = 'PT "Sinar", Agung; Sentosa') {
  const encode = (cells: string[]) => cells.map((c) => /[",;\t\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(delimiter);
  const header = Array<string>(17).fill("");
  header[1] = "Send Date"; header[7] = "Business Partner";
  header[14] = "No. Invoice"; header[15] = "Date Invoice";
  const row = Array<string>(17).fill("");
  row[1] = "07-10-2026"; row[7] = partner;
  row[14] = "SI/EXAMPLE/2026"; row[15] = date;
  return ["Report", "Period", "Tgl", "Doc", encode(header), encode(row)].join("\r\n");
}

describe("Master Kirim CSV", () => {
  it.each([",", ";", "\t"])("reads delimiter %j, quoted names and day-first hyphen dates", (delimiter) => {
    const result = parseMasterCsv("\uFEFF" + report(delimiter));
    expect(result.delimiter).toBe(delimiter);
    expect(result.rows).toEqual([{
      invoice_no: "SI/EXAMPLE/2026", business_partner: 'PT "Sinar", Agung; Sentosa',
      invoice_date: "2026-09-05", send_date: "2026-10-07",
    }]);
  });
  it("preserves legacy slash dates and multiline quoted fields", () => {
    expect(parseMasterCsv(report(";", "5/9/2026", "PT Sinar\nAgung")).rows[0]).toMatchObject({
      invoice_date: "2026-09-05", business_partner: "PT Sinar\nAgung",
    });
  });
  it("keeps first invoice when report blocks repeat", () => {
    const input = report() + "\r\n" + report(",", "06-09-2026", "Second");
    expect(parseMasterCsv(input).rows).toHaveLength(1);
    expect(parseMasterCsv(input).rows[0].invoice_date).toBe("2026-09-05");
  });
  it("rejects impossible invoice dates", () => {
    expect(parseMasterCsv(report(",", "31-02-2026")).rows).toHaveLength(0);
  });
  it("rejects invalid CSV and unclosed quotes", () => {
    expect(() => parseMasterCsv("wrong,columns")).toThrow(/Format CSV/);
    expect(() => parseMasterCsv(report() + '\r\n,"unclosed')).toThrow(/Format CSV/);
  });
});
