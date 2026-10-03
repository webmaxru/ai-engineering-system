import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function workspacePath(path, root) {
  if (typeof path !== "string" || !path.trim()) {
    throw new Error("Workspace path must be a non-empty string.");
  }
  const base = realpathSync(resolve(root));
  const absolute = resolve(base, path);
  const within = relative(base, absolute);
  if (!within || isAbsolute(within) || within === ".." || within.startsWith(`..${sep}`)) {
    throw new Error("Workspace path must stay inside the repository.");
  }
  let cursor = base;
  for (const segment of within.split(sep)) {
    cursor = join(cursor, segment);
    try {
      if (lstatSync(cursor).isSymbolicLink()) {
        throw new Error(`Workspace path contains a symbolic link: ${path}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      break;
    }
  }
  return absolute;
}
