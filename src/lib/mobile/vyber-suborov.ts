/**
 * Výber súborov z telefónu — galéria, fotky aj súbory (PDF).
 *
 * Ide cez obyčajný `<input type="file">`, rovnako ako doteraz jeden súbor:
 * na webe je to jediná možnosť a v zabalenej appke ho obslúži systémový výber
 * (iOS fotky aj Súbory, Android výber obsahu). S `multiple` oba systémy
 * dovolia označiť viac položiek naraz — plugin kamery (`pickImages`) by vedel
 * len fotky, nie PDF, a pridával by druhú cestu k tomu istému.
 */
export type VybranySubor = { dataUrl: string; nazov: string };

function citaj(f: File): Promise<VybranySubor | null> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve({ dataUrl: String(r.result), nazov: f.name });
    r.onerror = () => resolve(null);
    r.readAsDataURL(f);
  });
}

/** Vráti vybrané súbory ako data URL; prázdne pole, keď človek nič nevybral. */
export function vyberSubory(accept: string, viac = true): Promise<VybranySubor[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = viac;
    input.onchange = async () => {
      const subory = Array.from(input.files ?? []);
      // Po jednom, nie naraz — desať fotiek po 3 MB naraz v pamäti WebView netreba.
      const out: VybranySubor[] = [];
      for (const f of subory) {
        const s = await citaj(f);
        if (s) out.push(s);
      }
      resolve(out);
    };
    input.click();
  });
}
