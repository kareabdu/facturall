"use client";

import {
  convertirLignes,
  devinerColonnes,
  formaterDate,
  formaterXOF,
  LIBELLES_ROLES_COLONNE,
  lireCSV,
  lireMontant,
  MODELE_CSV_RELEVE,
  resumeLignes,
  trouverEntetes,
  type Cellule,
  type LigneImport,
  type RoleColonne,
  type SourceReleve,
} from "@facturall/core";
import { useId, useMemo, useState } from "react";

import { Alerte, Bouton } from "@/components/ui";

const styleChamp =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-4 focus:ring-primary/15";

/** Montant signé (solde débiteur, sortie…) : accepte « -150 000 » ou « (150 000) ». */
export function ChampMontantSigne({
  libelle,
  valeur,
  onChange,
  aide,
}: {
  libelle: string;
  valeur: number;
  onChange: (v: number) => void;
  aide?: string;
}) {
  const [texte, setTexte] = useState<string | null>(null);
  const affiche = texte ?? formaterXOF(valeur, { symbole: false });
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{libelle}</span>
      <input
        inputMode="text"
        className={`${styleChamp} montant text-right ${valeur < 0 ? "text-danger" : ""}`}
        value={affiche}
        onFocus={(e) => {
          setTexte(valeur ? String(valeur) : "");
          const champ = e.currentTarget;
          requestAnimationFrame(() => champ.select());
        }}
        onChange={(e) => {
          setTexte(e.target.value);
          onChange(lireMontant(e.target.value) ?? 0);
        }}
        onBlur={() => setTexte(null)}
      />
      {aide && <span className="text-xs text-muted">{aide}</span>}
    </label>
  );
}

/** Montant signé affiché : + vert pour une entrée, − pour une sortie. */
export function MontantSigne({ valeur, className = "" }: { valeur: number; className?: string }) {
  return (
    <span className={`montant whitespace-nowrap ${valeur > 0 ? "text-primary" : ""} ${className}`}>
      {valeur > 0 ? "+" : valeur < 0 ? "−" : ""}
      {formaterXOF(Math.abs(valeur), { symbole: false })}
    </span>
  );
}

/** Décode un CSV : UTF-8, sinon Windows-1252 (exports bancaires sous Excel français). */
function decoderTexte(octets: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(octets);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(octets) : utf8;
}

interface Fichier {
  nom: string;
  source: SourceReleve;
  lignes: Cellule[][];
}

/**
 * Import d'un relevé : CSV ou Excel → choix du rôle des colonnes → aperçu → lignes.
 * Le PDF n'est pas lu automatiquement : on demande l'export CSV / Excel à la banque.
 */
