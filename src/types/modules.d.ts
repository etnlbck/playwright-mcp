declare module 'url' {
  export function fileURLToPath(url: string | URL): string;
  export function dirname(path: string): string;
}

declare module 'path' {
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:fs' {
  export function writeFileSync(path: string, data: string | Buffer): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
}
