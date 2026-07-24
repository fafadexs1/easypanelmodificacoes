import utils from "../utils.js";
import fs from "fs";

await utils.cloneOrPullRepo({ repo: "https://github.com/supabase/supabase", branch: "master" });
await utils.copyDir("./repo/docker", "./code");

await utils.removeContainerNames("./code/docker-compose.yml");
await utils.removePorts("./code/docker-compose.yml");
await utils.addPorts("./code/docker-compose.yml", {
  studio: ["${STUDIO_PORT:-3000}:3000"],
  kong: [
    "${KONG_HTTP_PORT:-8000}:8000",
    "${KONG_HTTPS_PORT:-8443}:8443",
  ],
  auth: ["${GOTRUE_PORT:-9999}:9999"],
  rest: ["${REST_PORT:-3000}:3000"],
  realtime: ["${REALTIME_PORT:-4000}:4000"],
  storage: ["${STORAGE_PORT:-5000}:5000"],
  meta: ["${META_PORT:-8080}:8080"],
  db: ["${POSTGRES_PORT:-5432}:${POSTGRES_PORT:-5432}"],
  supavisor: ["${POOLER_PROXY_PORT_TRANSACTION:-6543}:6543"],
});

// Keep the hostname expected by Kong without reserving a global container name.
// A fixed container_name conflicts with stale containers during Easypanel redeploys.
await utils.setServiceProperty("./code/docker-compose.yml", "realtime", "networks", {
  default: {
    aliases: ["realtime-dev.supabase-realtime"],
  },
});
await utils.setServiceProperty("./code/docker-compose.yml", "realtime", "entrypoint", [
  "/usr/bin/tini",
  "-s",
  "-g",
  "--",
  "/bin/bash",
  "/tmp/realtime-entrypoint.sh",
]);
await utils.setServiceProperty("./code/docker-compose.yml", "realtime", "volumes", [
  "./volumes/realtime/entrypoint.sh:/tmp/realtime-entrypoint.sh:ro,z",
]);

// The Easypanel database volume has completed the explicit PG15 -> PG17 migration.
// Keep subsequent upstream syncs on PG17; running PG15 on this volume is unsafe.
await utils.setServiceProperty(
  "./code/docker-compose.yml",
  "db",
  "image",
  "supabase/postgres:17.6.1.136",
);

const realtimeEntrypoint = [
  "#!/bin/bash",
  "set -euo pipefail",
  "",
  "# Realtime tenant DB connections auto-detect IP version and may pick IPv6 first.",
  "# Resolve DB_HOST to an IPv4 literal to avoid :enetunreach on IPv6-misconfigured hosts.",
  "if [ -n \"${DB_HOST:-}\" ]; then",
  "  resolved_db_host=\"\"",
  "",
  "  if command -v getent >/dev/null 2>&1; then",
  "    resolved_db_host=\"$(getent ahostsv4 \"${DB_HOST}\" 2>/dev/null | awk 'NR==1 {print $1}')\"",
  "  fi",
  "",
  "  if [ -n \"${resolved_db_host}\" ]; then",
  "    echo \"Resolved DB_HOST ${DB_HOST} -> ${resolved_db_host}\"",
  "    export DB_HOST=\"${resolved_db_host}\"",
  "  else",
  "    echo \"Unable to resolve IPv4 for DB_HOST=${DB_HOST}; using original value\"",
  "  fi",
  "fi",
  "",
  "if [ \"$#\" -eq 0 ]; then",
  "  set -- /app/bin/server",
  "fi",
  "",
  "exec /app/run.sh \"$@\"",
  "",
].join("\n");

await fs.promises.mkdir("./code/volumes/realtime", { recursive: true });
await fs.promises.writeFile("./code/volumes/realtime/entrypoint.sh", realtimeEntrypoint, { mode: 0o755 });

// Add explicit healthcheck for postgres-meta to ensure Docker and Easypanel mark it healthy
await utils.setServiceProperty("./code/docker-compose.yml", "meta", "healthcheck", {
  test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:8080/health').then((r) => {if (r.status !== 200) process.exit(1)}).catch(() => process.exit(1))\""],
  interval: "5s",
  timeout: "5s",
  retries: 3,
  start_period: "10s",
});

// Disable IPv6 on Docker network to fix Postgrex :enetunreach errors
// Realtime's detect_ip_version() tries IPv6 first; disabling IPv6 at the network level
// forces DNS to only return IPv4 addresses
await utils.setTopLevelProperty("./code/docker-compose.yml", "networks", {
  default: { enable_ipv6: false },
});

await utils.searchReplace(
  "./code/.env.example",
  "SITE_URL=http://localhost:3000",
  "SITE_URL=https://$(PRIMARY_DOMAIN)"
);

const portsEnvConfig = [
  "",
  "############",
  "# Exposed Ports (Easypanel / Host)",
  "############",
  "STUDIO_PORT=3000",
  "KONG_HTTP_PORT=8000",
  "KONG_HTTPS_PORT=8443",
  "GOTRUE_PORT=9999",
  "REST_PORT=3000",
  "REALTIME_PORT=4000",
  "STORAGE_PORT=5000",
  "META_PORT=8080",
  "POSTGRES_PORT=5432",
  "POOLER_PROXY_PORT_TRANSACTION=6543",
  "",
].join("\n");

await fs.promises.appendFile("./code/.env.example", portsEnvConfig);
