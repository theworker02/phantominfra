import type { RouteCandidate } from "./types.js";

/** Guards what speculation is allowed to open. */
export interface SpeculationPolicy {
  /** Absolute cap on concurrent open branches (default: unlimited). */
  maxBranches?: number;
  /** Routes that must never be speculated. */
  denyRoutes?: string[];
  /** If set, only these routes may be speculated. */
  allowRoutes?: string[];
  /** Minimum probability after filtering (overrides engine min when stricter). */
  minProbability?: number;
  /** Effect labels that require a shadow callback during speculate. */
  requireShadowFor?: string[];
}

export interface PolicyDecision {
  allowed: RouteCandidate[];
  denied: { route: string; reason: string }[];
}

export function applySpeculationPolicy(
  candidates: RouteCandidate[],
  policy: SpeculationPolicy | undefined,
): PolicyDecision {
  if (!policy) {
    return { allowed: candidates, denied: [] };
  }

  const denied: { route: string; reason: string }[] = [];
  let allowed = [...candidates];

  if (policy.denyRoutes?.length) {
    const deny = new Set(policy.denyRoutes);
    allowed = allowed.filter((c) => {
      if (deny.has(c.route)) {
        denied.push({ route: c.route, reason: "denied_by_policy" });
        return false;
      }
      return true;
    });
  }

  if (policy.allowRoutes?.length) {
    const allow = new Set(policy.allowRoutes);
    allowed = allowed.filter((c) => {
      if (!allow.has(c.route)) {
        denied.push({ route: c.route, reason: "not_in_allowlist" });
        return false;
      }
      return true;
    });
  }

  if (policy.minProbability != null) {
    allowed = allowed.filter((c) => {
      if (c.probability < policy.minProbability!) {
        denied.push({ route: c.route, reason: "below_policy_min_probability" });
        return false;
      }
      return true;
    });
  }

  if (policy.maxBranches != null && policy.maxBranches >= 0) {
    const kept = allowed.slice(0, policy.maxBranches);
    for (const c of allowed.slice(policy.maxBranches)) {
      denied.push({ route: c.route, reason: "max_branches" });
    }
    allowed = kept;
  }

  return { allowed, denied };
}
