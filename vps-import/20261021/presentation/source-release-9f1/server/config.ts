import { oidcSettings, integerSetting, type OidcSettings, type UsageLimits } from "./auth-config.js";
import path from "node:path";
export interface Config {
  root: string;
  production: boolean;
  host: string;
  port: number;
  origin?: string;
  key?: string;
  model: string;
  database?: string;
  redis?: string;
  render: boolean;
  soffice: string;
  pdftoppm: string;
  localAdmin?: boolean;
  oidc?: OidcSettings;
  usageLimits?: UsageLimits;
}
export function config(): Config {
  return {
    root: path.resolve(process.env.DATA_DIR || "data"),
    production: process.env.APP_MODE === "production",
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 4310),
    origin: process.env.APP_ORIGIN,
    key: process.env.OPENAI_API_KEY,
    model: "gpt-6-luna",
    database: process.env.DATABASE_URL,
    redis: process.env.REDIS_URL,
    render: process.env.RENDER_PREVIEWS !== "false",
    soffice: process.env.SOFFICE_BIN || "soffice",
    pdftoppm: process.env.PDFTOPPM_BIN || "pdftoppm",
    localAdmin: process.env.LOCAL_ADMIN_ENABLED === "true",
    oidc: oidcSettings(process.env),
    usageLimits: {
      generations: integerSetting(process.env.DAILY_GENERATION_LIMIT, 25),
      ai: integerSetting(process.env.DAILY_AI_LIMIT, 50),
    },
  };
}
