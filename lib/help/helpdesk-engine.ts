// Mesin mode terpandu AR Helpdesk (Fase 67): memilih topik untuk halaman aktif & mencari topik dari teks bebas, tanpa AI.
// SATU fungsi mandiri tanpa import: scripts/export-menu-help.mjs menyalin kodenya (Function#toString) ke Apps Script agar
// pencocokan di chatbot identik dengan yang diuji di sini. Jangan memakai sintaks TS selain anotasi tipe (enum, dsb.).

export type HelpTopic = {
  id: string;
  /** Judul pertanyaan (teks tombol pilihan). */
  q: string;
  /** Jawaban; boleh **tebal** & _miring_, baris baru = paragraf. */
  a: string;
  /** Kata kunci tambahan untuk pencarian. */
  keys: string[];
  /** Halaman (href menu) tempat topik ini ditawarkan; kosong = umum. */
  pages?: string[];
  /** Topik lanjutan yang ditawarkan sesudah jawaban. */
  related?: string[];
  /** Kelompok: halaman, istilah, umum. */
  kind: "page" | "term" | "general";
};

export type TopicHit = { topic: HelpTopic; score: number; coverage: number };

export function helpdeskEngine(topics: HelpTopic[]) {
  const STOP = ["apa", "itu", "yang", "di", "ke", "dan", "atau", "bagaimana", "gimana", "cara", "caranya", "maksud", "maksudnya",
    "arti", "artinya", "dari", "ini", "saya", "aku", "untuk", "ada", "dengan", "pada", "mau", "ingin", "tolong", "bisa", "dong",
    "kak", "pak", "bu", "min", "halo", "hai", "the", "is", "of", "jelaskan", "tentang", "apakah", "adalah", "kalau", "kok", "ya",
    "nya", "sih", "deh", "nih", "tidak", "gak", "nggak", "ga", "belum", "sudah", "kenapa", "mengapa", "halaman", "menu"];
  const SYN: Record<string, string> = {
    unggah: "upload", update: "upload", perbarui: "upload", import: "upload", impor: "upload", upload: "upload", uplod: "upload",
    diupdate: "upload", mengupdate: "upload", memperbarui: "upload", mengunggah: "upload", diunggah: "upload",
    kosong: "kosong", hilang: "kosong", muncul: "kosong", tampil: "kosong",
    terkunci: "akses", kunci: "akses", gembok: "akses", izin: "akses", hak: "akses", access: "akses",
    cari: "cari", mencari: "cari", search: "cari", temukan: "cari",
    receiving: "gr", receipt: "gr", penerimaan: "gr",
    kwitansi: "kwitansi", kuitansi: "kwitansi", kw: "kwitansi",
    pajak: "pajak", ppn: "pajak",
    komisi: "komisi", fee: "komisi",
  };
  const norm = (s: string) => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
  const words = (s: string) => norm(s).split(" ").filter(Boolean).map((w) => SYN[w] || w);
  const tokens = (s: string) => words(s).filter((w) => STOP.indexOf(w) < 0);
  const onPage = (t: HelpTopic, path: string) => (t.pages || []).some((h) => path === h || (h !== "/" && path.indexOf(h + "/") === 0));
  // Indeks kata per topik dihitung sekali.
  const index = topics.map((t) => ({ t, keys: t.keys.reduce((a: string[], k) => a.concat(words(k)), []), q: tokens(t.q) }));
  const byId: Record<string, HelpTopic> = {};
  topics.forEach((t) => { byId[t.id] = t; });

  /** Topik halaman `path` (href terpanjang yang cocok), urutan: khusus halaman → istilah halaman → umum halaman. */
  function forPage(path: string) {
    let best = "";
    topics.forEach((t) => (t.pages || []).forEach((h) => {
      if ((path === h || (h !== "/" && path.indexOf(h + "/") === 0)) && h.length > best.length) best = h;
    }));
    if (!best) return [];
    // Topik otomatis halaman (id berisi "#") paling akhir; sort stabil menjaga urutan tulisan.
    const rank = (t: HelpTopic) => (t.id.indexOf("#") >= 0 ? 3 : t.kind === "page" ? 0 : t.kind === "term" ? 1 : 2);
    return topics.filter((t) => (t.pages || []).indexOf(best) >= 0).sort((a, b) => rank(a) - rank(b));
  }

  /** Cari topik dari teks bebas. coverage = porsi kata pertanyaan yang dikenali topik itu. */
  function search(text: string, path: string, limit?: number): TopicHit[] {
    const qs = tokens(text);
    if (!qs.length) return [];
    const hits: TopicHit[] = [];
    index.forEach((e) => {
      let score = 0, matched = 0;
      qs.forEach((w) => {
        let s = 0;
        if (e.keys.indexOf(w) >= 0) s = e.q.indexOf(w) >= 0 ? 4 : 3; // kata kunci yang juga di judul = inti topik
        else if (e.q.indexOf(w) >= 0) s = 2;
        else if (w.length >= 4 && (e.keys.some((k) => k.indexOf(w) === 0 || w.indexOf(k) === 0 && k.length >= 4) ||
          e.q.some((k) => k.indexOf(w) === 0))) s = 1;
        if (s) { score += s; matched++; }
      });
      if (!score) return;
      if (e.t.id.indexOf("#") >= 0 && score > 1) score -= 1; // topik otomatis halaman kalah dari topik yang ditulis khusus
      if (path && onPage(e.t, path)) score += 2;
      hits.push({ topic: e.t, score, coverage: matched / qs.length });
    });
    hits.sort((a, b) => b.score - a.score || b.coverage - a.coverage);
    return hits.slice(0, limit || 6);
  }

  /** Satu topik jelas cocok (semua kata dikenali & unggul jauh) → boleh dijawab langsung tanpa AI. */
  function confident(hits: TopicHit[], text: string) {
    const top = hits[0];
    if (!top || top.coverage < 1 || top.score < 4 || tokens(text).length > 3) return null;
    const second = hits[1];
    return !second || top.score >= second.score * 1.25 ? top.topic : null;
  }

  return { forPage, search, confident, get: (id: string) => byId[id] || null, all: topics };
}
