/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_LOCAL_CATALOG_API?: string;
  readonly VITE_CATALOG_API_BASE?: string;
  readonly VITE_CATALOG_API_PROXY_TARGET?: string;
  readonly VITE_MIXPANEL_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  litellmTrack?: (event: string, properties?: Record<string, unknown>) => void;
}
