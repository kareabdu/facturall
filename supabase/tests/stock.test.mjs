// Tests du stock : CMUP, mouvements automatiques (achats, ventes, avoirs), transferts, inventaires, droits.
// Lancer : pnpm test:db
import { creerBase } from "./outils.mjs";

const { en, vrai, echoue, creerUser, bilan } = await creerBase();
const annee = new Date().getFullYear();
const aujourdhui = new Date().toISOString().slice(0, 10);

const P = await creerUser("proprio@stock.sn", "Propriétaire");
const G = await creerUser("gestion@stock.sn", "Gestionnaire");
const V = await creerUser("vendeur@stock.sn", "Vendeur");
const L = await creerUser("lecteur@stock.sn", "Lecteur");

const e = (await en(P, "select public.creer_entreprise('Stock Test SARL','SN') as id"))[0].id;
const bPrinc = (await en(P, "select id from public.boutiques where entreprise_id=$1", [e]))[0].id;
const bPlateau = (await en(P, "insert into public.boutiques (entreprise_id, code, nom) values ($1,'PLATEAU','Plateau') returning id", [e]))[0].id;
await en(P, "select public.inviter_membre($1,$2,'gestionnaire',false,array[$3]::uuid[])", [e, G.email, bPlateau]);
await en(G, "select public.accepter_invitations()");
for (const [u, r] of [[V, "vendeur"], [L, "lecteur"]]) {
  await en(P, "select public.inviter_membre($1,$2,$3)", [e, u.email, r]);
  await en(u, "select public.accepter_invitations()");
}

const un = async (u, sql, p) => (await en(u, sql, p))[0];
const L_ = (...l) => JSON.stringify(l);
const stock = (b, a) => un(P, "select quantite::float q, valeur::int v, cmup::int c from public.stocks where boutique_id=$1 and article_id=$2", [b, a]);
const egal = (s, q, v, c) => s && s.q === q && s.v === v && s.c === c;

console.log("Articles stockés");
const riz = (await un(P, "insert into public.articles (entreprise_id, designation, prix_vente, suivi_stock, seuil_alerte) values ($1,'Riz 25 kg',15000,true,5) returning id", [e])).id;
const huile = (await un(P, "insert into public.articles (entreprise_id, designation, prix_vente) values ($1,'Huile 5 L',6000) returning id", [e])).id;
await echoue("un service ne peut pas être suivi en stock", () =>
  en(P, "insert into public.articles (entreprise_id, designation, type, suivi_stock) values ($1,'Livraison','service',true)", [e]), "articles_suivi_stock_biens");
await vrai("paramètres : stock négatif interdit par défaut", async () =>
  (await un(P, "select autoriser_stock_negatif a from public.parametres_stock where entreprise_id=$1", [e])).a === false);

console.log("Entrée manuelle (stock initial)");
await en(P, "select public.ajuster_stock($1,$2,$3,10,'Stock initial',10000)", [e, bPrinc, riz]);
await vrai("10 riz à 10 000 : valeur 100 000, CMUP 10 000", async () => egal(await stock(bPrinc, riz), 10, 100000, 10000));
await echoue("motif obligatoire", () => en(P, "select public.ajuster_stock($1,$2,$3,1,' ')", [e, bPrinc, riz]), "motif");
await echoue("article non suivi refusé", () => en(P, "select public.ajuster_stock($1,$2,$3,1,'Test',100)", [e, bPrinc, huile]), "pas suivi en stock");
await echoue("le vendeur ne gère pas le stock", () => en(V, "select public.ajuster_stock($1,$2,$3,1,'Test',100)", [e, bPrinc, riz]), "Droits insuffisants");
await echoue("gestionnaire : boutique non attribuée refusée", () =>
  en(G, "select public.ajuster_stock($1,$2,$3,1,'Test',100)", [e, bPrinc, riz]), "non autorisée");
await echoue("écriture directe dans les stocks interdite", () =>
  en(P, "update public.stocks set quantite=1000 where article_id=$1", [riz]), "permission denied");

