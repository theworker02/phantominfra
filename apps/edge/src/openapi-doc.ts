/** Served at GET /openapi.json — keep in sync with ../openapi.yaml */
export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "PhantomInfra Edge API",
    version: "1.4.1",
    description:
      "Speculative zero-latency edge engine. Predict, pre-execute, commit or roll back.",
  },
  servers: [
    {
      url: "https://phantominfra-edge.matthewlooney5.workers.dev",
      description: "Live",
    },
    { url: "http://127.0.0.1:8787", description: "Local wrangler" },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        security: [],
        summary: "Liveness + global predictor stats",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/proof": {
      get: {
        security: [],
        summary: "Live hit-vs-miss latency proof",
        description:
          "Runs isolated speculate→confirm rounds for a HIT and a MISS. Query ?rounds=6 (max 20).",
        responses: { "200": { description: "Proof report with speedup" } },
      },
    },
    "/v1/value": {
      get: {
        security: [],
        summary: "Diligence value snapshot",
        description:
          "Combines live proof latency gap with global predictor mesh confirms.",
        responses: { "200": { description: "Value estimate" } },
      },
    },
    "/v1/demo": {
      post: {
        security: [],
        summary: "Interactive demo playground API",
        description:
          "Actions: session | speculate | confirm | run | proof. Pass surface (browse|checkout|support|…) and optional route. No API key.",
        responses: { "200": { description: "Demo result" } },
      },
    },
    "/openapi.json": {
      get: {
        security: [],
        summary: "OpenAPI document",
        responses: { "200": { description: "OpenAPI JSON" } },
      },
    },
    "/v1/predictor": {
      get: {
        summary: "Global KV predictor mesh stats",
        responses: {
          "200": { description: "Mesh stats + rate remaining" },
          "401": { description: "Unauthorized" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/v1/sessions": {
      post: {
        summary: "Create a sticky speculation session",
        responses: { "200": { description: "Session created" } },
      },
    },
    "/v1/sessions/{id}": {
      get: {
        summary: "Session status, branches, metrics, ledger",
        parameters: [{ $ref: "#/components/parameters/SessionId" }],
        responses: { "200": { description: "Session view" } },
      },
    },
    "/v1/sessions/{id}/speculate": {
      post: {
        summary: "Speculate from surface/history priors",
        parameters: [{ $ref: "#/components/parameters/SessionId" }],
        responses: { "200": { description: "Open branches" } },
      },
    },
    "/v1/sessions/{id}/confirm": {
      post: {
        summary: "Confirm a route (hit commit or cold path)",
        parameters: [{ $ref: "#/components/parameters/SessionId" }],
        responses: { "200": { description: "Confirm result" } },
      },
    },
    "/v1/sessions/{id}/agent/plan": {
      post: {
        summary: "Speculate from an agent plan",
        parameters: [{ $ref: "#/components/parameters/SessionId" }],
        responses: { "200": { description: "Tool branches" } },
      },
    },
    "/v1/sessions/{id}/events": {
      get: {
        summary: "SSE live event stream",
        parameters: [{ $ref: "#/components/parameters/SessionId" }],
        responses: { "200": { description: "text/event-stream" } },
      },
    },
    "/v1/sessions/{id}/metrics": {
      get: {
        summary: "Session metrics only",
        parameters: [{ $ref: "#/components/parameters/SessionId" }],
        responses: { "200": { description: "Metrics" } },
      },
    },
    "/v1/sessions/{id}/audit": {
      get: {
        summary: "Diligence audit bundle (metrics, ledger, predictor, value)",
        parameters: [{ $ref: "#/components/parameters/SessionId" }],
        responses: { "200": { description: "Audit bundle" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key from API_KEYS (local default: dev_phantom_key)",
      },
    },
    parameters: {
      SessionId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
    },
  },
} as const;
