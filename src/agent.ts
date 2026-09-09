import { EventEmitter } from "events";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (args: any) => Promise<any>;
}

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  maxIterations?: number;
  tools?: ToolDefinition[];
}

export interface TelemetryPayload {
  agentId: string;
  step: number;
  action: string;
  input?: any;
  output?: any;
  durationMs: number;
  timestamp: string;
}

export class AgentBuilder {
  private config: AgentConfig;

  constructor(id: string, name: string) {
    this.config = {
      id,
      name,
      systemPrompt: "You are a helpful autonomous assistant.",
      model: "gpt-4o-mini",
      maxIterations: 5,
      tools: [],
    };
  }

  public setSystemPrompt(prompt: string): this {
    this.config.systemPrompt = prompt;
    return this;
  }

  public setModel(model: string): this {
    this.config.model = model;
    return this;
  }

  public setMaxIterations(count: number): this {
    this.config.maxIterations = count;
    return this;
  }

  public registerTool(tool: ToolDefinition): this {
    this.config.tools?.push(tool);
    return this;
  }

  public build(): BugBaarAgent {
    return new BugBaarAgent(this.config);
  }
}

export class BugBaarAgent extends EventEmitter {
  private config: AgentConfig;
  private toolsMap: Map<string, ToolDefinition> = new Map();

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    (config.tools || []).forEach((tool) => this.toolsMap.set(tool.name, tool));
  }

  public async run(task: string): Promise<{ result: string; traces: TelemetryPayload[] }> {
    const traces: TelemetryPayload[] = [];
    const maxIterations = this.config.maxIterations || 5;
    let iteration = 0;
    let currentInput = task;

    this.emit("start", { agentId: this.config.id, task });

    while (iteration < maxIterations) {
      iteration++;
      const startTime = Date.now();

      const stepDecision = await this.decideNextStep(currentInput, iteration);
      const durationMs = Date.now() - startTime;

      const telemetry: TelemetryPayload = {
        agentId: this.config.id,
        step: iteration,
        action: stepDecision.action,
        input: stepDecision.params,
        output: stepDecision.output,
        durationMs,
        timestamp: new Date().toISOString(),
      };
      traces.push(telemetry);
      this.emit("telemetry", telemetry);

      if (stepDecision.action === "finish") {
        this.emit("complete", { agentId: this.config.id, result: stepDecision.output });
        return { result: stepDecision.output ?? "", traces };
      }

      if (stepDecision.action === "call_tool") {
        const tool = this.toolsMap.get(stepDecision.toolName!);
        if (!tool) {
          throw new Error(`Tool ${stepDecision.toolName} not found in agent registry.`);
        }

        const toolStart = Date.now();
        const toolResult = await tool.handler(stepDecision.params);
        const toolDuration = Date.now() - toolStart;

        const toolTrace: TelemetryPayload = {
          agentId: this.config.id,
          step: iteration,
          action: `tool_executed:${tool.name}`,
          input: stepDecision.params,
          output: toolResult,
          durationMs: toolDuration,
          timestamp: new Date().toISOString(),
        };
        traces.push(toolTrace);
        this.emit("telemetry", toolTrace);

        currentInput = `Observation from ${tool.name}: ${JSON.stringify(toolResult)}`;
      }
    }

    return { result: "Execution limit reached before final consensus.", traces };
  }

  private async decideNextStep(
    context: string,
    step: number
  ): Promise<
    | { action: "call_tool"; toolName: string; params: Record<string, any>; output: null }
    | { action: "finish"; params: null; output: string }
  > {
    if (step === 1 && this.toolsMap.size > 0) {
      const firstTool = Array.from(this.toolsMap.keys())[0];
      return {
        action: "call_tool",
        toolName: firstTool,
        params: { query: context },
        output: null,
      };
    }

    return {
      action: "finish",
      params: null,
      output: `Completed processing task with context: [${context}]`,
    };
  }
}