console.log("Achats : entrées au coût d'achat HT");
const four = (await un(P, "insert into public.fournisseurs (entreprise_id, nom) values ($1,'Sodiz') returning id", [e])).id;
const fa1 = (await un(P, "select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,'SZ-1') id", [e, bPrinc, four, aujourdhui,
  L_({ article_id: riz, quantite: 10, prix_unitaire: 12000 }, { article_id: huile, quantite: 4, prix_unitaire: 4000 })])).id;
await vrai("brouillon : aucun mouvement", async () => egal(await stock(bPrinc, riz), 10, 100000, 10000));
await en(P, "select public.valider_document_achat($1)", [fa1]);
await vrai("+10 à 12 000 : 20 riz, valeur 220 000, CMUP 11 000", async () => egal(await stock(bPrinc, riz), 20, 220000, 11000));
await vrai("l'huile (non suivie) n'a pas de stock", async () => (await stock(bPrinc, huile)) === undefined);
const fa2 = (await un(P, "select public.enregistrer_document_achat($1,$2,$3,$4,$5::jsonb,'SZ-2') id", [e, bPrinc, four, aujourdhui,
  L_({ article_id: riz, quantite: 5, prix_unitaire: 13000, remise_pct: 10 })])).id;
await en(P, "select public.valider_document_achat($1)", [fa2]);
await vrai("+5 à 13 000 remisé 10 % (58 500) : 25 riz, valeur 278 500, CMUP 11 140", async () =>
  egal(await stock(bPrinc, riz), 25, 278500, 11140));
await vrai("mouvement d'achat relié à la facture", async () => {
  const m = await un(P, "select type, quantite::float q, valeur::int v, cout_unitaire::int c from public.mouvements_stock where document_achat_id=$1", [fa2]);
  return m.type === "entree_achat" && m.q === 5 && m.v === 58500 && m.c === 11700;
});

console.log("Ventes : sorties au CMUP");
const client = (await un(V, "insert into public.clients (entreprise_id, nom) values ($1,'Awa Diop') returning id", [e])).id;
const fv1 = (await un(V, "select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb) id", [e, bPrinc, client, aujourdhui,
  L_({ article_id: riz, quantite: 2 }, { article_id: riz, quantite: 1 }, { article_id: huile, quantite: 1 })])).id;
await vrai(`facture FA-${annee}-00001 validée par le vendeur`, async () =>
  (await un(V, "select public.valider_document_vente($1) n", [fv1])).n === `FA-${annee}-00001`);
await vrai("-3 au CMUP : 22 riz, valeur 245 080, CMUP inchangé", async () => egal(await stock(bPrinc, riz), 22, 245080, 11140));
const fv2 = (await un(V, "select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb) id", [e, bPrinc, client, aujourdhui,
  L_({ article_id: riz, quantite: 30 })])).id;
await echoue("vente au-delà du stock refusée", () => en(V, "select public.valider_document_vente($1)", [fv2]), "Stock insuffisant");
await vrai("la facture refusée reste en brouillon, stock intact", async () => {
  const d = await un(V, "select statut, numero from public.documents_vente where id=$1", [fv2]);
  return d.statut === "brouillon" && d.numero === null && egal(await stock(bPrinc, riz), 22, 245080, 11140);
});
await en(V, "select public.enregistrer_document_vente($1,'facture',$2,$3,$4,$5::jsonb,null,null,null,$6)",
  [e, bPrinc, client, aujourdhui, L_({ article_id: riz, quantite: 2 }), fv2]);
await vrai(`numérotation sans trou : FA-${annee}-00002`, async () =>
  (await un(V, "select public.valider_document_vente($1) n", [fv2])).n === `FA-${annee}-00002`);
await vrai("22 - 2 : 20 riz, valeur 222 800", async () => egal(await stock(bPrinc, riz), 20, 222800, 11140));

