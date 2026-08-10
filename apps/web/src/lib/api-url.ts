const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

// Environment values can pick up an invisible BOM when entered from Windows PowerShell.
export const API_BASE_URL =
  configuredApiUrl?.replace(/\uFEFF/g, "").trim().replace(/\/+$/, "") ||
  "http://localhost:4000";
