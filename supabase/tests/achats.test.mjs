// Tests des achats : calculs, numérotation, écritures automatiques, paiements, avoirs, droits.
// Lancer : pnpm test:db
import { creerBase } from "./outils.mjs";

const { en, vrai, echoue, creerUser, bilan } = await creerBase();
const annee = new Date().getFullYear();
const aujourdhui = new Date().toISOString().slice(0, 10);

const P = await creerUser("proprio@achat.sn", "Propriétaire");
const G = await creerUser("gestion@achat.sn", "Gestionnaire");
const V = await creerUser("vendeur@achat.sn", "Vendeur");
const L = await creerUser("lecteur@achat.sn", "Lecteur");
const X = await creerUser("externe@achat.sn", "Externe");

const e = (await en(P, "select public.creer_entreprise('Achats Test SARL','SN') as id"))[0].id;
const bPrinc = (await en(P, "select id from public.boutiques where entreprise_id=$1", [e]))[0].id;
const bPlateau = (await en(P, "insert into public.boutiques (entreprise_id, code, nom) values ($1,'PLATEAU','Plateau') returning id", [e]))[0].id;
// Gestionnaire limité à la boutique Plateau
await en(P, "select public.inviter_membre($1,$2,'gestionnaire',false,array[$3]::uuid[])", [e, G.email, bPlateau]);
await en(G, "select public.accepter_invitations()");
for (const [u, r] of [[V, "vendeur"], [L, "lecteur"]]) {
  await en(P, "select public.inviter_membre($1,$2,$3)", [e, u.email, r]);
  await en(u, "select public.accepter_invitations()");
}

const un = async (u, sql, p) => (await en(u, sql, p))[0];
const L_ = (...l) => JSON.stringify(l);
const compte = async (n) => (await un(P, "select id from public.comptes where entreprise_id=$1 and numero=$2", [e, n])).id;
const lignesEcriture = (doc) => en(P, `select c.numero, l.debit::int d, l.credit::int c, l.fournisseur_id f from public.ecriture_lignes l
  join public.comptes c on c.id=l.compte_id join public.documents_achat d on d.ecriture_id=l.ecriture_id
  where d.id=$1 order by l.ordre`, [doc]);

console.log("Initialisation");
await vrai("paramètres : 401, AC, 601, 6057", async () => {
  const r = await un(P, `select c1.numero a, j.code b, c2.numero c, c3.numero d from public.parametres_achat p
    join public.comptes c1 on c1.id=p.compte_fournisseurs_id join public.journaux j on j.id=p.journal_achats_id
    join public.comptes c2 on c2.id=p.compte_achats_biens_id join public.comptes c3 on c3.id=p.compte_achats_services_id
    where p.entreprise_id=$1`, [e]);
  return r.a === "401" && r.b === "AC" && r.c === "601" && r.d === "6057";
});

console.log("Fournisseurs");
const four = await un(G, "insert into public.fournisseurs (entreprise_id, nom, telephone) values ($1,'Grands Moulins','338000000') returning id, code", [e]);
await vrai("code fournisseur automatique FR0001", async () => four.code === "FR0001");
await echoue("le vendeur ne crée pas de fournisseur", () =>
  en(V, "insert into public.fournisseurs (entreprise_id, nom) values ($1,'Autre')", [e]), "row-level security");
await vrai("le vendeur ne voit pas les fournisseurs", async () =>
  (await en(V, "select * from public.fournisseurs where entreprise_id=$1", [e])).length === 0);
await vrai("le lecteur voit les fournisseurs", async () =>
  (await en(L, "select * from public.fournisseurs where entreprise_id=$1", [e])).length === 1);
await vrai("l'externe ne voit pas les fournisseurs", async () =>
  (await en(X, "select * from public.fournisseurs where entreprise_id=$1", [e])).length === 0);

const exo = (await un(P, "select id from public.taux_tva where entreprise_id=$1 and taux=0", [e])).id;
const c622 = await compte("622");
const c411 = await compte("411");

console.log("Facture fournisseur : calculs");
const fa = (await un(G, `select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,'GM-778') id`, [e, bPlateau, four.id, aujourdhui, L_(
  { designation: "Farine 50 kg", quantite: 10, prix_unitaire: 18000 },                         // 180 000 HT, TVA 32 400 → 601
  { designation: "Loyer entrepôt", quantite: 1, prix_unitaire: 50000, compte_charge_id: c622, taux_tva_id: exo }, // 50 000 → 622
  { designation: "Transport", quantite: 1, prix_unitaire: 10000, remise_pct: 10 },             // 9 000 HT, TVA 1 620 → 601
)])).id;
await vrai("totaux : HT 239 000, TVA 34 020, TTC 273 020", async () => {
  const d = await un(G, "select total_ht::int ht, total_tva::int tva, total_ttc::int ttc, statut, numero from public.documents_achat where id=$1", [fa]);
  return d.ht === 239000 && d.tva === 34020 && d.ttc === 273020 && d.statut === "brouillon" && d.numero === null;
});
await echoue("compte hors classes 2 et 6 refusé", () =>
  en(G, `select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,'X')`, [e, bPlateau, four.id, aujourdhui,
    L_({ designation: "Erreur", quantite: 1, prix_unitaire: 1000, compte_charge_id: c411 })]), "compte de charge");