console.log("Visibilité");
await vrai("le vendeur ne voit ni stocks ni mouvements (coûts)", async () =>
  (await en(V, "select * from public.stocks where entreprise_id=$1", [e])).length === 0
  && (await en(V, "select * from public.mouvements_stock where entreprise_id=$1", [e])).length === 0);
await vrai("le vendeur voit les quantités disponibles", async () => {
  const d = await en(V, "select article_id, quantite::float q from public.disponibilites_stock($1,$2)", [e, bPrinc]);
  return d.length === 1 && d[0].article_id === riz && d[0].q === 20;
});
await vrai("le lecteur voit les stocks valorisés", async () =>
  (await en(L, "select * from public.stocks where entreprise_id=$1", [e])).length === 1);
await vrai("le gestionnaire Plateau ne voit pas le stock de la boutique principale", async () =>
  (await en(G, "select * from public.stocks where boutique_id=$1", [bPrinc])).length === 0);

console.log("Avoirs : retours");
await en(P, "select public.creer_avoir($1,'Retour client')", [fv1]);
await vrai("avoir client : +3 au coût de sortie (33 420) → 23 riz, valeur 256 220", async () => {
  const m = await un(P, "select m.type, m.quantite::float q, m.valeur::int v from public.mouvements_stock m join public.documents_vente d on d.id=m.document_vente_id where d.document_origine_id=$1", [fv1]);
  return m.type === "retour_client" && m.q === 3 && m.v === 33420 && egal(await stock(bPrinc, riz), 23, 256220, 11140);
});
await en(P, "select public.creer_avoir_achat($1,'Riz abîmé')", [fa2]);
await vrai("avoir fournisseur : -5 au CMUP (55 700) → 18 riz, valeur 200 520", async () => {
  const m = await un(P, "select m.type, m.quantite::float q, m.valeur::int v from public.mouvements_stock m join public.documents_achat d on d.id=m.document_achat_id where d.document_origine_id=$1", [fa2]);
  return m.type === "retour_fournisseur" && m.q === -5 && m.v === -55700 && egal(await stock(bPrinc, riz), 18, 200520, 11140);
});

console.log("Transferts");
const tr = (await un(P, "select public.transferer_stock($1,$2,$3,$4::jsonb) id", [e, bPrinc, bPlateau, L_({ article_id: riz, quantite: 5 })])).id;
await vrai(`transfert TR-${annee}-00001 de 5 riz (55 700)`, async () => {
  const t = await un(P, "select numero, valeur_totale::int v from public.transferts_stock where id=$1", [tr]);
  return t.numero === `TR-${annee}-00001` && t.v === 55700;
});
await vrai("source : 13 riz, 144 820 ; destination : 5 riz, 55 700, CMUP 11 140", async () =>
  egal(await stock(bPrinc, riz), 13, 144820, 11140) && egal(await stock(bPlateau, riz), 5, 55700, 11140));
await vrai("le gestionnaire Plateau voit le transfert reçu", async () =>
  (await en(G, "select * from public.transferts_stock where id=$1", [tr])).length === 1);
await echoue("transfert au-delà du stock refusé", () =>
  en(P, "select public.transferer_stock($1,$2,$3,$4::jsonb)", [e, bPlateau, bPrinc, L_({ article_id: riz, quantite: 6 })]), "Stock insuffisant");
await echoue("gestionnaire : transfert depuis une boutique non attribuée refusé", () =>
  en(G, "select public.transferer_stock($1,$2,$3,$4::jsonb)", [e, bPrinc, bPlateau, L_({ article_id: riz, quantite: 1 })]), "non autorisée");
await echoue("même boutique refusée", () =>
  en(P, "select public.transferer_stock($1,$2,$2,$3::jsonb)", [e, bPrinc, L_({ article_id: riz, quantite: 1 })]), "différentes");
await echoue("transfert non modifiable", () => en(null, "update public.transferts_stock set notes='x' where id=$1", [tr]), "ni modifié");

