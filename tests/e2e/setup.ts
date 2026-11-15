import { execFileSync } from "node:child_process";
export default function setup() {
  execFileSync(process.execPath, ["--conditions=react-server", "--import=tsx", "scripts/e2e-seed.ts"], { stdio: "inherit", windowsHide: true });
}
