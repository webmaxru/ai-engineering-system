export interface EvidenceLinks {
  run?: string | null;
}

export declare function renderComment(
  report: Record<string, unknown>,
  links?: EvidenceLinks,
): string;
export declare function existingCommentId(
  pr: number | string,
  publisher: string,
  deps?: import("./github-api.d.mts").GitHubDeps,
): number | null;
