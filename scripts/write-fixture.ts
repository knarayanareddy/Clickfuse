import { writeFileSync } from "node:fs";
import { buildIncidentBoard } from "../src/lib/investigation.ts";

writeFileSync("clickfuse-fixture.json", JSON.stringify(buildIncidentBoard(), null, 2));
console.log("Wrote clickfuse-fixture.json");
