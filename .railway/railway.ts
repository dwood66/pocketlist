import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "pocketlist";
export default defineRailway(() => {
  const pocketlist = service("pocketlist", {
    source: github("dwood66/pocketlist", { branch: "main", checkSuites: false, upstreamUrl: "https://github.com/dwood66/pocketlist" }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    start: "npm start",
    healthcheck: "/api/health",
    replicas: { "sfo": 1 },
  });

  return project("pocketlist", {
    variables: { managed: false },
    resources: [pocketlist],
  });
});
