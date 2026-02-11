import utils from "../utils.js";

await utils.removeDir("./code");
await utils.renameDir("./plane-code", "./code");
await utils.removeDir("./code/archive");
await utils.renameFile("./code/plane.env", "./code/.env.example");
await utils.renameFile("./code/docker-compose.yaml", "./code/docker-compose.yml");

await utils.removeContainerNames("./code/docker-compose.yml");
await utils.removePorts("./code/docker-compose.yml");

await utils.searchReplace(
  "./code/.env.example",
  "APP_DOMAIN=localhost",
  "APP_DOMAIN=$(PRIMARY_DOMAIN)"
);

await utils.searchReplace(
  "./code/.env.example",
  "WEB_URL=http://${APP_DOMAIN}",
  "WEB_URL=https://$(PRIMARY_DOMAIN)"
);

await utils.searchReplace(
  "./code/.env.example",
  "CORS_ALLOWED_ORIGINS=http://${APP_DOMAIN}",
  "CORS_ALLOWED_ORIGINS=https://$(PRIMARY_DOMAIN)"
);
