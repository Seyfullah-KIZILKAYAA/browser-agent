import * as readline from "node:readline";
import { Approver } from "@ba/core";

/**
 * Terminal approver for destructive steps. --yes pre-approves everything
 * (only for workflows the user already reviewed).
 */
export function makeCliApprover(autoYes: boolean): Approver {
  return async (step, context) => {
    if (autoYes) return true;
    if (!process.stdin.isTTY) return false;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question(
        `DESTRUCTIVE step ${step.id} (${step.action}) in ${context}. Approve? [y/N] `,
        resolve,
      );
    });
    rl.close();
    return answer.trim().toLowerCase() === "y";
  };
}
