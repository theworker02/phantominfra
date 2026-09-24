import type { HandlerContext, RouteHandler } from "../types.js";

export interface CartState {
  cart: { sku: string; qty: number }[];
  inventory: Record<string, number>;
  orders: { id: string; total: number }[];
  wallet: number;
  notes: string[];
}

export const DEFAULT_CART_STATE: CartState = {
  cart: [{ sku: "edge-node", qty: 1 }],
  inventory: { "edge-node": 42, "gpu-slice": 8 },
  orders: [],
  wallet: 500,
  notes: [],
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Shared checkout catalog used by CLI, web demo, and edge Worker. */
export function createCartHandlers(
  workDelayScale = 1,
): Record<string, RouteHandler<CartState>> {
  const d = (ms: number) => delay(ms * workDelayScale);

  return {
    "cart.add": async (ctx: HandlerContext<CartState>) => {
      await d(35);
      ctx.mutate((s) => {
        s.cart.push({ sku: "gpu-slice", qty: 1 });
      });
      return { ok: true, items: ctx.state.cart.length };
    },
    "cart.remove": async (ctx: HandlerContext<CartState>) => {
      await d(25);
      ctx.mutate((s) => {
        s.cart.pop();
      });
      return { ok: true, items: ctx.state.cart.length };
    },
    "inventory.check": async (ctx: HandlerContext<CartState>) => {
      await d(40);
      const sku =
        typeof ctx.payload === "object" &&
        ctx.payload &&
        "sku" in ctx.payload
          ? String((ctx.payload as { sku: string }).sku)
          : "gpu-slice";
      const qty = ctx.state.inventory[sku] ?? 0;
      ctx.mutate((s) => {
        s.notes.push(`inventory:${sku}=${qty}`);
      });
      return { ok: true, sku, qty };
    },
    "checkout.quote": async (ctx: HandlerContext<CartState>) => {
      await d(55);
      const total = ctx.state.cart.length * 49;
      return { ok: true, total };
    },
    "checkout.confirm": async (ctx: HandlerContext<CartState>) => {
      await d(85);
      const total = Math.max(ctx.state.cart.length, 1) * 49;
      ctx.mutate((s) => {
        for (const item of s.cart) {
          s.inventory[item.sku] = (s.inventory[item.sku] ?? 0) - item.qty;
        }
        s.wallet -= total;
        s.orders.push({ id: `ord_${s.orders.length + 1}`, total });
        s.cart = [];
      });
      ctx.effect("ledger.write", async () => {
        ctx.state.notes.push("order committed");
      });
      return { ok: true, total };
    },
    "support.ticket": async (ctx: HandlerContext<CartState>) => {
      await d(45);
      ctx.mutate((s) => {
        s.notes.push("ticket opened");
      });
      return { ok: true, ticketId: `t_${Math.floor(Math.random() * 90 + 10)}` };
    },
    "support.refund": async (ctx: HandlerContext<CartState>) => {
      await d(60);
      const credit = 49;
      ctx.mutate((s) => {
        s.wallet += credit;
        s.notes.push(`refund:${credit}`);
      });
      return { ok: true, credit };
    },
  };
}

export function applyCartSurfacePriors(setPrior: (surface: string, route: string, w: number) => void): void {
  setPrior("browse", "cart.add", 9);
  setPrior("browse", "inventory.check", 4);
  setPrior("browse", "checkout.quote", 2);

  setPrior("quote", "checkout.quote", 10);
  setPrior("quote", "cart.add", 3);
  setPrior("quote", "checkout.confirm", 2);

  setPrior("checkout", "checkout.confirm", 10);
  setPrior("checkout", "checkout.quote", 5);
  setPrior("checkout", "cart.add", 1);

  setPrior("support", "support.ticket", 10);
  setPrior("support", "support.refund", 5);
  setPrior("support", "checkout.quote", 1);

  setPrior("inventory", "inventory.check", 10);
  setPrior("inventory", "cart.add", 4);
  setPrior("inventory", "cart.remove", 2);
}
