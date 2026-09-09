# BugBaar Engine - Agent Builder & Task Orchestration

Lightweight, production-ready AI Agent Builder framework featuring:
- **AgentBuilder DSL**: Fluid configuration of models, system prompts, loop limits, and registered tools.
- **Autonomous ReAct Engine**: Step controller supporting cyclic Thought -> Action -> Observation execution.
- **Telemetry Event Bus**: Non-blocking EventEmitter publishing runtime latency, step traces, and output payloads.
- **EngineWorker**: Asynchronous background queue for executing autonomous agent jobs.

## Setup & Run

```bash
npm install
npm run test
```
