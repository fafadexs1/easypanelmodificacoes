#!/usr/bin/env node
// Minimal Realtime smoke test: healthcheck + WS subscribe to postgres_changes.
// Usage:
//   SUPABASE_URL=https://<domain> ANON_KEY=<anon> node supabase/realtime-test.js
// Optional env:
//   SCHEMA=public TABLE=test_realtime EVENT=* TENANT=realtime-dev TIMEOUT_MS=60000

// Optional hardcoded defaults (leave empty to require env/args)
const DEFAULT_SUPABASE_URL = "https://projetosteste-supabase-dialogy.bzpwtu.easypanel.host";
const DEFAULT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcwODYyOTUxLCJleHAiOjIwODYyMjI5NTF9.Q7D6_Pd-DheHThfDHslox8Mk8XIAs6GE-B1jEjc9bdc";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const supabaseUrl =
  args.url ||
  process.env.SUPABASE_URL ||
  process.env.REALTIME_URL ||
  DEFAULT_SUPABASE_URL ||
  "";
const anonKey =
  args.key ||
  process.env.ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  DEFAULT_ANON_KEY ||
  "";

const schema = args.schema || process.env.SCHEMA || "public";
const table = args.table || process.env.TABLE || "test_realtime";
const event = args.event || process.env.EVENT || "*";
const tenant = args.tenant || process.env.TENANT || "realtime-dev";
const timeoutMs = Number(args.timeout || process.env.TIMEOUT_MS || 60000);

if (!supabaseUrl || !anonKey) {
  console.error(
    "Missing SUPABASE_URL/ANON_KEY. Example:\n" +
            "SUPABASE_URL=https://<domain> ANON_KEY=<anon> node supabase/realtime-test.js"
  );
  process.exit(1);
}

const baseUrl = supabaseUrl.replace(/\/+$/, "");
const healthUrl = `${baseUrl}/realtime/v1/api/tenants/${tenant}/health`;
const wsUrl = `${baseUrl.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(
  anonKey
)}&log_level=info&vsn=1.0.0`;

async function healthcheck() {
  try {
    const res = await fetch(healthUrl, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    const text = await res.text();
    console.log(`[health] ${res.status}: ${text}`);
  } catch (err) {
    console.error("[health] failed:", err.message || err);
  }
}

function subscribe() {
  console.log("[ws] connecting:", wsUrl);
  const ws = new WebSocket(wsUrl);

  let ref = 0;
  const nextRef = () => `${++ref}`;

  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: nextRef() })
      );
    }
  }, 25000);

  const timer = setTimeout(() => {
    console.log(`[timeout] no events after ${timeoutMs}ms, closing`);
    ws.close(1000, "timeout");
  }, timeoutMs);

  ws.addEventListener("open", () => {
    const topic = `realtime:${schema}:${table}`;
    const joinPayload = {
      config: {
        broadcast: { self: false },
        presence: { key: "" },
        postgres_changes: [{ event, schema, table }],
      },
      access_token: anonKey,
    };
    const msg = { topic, event: "phx_join", payload: joinPayload, ref: nextRef() };
    console.log("[ws] join:", topic);
    ws.send(JSON.stringify(msg));
  });

  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.event === "phx_reply") {
        console.log("[ws] reply:", JSON.stringify(msg.payload));
      } else if (msg.event === "postgres_changes") {
        console.log("[ws] change:", JSON.stringify(msg.payload));
      } else {
        console.log("[ws] event:", msg.event, JSON.stringify(msg.payload));
      }
    } catch {
      console.log("[ws] raw:", ev.data);
    }
  });

  ws.addEventListener("close", (ev) => {
    clearInterval(heartbeat);
    clearTimeout(timer);
    console.log(`[ws] closed: ${ev.code} ${ev.reason || ""}`);
  });

  ws.addEventListener("error", (ev) => {
    console.error("[ws] error:", ev.message || ev);
  });
}

await healthcheck();
subscribe();
