// Tests de sécurité du socle (RLS, rôles, invitations).
// Lancer : pnpm test:db
import { creerBase } from "./outils.mjs";

const { db, en, vrai, echoue, creerUser, bilan } = await creerBase();

// --- Utilisateurs (inscription jouée par le service d'auth) ----------------------
const A = await creerUser("Awa@exemple.sn", "Awa Diop");
const B = await creerUser("bakary@exemple.sn", "Bakary Traoré");
const C = await creerUser("coumba@exemple.ci", "Coumba");

console.log("Profils");
await vrai("profil créé automatiquement, e-mail en minuscules", async () =>
  (await en(null, "select email, nom_complet from public.profils where id=$1", [A.id]))[0].email === "awa@exemple.sn");
await vrai("A ne voit que son profil", async () => (await en(A, "select * from public.profils")).length === 1);
await echoue("A ne peut pas modifier son e-mail", () => en(A, "update public.profils set email='x@y.z' where id=$1", [A.id]), "permission denied");

console.log("Création d'entreprise");
await echoue("anonyme ne peut pas créer", async () => { await db.exec("set role anon"); try { await db.query("select public.creer_entreprise('X','SN')"); } finally { await db.exec("reset role"); } }, "permission denied");
const eA = (await en(A, "select public.creer_entreprise('Diop Commerce SARL','SN', p_ville => 'Dakar') as id"))[0].id;
await vrai("A est propriétaire", async () => (await en(A, "select * from public.mes_entreprises()"))[0].role === "proprietaire");
await vrai("boutique principale créée", async () =>
  (await en(A, "select * from public.boutiques where entreprise_id=$1", [eA]))[0].est_principale === true);
await echoue("pays hors UEMOA refusé", () => en(A, "select public.creer_entreprise('Test','CM')"), "entreprises_pays_check");
await echoue("insertion directe interdite", () => en(A, "insert into public.entreprises (raison_sociale, pays) values ('Pirate','SN')"));

console.log("Isolation");
await vrai("B ne voit pas l'entreprise de A", async () => (await en(B, "select * from public.entreprises")).length === 0);
await vrai("B ne voit pas les boutiques de A", async () => (await en(B, "select * from public.boutiques")).length === 0);
await vrai("B ne voit pas les membres de A", async () => (await en(B, "select * from public.membres_entreprise($1)", [eA])).length === 0);
await vrai("UPDATE de B sans effet", async () =>
  (await en(B, "update public.entreprises set raison_sociale='Volée' where id=$1 returning id", [eA])).length === 0);
await echoue("B ne peut pas créer de boutique chez A", () =>
  en(B, "insert into public.boutiques (entreprise_id, code, nom) values ($1,'PIRATE','Pirate')", [eA]), "row-level security");

console.log("Boutiques");
const b2 = (await en(A, "insert into public.boutiques (entreprise_id, code, nom) values ($1,'PLATEAU','Boutique Plateau') returning id", [eA]))[0].id;
await echoue("code boutique dupliqué refusé", () =>
  en(A, "insert into public.boutiques (entreprise_id, code, nom) values ($1,'PLATEAU','Doublon')", [eA]), "duplicate");
await echoue("2e boutique principale refusée", () =>
  en(A, "insert into public.boutiques (entreprise_id, code, nom, est_principale) values ($1,'P2','P2', true)", [eA]), "row-level security");
await echoue("suppression de boutique interdite", () => en(A, "delete from public.boutiques where id=$1", [b2]), "permission denied");

console.log("Invitations");
await echoue("C (externe) ne peut pas inviter", () =>
  en(C, "select public.inviter_membre($1,'x@y.sn','vendeur')", [eA]), "administrateurs");
await en(A, "select public.inviter_membre($1,' Bakary@Exemple.sn ','vendeur', false, array[$2]::uuid[])", [eA, b2]);
await vrai("B voit son invitation", async () => (await en(B, "select * from public.invitations")).length === 1);
await vrai("C ne voit pas l'invitation", async () => (await en(C, "select * from public.invitations")).length === 0);
await vrai("B accepte : 1 entreprise rejointe", async () => (await en(B, "select public.accepter_invitations() as n"))[0].n === 1);
await vrai("2e acceptation sans effet", async () => (await en(B, "select public.accepter_invitations() as n"))[0].n === 0);
await vrai("B (vendeur limité) ne voit que la boutique Plateau", async () => {
  const r = await en(B, "select code from public.boutiques"); return r.length === 1 && r[0].code === "PLATEAU"; });
