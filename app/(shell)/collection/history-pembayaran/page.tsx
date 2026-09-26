import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { HistoryView } from "./history-view";

// History Pembayaran BP: pembayaran 3 bulan terakhir (payment date) untuk BP ber-tempo, dihitung di browser.
export default async function HistoryPembayaranPage() {
  const { allowed, label } = await menuGuard("coll.payhist");
  if (!allowed) return <NoAccess label={label} />;
  return <HistoryView />;
}
