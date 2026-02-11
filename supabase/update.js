import utils from "../utils.js";

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
// Disable IPv6 at container level to fix :enetunreach errors with Postgrex
await utils.setServiceProperty("./code/docker-compose.yml", "realtime", "sysctls", ["net.ipv6.conf.all.disable_ipv6=1"]);

await utils.searchReplace(
  "./code/.env.example",
  "SITE_URL=http://localhost:3000",
  "SITE_URL=https://$(PRIMARY_DOMAIN)"
);
