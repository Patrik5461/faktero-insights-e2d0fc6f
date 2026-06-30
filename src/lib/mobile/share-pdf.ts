/**
 * Natívne zdieľanie PDF/súboru cez Capacitor Share Sheet.
 * Web fallback: stiahnutie cez <a download> alebo Web Share API ak je dostupné.
 */
export async function sharePdf(opts: {
  fileName: string;
  base64: string; // bez data: prefixu
  title?: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const written = await Filesystem.writeFile({
        path: opts.fileName,
        data: opts.base64,
        directory: Directory.Cache,
      });
      await Share.share({
        title: opts.title ?? opts.fileName,
        text: opts.text,
        url: written.uri,
        dialogTitle: "Zdieľať PDF",
      });
      return { ok: true };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }

  // Web fallback
  try {
    const bin = atob(opts.base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: "application/pdf" });
    if ((navigator as any).canShare && (navigator as any).share) {
      const file = new File([blob], opts.fileName, { type: "application/pdf" });
      if ((navigator as any).canShare({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: opts.title, text: opts.text });
        return { ok: true };
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = opts.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}
