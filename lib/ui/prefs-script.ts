// Tanpa "use client": diimpor layout server untuk skrip inline anti-kedip (lihat lib/ui/prefs.ts).
export const THEME_KEY = "prefs:theme";
export const DENSITY_KEY = "prefs:density";
export const DEFAULT_THEME = "dark" as const; // tampilan lama gelap → tetap gelap sampai user memilih lain

// Dijalankan di <head> sebelum hidrasi: baca localStorage → set atribut di <html>.
export const PREFS_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t!=="dark"&&t!=="light"&&t!=="system")t=${JSON.stringify(DEFAULT_THEME)};var r=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var d=document.documentElement;d.setAttribute("data-theme",r);d.setAttribute("data-theme-mode",t);var c=localStorage.getItem(${JSON.stringify(DENSITY_KEY)});if(c==="compact")d.setAttribute("data-density","compact");}catch(e){}})();`;

