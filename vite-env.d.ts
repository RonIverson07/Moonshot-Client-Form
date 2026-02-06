/// <reference types="vite/client" />

type ViteApiBaseUrl = string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: ViteApiBaseUrl;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'html2pdf.js';
