/**
 * Provenance-carrying commands.
 *
 * Every AI-driven mutation of the grid must be expressed as an undoable
 * {@link Command} (from `@lattica/core`) that also records *why* it happened:
 * which model, what prompt, the token usage and an optional rationale. Wrapping
 * a plain command with {@link withProvenance} preserves apply/invert semantics
 * while attaching this {@link Provenance}; the inverse keeps the same provenance
 * so an undo is auditable back to the originating AI call.
 */

import type { Command } from '@lattica/core';
import type { AIUsage } from './provider.js';

/** Audit metadata describing the AI call that produced a command. */
export interface Provenance {
  model: string;
  prompt: string;
  usage: AIUsage;
  rationale?: string;
}

/** A {@link Command} annotated with the AI {@link Provenance} that created it. */
export interface AICommand extends Command {
  readonly provenance: Provenance;
  invert(): AICommand;
}

/**
 * Wrap `command` so it carries `provenance`. The returned command delegates
 * apply/invert to the wrapped command; its inverse is itself an
 * {@link AICommand} carrying the same provenance.
 */
export function withProvenance(command: Command, provenance: Provenance): AICommand {
  return {
    label: command.label,
    provenance,
    apply(): void {
      command.apply();
    },
    invert(): AICommand {
      return withProvenance(command.invert(), provenance);
    },
  };
}