export function ImportReleve({
  onImporter,
  envoi = false,
}: {
  onImporter: (r: { lignes: LigneImport[]; source: SourceReleve; fichier: string }) => void;
  envoi?: boolean;
}) {
  const idFichier = useId();
  const [fichier, setFichier] = useState<Fichier | null>(null);
  const [entete, setEntete] = useState(0);
  const [roles, setRoles] = useState<RoleColonne[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lecture, setLecture] = useState(false);

  async function lire(f: File) {
    setErreur(null);
    setLecture(true);
    try {
      const nom = f.name;
      let lignes: Cellule[][];
      let source: SourceReleve;
      if (/\.xlsx$/i.test(nom)) {
        const { readSheet } = await import("read-excel-file/browser");
        lignes = (await readSheet(f)) as unknown as Cellule[][];
        source = "excel";
      } else if (/\.(csv|txt)$/i.test(nom)) {
        lignes = lireCSV(decoderTexte(await f.arrayBuffer()));
        source = "csv";
      } else if (/\.xls$/i.test(nom)) {
        throw new Error("Ancien format Excel (.xls) : enregistrez le fichier en .xlsx ou en CSV, puis réessayez.");
      } else if (/\.pdf$/i.test(nom)) {
        throw new Error(
          "Les relevés PDF ne sont pas encore lus automatiquement. Téléchargez le relevé au format CSV ou Excel depuis votre banque en ligne, ou saisissez les lignes à la main.",
        );
      } else {
        throw new Error("Format non reconnu : choisissez un fichier CSV ou Excel (.xlsx).");
      }
      if (lignes.length === 0) throw new Error("Le fichier est vide.");
      const i = trouverEntetes(lignes);
      setFichier({ nom, source, lignes });
      setEntete(i);
      setRoles(devinerColonnes((lignes[i] ?? []).map((c) => String(c ?? ""))));
    } catch (e) {
      setFichier(null);
      setErreur((e as Error).message);
    } finally {
      setLecture(false);
    }
  }

  const largeur = useMemo(() => Math.max(0, ...(fichier?.lignes.map((l) => l.length) ?? [0])), [fichier]);
  const resultat = useMemo(
    () => (fichier ? convertirLignes(fichier.lignes.slice(entete + 1), roles) : null),
    [fichier, entete, roles],
  );
  const resume = resultat ? resumeLignes(resultat.lignes) : null;
  const aDate = roles.includes("date");
  const aMontant = roles.includes("montant") || roles.includes("debit") || roles.includes("credit");

  function changerEntete(i: number) {
    setEntete(i);
    setRoles(devinerColonnes((fichier?.lignes[i] ?? []).map((c) => String(c ?? ""))));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={idFichier}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary-soft px-4 text-sm font-medium text-primary transition-colors hover:border-primary"
        >
          {lecture ? "Lecture…" : fichier ? "Changer de fichier" : "Choisir un fichier CSV ou Excel"}
        </label>
        <input
          id={idFichier}
          type="file"
          accept=".csv,.txt,.xlsx,.xls,.pdf"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void lire(f);
            e.target.value = "";
          }}
        />
        {fichier ? (
          <span className="text-sm text-muted">{fichier.nom}</span>
        ) : (
          <a
            className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(MODELE_CSV_RELEVE)}`}
            download="modele-releve.csv"
          >
            Télécharger un modèle CSV
          </a>
        )}
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}

      {fichier && resultat && (
        <>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Ligne des en-têtes</span>
              <select className={`${styleChamp} w-auto`} value={entete} onChange={(e) => changerEntete(Number(e.target.value))}>
                {fichier.lignes.slice(0, 30).map((l, i) => (
                  <option key={i} value={i}>
                    Ligne {i + 1} : {l.map((c) => String(c ?? "")).filter(Boolean).join(" · ").slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
            <p className="pb-2 text-muted">Indiquez à quoi correspond chaque colonne, puis vérifiez l’aperçu.</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-retrait">
                <tr>
                  {Array.from({ length: largeur }, (_, i) => (
                    <th key={i} className="min-w-36 px-2 py-2 text-left font-normal">
                      <select
                        aria-label={`Rôle de la colonne ${i + 1}`}
                        className={`${styleChamp} h-9 ${roles[i] && roles[i] !== "ignorer" ? "border-primary/50 text-primary" : ""}`}
                        value={roles[i] ?? "ignorer"}
                        onChange={(e) => {
                          const r = e.target.value as RoleColonne;
                          setRoles((actuels) => {
                            const suivant = Array.from({ length: largeur }, (_, k) => actuels[k] ?? "ignorer");
                            // Un rôle n'est porté que par une colonne
                            return suivant.map((x, k) => (k === i ? r : x === r && r !== "ignorer" ? "ignorer" : x));
                          });
                        }}
                      >
                        {(Object.keys(LIBELLES_ROLES_COLONNE) as RoleColonne[]).map((r) => (
                          <option key={r} value={r}>
                            {LIBELLES_ROLES_COLONNE[r]}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block truncate px-1 text-xs text-muted">{String(fichier.lignes[entete]?.[i] ?? "")}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fichier.lignes.slice(entete + 1, entete + 6).map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    {Array.from({ length: largeur }, (_, k) => (
                      <td key={k} className="max-w-56 truncate px-3 py-2 text-muted">
                        {l[k] instanceof Date ? formaterDate((l[k] as Date).toISOString().slice(0, 10)) : String(l[k] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!aDate || !aMontant ? (
            <Alerte type="attention">Choisissez au moins la colonne « Date » et une colonne de montant (signé, ou débit et crédit).</Alerte>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-retrait px-4 py-3 text-sm">
              <p>
                <strong>{resultat.lignes.length}</strong> opération(s)
                {resume?.debut && (
                  <>
                    {" "}du {formaterDate(resume.debut)} au {formaterDate(resume.fin!)}
                  </>
                )}
                {" · "}entrées <span className="montant text-primary">{formaterXOF(resume?.entrees ?? 0)}</span>
                {" · "}sorties <span className="montant">{formaterXOF(resume?.sorties ?? 0)}</span>
                {resultat.ignorees > 0 && <span className="text-muted"> · {resultat.ignorees} ligne(s) ignorée(s) (soldes, totaux…)</span>}
              </p>
              <Bouton
                disabled={resultat.lignes.length === 0}
                chargement={envoi}
                onClick={() => onImporter({ lignes: resultat.lignes, source: fichier.source, fichier: fichier.nom })}
              >
                Ajouter {resultat.lignes.length} opération(s)
              </Bouton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
