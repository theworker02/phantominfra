/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EDGE_URL?: string;
  readonly VITE_EDGE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
