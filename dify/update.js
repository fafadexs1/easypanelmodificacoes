import utils from "../utils.js";

await utils.cloneOrPullRepo({ repo: "https://github.com/langgenius/dify.git" });
await utils.copyDir("./repo/docker", "./code");
await utils.removeContainerNames("./code/docker-compose.yaml");
await utils.removePorts("./code/docker-compose.yaml");

await utils.searchReplace(
  "./code/.env.example",
  "APP_WEB_URL=",
  "APP_WEB_URL=https://$(PRIMARY_DOMAIN)"
);

await utils.searchReplace(
  "./code/.env.example",
  "SECRET_KEY=sk-9f73s3ljTXVcMT3Blb3ljTqtsKiGHXVcMT3BlbkFJLK7U",
  "SECRET_KEY="
);