await vrai("A voit l'e-mail et le nom de B", async () => {
  const r = await en(A, "select * from public.membres_entreprise($1)", [eA]);
  return r.length === 2 && r.some((m) => m.email === "bakary@exemple.sn" && m.boutique_ids.length === 1); });
await vrai("B voit le profil de A (collègue)", async () => (await en(B, "select * from public.profils")).length === 2);
await vrai("C ne voit pas le profil de A", async () => (await en(C, "select * from public.profils")).length === 1);
await echoue("déjà membre : ré-invitation refusée", () =>
  en(A, "select public.inviter_membre($1,'bakary@exemple.sn','admin')", [eA]), "déjà membre");

console.log("Rôles et propriétaires");
await vrai("vendeur ne modifie pas l'entreprise", async () =>
  (await en(B, "update public.entreprises set sigle='X' where id=$1 returning id", [eA])).length === 0);
await echoue("vendeur ne s'auto-promeut pas", () =>
  en(B, "select public.modifier_membre((select id from public.membres where user_id=$1), 'admin', true)", [B.id]), "droits insuffisants");
await echoue("A ne peut pas se rétrograder (dernier propriétaire)", () =>
  en(A, "update public.membres set role='admin' where user_id=$1", [A.id]), "au moins un propriétaire");
await echoue("A ne peut pas quitter (dernier propriétaire)", () =>
  en(A, "delete from public.membres where user_id=$1", [A.id]), "au moins un propriétaire");
const mB = (await en(A, "select id from public.membres where user_id=$1", [B.id]))[0].id;
await en(A, "select public.modifier_membre($1, 'admin', true)", [mB]);
await vrai("B promu admin voit toutes les boutiques", async () => (await en(B, "select * from public.boutiques")).length === 2);
await vrai("accès boutique nettoyé", async () => (await en(A, "select * from public.membres_boutiques")).length === 0);
await echoue("admin ne se fait pas propriétaire", () =>
  en(B, "update public.membres set role='proprietaire' where id=$1", [mB]), "Seul un propriétaire");
await echoue("admin ne retire pas le propriétaire", () =>
  en(B, "delete from public.membres where user_id=$1", [A.id]), "Seul un propriétaire");
await echoue("admin n'invite pas de propriétaire", () =>
  en(B, "select public.inviter_membre($1,'z@z.sn','proprietaire')", [eA]), "propriétaire");
await vrai("admin modifie l'entreprise", async () =>
  (await en(B, "update public.entreprises set sigle='DC' where id=$1 returning id", [eA])).length === 1);
await echoue("changement de pays bloqué ? (colonne non autorisée)", () =>
  en(B, "update public.entreprises set devise='EUR' where id=$1", [eA]), "permission denied");
await en(A, "select public.modifier_membre($1, 'proprietaire', true)", [mB]);
await vrai("2 propriétaires : A peut maintenant se rétrograder", async () =>
  (await en(A, "update public.membres set role='admin' where user_id=$1 returning id", [A.id])).length === 1);
await vrai("départ volontaire de A", async () =>
  (await en(A, "delete from public.membres where user_id=$1 returning id", [A.id])).length === 1);
await vrai("A ne voit plus l'entreprise", async () => (await en(A, "select * from public.entreprises")).length === 0);

console.log("Système");
await vrai("suppression d'un compte (cascade) possible", async () => {
  await db.exec("select set_config('request.jwt.claims', '', false)"); await db.query("delete from auth.users where id=$1", [B.id]); return (await db.query("select count(*)::int n from public.membres")).rows[0].n === 0; });
await vrai("fonctions privées non exécutables par anon", async () => {
  await db.exec("set role anon"); try { await db.query("select prive.est_membre(gen_random_uuid())"); return false; } catch (e) { return e.message.includes("permission denied"); } finally { await db.exec("reset role"); } });

process.exitCode = bilan() ? 1 : 0;
