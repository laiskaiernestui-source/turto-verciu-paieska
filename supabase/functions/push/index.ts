import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
let CFG: Record<string, string> | null = null;
async function cfg() {
  if (CFG) return CFG;
  const { data } = await sb.from("push_config").select("k,v");
  CFG = Object.fromEntries((data || []).map((r: any) => [r.k, r.v]));
  webpush.setVapidDetails("mailto:ernestas@realia.lt", CFG.vapid_public, CFG.vapid_private);
  return CFG;
}
async function sendTo(email: string, payload: any) {
  const { data: subs } = await sb.from("push_subs").select("id,endpoint,p256dh,auth").eq("email", email);
  let n = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      n++;
    } catch (e: any) {
      const st = e?.statusCode;
      if (st === 404 || st === 410) await sb.from("push_subs").delete().eq("id", s.id);
      else console.error("push fail", st, e?.body || e?.message);
    }
  }
  return n;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const vt = url.searchParams.get("validationToken");
  if (vt) return new Response(vt, { status: 200, headers: { "content-type": "text/plain" } });
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const C = await cfg();
  const kind = url.searchParams.get("kind");

  if (kind === "task") {
    if (req.headers.get("x-push-secret") !== C.secret) return new Response("unauthorized", { status: 401 });
    const b = await req.json();
    const n = await sendTo(b.email, { kind: "task", title: b.title, body: b.body || "", url: b.url || "/projektai.html", tag: "task-" + b.id, badge: b.badge ?? null });
    return new Response(JSON.stringify({ sent: n }), { headers: { "content-type": "application/json" } });
  }

  if (kind === "mail") {
    let b: any = {};
    try { b = await req.json(); } catch { return new Response("", { status: 202 }); }
    const seen = new Set<string>();
    for (const v of b.value || []) {
      if (!v.subscriptionId || seen.has(v.subscriptionId)) continue;
      seen.add(v.subscriptionId);
      const { data: s } = await sb.from("graph_subs").select("email").eq("id", v.subscriptionId).maybeSingle();
      if (!s || s.email !== v.clientState) continue;
      await sendTo(s.email, { kind: "mail", title: "Naujas laiškas", body: "Realia paštas – atidaryti", url: "/pastas.html", tag: "mail-" + Date.now() });
    }
    return new Response("", { status: 202 });
  }

  if (kind === "test") {
    const auth = req.headers.get("authorization") || "";
    const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer /i, ""));
    if (!u?.user?.email) return new Response("unauthorized", { status: 401 });
    const n = await sendTo(u.user.email, { kind: "test", title: "Realia", body: "Pranešimai įjungti ✓", url: "/pastas.html", tag: "test" });
    return new Response(JSON.stringify({ sent: n }), { headers: { "content-type": "application/json" } });
  }
  return new Response("bad request", { status: 400 });
});