await echoue("gestionnaire : boutique non attribuée refusée", () =>
  en(G, `select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,'X')`, [e, bPrinc, four.id, aujourdhui,
    L_({ designation: "Farine", quantite: 1, prix_unitaire: 1000 })]), "non autorisée");
await echoue("le vendeur n'achète pas", () =>
  en(V, `select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,'X')`, [e, bPlateau, four.id, aujourdhui,
    L_({ designation: "Farine", quantite: 1, prix_unitaire: 1000 })]), "Droits insuffisants");
await echoue("insertion directe interdite", () =>
  en(G, "insert into public.documents_achat (entreprise_id, boutique_id, type, fournisseur_id) values ($1,$2,'facture',$3)", [e, bPlateau, four.id]), "permission denied");

console.log("Validation et écriture");
const brouillonSansNum = (await un(G, `select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb) id`, [e, bPlateau, four.id, aujourdhui,
  L_({ designation: "Sucre", quantite: 1, prix_unitaire: 1000 })])).id;
await echoue("validation sans numéro fournisseur refusée", () =>
  en(G, "select public.valider_document_achat($1)", [brouillonSansNum]), "numéro de la facture du fournisseur");
await en(G, "select public.supprimer_document_achat($1)", [brouillonSansNum]);

const numFa = (await un(G, "select public.valider_document_achat($1) n", [fa])).n;
await vrai(`numéro interne FF-${annee}-00001`, async () => numFa === `FF-${annee}-00001`);
await vrai("écriture AC : 601 D 189 000 / 622 D 50 000 / 4452 D 34 020 / 401 C 273 020", async () => {
  const l = await lignesEcriture(fa);
  const m = Object.fromEntries(l.map((x) => [x.numero, x]));
  return m["601"].d === 189000 && m["622"].d === 50000 && m["4452"].d === 34020
    && m["401"].c === 273020 && m["401"].f === four.id && l.length === 4;
});
await vrai("écriture au journal AC", async () =>
  (await un(P, `select j.code from public.documents_achat d join public.ecritures e on e.id=d.ecriture_id
    join public.journaux j on j.id=e.journal_id where d.id=$1`, [fa])).code === "AC");
await echoue("facture validée non modifiable", () =>
  en(null, "update public.documents_achat set total_ttc=1 where id=$1", [fa]), "ne peut plus être modifié");
await echoue("lignes validées non modifiables", () =>
  en(null, "update public.lignes_documents_achat set prix_unitaire=1 where document_id=$1", [fa]), "ne peuvent plus être modifiées");
await echoue("facture validée non supprimable", () => en(G, "select public.supprimer_document_achat($1)", [fa]), "ne peut pas être supprimé");
await echoue("écriture d'achat non contre-passable à la main", () =>
  en(P, "select public.contre_passer_ecriture((select ecriture_id from public.documents_achat where id=$1))", [fa]), "achats");

const doublon = (await un(G, `select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,' gm-778 ') id`, [e, bPlateau, four.id, aujourdhui,
  L_({ designation: "Farine", quantite: 1, prix_unitaire: 1000 })])).id;
await echoue("même facture fournisseur saisie deux fois refusée", () =>
  en(G, "select public.valider_document_achat($1)", [doublon]), "déjà enregistrée");
await en(G, "select public.supprimer_document_achat($1)", [doublon]);

console.log("Paiements");
const CA = (await un(P, "select id from public.journaux where entreprise_id=$1 and code='CA'", [e])).id;
const BQ = (await un(P, "select id from public.journaux where entreprise_id=$1 and code='BQ'", [e])).id;
await en(G, "select public.enregistrer_paiement_fournisseur($1, 100000, $2, 'especes')", [fa, CA]);
await vrai("acompte 100 000 : reste 173 020", async () =>
  (await un(G, "select (total_ttc - montant_paye - montant_avoir)::int r from public.documents_achat where id=$1", [fa])).r === 173020);
await echoue("dépassement du reste à payer refusé", () =>
  en(G, "select public.enregistrer_paiement_fournisseur($1, 200000, $2, 'virement')", [fa, BQ]), "dépasse le reste");
