// Tests de la comptabilité : plan, journaux, écritures, équilibre, immuabilité,
// numérotation, contre-passation, saisie simplifiée, balance, droits par rôle.
// Lancer : pnpm test:db
import { creerBase } from "./outils.mjs";

const { en, vrai, echoue, creerUser, bilan } = await creerBase();
const annee = new Date().getFullYear();
const jour = (m, j) => `${annee}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;

const P = await creerUser("proprio@exemple.sn", "Propriétaire");
const CPT = await creerUser("compta@exemple.sn", "Comptable");
const V = await creerUser("vendeur@exemple.sn", "Vendeur");
const L = await creerUser("lecteur@exemple.sn", "Lecteur");
const X = await creerUser("externe@exemple.sn", "Externe");

const e = (await en(P, "select public.creer_entreprise('Compta Test SARL','SN') as id"))[0].id;
for (const [u, role] of [[CPT, "comptable"], [V, "vendeur"], [L, "lecteur"]]) {
  await en(P, "select public.inviter_membre($1, $2, $3)", [e, u.email, role]);
  await en(u, "select public.accepter_invitations()");
}
const eX = (await en(X, "select public.creer_entreprise('Autre SA','CI') as id"))[0].id;

const compte = async (num, ent = e) =>
  (await en(null, "select id from public.comptes where entreprise_id=$1 and numero=$2", [ent, num]))[0]?.id;
const journal = async (code, ent = e) =>
  (await en(null, "select id from public.journaux where entreprise_id=$1 and code=$2", [ent, code]))[0]?.id;

console.log("Initialisation");
await vrai("plan de base copié (≥ 200 comptes)", async () =>
  (await en(P, "select count(*)::int n from public.comptes where entreprise_id=$1", [e]))[0].n >= 200);
await vrai("443 est un compte de regroupement, 4431 mouvementable", async () => {
  const r = await en(P, "select numero, mouvementable from public.comptes where entreprise_id=$1 and numero in ('443','4431') order by numero", [e]);
  return r[0].mouvementable === false && r[1].mouvementable === true;
});
await vrai("7 journaux créés (AC VT BQ CA MM OD AN)", async () =>
  (await en(P, "select count(*)::int n from public.journaux where entreprise_id=$1", [e]))[0].n === 7);
await vrai("journal CA lié au compte 571", async () =>
  (await en(P, "select c.numero from public.journaux j join public.comptes c on c.id=j.compte_tresorerie_id where j.entreprise_id=$1 and j.code='CA'", [e]))[0].numero === "571");
await vrai(`exercice ${annee} ouvert`, async () =>
  (await en(P, "select statut from public.exercices where entreprise_id=$1", [e]))[0].statut === "ouvert");
await vrai("le vendeur voit le plan comptable (listes de choix)", async () =>
  (await en(V, "select count(*)::int n from public.comptes where entreprise_id=$1", [e]))[0].n > 0);
await vrai("l'externe ne voit pas le plan de l'entreprise", async () =>
  (await en(X, "select count(*)::int n from public.comptes where entreprise_id=$1", [e]))[0].n === 0);

const OD = await journal("OD");
const CA = await journal("CA");
const lignes = (...l) => JSON.stringify(l);

console.log("Saisie et validation");
await echoue("écriture déséquilibrée refusée", () =>
  en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Test',$4::jsonb, p_valider => true)",
    [e, OD, jour(3, 1), lignes({ compte: "601", debit: 1000 }, { compte: "401", credit: 900 })]), "déséquilibrée");
await echoue("compte de regroupement refusé", () =>
  en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Test',$4::jsonb)",
    [e, OD, jour(3, 1), lignes({ compte: "443", debit: 1000 }, { compte: "401", credit: 1000 })]), "regroupement");
await echoue("ligne débit ET crédit refusée", () =>
  en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Test',$4::jsonb)",
    [e, OD, jour(3, 1), lignes({ compte: "601", debit: 1000, credit: 5 }, { compte: "401", credit: 995 })]), "débit OU au crédit");
await echoue("montant décimal refusé", () =>
  en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Test',$4::jsonb)",
    [e, OD, jour(3, 1), lignes({ compte: "601", debit: "10.5" }, { compte: "401", credit: "10.5" })]), "entiers");
await echoue("date hors exercice refusée", () =>
  en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Test',$4::jsonb)",
    [e, OD, `${annee + 3}-01-01`, lignes({ compte: "601", debit: 1 }, { compte: "401", credit: 1 })]), "Aucun exercice");
await echoue("compte d'une autre entreprise refusé", async () =>
  en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Test',$4::jsonb)",
    [e, OD, jour(3, 1), lignes({ compte_id: await compte("601", eX), debit: 1 }, { compte: "401", credit: 1 })]), "introuvable");
await echoue("le vendeur ne peut pas saisir", () =>
  en(V, "select public.enregistrer_ecriture($1,$2,$3,'Test',$4::jsonb)",
    [e, OD, jour(3, 1), lignes({ compte: "601", debit: 1 }, { compte: "401", credit: 1 })]), "Droits insuffisants");
await echoue("le lecteur ne peut pas saisir", () =>
  en(L, "select public.enregistrer_ecriture($1,$2,$3,'Test',$4::jsonb)",
    [e, OD, jour(3, 1), lignes({ compte: "601", debit: 1 }, { compte: "401", credit: 1 })]), "Droits insuffisants");
await echoue("insertion directe interdite", () =>
  en(CPT, "insert into public.ecritures (entreprise_id, exercice_id, journal_id, date_ecriture, libelle) select $1, id, $2, current_date, 'x' from public.exercices where entreprise_id=$1", [e, OD]), "permission denied");

// Achat de marchandises 100 000 HT + TVA 18 % = 118 000
const brouillon = (await en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Facture F-001',$4::jsonb, 'F-001') as id",
  [e, await journal("AC"), jour(3, 5), lignes(
    { compte: "601", debit: 100000 }, { compte: "4452", debit: 18000 }, { compte: "401", credit: 118000 })]))[0].id;
await vrai("brouillon enregistré sans numéro", async () => {
  const r = (await en(CPT, "select statut, numero from public.ecritures where id=$1", [brouillon]))[0];
  return r.statut === "brouillon" && r.numero === null;
});
await vrai("le brouillon est modifiable", async () => {
  await en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Facture F-001 (corrigée)',$4::jsonb, 'F-001', p_ecriture_id => $5)",
    [e, await journal("AC"), jour(3, 5), lignes(
      { compte: "601", debit: 200000 }, { compte: "4452", debit: 36000 }, { compte: "401", credit: 236000 }), brouillon]);
  return (await en(CPT, "select sum(debit)::int s from public.ecriture_lignes where ecriture_id=$1", [brouillon]))[0].s === 236000;
});
await vrai("validation : numéro AC-AAAA-00001", async () =>
  (await en(CPT, "select public.valider_ecriture($1) n", [brouillon]))[0].n === `AC-${annee}-00001`);
await echoue("écriture validée non modifiable", () =>
  en(null, "update public.ecritures set libelle='fraude' where id=$1", [brouillon]), "ne peut plus être modifiée");
await echoue("lignes validées non modifiables (même superutilisateur)", () =>
  en(null, "update public.ecriture_lignes set debit=1 where ecriture_id=$1", [brouillon]), "ne peuvent plus être modifiées");
await echoue("écriture validée non supprimable", () =>
  en(CPT, "select public.supprimer_brouillon($1)", [brouillon]), "ne peut plus être modifiée");

console.log("Numérotation");
const n2 = (await en(P, "select public.enregistrer_ecriture($1,$2,$3,'Facture F-002',$4::jsonb, p_valider => true) id",
  [e, await journal("AC"), jour(3, 6), lignes({ compte: "601", debit: 5000 }, { compte: "401", credit: 5000 })]))[0].id;
const b3 = (await en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Brouillon abandonné',$4::jsonb) id",
  [e, await journal("AC"), jour(3, 7), lignes({ compte: "601", debit: 1 }, { compte: "401", credit: 1 })]))[0].id;
await en(CPT, "select public.supprimer_brouillon($1)", [b3]);
await en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Facture F-003',$4::jsonb, p_valider => true)",
  [e, await journal("AC"), jour(3, 8), lignes({ compte: "601", debit: 7000 }, { compte: "401", credit: 7000 })]);
await vrai("pas de trou malgré le brouillon supprimé (00001, 00002, 00003)", async () => {
  const r = await en(CPT, "select numero from public.ecritures where entreprise_id=$1 and journal_id=$2 and statut='validee' order by numero", [e, await journal("AC")]);
  return r.map((x) => x.numero).join(",") === [1, 2, 3].map((n) => `AC-${annee}-0000${n}`).join(",");
});
await vrai("numérotation indépendante par journal (OD-…-00001)", async () => {
  const id = (await en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'OD',$4::jsonb, p_valider => true) id",
    [e, OD, jour(3, 9), lignes({ compte: "658", debit: 100 }, { compte: "471", credit: 100 })]))[0].id;
  return (await en(CPT, "select numero from public.ecritures where id=$1", [id]))[0].numero === `OD-${annee}-00001`;
});

console.log("Contre-passation");
const cp = (await en(CPT, "select public.contre_passer_ecriture($1, $2) id", [n2, jour(3, 10)]))[0].id;
await vrai("contre-passation validée, montants inversés", async () => {
  const l = await en(CPT, "select c.numero, l.debit, l.credit from public.ecriture_lignes l join public.comptes c on c.id=l.compte_id where l.ecriture_id=$1 order by l.ordre", [cp]);
  return l[0].numero === "601" && Number(l[0].credit) === 5000 && l[1].numero === "401" && Number(l[1].debit) === 5000;
});
await echoue("double contre-passation refusée", () =>
  en(CPT, "select public.contre_passer_ecriture($1)", [n2]), "déjà été contre-passée");

console.log("Saisie simplifiée");
const opRecette = (await en(CPT, "select public.enregistrer_operation_simple($1,'recette',$2,250000,$3,$4,'Ventes du jour') id",
  [e, jour(3, 11), CA, await compte("701")]))[0].id;
await vrai("recette : débit 571 / crédit 701, validée, origine « simple »", async () => {
  const l = await en(CPT, "select c.numero, l.debit, l.credit, e.statut, e.origine from public.ecriture_lignes l join public.comptes c on c.id=l.compte_id join public.ecritures e on e.id=l.ecriture_id where l.ecriture_id=$1 order by l.ordre", [opRecette]);
  return l[0].numero === "571" && Number(l[0].debit) === 250000 && l[1].numero === "701" && Number(l[1].credit) === 250000
    && l[0].statut === "validee" && l[0].origine === "simple";
});
await en(CPT, "select public.enregistrer_operation_simple($1,'depense',$2,45000,$3,$4,'Facture SENELEC')",
  [e, jour(3, 12), CA, await compte("6052")]);
await echoue("montant nul refusé", async () =>
  en(CPT, "select public.enregistrer_operation_simple($1,'depense',$2,0,$3,$4,'x')", [e, jour(3, 12), CA, await compte("6052")]), "supérieur à zéro");
await echoue("journal sans trésorerie refusé", async () =>
  en(CPT, "select public.enregistrer_operation_simple($1,'depense',$2,10,$3,$4,'x')", [e, jour(3, 12), OD, await compte("6052")]), "caisse, une banque");

console.log("Balance et grand livre");
const ex = (await en(P, "select id from public.exercices where entreprise_id=$1", [e]))[0].id;
await vrai("balance équilibrée (Σ débits = Σ crédits)", async () => {
  const r = (await en(L, "select sum(total_debit)::bigint d, sum(total_credit)::bigint c from public.balance_generale($1,$2)", [e, ex]))[0];
  return Number(r.d) > 0 && r.d === r.c;
});
await vrai("caisse 571 : solde débiteur 205 000 (250 000 − 45 000)", async () =>
  Number((await en(L, "select solde_debiteur from public.balance_generale($1,$2) where numero='571'", [e, ex]))[0].solde_debiteur) === 205000);
await vrai("brouillons exclus de la balance", async () => {
  await en(CPT, "select public.enregistrer_ecriture($1,$2,$3,'Brouillon',$4::jsonb)",
    [e, OD, jour(3, 13), lignes({ compte: "571", debit: 999999 }, { compte: "701", credit: 999999 })]);
  return Number((await en(L, "select solde_debiteur from public.balance_generale($1,$2) where numero='571'", [e, ex]))[0].solde_debiteur) === 205000;
});
await vrai("grand livre 571 : solde progressif", async () => {
  const r = await en(L, "select debit, credit, solde from public.grand_livre($1,$2,$3)", [e, await compte("571"), ex]);
  return r.length === 2 && Number(r[1].solde) === 205000;
});
await vrai("le vendeur ne voit aucune écriture", async () =>
  (await en(V, "select count(*)::int n from public.ecritures")).length === 1 &&
  (await en(V, "select count(*)::int n from public.ecritures"))[0].n === 0);
await vrai("le vendeur obtient une balance vide", async () =>
  (await en(V, "select * from public.balance_generale($1,$2)", [e, ex])).length === 0);
await vrai("l'externe ne voit aucune écriture de l'entreprise", async () =>
  (await en(X, "select count(*)::int n from public.ecritures where entreprise_id=$1", [e]))[0].n === 0);

console.log("Plan comptable et journaux");
const c4111 = (await en(CPT, "select public.creer_compte($1,'4111','Clients — grossistes') id", [e]))[0].id;
await vrai("sous-compte 4111 créé, 411 devient compte de regroupement", async () =>
  c4111 && (await en(CPT, "select mouvementable from public.comptes where entreprise_id=$1 and numero='411'", [e]))[0].mouvementable === false);
await vrai("parent déjà mouvementé : il reste mouvementable", async () => {
  await en(CPT, "select public.creer_compte($1,'6011','Achats de marchandises — local')", [e]);
  return (await en(CPT, "select mouvementable from public.comptes where entreprise_id=$1 and numero='601'", [e]))[0].mouvementable === true;
});
await echoue("compte sans parent refusé", () => en(CPT, "select public.creer_compte($1,'999','Orphelin')", [e]), "rattaché");
await echoue("le lecteur ne crée pas de compte", () => en(L, "select public.creer_compte($1,'4112','X')", [e]), "Droits insuffisants");
await vrai("2e banque : sous-compte 5212 + journal BQ2", async () => {
  await en(CPT, "select public.creer_compte($1,'5211','Banque A')", [e]);
  const c = (await en(CPT, "select public.creer_compte($1,'5212','Banque B') id", [e]))[0].id;
  await en(CPT, "select public.creer_journal($1,'BQ2','Banque B','banque',$2)", [e, c]);
  return (await en(CPT, "select count(*)::int n from public.journaux where entreprise_id=$1 and code='BQ2'", [e]))[0].n === 1;
});
await echoue("journal banque sur compte hors classe 5 refusé", async () =>
  en(CPT, "select public.creer_journal($1,'BQ3','X','banque',$2)", [e, await compte("701")]), "classe 5");
await echoue("exercice chevauchant refusé", () =>
  en(CPT, "select public.creer_exercice($1,'X',$2,$3)", [e, jour(6, 1), `${annee + 1}-05-31`]), "chevauche");
await vrai("exercice suivant créé", async () =>
  (await en(CPT, "select public.creer_exercice($1,$2,$3,$4) id", [e, String(annee + 1), `${annee + 1}-01-01`, `${annee + 1}-12-31`]))[0].id);
await echoue("le comptable ne peut pas changer le numéro d'un compte", () =>
  en(CPT, "update public.comptes set numero='7011' where entreprise_id=$1 and numero='701'", [e]), "permission denied");

process.exitCode = bilan() ? 1 : 0;
