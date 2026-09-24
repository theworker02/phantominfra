import type { RouteCandidate } from "./types.js";

/** Declared tool an agent may call — maps to a registered engine route. */
export interface ToolSpec {
  name: string;
  description?: string;
  /** Alternate phrases that match this tool in free-text plans. */
  aliases?: string[];
}

/** Structured or free-text agent plan used to drive speculation. */
export interface AgentPlan {
  goal?: string;
  /** Ordered intended tool calls (highest intent first if confidence omitted). */
  steps?: AgentPlanStep[];
  /** Free-text plan / chain-of-thought used when steps are absent. */
  text?: string;
}

export interface AgentPlanStep {
  tool: string;
  args?: unknown;
  /** 0–1 confidence from the model; defaults evenly across steps. */
  confidence?: number;
}

export interface AgentPrediction {
  candidates: RouteCandidate[];
  matchedFrom: "steps" | "text" | "empty";
  goal?: string;
}

/**
 * Turn an agent plan into speculative route candidates.
 * Prefers explicit steps; falls back to alias/keyword scan of plan text.
 */
export function predictFromAgentPlan(
  plan: AgentPlan,
  tools: ToolSpec[],
  topK = 3,
): AgentPrediction {
  const toolNames = new Set(tools.map((t) => t.name));

  if (plan.steps && plan.steps.length > 0) {
    const scored = plan.steps
      .filter((s) => toolNames.has(s.tool))
      .map((s, index) => {
        const base = s.confidence ?? Math.max(0.15, 1 - index * 0.18);
        return {
          route: s.tool,
          probability: base,
          payload: s.args,
        } satisfies RouteCandidate;
      });

    const normalized = normalizeTop(scored, topK);
    return { candidates: normalized, matchedFrom: "steps", goal: plan.goal };
  }

  if (plan.text && plan.text.trim()) {
    const text = plan.text.toLowerCase();
    const scored: RouteCandidate[] = [];

    for (const tool of tools) {
      const needles = [tool.name, ...(tool.aliases ?? [])].map((n) =>
        n.toLowerCase(),
      );
      let hits = 0;
      for (const needle of needles) {
        if (text.includes(needle)) hits += 1;
      }
      if (hits > 0) {
        scored.push({
          route: tool.name,
          probability: Math.min(0.95, 0.35 + hits * 0.2),
        });
      }
    }

    scored.sort((a, b) => b.probability - a.probability);
    return {
      candidates: normalizeTop(scored, topK),
      matchedFrom: scored.length ? "text" : "empty",
      goal: plan.goal,
    };
  }

  return { candidates: [], matchedFrom: "empty", goal: plan.goal };
}

function normalizeTop(candidates: RouteCandidate[], topK: number): RouteCandidate[] {
  const dedup = new Map<string, RouteCandidate>();
  for (const c of candidates) {
    const prev = dedup.get(c.route);
    if (!prev || c.probability > prev.probability) dedup.set(c.route, c);
  }
  const list = [...dedup.values()].sort((a, b) => b.probability - a.probability);
  const top = list.slice(0, topK);
  const sum = top.reduce((a, c) => a + c.probability, 0) || 1;
  return top.map((c) => ({
    ...c,
    probability: Number((c.probability / sum).toFixed(4)),
  }));
}

/** Built-in agent tool catalog for commerce + support demos. */
export const AGENT_TOOLS: ToolSpec[] = [
  {
    name: "tools.search",
    description: "Search catalog inventory",
    aliases: ["search", "find product", "look up sku"],
  },
  {
    name: "tools.quote",
    description: "Price the current cart",
    aliases: ["quote", "price", "how much"],
  },
  {
    name: "tools.charge",
    description: "Capture payment (shadow during speculate)",
    aliases: ["charge", "pay", "stripe", "checkout", "purchase"],
  },
  {
    name: "tools.notify",
    description: "Send confirmation notification",
    aliases: ["email", "notify", "send receipt"],
  },
  {
    name: "tools.ticket",
    description: "Open a support ticket",
    aliases: ["ticket", "support", "help desk"],
  },
];
