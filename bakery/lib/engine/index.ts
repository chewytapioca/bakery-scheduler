export * from "./types";
export * from "./catalog";
export * from "./scenario";
export * from "./sim";

import { makeScenario } from "./scenario";
import { createSim, runToEnd, summarize } from "./sim";
import type { PolicyId, Scenario, Summary } from "./types";

export const POLICIES: { id: PolicyId; name: string; blurb: string }[] = [
  { id: "fifo", name: "FIFO", blurb: "FIFO: every queue is served in arrival order, and the first free oven takes whatever is first in line." },
  { id: "edf", name: "Earliest deadline", blurb: "Earliest deadline: whatever is due soonest goes first, at every station and oven." },
  { id: "smart", name: "Slack + batching", blurb: "Slack + batching: short, urgent jobs go first, dough close to over-proofing jumps the queue, and ovens wait briefly for a fuller batch." },
];

export function runPolicy(policy: PolicyId, scenario: Scenario = makeScenario()): Summary {
  return summarize(runToEnd(createSim(structuredClone(scenario), policy)));
}
export function comparePolicies(scenario: Scenario = makeScenario()): Summary[] {
  return POLICIES.map((p) => runPolicy(p.id, scenario));
}