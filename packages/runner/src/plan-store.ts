import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BatchPlanSchema, type BatchPlan } from "@aibench/contracts";

export class PlanStore {
  constructor(private readonly options: { plansRoot: string }) {}

  private pathFor(planId: string): string {
    if (!/^plan-20\d{6}-[a-f0-9]{6}$/.test(planId)) {
      throw new Error(`Invalid plan id: ${planId}`);
    }
    return join(this.options.plansRoot, `${planId}.json`);
  }

  async save(plan: BatchPlan): Promise<void> {
    const validated = BatchPlanSchema.parse(plan);
    await mkdir(this.options.plansRoot, { recursive: true });
    try {
      await writeFile(this.pathFor(validated.planId), `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`Plan already exists: ${validated.planId}`);
      }
      throw error;
    }
  }

  async load(planId: string): Promise<BatchPlan> {
    return BatchPlanSchema.parse(JSON.parse(await readFile(this.pathFor(planId), "utf8")));
  }
}
