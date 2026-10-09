import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { EmailCustomerView } from "./email-customer-view";

export default async function EmailCustomerPage() {
  const { allowed, label } = await menuGuard("bill.email");
  if (!allowed) return <NoAccess label={label} />;
  return <EmailCustomerView />;
}
