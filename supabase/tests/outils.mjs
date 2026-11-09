// Outillage commun aux tests de la base : Postgres en mémoire (PGlite)
// avec une imitation minimale de l'environnement Supabase (rôles, auth.uid()…).
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dossier = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function creerBase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role supabase_auth_admin nologin;
    create schema auth;
    grant usage on schema auth to anon, authenticated, supabase_auth_admin;
    grant usage on schema public to anon, authenticated, supabase_auth_admin;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}'
    );
    grant all on auth.users to supabase_auth_admin;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
    -- Privilèges par défaut de Supabase
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const f of readdirSync(dossier).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dossier, f), "utf8"));
  }
  console.log("✔ migrations appliquées");

  let ok = 0, ko = 0;

  /** Exécute une requête en tant qu'utilisateur connecté (ou en superutilisateur si user = null). */
  async function en(user, sql, params = []) {
    await db.exec("reset role; select set_config('request.jwt.claims', '', false);");
    if (user) {
      await db.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: user.id, email: user.email, role: "authenticated" }),
      ]);
      await db.exec("set role authenticated");
    }
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  }
  async function vrai(nom, fn) {
    try { const r = await fn(); if (r === false) throw new Error("condition fausse"); ok++; console.log("  ✔", nom); }
    catch (e) { ko++; console.log("  ✘", nom, "→", e.message); }
  }
  async function echoue(nom, fn, attendu) {
    try { await fn(); ko++; console.log("  ✘", nom, "→ aurait dû échouer"); }
    catch (e) {
      if (attendu && !e.message.includes(attendu)) { ko++; console.log("  ✘", nom, "→ mauvaise erreur :", e.message); }
      else { ok++; console.log("  ✔", nom, `(${e.message})`); }
    }
  }
  async function creerUser(email, nom) {
    await db.exec("set role supabase_auth_admin");
    try {
      return (await db.query(
        "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, now(), $2) returning id, email",
        [email, JSON.stringify({ nom_complet: nom ?? null })])).rows[0];
    } finally {
      await db.exec("reset role");
    }
  }
  function bilan() {
    console.log(`\n${ok} réussis, ${ko} échoués`);
    return ko;
  }
  return { db, en, vrai, echoue, creerUser, bilan };
}
