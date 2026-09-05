export interface SecretFinding {
  id: string;
  file: string;
  line: number;
}

export declare const SECRET_PATTERNS: ReadonlyArray<{
  id: string;
  pattern: RegExp;
}>;
export declare function scanText(text: string, file?: string): SecretFinding[];
export declare function scanTrackedFiles(files: string[]): SecretFinding[];
