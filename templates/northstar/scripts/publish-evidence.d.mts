export interface EvidenceLinks {
  run?: string | null;
}

export declare function renderComment(
  report: Record<string, unknown>,
  links?: EvidenceLinks,
): string;
