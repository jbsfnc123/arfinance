import { menuGuard } from "@/lib/guard";
import { NoAccess } from "@/components/no-access";
import { PdfEditor } from "./pdf-editor";

export default async function PdfEditorPage() {
  const { allowed, label } = await menuGuard("tool.pdf");
  if (!allowed) return <NoAccess label={label} />;
  return <PdfEditor />;
}