await en(G, "select public.enregistrer_paiement_fournisseur($1, 173020, $2, 'virement', current_date, 'VIR-55')", [fa, BQ]);
await vrai("soldée ; écritures de trésorerie (401 D, 571 C puis 521 C)", async () => {
  const d = await un(P, "select (total_ttc - montant_paye)::int r from public.documents_achat where id=$1", [fa]);
  const l = await en(P, `select c.numero from public.paiements_fournisseurs p
    join public.ecriture_lignes l on l.ecriture_id=p.ecriture_id join public.comptes c on c.id=l.compte_id
    where p.document_id=$1 order by p.created_at, l.ordre`, [fa]);
  return d.r === 0 && l.map((x) => x.numero).join(",") === "401,571,401,521";
});
await vrai("compte fournisseur 401 soldé dans la balance", async () => {
  const ex = (await un(P, "select id from public.exercices where entreprise_id=$1", [e])).id;
  const b = await en(P, "select * from public.balance_generale($1,$2) where numero='401'", [e, ex]);
  return Number(b[0].solde_debiteur) === 0 && Number(b[0].solde_crediteur) === 0;
});
await echoue("paiement non modifiable", () => en(null, "update public.paiements_fournisseurs set montant=1"), "ni modifié");

console.log("Paiement comptant et avoir");
const fa2 = (await un(G, `select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,'GM-779') id`,
  [e, bPlateau, four.id, aujourdhui, L_({ designation: "Farine", quantite: 1, prix_unitaire: 10000 })])).id;
await en(G, "select public.valider_document_achat($1, $2::jsonb)", [fa2, JSON.stringify({ montant: 11800, journal_id: CA, mode: "especes" })]);
await vrai(`FF-${annee}-00002 payée comptant (11 800)`, async () => {
  const d = await un(G, "select numero, montant_paye::int m from public.documents_achat where id=$1", [fa2]);
  return d.numero === `FF-${annee}-00002` && d.m === 11800;
});
await echoue("avoir impossible sur facture payée", () => en(G, "select public.creer_avoir_achat($1,'Erreur')", [fa2]), "déjà des paiements");
const fa3 = (await un(G, `select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,'GM-780') id`,
  [e, bPlateau, four.id, aujourdhui, L_({ designation: "Farine", quantite: 2, prix_unitaire: 10000 })])).id;
await en(G, "select public.valider_document_achat($1)", [fa3]);
await echoue("avoir sans motif refusé", () => en(G, "select public.creer_avoir_achat($1,'  ')", [fa3]), "motif");
const av = (await un(G, "select public.creer_avoir_achat($1,'Marchandise avariée', current_date, 'AV-GM-12') id", [fa3])).id;
await vrai(`avoir AF-${annee}-00001 ; facture soldée par l'avoir`, async () => {
  const a = await un(P, "select numero, numero_fournisseur nf, total_ttc::int t from public.documents_achat where id=$1", [av]);
  const f = await un(P, "select (total_ttc - montant_paye - montant_avoir)::int r from public.documents_achat where id=$1", [fa3]);
  return a.numero === `AF-${annee}-00001` && a.nf === "AV-GM-12" && a.t === 23600 && f.r === 0;
});
await vrai("écriture d'avoir : 401 D, 601 C, 4452 C", async () => {
  const l = await lignesEcriture(av);
  return l.map((x) => `${x.numero}:${x.d || -x.c}`).join(",") === "401:23600,601:-20000,4452:-3600";
});

console.log("Visibilité et situation");
const faPrinc = (await un(P, `select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,'GM-900') id`,
  [e, bPrinc, four.id, aujourdhui, L_({ designation: "Farine", quantite: 1, prix_unitaire: 1000 })])).id;
await vrai("le gestionnaire Plateau ne voit pas les achats de la boutique principale", async () =>
  (await en(G, "select * from public.documents_achat where id=$1", [faPrinc])).length === 0);
await vrai("le vendeur ne voit aucun achat", async () =>
  (await en(V, "select * from public.documents_achat where entreprise_id=$1", [e])).length === 0);
await vrai("le lecteur voit tous les achats", async () =>
  (await en(L, "select * from public.documents_achat where entreprise_id=$1", [e])).length >= 5);
await vrai("situation fournisseur : 3 factures, reste à payer 0", async () => {
  const s = await un(P, "select nb_factures, reste_a_payer::int r from public.situation_fournisseurs($1) where fournisseur_id=$2", [e, four.id]);
  return s.nb_factures === 3 && s.r === 0;
});
await vrai("balance de l'entreprise toujours équilibrée", async () => {
  const ex = (await un(P, "select id from public.exercices where entreprise_id=$1", [e])).id;
  const b = await un(P, "select sum(total_debit)::bigint d, sum(total_credit)::bigint c from public.balance_generale($1,$2)", [e, ex]);
  return b.d === b.c && Number(b.d) > 0;
});

process.exitCode = bilan() ? 1 : 0;
