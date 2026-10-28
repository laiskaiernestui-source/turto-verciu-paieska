// Realia platforma – iCal (ICS) tarpininkas: parsiunčia kalendoriaus prenumeratos failą (Google/Apple/Outlook), nes naršyklė tiesiogiai negali (CORS).
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, apikey", "access-control-allow-methods": "GET, POST, OPTIONS" };
const OK_HOSTS = [/(^|\.)google\.com$/i, /(^|\.)googleusercontent\.com$/i, /(^|\.)icloud\.com$/i, /(^|\.)office365\.com$/i, /(^|\.)office\.com$/i, /(^|\.)live\.com$/i, /(^|\.)outlook\.com$/i];
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS });
  let u = new URL(req.url).searchParams.get("u") || "";
  if (!u && req.method === "POST") { try { u = (await req.json()).u || ""; } catch {} }
  u = u.replace(/^webcal:/i, "https:");
  let t: URL;
  try { t = new URL(u); } catch { return new Response(JSON.stringify({ error: "Neteisingas adresas" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } }); }
  if (t.protocol !== "https:" || !OK_HOSTS.some((r) => r.test(t.hostname))) return new Response(JSON.stringify({ error: "Leidžiami tik Google, Apple (iCloud) ir Outlook kalendorių adresai" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });
  const r = await fetch(t.href, { headers: { "user-agent": "Realia-platforma/1.0" }, redirect: "follow" });
  if (!r.ok) return new Response(JSON.stringify({ error: "Kalendorius nepasiekiamas: HTTP " + r.status }), { status: 502, headers: { ...CORS, "content-type": "application/json" } });
  const txt = (await r.text()).slice(0, 3_000_000);
  return new Response(txt, { headers: { ...CORS, "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" } });
});
