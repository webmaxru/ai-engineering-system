import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";

export type WorkflowScannerSpawn = (
  command: string,
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

export interface SarifFinding {
  file: string;
  ruleId: string;
  level: string;
  suppressed: boolean;
  uri: string | null;
  line: number | null;
  locations: Array<{ uri: string; line: number | null }>;
}

export interface SarifValidation {
  ok: boolean;
  errors: string[];
  findings: SarifFinding[];
  tools: Array<{ name: string; version: string | null }>;
}

export declare const ZIZMOR_VERSION: "1.30.0";
export declare const ZIZMOR_IMAGE: string;
export declare function validateSarif(sarif: unknown, file?: string): SarifValidation;
export declare function checkSarif(
  path: string,
  options?: { read?: (file: string) => string },
): SarifValidation & { files: string[] };
export declare function scanWorkflows(options?: {
  root?: string;
  spawn?: WorkflowScannerSpawn;
  read?: (file: string) => string;
}): {
  ok: boolean;
  generatedAt: string;
  image: string;
  version: string;
  files: string[];
  sourceDigest: string | null;
  artifact: string | null;
  artifactDigest: string | null;
  scannerExitCode: number | null;
  configuration: string | null;
  suppressionDirectives: Array<{ file: string; line: number; rules: string[] }>;
  diagnosticsDigest: string | null;
  findings: SarifFinding[];
  errors: string[];
  exitCode: number;
  limits: string[];
};
