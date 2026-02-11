import utils from "../utils.js";

await utils.downloadFile(
  "https://appwrite.io/install/compose",
  "./code/docker-compose.yml"
);
await utils.downloadFile(
  "https://appwrite.io/install/env",
  "./code/.env.example"
);

await utils.removeContainerNames("./code/docker-compose.yml");
await utils.removePorts("./code/docker-compose.yml");

await utils.searchReplace(
  "./code/.env.example",
  "_APP_DOMAIN=localhost",
  "_APP_DOMAIN=$(PRIMARY_DOMAIN)"
);
