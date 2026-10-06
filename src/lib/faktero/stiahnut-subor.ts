/*
  Stiahnutie súboru v prehliadači v správnom kódovaní — Omega a súpiska CSV
  chcú Windows-1250, ISDOC ZIP prichádza ako base64.
*/

/**
 * Windows-1250. Omega slovenskú diakritiku v UTF-8 neprečíta a v súbore by
 * boli namiesto písmen otázniky. Prevádzajú sa len znaky, ktoré sa od ASCII
 * líšia — zvyšok je zhodný.
 */
const CP1250: Record<string, number> = {
  "\u20AC": 0x80,
  "\u201A": 0x82,
  "\u201E": 0x84,
  "\u2026": 0x85,
  "\u2020": 0x86,
  "\u2021": 0x87,
  "\u2030": 0x89,
  "\u0160": 0x8a,
  "\u2039": 0x8b,
  "\u015A": 0x8c,
  "\u0164": 0x8d,
  "\u017D": 0x8e,
  "\u0179": 0x8f,
  "\u2018": 0x91,
  "\u2019": 0x92,
  "\u201C": 0x93,
  "\u201D": 0x94,
  "\u2022": 0x95,
  "\u2013": 0x96,
  "\u2014": 0x97,
  "\u0161": 0x9a,
  "\u203A": 0x9b,
  "\u015B": 0x9c,
  "\u0165": 0x9d,
  "\u017E": 0x9e,
  "\u017A": 0x9f,
  "\u00A0": 0xa0,
  "\u02C7": 0xa1,
  "\u02D8": 0xa2,
  "\u0141": 0xa3,
  "\u00A4": 0xa4,
  "\u0104": 0xa5,
  "\u00A6": 0xa6,
  "\u00A7": 0xa7,
  "\u00A8": 0xa8,
  "\u00A9": 0xa9,
  "\u015E": 0xaa,
  "\u00AB": 0xab,
  "\u00AC": 0xac,
  "\u00AD": 0xad,
  "\u00AE": 0xae,
  "\u017B": 0xaf,
  "\u00B0": 0xb0,
  "\u00B1": 0xb1,
  "\u02DB": 0xb2,
  "\u0142": 0xb3,
  "\u00B4": 0xb4,
  "\u00B5": 0xb5,
  "\u00B6": 0xb6,
  "\u00B7": 0xb7,
  "\u00B8": 0xb8,
  "\u0105": 0xb9,
  "\u015F": 0xba,
  "\u00BB": 0xbb,
  "\u013D": 0xbc,
  "\u02DD": 0xbd,
  "\u013E": 0xbe,
  "\u017C": 0xbf,
  "\u0154": 0xc0,
  "\u00C1": 0xc1,
  "\u00C2": 0xc2,
  "\u0102": 0xc3,
  "\u00C4": 0xc4,
  "\u0139": 0xc5,
  "\u0106": 0xc6,
  "\u00C7": 0xc7,
  "\u010C": 0xc8,
  "\u00C9": 0xc9,
  "\u0118": 0xca,
  "\u00CB": 0xcb,
  "\u011A": 0xcc,
  "\u00CD": 0xcd,
  "\u00CE": 0xce,
  "\u010E": 0xcf,
  "\u0110": 0xd0,
  "\u0143": 0xd1,
  "\u0147": 0xd2,
  "\u00D3": 0xd3,
  "\u00D4": 0xd4,
  "\u0150": 0xd5,
  "\u00D6": 0xd6,
  "\u00D7": 0xd7,
  "\u0158": 0xd8,
  "\u016E": 0xd9,
  "\u00DA": 0xda,
  "\u0170": 0xdb,
  "\u00DC": 0xdc,
  "\u00DD": 0xdd,
  "\u0162": 0xde,
  "\u00DF": 0xdf,
  "\u0155": 0xe0,
  "\u00E1": 0xe1,
  "\u00E2": 0xe2,
  "\u0103": 0xe3,
  "\u00E4": 0xe4,
  "\u013A": 0xe5,
  "\u0107": 0xe6,
  "\u00E7": 0xe7,
  "\u010D": 0xe8,
  "\u00E9": 0xe9,
  "\u0119": 0xea,
  "\u00EB": 0xeb,
  "\u011B": 0xec,
  "\u00ED": 0xed,
  "\u00EE": 0xee,
  "\u010F": 0xef,
  "\u0111": 0xf0,
  "\u0144": 0xf1,
  "\u0148": 0xf2,
  "\u00F3": 0xf3,
  "\u00F4": 0xf4,
  "\u0151": 0xf5,
  "\u00F6": 0xf6,
  "\u00F7": 0xf7,
  "\u0159": 0xf8,
  "\u016F": 0xf9,
  "\u00FA": 0xfa,
  "\u0171": 0xfb,
  "\u00FC": 0xfc,
  "\u00FD": 0xfd,
  "\u0163": 0xfe,
  "\u02D9": 0xff,
};

function doCp1250(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    const kod = z.charCodeAt(0);
    // Znak, ktorý v CP1250 nie je, nahradíme otáznikom — inak by sa posunuli bajty.
    out[i] = kod < 0x80 ? kod : (CP1250[z] ?? 0x3f);
  }
  return out;
}

/** Base64 späť na bajty — ISDOC chodí ako ZIP, ktorý história drží ako text. */
function zBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function downloadFile(
  name: string,
  content: string,
  mime = "application/xml",
  encoding: "utf-8" | "windows-1250" | "base64" = "utf-8",
) {
  const data: BlobPart =
    encoding === "windows-1250"
      ? (doCp1250(content) as BlobPart)
      : encoding === "base64"
        ? (zBase64(content) as BlobPart)
        : content;
  const blob = new Blob([data], {
    type: encoding === "base64" ? mime : `${mime};charset=${encoding}`,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
