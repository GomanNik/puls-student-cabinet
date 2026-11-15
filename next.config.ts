import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["argon2", "pg", "exceljs", "pdf-lib", "@pdf-lib/fontkit"],
  outputFileTracingIncludes: { "/api/v1/calendar/export": ["./src/assets/fonts/**/*"], "*": ["./src/assets/learning/*.pdf","./src/assets/learning/*.docx","./src/assets/learning/*.pptx","./src/assets/learning/*.xlsx"] },
  outputFileTracingExcludes: { "*": ["./_reference/**/*", "./*.zip", "./.local/**/*", "./.env*", "./документация/**/*"] },
};
export default config;
