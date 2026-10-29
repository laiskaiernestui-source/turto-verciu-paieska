// notion-sync: kas 10 min nuskaito Notion duomenų šaltinius (notion_saltiniai) ir veidrodina į `uzduotys` / `biudzetas`.
// Notion → Supabase (platformos pakeitimai į Notion rašomi per notion-push). Reikia secret NOTION_TOKEN ir INGEST_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const NV = "2025-09-03";

function txt(p: any): string | null { const a = p?.title || p?.rich_text; return Array.isArray(a) ? (a.map((x: any) => x.plain_text).join("") || null) : null; }
function val(p: any): any {
  if (!p) return null;
  switch (p.type) {
    case "title": case "rich_text": return txt(p);
    case "number": return p.number;
    case "select": return p.select?.name ?? null;
    case "status": return p.status?.name ?? null;
    case "multi_select": return (p.multi_select || []).map((x: any) => x.name);
    case "date": return p.date ? { start: p.date.start, end: p.date.end } : null;
    case "checkbox": return p.checkbox;
    case "url": return p.url; case "email": return p.email; case "phone_number": return p.phone_number;
    case "people": return (p.people || []).map((x: any) => x.name || x.person?.email || x.id);
    case "files": return (p.files || []).map((x: any) => x.name);
    case "relation": return (p.relation || []).map((x: any) => x.id);
    case "formula": return p.formula?.[p.formula?.type] ?? null;
    case "rollup": return p.rollup?.[p.rollup?.type] ?? null;
    default: return null;
  }
}
const pick = (props: Record<string, any>, names: string[], types?: string[]) => {
  for (const n of names) { const k = Object.keys(props).find((x) => x.toLowerCase() === n.toLowerCase()); if (k) return val(props[k]); }
  if (types) { const k = Object.keys(props).find((x) => types.includes(props[x]?.type)); if (k) return val(props[k]); }
  return null;
};
const PEOPLE: Record<string, string> = { ernestas: "ernestas@realia.lt", justinas: "justinas@realia.lt", domas: "domas@realia.lt" };

