// Tests des ventes : calculs, numérotation, écritures automatiques, règlements, avoirs, droits.
// Lancer : pnpm test:db
import { creerBase } from "./outils.mjs";

const { en, vrai, echoue, creerUser, bilan } = await creerBase();
const annee = new Date().getFullYear();
const aujourdhui = new Date().toISOString().slice(0, 10);

const P = await creerUser("proprio@vente.sn", "Propriétaire");
const V = await creerUser("vendeur@vente.sn", "Vendeur");
const G = await creerUser("gestion@vente.sn", "Gestionnaire");
const L = await creerUser("lecteur@vente.sn", "Lecteur");
const X = await creerUser("externe@vente.sn", "Externe");

const e = (await en(P, "select public.creer_entreprise('Ventes Test SARL','SN') as id"))[0].id;
const bPrinc = (await en(P, "select id from public.boutiques where entreprise_id=$1", [e]))[0].id;
const bPlateau = (await en(P, "insert into public.boutiques (entreprise_id, code, nom) values ($1,'PLATEAU','Plateau') returning id", [e]))[0].id;
// Vendeur limité à la boutique Plateau
await en(P, "select public.inviter_membre($1,$2,'vendeur',false,array[$3]::uuid[])", [e, V.email, bPlateau]);
await en(V, "select public.accepter_invitations()");
for (const [u, r] of [[G, "gestionnaire"], [L, "lecteur"]]) {
  await en(P, "select public.inviter_membre($1,$2,$3)", [e, u.email, r]);
  await en(u, "select public.accepter_invitations()");
}
const eNE = (await en(X, "select public.creer_entreprise('Niamey SA','NE') as id"))[0].id;

const un = async (u, sql, p) => (await en(u, sql, p))[0];
const L_ = (...l) => JSON.stringify(l);

console.log("Initialisation");
await vrai("TVA 18 % par défaut (Sénégal) + Exonéré", async () => {
  const r = await en(P, "select libelle, taux::float, par_defaut from public.taux_tva where entreprise_id=$1 order by taux desc", [e]);
  return r.length === 2 && r[0].taux === 18 && r[0].par_defaut && r[1].taux === 0;
});
await vrai("TVA 19 % au Niger", async () =>
  (await un(X, "select taux::float t from public.taux_tva where entreprise_id=$1 and par_defaut", [eNE])).t === 19);
await vrai("client « Clients divers » créé", async () =>
  (await un(P, "select nom from public.clients where entreprise_id=$1 and code='CL0000'", [e])).nom === "Clients divers");
await vrai("paramètres : 411, VT, 701, 706", async () => {
  const r = await un(P, `select c1.numero a, j.code b, c2.numero c, c3.numero d from public.parametres_vente p
    join public.comptes c1 on c1.id=p.compte_clients_id join public.journaux j on j.id=p.journal_ventes_id
    join public.comptes c2 on c2.id=p.compte_ventes_biens_id join public.comptes c3 on c3.id=p.compte_ventes_services_id
    where p.entreprise_id=$1`, [e]);
  return r.a === "411" && r.b === "VT" && r.c === "701" && r.d === "706";
});

console.log("Clients et articles");
const client = (await un(V, "insert into public.clients (entreprise_id, nom, telephone) values ($1,'Boutique Ndiaye','771234567') returning id, code", [e]));
await vrai("code client automatique CL0001", async () => client.code === "CL0001");
await echoue("le vendeur ne crée pas d'article", () =>
  en(V, "insert into public.articles (entreprise_id, designation, prix_vente) values ($1,'Riz 25 kg',15000)", [e]), "row-level security");
const riz = (await un(G, "insert into public.articles (entreprise_id, reference, designation, prix_vente, unite) values ($1,'RIZ25','Riz parfumé 25 kg',15000,'sac') returning id", [e])).id;
const livraison = (await un(G, "insert into public.articles (entreprise_id, designation, type, prix_vente) values ($1,'Livraison Dakar','service',2500) returning id", [e])).id;
const exo = (await un(P, "select id from public.taux_tva where entreprise_id=$1 and taux=0", [e])).id;
await echoue("l'externe ne voit pas les clients", async () => {
  if ((await en(X, "select * from public.clients where entreprise_id=$1", [e])).length === 0) throw new Error("invisible");
});

console.log("Facture : calculs");
const fa = (await un(V, `select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb) id`, [e, bPlateau, client.id, aujourdhui, L_(
  { article_id: riz, quantite: 3 },                                            // 45 000 HT, TVA 8 100
  { article_id: livraison, quantite: 1, remise_pct: 10 },                      // 2 250 HT, TVA 405
  { designation: "Sachets (exonéré)", quantite: 2.5, prix_unitaire: 333, taux_tva_id: exo }, // 832.5 → 833 HT
)])).id;
await vrai("totaux : HT 48 083, TVA 8 505, TTC 56 588", async () => {
  const d = await un(V, "select total_ht::int ht, total_tva::int tva, total_ttc::int ttc, statut, numero from public.documents_vente where id=$1", [fa]);
  return d.ht === 48083 && d.tva === 8505 && d.ttc === 56588 && d.statut === "brouillon" && d.numero === null;
});
await vrai("échéance par défaut à 30 jours", async () => {
  const d = await un(V, "select date_echeance - date_document n from public.documents_vente where id=$1", [fa]);
  return d.n === 30;
});
await echoue("vendeur : boutique non attribuée refusée", () =>
  en(V, `select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb)`, [e, bPrinc, client.id, aujourdhui, L_({ article_id: riz, quantite: 1 })]), "non autorisée");
