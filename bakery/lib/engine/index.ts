export * from "./types";
export * from "./catalog";
export * from "./scenario";
export * from "./sim";

import { makeScenario } from "./scenario";
import { createSim, runToEnd, summarize } from "./sim";
import type { PolicyId, Scenario, Summary } from "./types";

export const POLICIES: { id: PolicyId; name: string; blurb: string }[] = [
  { id: "fifo", name: "FIFO", blurb: "First come, first served; first free oven" },
  { id: "edf", name: "Earliest deadline", blurb: "Most urgent order first; greedy batches" },
  { id: "smart", name: "Slack + batching", blurb: "Least slack & proof risk first, reserves ingredients, scores oven batches by fill, temperature changeover and urgency" },
];

export function runPolicy(policy: PolicyId, scenario: Scenario = makeScenario()): Summary {
  return summarize(runToEnd(createSim(structuredClone(scenario), policy)));
}
export function comparePolicies(scenario: Scenario = makeScenario()): Summary[] {
  return POLICIES.map((p) => runPolicy(p.id, scenario));
}
