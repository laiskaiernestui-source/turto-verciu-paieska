// Realia platforma – Claude asistentas (laiškų santrauka, atsakymo juodraštis, užduotys iš laiško).
// Kviečiama su Supabase vartotojo JWT (verify_jwt = true). Raktas: ANTHROPIC_API_KEY (Supabase secrets).
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, apikey", "access-control-allow-methods": "POST, OPTIONS" };

const SYSTEM = `Tu esi Realia (nekilnojamojo turto plėtra, Kaunas; įmonės: Realia, Formos grupė UAB, Real Game) vidinės platformos asistentas. Vartotojas – įmonės darbuotojas. Rašyk lietuviškai, dalykiškai, be įžangų ir mandagybių, konkrečiai. Datas rašyk formatu YYYY-MM-DD. Neišgalvok faktų, kurių nėra laiške.`;

const PROMPTS: Record<string, string> = {
  summary: `Apibendrink šį el. laiškų susirašinėjimą. Struktūra: 1) Esmė (2–4 sakiniai). 2) Kas ko prašo / ką sutarė (punktais). 3) Atviri klausimai ir terminai. 4) Rekomenduojamas kitas žingsnis vartotojui. Iki 180 žodžių.`,
  reply: `Parašyk atsakymo į paskutinį laišką juodraštį vartotojo (siuntėjo) vardu. Tik laiško tekstas be temos, be parašo ir be paaiškinimų. Tonas: profesionalus, trumpas, aiškus; jei reikia sprendimų ar datų, kurių laiške nėra, palik laužtiniuose skliaustuose [įrašyti]. Pradėk kreipiniu („Laba diena,“ arba vardu, jei aišku).`,
  tasks: `Iš šio susirašinėjimo išskirk konkrečias užduotis, kurias turi atlikti vartotojas ar jo komanda. Grąžink TIK JSON masyvą be jokio kito teksto: [{"pavadinimas":"…","terminas":"YYYY-MM-DD arba null","prioritetas":"Aukštas|Vidutinis|Žemas","aprasymas":"1 sakinys konteksto"}]. Iki 6 užduočių. Jei užduočių nėra – [].`,
  custom: ``,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS });
  if (req.method !== "POST") return new Response("ok", { headers: CORS });
  if (!KEY) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY nenustatytas Supabase secrets." }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  let b: any = {};
  try { b = await req.json(); } catch { return new Response("bad json", { status: 400, headers: CORS }); }
  const action = String(b.action || "summary");
  const text = String(b.text || "").slice(0, 60000);
  const extra = String(b.prompt || "").slice(0, 2000);
  const instr = action === "custom" ? extra : PROMPTS[action] || PROMPTS.summary;
  if (!text && !extra) return new Response("no text", { status: 400, headers: CORS });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1200, system: SYSTEM,
      messages: [{ role: "user", content: `${instr}\n\n${b.me ? "Vartotojas: " + b.me + "\n" : ""}=== SUSIRAŠINĖJIMAS ===\n${text}` }],
    }),
  });
  const j = await r.json();
  if (!r.ok) return new Response(JSON.stringify({ error: j?.error?.message || "Anthropic API klaida" }), { status: 502, headers: { ...CORS, "content-type": "application/json" } });
  const out = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
  return new Response(JSON.stringify({ text: out, usage: j.usage }), { headers: { ...CORS, "content-type": "application/json" } });
});
