import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { githubJson } from "./github-api.mjs";

export const PLAN_DIRECTORY = "docs/plans";
const MAX_PLAN_BYTES = 1024 * 1024;
const SHA = /^[0-9a-f]{40}$/;

export function localProposalPath(file, root) {
  if (!["artifacts/plan-proposal.md", "artifacts/plan.json"].includes(file)) {
    throw new Error("Only an explicit canonical local proposal path is supported.");
  }
  const directory = resolve(root, "artifacts");
  const target = resolve(root, file);
  const parent = lstatSync(directory);
  const entry = lstatSync(target);
  if (parent.isSymbolicLink() || !parent.isDirectory() ||
      entry.isSymbolicLink() || !entry.isFile() || entry.size > MAX_PLAN_BYTES) {
    throw new Error("A local proposal must be a bounded regular file in the owned artifacts directory.");
  }
  return target;
}

export function planArtifactPath(taskId) {
  const id = String(taskId ?? "").toLowerCase();
  if (
    !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(id) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/.test(id)
  ) {
    throw new Error("Task ID cannot be represented as a portable plan artifact path.");
  }
  return `${PLAN_DIRECTORY}/${id}.md`;
}

export function validatePlanOnlyFiles({ taskId, files, entry }) {
  const path = planArtifactPath(taskId);
  if (
    !Array.isArray(files) || files.length !== 1 ||
    files[0].filename !== path ||
    !["added", "modified"].includes(files[0].status) ||
    files[0].previous_filename
  ) {
    return { ok: false, reason: `A plan-only PR may only add or modify ${path}.` };
  }
  if (
    entry?.type !== "blob" || entry?.mode !== "100644" ||
    entry?.path !== path.split("/").at(-1) || !SHA.test(entry?.sha ?? "") ||
    (files[0].sha && files[0].sha !== entry.sha)
  ) {
    return { ok: false, reason: "The plan must be the expected non-executable regular Git blob." };
  }
  return { ok: true, path, blobSha: entry.sha };
}

export function readPlanArtifact(headSha, taskId, deps = {}) {
  if (!SHA.test(headSha)) throw new Error("Plan artifact reads require an immutable commit SHA.");
  const path = planArtifactPath(taskId);
  const commit = githubJson(`repos/{owner}/{repo}/git/commits/${headSha}`, deps);
  let treeSha = commit.tree?.sha;
  let entry;
  const segments = path.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    if (!SHA.test(treeSha ?? "")) throw new Error("The plan's Git tree identity is invalid.");
    const tree = githubJson(`repos/{owner}/{repo}/git/trees/${treeSha}`, deps);
    if (tree.truncated !== false || !Array.isArray(tree.tree)) {
      throw new Error("The plan's Git tree could not be read completely.");
    }
    entry = tree.tree.find((candidate) => candidate.path === segments[index]);
    if (!entry) throw new Error(`The committed plan artifact ${path} is missing.`);
    if (index < segments.length - 1) {
      if (entry.type !== "tree" || entry.mode !== "040000") {
        throw new Error("A plan artifact parent is not a regular Git directory.");
      }
      treeSha = entry.sha;
    }
  }
  if (entry.type !== "blob" || entry.mode !== "100644" || !SHA.test(entry.sha)) {
    throw new Error("Executable, symlink, and submodule plan artifacts are prohibited.");
  }
  const blob = githubJson(`repos/{owner}/{repo}/git/blobs/${entry.sha}`, deps);
  if (
    blob.sha !== entry.sha || blob.encoding !== "base64" ||
    !Number.isSafeInteger(blob.size) || blob.size < 1 || blob.size > MAX_PLAN_BYTES ||
    typeof blob.content !== "string" || !/^[A-Za-z0-9+/=\r\n]+$/.test(blob.content)
  ) {
    throw new Error("The committed plan blob is invalid or exceeds the 1 MiB review limit.");
  }
  const bytes = Buffer.from(blob.content, "base64");
  if (bytes.length !== blob.size) throw new Error("The committed plan blob size does not match its content.");
  return {
    path,
    entry,
    body: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  };
}
