/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_USE_MOCK: string;

  readonly VITE_CLOUDINARY_CLOUD_NAME: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET_PURCHASEORDER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
