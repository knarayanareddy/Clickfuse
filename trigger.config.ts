import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_clickfuse_local",
  dirs: ["./trigger"],
  maxDuration: 120
});
