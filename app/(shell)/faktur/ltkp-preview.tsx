"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/modal";

// Pratinjau PDF LTKP dari Storage privat (signed URL 1 jam).
export function LtkpPreview({ path, title, onClose }: { path: string | null; title: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    createClient().storage.from("ltkp").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => {
      cancelled = true;
      setUrl(null);
    };
  }, [path]);

  return (
    <Modal open={!!path} onClose={onClose} title={title} wide>
      {url ? (
        <>
          <iframe src={url} title={title} className="h-[70vh] w-full rounded-lg bg-white" />
          <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-accent hover:underline">Buka di tab baru</a>
        </>
      ) : (
        <p className="text-sm text-fg-2">Memuat dokumen…</p>
      )}
    </Modal>
  );
}
