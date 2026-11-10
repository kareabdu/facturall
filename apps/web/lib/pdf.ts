import type { ElementPDF } from "@facturall/core";

/**
 * Extrait les textes positionnés d'un PDF (pdf.js, chargé à la demande).
 * Un PDF scanné (image) ne contient pas de texte : on le signale.
 */
export async function lireElementsPDF(fichier: File): Promise<ElementPDF[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  let document;
  try {
    document = await pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
  } catch (e) {
    if ((e as Error).name === "PasswordException") {
      throw new Error("Ce PDF est protégé par un mot de passe : ouvrez-le, enregistrez une copie sans mot de passe, puis réessayez.");
    }
    throw new Error("Ce fichier PDF n’a pas pu être lu.");
  }

  const elements: ElementPDF[] = [];
  try {
    for (let page = 1; page <= document.numPages; page++) {
      const contenu = await (await document.getPage(page)).getTextContent();
      for (const item of contenu.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [, , c, d, x, y] = item.transform as number[];
        elements.push({
          page,
          texte: item.str,
          x,
          y,
          largeur: item.width,
          hauteur: item.height || Math.hypot(c, d) || 10,
        });
      }
    }
  } finally {
    void document.loadingTask.destroy();
  }

  if (elements.length === 0) {
    throw new Error(
      "Ce PDF ne contient pas de texte (relevé scanné en image). Téléchargez le relevé au format PDF « texte », CSV ou Excel depuis votre banque en ligne.",
    );
  }
  return elements;
}