await echoue("quantité négative refusée", () =>
  en(V, `select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb)`, [e, bPlateau, client.id, aujourdhui, L_({ article_id: riz, quantite: -1 })]), "quantité invalide");
await echoue("le lecteur ne vend pas", () =>
  en(L, `select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb)`, [e, bPlateau, client.id, aujourdhui, L_({ article_id: riz, quantite: 1 })]), "Droits insuffisants");
await echoue("insertion directe interdite", () =>
  en(V, "insert into public.documents_vente (entreprise_id, boutique_id, type, client_id) values ($1,$2,'facture',$3)", [e, bPlateau, client.id]), "permission denied");

console.log("Facture : validation et écriture");
const numFa = (await un(V, "select public.valider_document_vente($1) n", [fa])).n;
await vrai(`numéro FA-${annee}-00001`, async () => numFa === `FA-${annee}-00001`);
await vrai("écriture VT : 411 D 56 588 / 701 C 45 833 / 706 C 2 250 / 4431 C 8 505", async () => {
  const l = await en(P, `select c.numero, l.debit::int d, l.credit::int c, l.client_id from public.ecriture_lignes l
    join public.comptes c on c.id=l.compte_id join public.documents_vente d on d.ecriture_id=l.ecriture_id
    where d.id=$1 order by l.ordre`, [fa]);
  const m = Object.fromEntries(l.map((x) => [x.numero, x]));
  return m["411"].d === 56588 && m["411"].client_id === client.id && m["701"].c === 45833 && m["706"].c === 2250 && m["4431"].c === 8505;
});
await vrai("le vendeur ne voit pas l'écriture comptable", async () =>
  (await en(V, "select * from public.ecritures where entreprise_id=$1", [e])).length === 0);
await echoue("facture validée non modifiable", () =>
  en(null, "update public.documents_vente set total_ttc=1 where id=$1", [fa]), "ne peut plus être modifié");
await echoue("lignes validées non modifiables", () =>
  en(null, "update public.lignes_documents_vente set prix_unitaire=1 where document_id=$1", [fa]), "ne peuvent plus être modifiées");
await echoue("facture validée non supprimable", () => en(V, "select public.supprimer_document_vente($1)", [fa]), "ne peut pas être supprimé");
await echoue("écriture de vente non contre-passable à la main", async () =>
  en(P, "select public.contre_passer_ecriture((select ecriture_id from public.documents_vente where id=$1))", [fa]), "avoir");

console.log("Règlements");
const CA = (await un(P, "select id from public.journaux where entreprise_id=$1 and code='CA'", [e])).id;
const MM = (await un(P, "select id from public.journaux where entreprise_id=$1 and code='MM'", [e])).id;
await en(V, "select public.enregistrer_reglement($1, 30000, $2, 'especes')", [fa, CA]);
await vrai("acompte 30 000 : reste 26 588", async () =>
  (await un(V, "select (total_ttc - montant_regle - montant_avoir)::int r from public.documents_vente where id=$1", [fa])).r === 26588);
await echoue("dépassement du reste à payer refusé", () =>
  en(V, "select public.enregistrer_reglement($1, 30000, $2, 'mobile_money')", [fa, MM]), "dépasse le reste");
await en(V, "select public.enregistrer_reglement($1, 26588, $2, 'mobile_money', current_date, 'WAVE-123')", [fa, MM]);
await vrai("soldée ; écritures de trésorerie (571 D / 552 D, 411 C)", async () => {
  const d = await un(P, "select (total_ttc - montant_regle)::int r from public.documents_vente where id=$1", [fa]);
  const l = await en(P, `select c.numero, l.debit::int d, l.credit::int c from public.reglements r
    join public.ecriture_lignes l on l.ecriture_id=r.ecriture_id join public.comptes c on c.id=l.compte_id
    where r.document_id=$1 order by r.created_at, l.ordre`, [fa]);
  return d.r === 0 && l.map((x) => x.numero).join(",") === "571,411,552,411";
});
await vrai("compte client 411 soldé dans la balance", async () => {
  const ex = (await un(P, "select id from public.exercices where entreprise_id=$1", [e])).id;
  const b = await en(P, "select * from public.balance_generale($1,$2) where numero='411'", [e, ex]);
  return Number(b[0].solde_debiteur) === 0 && Number(b[0].solde_crediteur) === 0;
});
await echoue("règlement non modifiable", () => en(null, "update public.reglements set montant=1"), "ni modifié");

