export declare function checkMerge(
  base: string,
  options?: { run?: (...args: unknown[]) => unknown },
): { ok: boolean; tree: string | null; message: string };
