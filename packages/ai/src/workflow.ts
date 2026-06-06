/**
 * Agent workflow with HITL approval + audit (Part A / Phase A12).
 *
 * Splits an AI-driven, multi-step grid task into two clearly separated phases:
 *
 * 1. **Planning** ({@link planWorkflow}) — the model proposes an ordered list of
 *    {@link WorkflowStep}s via the injected {@link AIClient}. Steps referencing a
 *    tool outside the caller-supplied allowlist are dropped, so a hallucinated
 *    tool can never reach execution.
 * 2. **Execution** ({@link WorkflowRunner}) — nothing is applied without explicit
 *    human approval (HITL). An injected {@link StepExecutor} performs the actual
 *    side effects, keeping this module decoupled from the data/grid layer. Every
 *    step yields an {@link AuditEntry}, forming a replayable audit trail.
 *
 * All model access is through {@link AIClient}, and all side effects go through
 * the executor, so every path is testable offline with a mock provider.
 */

import type { AIClient } from './client.js';

/** A single planned operation: an allowlisted tool plus its opaque input. */
export interface WorkflowStep {
  tool: string;
  input: unknown;
  rationale?: string;
}

/** Outcome record for one step, accumulated into the audit trail. */
export interface AuditEntry {
  step: WorkflowStep;
  status: 'applied' | 'rejected' | 'failed';
  output?: unknown;
  error?: string;
}

/** Performs the side effect for a step. Throws on failure. */
export type StepExecutor = (step: WorkflowStep) => unknown;

/** Structured result of {@link planWorkflow} (model output shape). */
export interface PlanResult {
  steps: WorkflowStep[];
}

/** JSON schema handed to the model describing the planned step list. */
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['steps'],
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tool', 'input'],
        properties: {
          tool: { type: 'string' },
          input: {},
          rationale: { type: 'string' },
        },
      },
    },
  },
} as const;

/** True when `value` is a plain (non-null, non-array) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural guard for one {@link WorkflowStep} coming back from the model. */
function isWorkflowStep(value: unknown): value is WorkflowStep {
  return (
    isRecord(value) &&
    typeof value.tool === 'string' &&
    'input' in value &&
    (value.rationale === undefined || typeof value.rationale === 'string')
  );
}

/**
 * Plan a multi-step workflow for `instruction`, restricted to `toolNames`.
 *
 * The model returns `{ steps: [{ tool, input, rationale? }] }`. Each item is
 * validated and any step whose `tool` is not in `toolNames` is dropped. Nothing
 * is executed here — planning is side-effect free.
 */
export async function planWorkflow(
  client: AIClient,
  instruction: string,
  toolNames: readonly string[],
): Promise<WorkflowStep[]> {
  const allowed = new Set(toolNames);
  const { object } = await client.generateObject<unknown>({
    system:
      'You plan a multi-step grid task as an ordered list of tool invocations. ' +
      'Use only the provided tools, referencing each by its exact name, and give ' +
      'a short rationale per step.',
    prompt: `Available tools: ${toolNames.join(', ')}\n\nInstruction: ${instruction}`,
    schema: PLAN_SCHEMA,
  });

  if (!isRecord(object) || !Array.isArray(object.steps)) {
    return [];
  }
  return object.steps
    .filter(isWorkflowStep)
    .filter((step) => allowed.has(step.tool))
    .map((step) => ({
      tool: step.tool,
      input: step.input,
      ...(step.rationale === undefined ? {} : { rationale: step.rationale }),
    }));
}

/** Default per-step approval: approve everything. */
function approveAll(): boolean {
  return true;
}

/**
 * Executes approved workflow steps in order while recording an audit trail.
 *
 * HITL: a step runs only when the `approve` callback returns true. A rejected
 * step is recorded as `'rejected'` and execution continues. An executor throw is
 * recorded as `'failed'` (with the error message) and halts all further steps.
 */
export class WorkflowRunner {
  private readonly executor: StepExecutor;
  private readonly audit: AuditEntry[] = [];

  constructor(executor: StepExecutor) {
    this.executor = executor;
  }

  /**
   * Apply `steps` in order. `approve` decides each step (default: approve all).
   * Returns the audit entries produced by this run.
   */
  run(
    steps: readonly WorkflowStep[],
    approve: (step: WorkflowStep) => boolean = approveAll,
  ): AuditEntry[] {
    const produced: AuditEntry[] = [];
    for (const step of steps) {
      if (!approve(step)) {
        const entry: AuditEntry = { step, status: 'rejected' };
        this.audit.push(entry);
        produced.push(entry);
        continue;
      }
      try {
        const output = this.executor(step);
        const entry: AuditEntry = { step, status: 'applied', output };
        this.audit.push(entry);
        produced.push(entry);
      } catch (err) {
        const entry: AuditEntry = {
          step,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        };
        this.audit.push(entry);
        produced.push(entry);
        break;
      }
    }
    return produced;
  }

  /** The accumulated audit trail across every {@link run} call. */
  getAudit(): AuditEntry[] {
    return [...this.audit];
  }
}
