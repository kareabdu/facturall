// Tests du rapprochement bancaire : relevés, pointage manuel et automatique,
// comptabilisation des frais, validation, état de rapprochement, droits.
// Lancer : pnpm test:db
import { creerBase } from "./outils.mjs";

const { en, vrai, echoue, creerUser, bilan } = await creerBase();
const annee = new Date().getFullYear();
const jour = (m, j) => `${annee}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;

const P = await creerUser("proprio@banque.sn", "Propriétaire");
const C = await creerUser("compta@banque.sn", "Comptable");
const V = await creerUser("vendeur@banque.sn", "Vendeur");
const L = await creerUser("lecteur@banque.sn", "Lecteur");

const e = (await en(P, "select public.creer_entreprise('Banque Test SARL','SN') as id"))[0].id;
for (const [u, r] of [[C, "comptable"], [V, "vendeur"], [L, "lecteur"]]) {
  await en(P, "select public.inviter_membre($1,$2,$3)", [e, u.email, r]);
  await en(u, "select public.accepter_invitations()");
}

const un = async (u, sql, p) => (await en(u, sql, p))[0];
const L_ = (...l) => JSON.stringify(l);
const compte = async (n) => (await un(P, "select id from public.comptes where entreprise_id=$1 and numero=$2", [e, n])).id;
const journal = async (code) => (await un(P, "select id from public.journaux where entreprise_id=$1 and code=$2", [e, code])).id;
const BQ = await journal("BQ");
const CA = await journal("CA");
const boutique = (await un(P, "select id from public.boutiques where entreprise_id=$1", [e])).id;

console.log("Opérations comptables sur la banque");
await en(C, "select public.enregistrer_operation_simple($1,'recette',$2,50000,$3,$4,'Apport en banque')", [e, jour(3, 2), BQ, await compte("701")]);
await en(C, "select public.enregistrer_operation_simple($1,'depense',$2,20000,$3,$4,'Loyer mars')", [e, jour(3, 5), BQ, await compte("6052")]);
// Vente réglée par virement sur la banque (écriture automatique « reglement »)
const client = (await un(P, "insert into public.clients (entreprise_id, nom) values ($1,'Awa Diop') returning id", [e])).id;
const fv = (await un(P, "select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb) id", [e, boutique, client, jour(3, 8),
  L_({ designation: "Prestation", quantite: 1, prix_unitaire: 30000 })])).id;
const ttc = (await un(P, "select total_ttc::int t from public.documents_vente where id=$1", [fv])).t;
await en(P, "select public.valider_document_vente($1,$2::jsonb)", [fv, JSON.stringify({ montant: ttc, journal_id: BQ, mode: "virement", reference: "VIR-881" })]);
// Opération en caisse : ne doit jamais apparaître dans le rapprochement de la banque
await en(C, "select public.enregistrer_operation_simple($1,'recette',$2,50000,$3,$4,'Vente comptoir')", [e, jour(3, 2), CA, await compte("701")]);

await vrai("3 opérations à pointer sur la banque (pas la caisse)", async () =>
  (await en(L, "select * from public.operations_a_pointer($1)", [BQ])).length === 3);

console.log("Relevé");
const lignes = [
  { date: jour(3, 3), libelle: "VERSEMENT ESPECES", montant: 50000 },
  { date: jour(3, 6), libelle: "PRLV LOYER", montant: -20000 },
  { date: jour(3, 10), libelle: "VIR RECU AWA DIOP", reference: "VIR-881", montant: ttc },
  { date: jour(3, 31), libelle: "FRAIS TENUE DE COMPTE", montant: -2500 },
];
const soldeFinal = 50000 - 20000 + ttc - 2500;
await echoue("le vendeur ne saisit pas de relevé", () =>
  en(V, "select public.enregistrer_releve($1,$2,$3,$4,0,0)", [e, BQ, jour(3, 1), jour(3, 31)]), "réservé à la comptabilité");
await echoue("le lecteur non plus", () =>
  en(L, "select public.enregistrer_releve($1,$2,$3,$4,0,0)", [e, BQ, jour(3, 1), jour(3, 31)]), "réservé à la comptabilité");
await echoue("un journal sans trésorerie est refusé", async () =>
  en(C, "select public.enregistrer_releve($1,$2,$3,$4,0,0)", [e, await journal("VT"), jour(3, 1), jour(3, 31)]), "banque");
await echoue("ligne sans montant refusée", () =>
  en(C, "select public.enregistrer_releve($1,$2,$3,$4,0,0,$5::jsonb)", [e, BQ, jour(3, 1), jour(3, 31),
    L_({ date: jour(3, 3), libelle: "X", montant: 0 })]), "montant");
const r1 = (await un(C, "select public.enregistrer_releve($1,$2,$3,$4,0,$5,$6::jsonb,'csv','releve-mars.csv') id",
  [e, BQ, jour(3, 1), jour(3, 31), soldeFinal, JSON.stringify(lignes)])).id;
await vrai("relevé brouillon avec 4 lignes, source CSV", async () => {
  const r = await un(L, "select statut, numero, source, (select count(*)::int from public.lignes_releve where releve_id=$1) n from public.releves_bancaires where id=$1", [r1]);
  return r.statut === "brouillon" && r.numero === null && r.source === "csv" && r.n === 4;
});
await vrai("le vendeur ne voit pas les relevés", async () =>
  (await en(V, "select * from public.releves_bancaires where entreprise_id=$1", [e])).length === 0);
await echoue("écriture directe interdite", () =>
  en(C, "update public.lignes_releve set montant=1 where releve_id=$1", [r1]), "permission denied");

console.log("Pointage");
const ligne = async (libelle) => (await un(C, "select id from public.lignes_releve where releve_id=$1 and libelle=$2", [r1, libelle])).id;
const opLoyer = (await un(C, "select ecriture_ligne_id id from public.operations_a_pointer($1) where montant=-20000", [BQ])).id;
await echoue("montants différents refusés", async () =>
  en(C, "select public.pointer_ligne_releve($1,$2)", [await ligne("VERSEMENT ESPECES"), opLoyer]), "Montants différents");
const opCaisse = (await un(C, `select l.id from public.ecriture_lignes l join public.ecritures e on e.id=l.ecriture_id
  where e.journal_id=$1 and l.debit=50000`, [CA])).id;
await echoue("une opération de caisse ne se pointe pas sur la banque", async () =>
  en(C, "select public.pointer_ligne_releve($1,$2)", [await ligne("VERSEMENT ESPECES"), opCaisse]), "compte de trésorerie");
await en(C, "select public.pointer_ligne_releve($1,$2)", [await ligne("PRLV LOYER"), opLoyer]);
await vrai("pointage manuel du loyer", async () =>
  (await un(C, "select ecriture_ligne_id id from public.lignes_releve where libelle='PRLV LOYER' and releve_id=$1", [r1])).id === opLoyer);

console.log("Rapprochement automatique");
await vrai("2 lignes pointées automatiquement (versement J+1, virement J+2)", async () =>
  (await un(C, "select public.rapprocher_automatiquement($1) n", [r1])).n === 2);
await vrai("les frais restent à pointer", async () =>
  (await un(C, "select ecriture_ligne_id id from public.lignes_releve where libelle='FRAIS TENUE DE COMPTE'", [])).id === null);
await echoue("validation refusée : une ligne non pointée", () => en(C, "select public.valider_releve($1)", [r1]), "pas pointées");
await vrai("état : écart expliqué par les frais (−2 500)", async () => {
  const s = (await un(L, "select public.etat_rapprochement($1) s", [r1])).s;
  return s.solde_comptable === 50000 - 20000 + ttc && s.releve_non_pointe === -2500 && s.nb_ecritures_non_pointees === 0 && s.ecart === 0;
});

console.log("Comptabiliser les frais depuis le relevé");
const fraisEcriture = (await un(C, "select public.comptabiliser_ligne_releve($1,$2) id", [await ligne("FRAIS TENUE DE COMPTE"), await compte("631")])).id;
await vrai("écriture validée 631 / banque, datée du relevé, et pointée", async () => {
  const r = await un(C, `select e.statut, e.date_ecriture::text d, e.libelle,
    (select ecriture_ligne_id is not null from public.lignes_releve where libelle='FRAIS TENUE DE COMPTE') p
    from public.ecritures e where e.id=$1`, [fraisEcriture]);
  return r.statut === "validee" && r.d === jour(3, 31) && r.libelle === "FRAIS TENUE DE COMPTE" && r.p;
});
await vrai("plus rien à pointer sur la banque", async () =>
  (await en(C, "select * from public.operations_a_pointer($1)", [BQ])).length === 0);

console.log("Validation");
await en(C, "select public.enregistrer_releve($1,$2,$3,$4,0,$5,null,null,null,null,$6)", [e, BQ, jour(3, 1), jour(3, 31), soldeFinal + 1, r1]);
await echoue("solde final faux : refusé", () => en(C, "select public.valider_releve($1)", [r1]), "ne s'équilibre pas");
await en(C, "select public.enregistrer_releve($1,$2,$3,$4,0,$5,null,null,null,null,$6)", [e, BQ, jour(3, 1), jour(3, 31), soldeFinal, r1]);
await vrai(`relevé validé RB-${annee}-00001`, async () => (await un(C, "select public.valider_releve($1) n", [r1])).n === `RB-${annee}-00001`);
await vrai("état final : écart nul", async () => (await un(C, "select public.etat_rapprochement($1) s", [r1])).s.ecart === 0);
await echoue("relevé validé : plus de dépointage", async () =>
  en(C, "select public.depointer_ligne_releve($1)", [await ligne("PRLV LOYER")]), "validé");
await echoue("relevé validé : suppression interdite", () => en(C, "select public.supprimer_releve($1)", [r1]), "validé");
await echoue("relevé validé : ajout de lignes interdit", () =>
  en(C, "select public.enregistrer_releve($1,$2,$3,$4,0,0,null,null,null,null,$5)", [e, BQ, jour(3, 1), jour(3, 31), r1]), "validé");

console.log("Relevé suivant");
const r2 = (await un(C, "select public.enregistrer_releve($1,$2,$3,$4,1000,1000) id", [e, BQ, jour(4, 1), jour(4, 30)])).id;
await echoue("solde initial différent du solde final précédent", () => en(C, "select public.valider_releve($1)", [r2]), "solde final du relevé");
const r3 = (await un(C, "select public.enregistrer_releve($1,$2,$3,$4,$5,$5) id", [e, BQ, jour(3, 15), jour(4, 15), soldeFinal])).id;
await echoue("période qui chevauche le relevé validé", () => en(C, "select public.valider_releve($1)", [r3]), "chevauche");
await en(C, "select public.supprimer_releve($1)", [r3]);
await en(C, "select public.enregistrer_releve($1,$2,$3,$4,$5,$5,null,null,null,null,$6)", [e, BQ, jour(4, 1), jour(4, 30), soldeFinal, r2]);
await vrai(`relevé sans mouvement validé RB-${annee}-00002`, async () => (await un(C, "select public.valider_releve($1) n", [r2])).n === `RB-${annee}-00002`);

console.log("Dépointage et doublons");
const r4 = (await un(C, "select public.enregistrer_releve($1,$2,$3,$4,$5,$5,$6::jsonb) id", [e, BQ, jour(5, 1), jour(5, 31), soldeFinal,
  L_({ date: jour(5, 2), libelle: "DOUBLON LOYER", montant: -20000 })])).id;
const lDoublon = (await un(C, "select id from public.lignes_releve where releve_id=$1", [r4])).id;
await echoue("une opération déjà pointée ne l'est pas deux fois", () =>
  en(C, "select public.pointer_ligne_releve($1,$2)", [lDoublon, opLoyer]), "déjà pointée");
await vrai("le rapprochement automatique ne réutilise pas une opération pointée", async () =>
  (await un(C, "select public.rapprocher_automatiquement($1) n", [r4])).n === 0);
await en(C, "select public.supprimer_ligne_releve($1)", [lDoublon]);
await vrai("ligne supprimée du brouillon", async () =>
  (await en(C, "select * from public.lignes_releve where releve_id=$1", [r4])).length === 0);

process.exitCode = bilan() ? 1 : 0;
