export interface GitHubDeps {
  run?: (args: string[]) => string;
}
export interface GitHubRunOptions {
  token?: string;
}
export declare function runGitHub(args: string[], options?: GitHubRunOptions): string;
export declare function githubJson<T = unknown>(route: string, deps?: GitHubDeps): T;
export declare function githubPages<T = unknown>(route: string, deps?: GitHubDeps): T[];
