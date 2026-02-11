import utils from "../utils.js";
import fs from "fs";

await utils.cloneOrPullRepo({ repo: "https://github.com/supabase/supabase", branch: "master" });
await utils.copyDir("./repo/docker", "./code");

await utils.removeContainerNames("./code/docker-compose.yml");
await utils.removePorts("./code/docker-compose.yml");
await utils.addPorts("./code/docker-compose.yml", {
  db: ["${POSTGRES_PORT}:${POSTGRES_PORT}"],
  supavisor: ["${POOLER_PROXY_PORT_TRANSACTION}:${POOLER_PROXY_PORT_TRANSACTION}"],
});

// Realtime needs its container_name for Kong routing and tenant ID parsing
await utils.setServiceProperty("./code/docker-compose.yml", "realtime", "container_name", "realtime-dev.supabase-realtime");
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
