const { extractText, getDocumentProxy } = await import("unpdf");
const fs = await import("node:fs/promises");
const cesta = process.argv[2];
const bajty = await fs.readFile(cesta);
const doc = await getDocumentProxy(new Uint8Array(bajty));
const { text } = await extractText(doc, { mergePages: true });
console.log(String(text).replace(/\s+\n/g, "\n"));
