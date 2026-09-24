import type { IncomingMessage, ServerResponse } from "node:http";
import type { PhantomEngine } from "@phantominfra/runtime";
import {
  handleWithSpeculation,
  type SpeculateGateOptions,
} from "./gate.js";

export interface NodeAdapterOptions<TState extends object>
  extends Omit<SpeculateGateOptions<TState>, "engine"> {
  engine: PhantomEngine<TState>;
}

function toWebRequest(req: IncomingMessage, body: Buffer): Request {
  const host = req.headers.host ?? "localhost";
  const url = `http://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }
  const method = req.method ?? "GET";
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = new Uint8Array(body);
  }
  return new Request(url, init);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Node.js http.createServer-compatible listener.
 * Acquisition fit: AWS Lambda / Azure Functions via Node runtimes, local gateways.
 */
export function createNodeRequestListener<TState extends object>(
  options: NodeAdapterOptions<TState>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const body = await readBody(req);
      const request = toWebRequest(req, body);
      const result = await handleWithSpeculation(request, options);

      if (result instanceof Response) {
        res.statusCode = result.status;
        result.headers.forEach((v, k) => res.setHeader(k, v));
        const buf = Buffer.from(await result.arrayBuffer());
        res.end(buf);
        return;
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("x-phantom-hit", result.hit ? "1" : "0");
      res.setHeader("x-phantom-latency-ms", String(result.serverLatencyMs));
      res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };
}
