import { BugBaarAgent, TelemetryPayload } from "./agent";

export interface TaskJob {
  jobId: string;
  agent: BugBaarAgent;
  task: string;
  status: "queued" | "running" | "completed" | "failed";
  traces: TelemetryPayload[];
  result?: string;
  error?: string;
}

export class EngineWorker {
  private queue: TaskJob[] = [];
  private activeJobs: Map<string, TaskJob> = new Map();

  public enqueue(jobId: string, agent: BugBaarAgent, task: string): TaskJob {
    const job: TaskJob = {
      jobId,
      agent,
      task,
      status: "queued",
      traces: [],
    };
    this.queue.push(job);
    this.processNext();
    return job;
  }

  private async processNext(): Promise<void> {
    const job = this.queue.shift();
    if (!job) return;

    job.status = "running";
    this.activeJobs.set(job.jobId, job);

    job.agent.on("telemetry", (t: TelemetryPayload) => {
      job.traces.push(t);
    });

    try {
      const { result } = await job.agent.run(job.task);
      job.result = result;
      job.status = "completed";
    } catch (err: any) {
      job.error = err?.message || String(err);
      job.status = "failed";
    } finally {
      this.activeJobs.delete(job.jobId);
      if (this.queue.length > 0) {
        this.processNext();
      }
    }
  }

  public getJob(jobId: string): TaskJob | undefined {
    return this.activeJobs.get(jobId);
  }
}
