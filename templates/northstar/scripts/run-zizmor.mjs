import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-v",
    `${root}:/workdir`,
    "-w",
    "/workdir",
    "ghcr.io/zizmorcore/zizmor:latest",
    "--format",
    "plain",
    ".github/workflows/daily-repository-status.lock.yml",
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

process.exit(result.status ?? 1);