console.log("Inventaire");
const inv = (await un(P, "select public.enregistrer_inventaire($1,$2,$3::jsonb) id", [e, bPrinc, L_({ article_id: riz, quantite_comptee: 12 })])).id;
await echoue("article compté deux fois refusé", () =>
  en(P, "select public.enregistrer_inventaire($1,$2,$3::jsonb)", [e, bPrinc,
    L_({ article_id: riz, quantite_comptee: 1 }, { article_id: riz, quantite_comptee: 2 })]), "compté deux fois");
await vrai("brouillon : stock inchangé", async () => egal(await stock(bPrinc, riz), 13, 144820, 11140));
await vrai(`inventaire INV-${annee}-00001 validé`, async () =>
  (await un(P, "select public.valider_inventaire($1) n", [inv])).n === `INV-${annee}-00001`);
await vrai("écart -1 (théorique 13, compté 12), valeur -11 140", async () => {
  const l = await un(P, "select quantite_theorique::float t, ecart::float e, valeur_ecart::int v from public.lignes_inventaire where inventaire_id=$1", [inv]);
  const i = await un(P, "select ecart_valeur::int v from public.inventaires where id=$1", [inv]);
  return l.t === 13 && l.e === -1 && l.v === -11140 && i.v === -11140 && egal(await stock(bPrinc, riz), 12, 133680, 11140);
});
await echoue("inventaire validé non modifiable", () => en(null, "update public.inventaires set notes='x' where id=$1", [inv]), "validé");
await echoue("inventaire validé non supprimable", () => en(P, "select public.supprimer_inventaire($1)", [inv]), "validé");
await echoue("mouvement non modifiable", () => en(null, "update public.mouvements_stock set quantite=1 where article_id=$1", [riz]), "ni modifiés");

console.log("Stock négatif et arrêt du suivi");
await echoue("arrêt du suivi refusé tant qu'il reste du stock", () =>
  en(P, "update public.articles set suivi_stock=false where id=$1", [riz]), "encore du stock");
await echoue("sortie au-delà du stock refusée", () =>
  en(G, "select public.ajuster_stock($1,$2,$3,-8,'Casse')", [e, bPlateau, riz]), "Stock insuffisant");
await echoue("seul l'administrateur autorise le stock négatif", async () => {
  const r = await en(G, "update public.parametres_stock set autoriser_stock_negatif=true where entreprise_id=$1 returning 1", [e]);
  if (r.length === 0) throw new Error("aucune ligne modifiée");
}, "aucune ligne");
await en(P, "update public.parametres_stock set autoriser_stock_negatif=true where entreprise_id=$1", [e]);
await en(G, "select public.ajuster_stock($1,$2,$3,-8,'Vente non saisie')", [e, bPlateau, riz]);
await vrai("stock négatif autorisé : -3 riz à Plateau", async () => (await stock(bPlateau, riz)).q === -3);
await en(G, "select public.ajuster_stock($1,$2,$3,10,'Réception',9000)", [e, bPlateau, riz]);
await vrai("entrée sur stock négatif : 7 riz, le coût d'entrée devient le CMUP (9 000)", async () =>
  egal(await stock(bPlateau, riz), 7, 63000, 9000));

console.log("Cohérence");
await vrai("quantités = somme des mouvements ; valeur = dernier mouvement", async () => {
  const r = await en(P, `select s.quantite::float q, (select sum(m.quantite) from public.mouvements_stock m
      where m.boutique_id=s.boutique_id and m.article_id=s.article_id)::float sq,
    s.valeur::int v, (select m.valeur_apres from public.mouvements_stock m
      where m.boutique_id=s.boutique_id and m.article_id=s.article_id order by m.created_at desc, m.id limit 1)::int dv
    from public.stocks s where s.entreprise_id=$1`, [e]);
  return r.length === 2 && r.every((x) => x.q === x.sq && x.v === x.dv);
});

process.exitCode = bilan() ? 1 : 0;
