import { describe, it, expect, vi } from 'vitest';
import { AIClient } from './client.js';
import { MockProvider } from './provider.js';
import {
  planWorkflow,
  WorkflowRunner,
  type AuditEntry,
  type WorkflowStep,
} from './workflow.js';

/** Build an AIClient whose mock provider returns `object` from generateObject. */
function clientReturning(object: unknown): AIClient {
  return new AIClient(new MockProvider({ objects: [object] }));
}

describe('planWorkflow', () => {
  it('returns validated steps and preserves rationale', async () => {
    const client = clientReturning({
      steps: [
        { tool: 'sort', input: { col: 0 }, rationale: 'order the data' },
        { tool: 'filter', input: { col: 1, condition: 'gt' } },
      ],
    });
    const steps = await planWorkflow(client, 'sort then filter', ['sort', 'filter']);
    expect(steps).toEqual([
      { tool: 'sort', input: { col: 0 }, rationale: 'order the data' },
      { tool: 'filter', input: { col: 1, condition: 'gt' } },
    ]);
  });

  it('drops steps whose tool is not in the allowlist', async () => {
    const client = clientReturning({
      steps: [
        { tool: 'sort', input: 1 },
        { tool: 'rm -rf', input: 2 },
      ],
    });
    const steps = await planWorkflow(client, 'do stuff', ['sort']);
    expect(steps).toEqual([{ tool: 'sort', input: 1 }]);
  });

  it('drops structurally invalid steps', async () => {
    const client = clientReturning({
      steps: [
        { tool: 'sort', input: 1 },
        { tool: 123, input: 2 }, // tool not a string
        { input: 3 }, // missing tool
        { tool: 'sort' }, // missing input
        { tool: 'sort', input: 4, rationale: 5 }, // rationale not a string
        'nope', // not a record
      ],
    });
    const steps = await planWorkflow(client, 'x', ['sort']);
    expect(steps).toEqual([{ tool: 'sort', input: 1 }]);
  });

  it('returns [] when the model omits a steps array', async () => {
    const client = clientReturning({ notSteps: true });
    expect(await planWorkflow(client, 'x', ['sort'])).toEqual([]);
  });

  it('returns [] when the model returns a non-object', async () => {
    const client = clientReturning('not an object');
    expect(await planWorkflow(client, 'x', ['sort'])).toEqual([]);
  });
});

const steps: WorkflowStep[] = [
  { tool: 'sort', input: { col: 0 } },
  { tool: 'filter', input: { col: 1 } },
];

describe('WorkflowRunner', () => {
  it('approves all steps by default and records an applied audit entry each', () => {
    const executor = vi.fn((step: WorkflowStep) => `did ${step.tool}`);
    const runner = new WorkflowRunner(executor);
    const result = runner.run(steps);

    expect(executor).toHaveBeenCalledTimes(2);
    expect(result).toEqual<AuditEntry[]>([
      { step: steps[0]!, status: 'applied', output: 'did sort' },
      { step: steps[1]!, status: 'applied', output: 'did filter' },
    ]);
  });

  it('skips a rejected step and continues with the rest', () => {
    const executor = vi.fn((step: WorkflowStep) => step.tool);
    const runner = new WorkflowRunner(executor);
    const result = runner.run(steps, (step) => step.tool !== 'sort');

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(steps[1]);
    expect(result).toEqual<AuditEntry[]>([
      { step: steps[0]!, status: 'rejected' },
      { step: steps[1]!, status: 'applied', output: 'filter' },
    ]);
  });

  it('records an executor throw as failed and halts remaining steps', () => {
    const executor = vi.fn(() => {
      throw new Error('boom');
    });
    const runner = new WorkflowRunner(executor);
    const result = runner.run(steps);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result).toEqual<AuditEntry[]>([
      { step: steps[0]!, status: 'failed', error: 'boom' },
    ]);
  });

  it('stringifies a non-Error throw value', () => {
    const executor = vi.fn(() => {
      throw 'plain string failure';
    });
    const runner = new WorkflowRunner(executor);
    const result = runner.run([steps[0]!]);
    expect(result).toEqual<AuditEntry[]>([
      { step: steps[0]!, status: 'failed', error: 'plain string failure' },
    ]);
  });

  it('accumulates audit entries across multiple run calls', () => {
    const executor = vi.fn((step: WorkflowStep) => step.tool);
    const runner = new WorkflowRunner(executor);
    runner.run([steps[0]!]);
    runner.run([steps[1]!], () => false);

    expect(runner.getAudit()).toEqual<AuditEntry[]>([
      { step: steps[0]!, status: 'applied', output: 'sort' },
      { step: steps[1]!, status: 'rejected' },
    ]);
  });

  it('getAudit returns a defensive copy', () => {
    const runner = new WorkflowRunner(() => undefined);
    runner.run([steps[0]!]);
    const snapshot = runner.getAudit();
    snapshot.push({ step: steps[1]!, status: 'applied' });
    expect(runner.getAudit()).toHaveLength(1);
  });
});