Deno.serve(async (req) => {
  if (req.headers.get("x-ingest-key") !== Deno.env.get("INGEST_SECRET")) return json({ error: "forbidden" }, 403);
  const tok = Deno.env.get("NOTION_TOKEN") || Deno.env.get("Notion_token") || Deno.env.get("notion_token");
  if (!tok) return json({ error: "missing NOTION_TOKEN secret" }, 500);
  const H = { authorization: "Bearer " + tok, "Notion-Version": NV, "content-type": "application/json" };
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: srcs, error: se } = await sb.from("notion_saltiniai").select("*").eq("aktyvus", true);
  if (se) return json({ error: se.message }, 500);
  const out: unknown[] = [];
  for (const s of srcs || []) {
    try {
      const rows: any[] = []; let cursor: string | undefined;
      do {
        const r = await fetch(`https://api.notion.com/v1/data_sources/${s.data_source_id}/query`, { method: "POST", headers: H, body: JSON.stringify({ page_size: 100, start_cursor: cursor }) });
        const j = await r.json();
        if (!r.ok) throw new Error(`${r.status} ${j.message || JSON.stringify(j).slice(0, 200)}`);
        rows.push(...(j.results || [])); cursor = j.has_more ? j.next_cursor : undefined;
      } while (cursor);
      const seen: string[] = [];
      if (s.tipas === "uzduotys") {
        const { data: prj } = await sb.from("projektai").select("id,pavadinimas");
        const OBJ: Record<string, string> = { "Šatijai (Dvaro 61)": "Dvaras", "Fryko 9": "Fryko 9", "Lapėnės krantas": "Lapėnės krantas", "Gertrūdos 4": "Gertrūdos 4", "Vilniaus 15A": "Vilniaus 15A" };
        const pid = (o: string | null) => { const n = o && OBJ[o]; const f = n && (prj || []).find((x) => x.pavadinimas.toLowerCase().includes(n.toLowerCase())); return f ? f.id : null; };
        const ST: Record<string, string> = { Nepadaryta: "Nauja", Vykdoma: "Vykdoma", Padaryta: "Atlikta" };
        // esamos platformos reikšmės (kad nepakeistume būsenos „Laukia“ ir neištrintume atsakingo, kai Notion tuščia)
        const { data: cur } = await sb.from("uzduotys").select("notion_id,busena,atsakingas,projektas_id").not("notion_id", "is", null);
        const curMap = new Map((cur || []).map((x) => [x.notion_id, x]));
        const ut = rows.map((pg) => { const P = pg.properties || {}; const d = pick(P, ["Terminas"], ["date"]); const st = pick(P, ["Statusas", "Status"]); const obj = pick(P, ["Objektas"]); seen.push(pg.id);
          const old = curMap.get(pg.id); let busena = ST[st] || "Nauja"; if (busena === "Nauja" && old?.busena === "Laukia") busena = "Laukia";
          const who = pick(P, ["Atsakingas"]); const whoKey = Array.isArray(who) ? who[0] : who; const email = whoKey ? (PEOPLE[String(whoKey).toLowerCase()] || (String(whoKey).includes("@") ? String(whoKey).toLowerCase() : null)) : null;
          const row: Record<string, any> = { notion_id: pg.id, notion_url: pg.url, pavadinimas: pick(P, ["Užduotis", "Name"], ["title"]) || "(be pavadinimo)", busena, prioritetas: pick(P, ["Prioritetas"]) || "Vidutinis", terminas: d?.start ? String(d.start).slice(0, 10) : null, aprasymas: pick(P, ["Pastabos"]) || null, objektas: obj, sinchronizuota: new Date().toISOString(), baigta: busena === "Atlikta" ? (pg.last_edited_time || null) : null };
          const p = pid(obj); if (p || !old?.projektas_id) row.projektas_id = p;
          if (email) row.atsakingas = email; else if (old?.atsakingas) row.atsakingas = old.atsakingas;
          return row; });
        if (ut.length) { const { error } = await sb.from("uzduotys").upsert(ut, { onConflict: "notion_id" }); if (error) throw new Error(error.message); }
        const gone = (cur || []).filter((x) => !seen.includes(x.notion_id)).map((x) => x.notion_id);
        if (gone.length) await sb.from("uzduotys").delete().in("notion_id", gone);
        await sb.from("notion_saltiniai").update({ paskutinis: new Date().toISOString(), klaida: null, eiluciu: ut.length }).eq("id", s.id);
        out.push({ saltinis: s.pavadinimas, rows: ut.length, removed: gone.length }); continue;
      }
      const up = rows.map((pg) => {
        const P = pg.properties || {}; const d = pick(P, ["Data nuo iki", "Data", "Datos"], ["date"]); const ats = pick(P, ["Atsiskaityta"]);
        seen.push(pg.id);
        return {
          notion_id: pg.id, saltinis_id: s.id, projektas_id: s.projektas_id,
          pozicija: pick(P, ["Užduotis", "Name", "Pavadinimas"], ["title"]) || "(be pavadinimo)",
          faze: pick(P, ["Fazė", "Etapas"]), statusas: pick(P, ["Statusas", "Status"]),
          planas: pick(P, ["Planas", "Biudžetas"]), faktas: pick(P, ["Faktas", "Išleista"]),
          firma: pick(P, ["Firma", "Rangovas", "Tiekėjas"]), pastabos: pick(P, ["Pastabos", "Komentaras"]),
          atsiskaityta: Array.isArray(ats) ? ats.includes("Taip") : (typeof ats === "boolean" ? ats : null),
          pradzia: d?.start ? String(d.start).slice(0, 10) : null, pabaiga: d?.end ? String(d.end).slice(0, 10) : (d?.start ? String(d.start).slice(0, 10) : null),
          atsakingas: (pick(P, ["Atsakingas"]) || []).join(", ") || null,
          bylos: (pick(P, ["Bylos"]) || []).length || 0,
          url: pg.url, notion_redaguota: pg.last_edited_time, archyvuota: !!pg.archived, sinchronizuota: new Date().toISOString(),
          raw: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, val(v)])),
        };
      });
      if (up.length) { const { error } = await sb.from("biudzetas").upsert(up, { onConflict: "notion_id" }); if (error) throw new Error(error.message); }
      const { data: old } = await sb.from("biudzetas").select("notion_id").eq("saltinis_id", s.id);
      const gone = (old || []).map((x) => x.notion_id).filter((id) => !seen.includes(id));
      if (gone.length) await sb.from("biudzetas").delete().in("notion_id", gone);
      await sb.from("notion_saltiniai").update({ paskutinis: new Date().toISOString(), klaida: null, eiluciu: up.length }).eq("id", s.id);
      out.push({ saltinis: s.pavadinimas, rows: up.length, removed: gone.length });
    } catch (e) {
      await sb.from("notion_saltiniai").update({ paskutinis: new Date().toISOString(), klaida: String(e).slice(0, 500) }).eq("id", s.id);
      out.push({ saltinis: s.pavadinimas, error: String(e) });
    }
  }
  return json({ ok: true, out });
});
