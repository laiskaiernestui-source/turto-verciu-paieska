// notion-push: platforma → Notion.
//  • užduoties pakeitimai (Statusas, Užduotis, Terminas, Prioritetas, Pastabos, Atsakingas, Objektas) į „Darbų briefingas“
//  • action=create  – nauja užduotis sukuriama Notion (kad visos užduotys gyventų Notion DB)
//  • action=budget  – nauja biudžeto pozicija (milestone) projekto Notion biudžeto DB, pasirinktinai susiejama su užduotimi
// Kviečia prisijungęs narys (JWT). Reikia NOTION_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" } });
const ST: Record<string, string> = { Nauja: "Nepadaryta", Laukia: "Nepadaryta", Vykdoma: "Vykdoma", Atlikta: "Padaryta" };
const NV = "2025-09-03";
const TASKS_DS = "53114db2-d59a-4265-a3d8-69f78bfffcaa";
const OBJ: Record<string, string> = { "dvaras": "Šatijai (Dvaro 61)", "fryko 9": "Fryko 9", "lapėnės krantas": "Lapėnės krantas", "gertrūdos 4": "Gertrūdos 4", "vilniaus 15a": "Vilniaus 15A" };
const personName = (email?: string | null) => { const l = String(email || "").split("@")[0].toLowerCase(); return l ? l.charAt(0).toUpperCase() + l.slice(1) : null; };
const findKey = (props: Record<string, any>, names: string[], types?: string[]) => { for (const n of names) { const k = Object.keys(props).find((x) => x.toLowerCase() === n.toLowerCase()); if (k) return k; } if (types) return Object.keys(props).find((x) => types.includes(props[x]?.type)); return undefined; };
const objFor = (projName?: string | null) => { if (!projName) return null; const p = projName.toLowerCase(); for (const k of Object.keys(OBJ)) if (p.includes(k)) return OBJ[k]; return null; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  const auth = req.headers.get("authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await sb.auth.getUser(jwt);
  const email = u?.user?.email?.toLowerCase();
  if (!email) return json({ error: "neprisijungęs", detail: ue?.message }, 401);
  const { data: nar } = await sb.from("naudotojai").select("role").ilike("email", email).maybeSingle();
  if (!nar) return json({ error: "nėra prieigos" }, 403);
  const body = await req.json().catch(() => ({}));
  const tok = Deno.env.get("NOTION_TOKEN") || Deno.env.get("Notion_token") || Deno.env.get("notion_token");
  const H = { authorization: "Bearer " + tok, "Notion-Version": NV, "content-type": "application/json" };
  const action = String(body.action || "update");

  // ---------- nauja biudžeto pozicija (milestone)
  if (action === "budget") {
    const pid = +body.projektas_id; if (!pid) return json({ error: "nėra projekto" }, 400);
    const { data: src } = await sb.from("notion_saltiniai").select("id,data_source_id,pavadinimas").eq("tipas", "biudzetas").eq("projektas_id", pid).eq("aktyvus", true).maybeSingle();
    if (!src) return json({ error: "Šis projektas neturi Notion biudžeto duomenų bazės" }, 400);
    const ds = await fetch(`https://api.notion.com/v1/data_sources/${src.data_source_id}`, { headers: H }).then((r) => r.json());
    const P = ds.properties || {};
    const props: Record<string, any> = {};
    const title = String(body.pozicija || "").trim(); if (!title) return json({ error: "įveskite pozicijos pavadinimą" }, 400);
    const kT = findKey(P, ["Užduotis", "Name", "Pavadinimas"], ["title"]); if (kT) props[kT] = { title: [{ type: "text", text: { content: title.slice(0, 2000) } }] };
    const kF = findKey(P, ["Fazė", "Etapas"]); if (kF && body.faze) props[kF] = P[kF].type === "status" ? { status: { name: body.faze } } : { select: { name: body.faze } };
    const kS = findKey(P, ["Statusas", "Status"]); if (kS) { const sv = body.statusas || "Nepradėtas"; props[kS] = P[kS].type === "status" ? { status: { name: sv } } : { select: { name: sv } }; }
    const kP = findKey(P, ["Planas", "Biudžetas"]); if (kP && body.planas != null && body.planas !== "") props[kP] = { number: +body.planas };
    const kFa = findKey(P, ["Faktas", "Išleista"]); if (kFa && body.faktas != null && body.faktas !== "") props[kFa] = { number: +body.faktas };
    const kFi = findKey(P, ["Firma", "Rangovas", "Tiekėjas"]); if (kFi && body.firma) props[kFi] = { rich_text: [{ type: "text", text: { content: String(body.firma).slice(0, 500) } }] };
    const kN = findKey(P, ["Pastabos", "Komentaras"]); if (kN && body.pastabos) props[kN] = { rich_text: [{ type: "text", text: { content: String(body.pastabos).slice(0, 2000) } }] };
    const kD = findKey(P, ["Data nuo iki", "Data", "Datos"], ["date"]); if (kD && body.pradzia) props[kD] = { date: { start: String(body.pradzia).slice(0, 10), end: body.pabaiga && body.pabaiga !== body.pradzia ? String(body.pabaiga).slice(0, 10) : null } };
    const kA = findKey(P, ["Atsiskaityta"]); if (kA && P[kA].type === "multi_select") props[kA] = { multi_select: [{ name: "Ne" }] };
    const r = await fetch("https://api.notion.com/v1/pages", { method: "POST", headers: H, body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: src.data_source_id }, properties: props }) });
    const j = await r.json();
    if (!r.ok) return json({ error: "Notion: " + (j.message || r.status), code: j.code }, 502);
    const row = { notion_id: j.id, saltinis_id: src.id, projektas_id: pid, pozicija: title, faze: body.faze || null, statusas: body.statusas || "Nepradėtas", planas: body.planas != null && body.planas !== "" ? +body.planas : null, faktas: body.faktas != null && body.faktas !== "" ? +body.faktas : null, firma: body.firma || null, pastabos: body.pastabos || null, atsiskaityta: false, pradzia: body.pradzia || null, pabaiga: body.pabaiga || body.pradzia || null, url: j.url, notion_redaguota: j.last_edited_time, sinchronizuota: new Date().toISOString() };
    await sb.from("biudzetas").upsert(row, { onConflict: "notion_id" });
    if (body.uzduotis_id) await sb.from("uzduotys").update({ biudzetas_notion_id: j.id }).eq("id", +body.uzduotis_id);
    return json({ ok: true, notion_id: j.id, url: j.url });
  }

  // ---------- nauja užduotis Notion „Darbų briefingas“
  if (action === "create") {
    const id = +body.id; if (!id) return json({ error: "nėra užduoties id" }, 400);
    const { data: t } = await sb.from("uzduotys").select("*").eq("id", id).maybeSingle();
    if (!t) return json({ error: "užduotis nerasta" }, 404);
    if (t.notion_id) return json({ ok: true, notion_id: t.notion_id, already: true });
    let projName: string | null = null; if (t.projektas_id) { const { data: p } = await sb.from("projektai").select("pavadinimas").eq("id", t.projektas_id).maybeSingle(); projName = p?.pavadinimas || null; }
    const obj = objFor(projName) || "Kita";
    const props: Record<string, any> = {
      "Užduotis": { title: [{ type: "text", text: { content: String(t.pavadinimas || "(be pavadinimo)").slice(0, 2000) } }] },
      "Statusas": { status: { name: ST[t.busena] || "Nepadaryta" } },
      "Prioritetas": { select: { name: ["Aukštas", "Vidutinis", "Žemas"].includes(t.prioritetas) ? t.prioritetas : "Vidutinis" } },
      "Objektas": { select: { name: obj } },
    };
    if (t.terminas) props["Terminas"] = { date: { start: String(t.terminas).slice(0, 10) } };
    if (t.aprasymas) props["Pastabos"] = { rich_text: [{ type: "text", text: { content: String(t.aprasymas).slice(0, 2000) } }] };
    const pn = personName(t.atsakingas); if (pn && ["Ernestas", "Justinas", "Domas"].includes(pn)) props["Atsakingas"] = { select: { name: pn } };
    const r = await fetch("https://api.notion.com/v1/pages", { method: "POST", headers: H, body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: TASKS_DS }, properties: props }) });
    const j = await r.json();
    if (!r.ok) return json({ error: "Notion: " + (j.message || r.status), code: j.code }, 502);
    await sb.from("uzduotys").update({ notion_id: j.id, notion_url: j.url, objektas: obj, sinchronizuota: new Date().toISOString() }).eq("id", id);
    return json({ ok: true, notion_id: j.id, notion_url: j.url, objektas: obj });
  }

  // ---------- esamos užduoties pakeitimai
  const id = +body.id;
  if (!id) return json({ error: "blogi parametrai" }, 400);
  const { data: t } = await sb.from("uzduotys").select("id,notion_id,busena").eq("id", id).maybeSingle();
  if (!t || !t.notion_id) return json({ error: "ne Notion užduotis" }, 400);
  const pr = await fetch(`https://api.notion.com/v1/pages/${t.notion_id}`, { headers: H });
  const pj = await pr.json();
  if (!pr.ok) return json({ error: "Notion: " + (pj.message || pr.status), code: pj.code }, 502);
  const P = pj.properties || {};
  const props: Record<string, any> = {}; const upd: Record<string, any> = {};
  if (body.busena !== undefined) { const b = String(body.busena); if (!ST[b]) return json({ error: "bloga būsena" }, 400); const k = findKey(P, ["Statusas", "Status"], ["status"]); if (k) props[k] = P[k].type === "status" ? { status: { name: ST[b] } } : { select: { name: ST[b] } }; upd.busena = b; upd.baigta = b === "Atlikta" ? new Date().toISOString() : null; }
  if (body.pavadinimas !== undefined) { const v = String(body.pavadinimas).trim(); if (!v) return json({ error: "tuščias pavadinimas" }, 400); const k = findKey(P, ["Užduotis", "Name"], ["title"]); if (k) props[k] = { title: [{ type: "text", text: { content: v.slice(0, 2000) } }] }; upd.pavadinimas = v; }
  if (body.terminas !== undefined) { const v = body.terminas ? String(body.terminas).slice(0, 10) : null; const k = findKey(P, ["Terminas"], ["date"]); if (k) props[k] = { date: v ? { start: v } : null }; upd.terminas = v; }
  if (body.prioritetas !== undefined) { const v = String(body.prioritetas || "Vidutinis"); const k = findKey(P, ["Prioritetas"]); if (k) props[k] = P[k].type === "status" ? { status: { name: v } } : P[k].type === "multi_select" ? { multi_select: [{ name: v }] } : { select: { name: v } }; upd.prioritetas = v; }
  if (body.aprasymas !== undefined) { const v = body.aprasymas ? String(body.aprasymas) : ""; const k = findKey(P, ["Pastabos", "Aprašymas"]); if (k && P[k].type === "rich_text") props[k] = { rich_text: v ? [{ type: "text", text: { content: v.slice(0, 2000) } }] : [] }; upd.aprasymas = v || null; }
  if (body.atsakingas !== undefined) { const v = body.atsakingas ? String(body.atsakingas).toLowerCase() : null; const k = findKey(P, ["Atsakingas"]); const pn = personName(v); if (k && P[k].type === "select") props[k] = { select: pn && ["Ernestas", "Justinas", "Domas"].includes(pn) ? { name: pn } : null }; upd.atsakingas = v; }
  if (body.projektas_id !== undefined) { const pid = body.projektas_id ? +body.projektas_id : null; let projName: string | null = null; if (pid) { const { data: p } = await sb.from("projektai").select("pavadinimas").eq("id", pid).maybeSingle(); projName = p?.pavadinimas || null; } const obj = objFor(projName) || "Kita"; const k = findKey(P, ["Objektas"]); if (k && P[k].type === "select") props[k] = { select: { name: obj } }; upd.projektas_id = pid; upd.objektas = obj; }
  if (!Object.keys(props).length && !Object.keys(upd).length) return json({ error: "nėra ką keisti" }, 400);
  if (Object.keys(props).length) {
    const r = await fetch(`https://api.notion.com/v1/pages/${t.notion_id}`, { method: "PATCH", headers: H, body: JSON.stringify({ properties: props }) });
    const j = await r.json();
    if (!r.ok) return json({ error: "Notion: " + (j.message || r.status), code: j.code }, 502);
  }
  upd.sinchronizuota = new Date().toISOString();
  await sb.from("uzduotys").update(upd).eq("id", id);
  return json({ ok: true, updated: Object.keys(upd) });
});
