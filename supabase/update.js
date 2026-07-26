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

// Upstream ships /mcp blocked by a request-termination plugin. Swap it for an IP
// allowlist so the endpoint can be reached from a known address. The copyDir above
// restores the pristine kong.yml on every run, so this has to be reapplied here.
// The allowed IP is NOT hardcoded: kong-entrypoint.sh substitutes $MCP_ALLOWED_IP
// from the environment, keeping the address out of this public repository.
const kongConfigPath = "./code/volumes/api/kong.yml";

await utils.searchReplace(
  kongConfigPath,
  `      - name: request-termination
        config:
          status_code: 403
          message: "Access is forbidden."
      # Enable local access (danger zone!)`,
  `      #- name: request-termination
      #  config:
      #    status_code: 403
      #    message: "Access is forbidden."
      - name: cors
      - name: ip-restriction
        config:
          allow:
            - 127.0.0.1
            - ::1
            # Estacao de trabalho - valor vem de MCP_ALLOWED_IP no ambiente
            # (substituido pelo kong-entrypoint.sh). Nao versionar o IP aqui:
            # este repositorio e publico.
            - $MCP_ALLOWED_IP
          deny: []
      # Enable local access (danger zone!)`
);

// Fail loudly: if upstream reshapes this block the replace above becomes a no-op
// and /mcp would silently go back to returning 403 after a deploy.
if (!(await fs.promises.readFile(kongConfigPath, "utf8")).includes("$MCP_ALLOWED_IP")) {
  throw new Error(
    `MCP allowlist patch did not apply to ${kongConfigPath} - the upstream /mcp block changed. ` +
      `Reconcile the search string in supabase/update.js before deploying.`
  );
}

// KONG_TRUSTED_IPS is what makes the allowlist compare the real client instead of
// the Easypanel proxy. Scope it to the internal overlay network only: with recursive
// real-ip resolution, a spoofed X-Forwarded-For from the internet is discarded
// because the proxy appends the true peer address after it.
await utils.setServiceEnv("./code/docker-compose.yml", "kong", {
  MCP_ALLOWED_IP: "${MCP_ALLOWED_IP:-127.0.0.1}",
  KONG_TRUSTED_IPS: "${KONG_TRUSTED_IPS:-10.11.0.0/16}",
  KONG_REAL_IP_HEADER: "X-Forwarded-For",
  KONG_REAL_IP_RECURSIVE: "on",
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
  "############",
  "# MCP endpoint (/mcp)",
  "############",
  "# The /mcp route has NO authentication - this IP allowlist is the only barrier.",
  "# Leave as 127.0.0.1 to keep it unreachable from outside the host.",
  "MCP_ALLOWED_IP=127.0.0.1",
  "# Internal network Kong trusts for X-Forwarded-For. Must cover the Easypanel",
  "# proxy, and nothing else - widening this lets clients spoof their own IP.",
  "KONG_TRUSTED_IPS=10.11.0.0/16",
  "",
].join("\n");

await fs.promises.appendFile("./code/.env.example", portsEnvConfig);
