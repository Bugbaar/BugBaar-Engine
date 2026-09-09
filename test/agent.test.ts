import { AgentBuilder } from "../src/agent";
import { EngineWorker } from "../src/engine";

async function verifyAgentSystem() {
  const worker = new EngineWorker();

  const searchTool = {
    name: "data_lookup",
    description: "Fetches information from internal index",
    parameters: { type: "object", properties: { query: { type: "string" } } },
    handler: async (args: { query: string }) => ({
      status: "success",
      data: `Lookup result for: ${args.query}`,
    }),
  };

  const candidateAgent = new AgentBuilder("talent-agent-01", "Candidate Matcher")
    .setSystemPrompt("Match inbound talent against hiring requisitions.")
    .registerTool(searchTool)
    .setMaxIterations(3)
    .build();

  const job = worker.enqueue("job-101", candidateAgent, "Evaluate Python Engineer candidates");

  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log("Job status:", job.status);
  console.log("Telemetry steps recorded:", job.traces.length);
  console.log("Final Agent Output:", job.result);
}

verifyAgentSystem();
