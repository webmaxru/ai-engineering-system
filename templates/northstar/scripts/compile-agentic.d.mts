export declare function compilationResult(result: {
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
  error?: Error;
}): { ok: boolean; reason: string };
