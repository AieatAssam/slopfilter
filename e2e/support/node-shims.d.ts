declare module 'node:fs/promises' {
  export function mkdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<string | undefined>;
  export function rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