console.log("Paiement immédiat et avoir");
const fa2 = (await un(V, `select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb) id`,
  [e, bPlateau, client.id, aujourdhui, L_({ article_id: riz, quantite: 1 })])).id;
await en(V, "select public.valider_document_vente($1, $2::jsonb)", [fa2, JSON.stringify({ montant: 17700, journal_id: CA, mode: "especes" })]);
await vrai(`FA-${annee}-00002 payée au comptant (17 700)`, async () => {
  const d = await un(V, "select numero, montant_regle::int m from public.documents_vente where id=$1", [fa2]);
  return d.numero === `FA-${annee}-00002` && d.m === 17700;
});
await echoue("avoir impossible sur facture réglée", () => en(G, "select public.creer_avoir($1,'Erreur')", [fa2]), "déjà des règlements");
const fa3 = (await un(V, `select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb) id`,
  [e, bPlateau, client.id, aujourdhui, L_({ article_id: riz, quantite: 2 })])).id;
await en(V, "select public.valider_document_vente($1)", [fa3]);
await echoue("le vendeur ne fait pas d'avoir", () => en(V, "select public.creer_avoir($1,'Retour')", [fa3]), "Seuls les gestionnaires");
await echoue("avoir sans motif refusé", () => en(G, "select public.creer_avoir($1,'  ')", [fa3]), "motif");
const av = (await un(G, "select public.creer_avoir($1,'Marchandise retournée') id", [fa3])).id;
await vrai(`avoir AV-${annee}-00001 ; facture soldée par l'avoir`, async () => {
  const a = await un(P, "select numero, total_ttc::int t from public.documents_vente where id=$1", [av]);
  const f = await un(P, "select (total_ttc - montant_regle - montant_avoir)::int r from public.documents_vente where id=$1", [fa3]);
  return a.numero === `AV-${annee}-00001` && a.t === 35400 && f.r === 0;
});
await vrai("écriture d'avoir : 701 D, 4431 D, 411 C", async () => {
  const l = await en(P, `select c.numero, l.debit::int d, l.credit::int c from public.ecriture_lignes l
    join public.comptes c on c.id=l.compte_id join public.documents_vente d on d.ecriture_id=l.ecriture_id
    where d.id=$1 order by l.ordre`, [av]);
  return l.map((x) => `${x.numero}:${x.d || -x.c}`).join(",") === "701:30000,4431:5400,411:-35400";
});
await echoue("double avoir refusé", () => en(G, "select public.creer_avoir($1,'Encore')", [fa3]), "déjà des règlements ou un avoir");

console.log("Devis");
const dv = (await un(V, `select public.enregistrer_document_vente($1,'devis',$2,$3,$4,$5::jsonb) id`,
  [e, bPlateau, client.id, aujourdhui, L_({ article_id: riz, quantite: 10, remise_pct: 5 })])).id;
await vrai(`devis validé DV-${annee}-00001, sans écriture`, async () => {
  const n = (await un(V, "select public.valider_document_vente($1) n", [dv])).n;
  const d = await un(V, "select ecriture_id from public.documents_vente where id=$1", [dv]);
  return n === `DV-${annee}-00001` && d.ecriture_id === null;
});
const faDv = (await un(V, "select public.transformer_devis($1) id", [dv])).id;
await vrai("devis transformé en facture brouillon (mêmes lignes et totaux)", async () => {
  const f = await un(V, "select statut, total_ttc::int t, document_origine_id o from public.documents_vente where id=$1", [faDv]);
  const d = await un(V, "select statut, total_ttc::int t from public.documents_vente where id=$1", [dv]);
  return f.statut === "brouillon" && f.t === d.t && f.o === dv && d.statut === "transforme";
});
await echoue("devis transformé deux fois refusé", () => en(V, "select public.transformer_devis($1)", [dv]), "Seul un devis validé");

console.log("Visibilité et situation");
const faPrinc = (await un(P, `select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb) id`,
  [e, bPrinc, client.id, aujourdhui, L_({ article_id: riz, quantite: 1 })])).id;
await vrai("le vendeur Plateau ne voit pas les documents de la boutique principale", async () =>
  (await en(V, "select * from public.documents_vente where id=$1", [faPrinc])).length === 0);
await vrai("le lecteur voit tous les documents", async () =>
  (await en(L, "select * from public.documents_vente where entreprise_id=$1", [e])).length >= 6);
await vrai("situation client : 3 factures, reste dû 0", async () => {
  const s = await un(P, "select nb_factures, reste_du::int r from public.situation_clients($1) where client_id=$2", [e, client.id]);
  return s.nb_factures === 3 && s.r === 0;
});
await vrai("balance de l'entreprise toujours équilibrée", async () => {
  const ex = (await un(P, "select id from public.exercices where entreprise_id=$1", [e])).id;
  const b = await un(P, "select sum(total_debit)::bigint d, sum(total_credit)::bigint c from public.balance_generale($1,$2)", [e, ex]);
  return b.d === b.c && Number(b.d) > 0;
});

process.exitCode = bilan() ? 1 : 0;
