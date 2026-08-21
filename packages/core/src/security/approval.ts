import { Step } from "@ba/shared";

/**
 * Human-in-the-loop gate. Steps with risk "destructive" (payment, delete,
 * irreversible submit) always require approval — this cannot be disabled by
 * configuration, only satisfied by an approver implementation.
 */
export type Approver = (step: Step, context: string) => Promise<boolean>;

export async function checkApproval(
  step: Step,
  approver: Approver | undefined,
  context: string,
): Promise<void> {
  if (step.risk !== "destructive") return;
  if (!approver) {
    throw new Error(
      `Step ${step.id} is destructive and no approver is configured — refusing to run.`,
    );
  }
  const ok = await approver(step, context);
  if (!ok) throw new Error(`Step ${step.id} rejected by user.`);
}
