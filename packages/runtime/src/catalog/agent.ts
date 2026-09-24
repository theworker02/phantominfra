import type { HandlerContext, RouteHandler } from "../types.js";
import type { CartState } from "./cart.js";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Agent tool handlers with shadow effects.
 * External I/O is simulated during speculate; real apply runs only on commit.
 */
export function createAgentToolHandlers(
  workDelayScale = 1,
): Record<string, RouteHandler<CartState>> {
  const d = (ms: number) => delay(ms * workDelayScale);

  return {
    "tools.search": async (ctx: HandlerContext<CartState>) => {
      await d(40);
      const q =
        typeof ctx.payload === "object" &&
        ctx.payload &&
        "query" in ctx.payload
          ? String((ctx.payload as { query: string }).query)
          : "edge";
      const matches = Object.keys(ctx.state.inventory).filter((sku) =>
        sku.includes(q.toLowerCase().replace(/\s+/g, "-")),
      );
      ctx.mutate((s) => {
        s.notes.push(`search:${q}`);
      });
      return { ok: true, matches: matches.length ? matches : ["edge-node"] };
    },

    "tools.quote": async (ctx: HandlerContext<CartState>) => {
      await d(35);
      const total = Math.max(ctx.state.cart.length, 1) * 49;
      return { ok: true, total, currency: "usd" };
    },

    "tools.charge": async (ctx: HandlerContext<CartState>) => {
      await d(70);
      const total = Math.max(ctx.state.cart.length, 1) * 49;
      let intentId = `pi_shadow_${ctx.branchId}`;

      await ctx.effect(
        "stripe.capture",
        async () => {
          // Real capture — only on commit
          intentId = `pi_live_${Date.now().toString(36)}`;
          ctx.state.notes.push(`stripe.captured:${intentId}`);
        },
        {
          shadow: async () => {
            ctx.mutate((s) => {
              s.notes.push(`stripe.shadow:${intentId}`);
            });
          },
        },
      );

      ctx.mutate((s) => {
        for (const item of s.cart) {
          s.inventory[item.sku] = (s.inventory[item.sku] ?? 0) - item.qty;
        }
        s.wallet -= total;
        s.orders.push({ id: `ord_${s.orders.length + 1}`, total });
        s.cart = [];
      });

      return { ok: true, total, paymentIntent: intentId, shadowed: true };
    },

    "tools.notify": async (ctx: HandlerContext<CartState>) => {
      await d(30);
      await ctx.effect(
        "email.send",
        async () => {
          ctx.state.notes.push("email.sent");
        },
        {
          shadow: async () => {
            ctx.mutate((s) => {
              s.notes.push("email.shadow");
            });
          },
        },
      );
      return { ok: true, channel: "email" };
    },

    "tools.ticket": async (ctx: HandlerContext<CartState>) => {
      await d(45);
      const ticketId = `t_${Math.floor(Math.random() * 90 + 10)}`;
      ctx.mutate((s) => {
        s.notes.push(`ticket:${ticketId}`);
      });
      return { ok: true, ticketId };
    },
  };
}

export function applyAgentSurfacePriors(
  setPrior: (surface: string, route: string, w: number) => void,
): void {
  setPrior("agent", "tools.charge", 8);
  setPrior("agent", "tools.quote", 6);
  setPrior("agent", "tools.search", 4);
  setPrior("agent", "tools.notify", 3);
  setPrior("agent", "tools.ticket", 2);

  setPrior("search", "tools.search", 10);
  setPrior("search", "tools.quote", 3);
  setPrior("search", "cart.add", 2);
}
