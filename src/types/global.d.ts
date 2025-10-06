declare global {
  var process: NodeJS.Process;
  var console: Console;
  var setTimeout: (callback: () => void, ms: number) => number;
  var setInterval: (callback: () => void, ms: number) => number;
  var clearInterval: (id: number) => void;
  var fetch: typeof globalThis.fetch;
  var global: typeof globalThis;
  var require: NodeJS.Require;
}

declare global {
  namespace NodeJS {
    interface Process {
      argv: string[];
      env: NodeJS.ProcessEnv;
      version: string;
      platform: string;
      arch: string;
      exit(code?: number): never;
      on(event: string, listener: (...args: any[]) => void): this;
      uptime(): number;
      memoryUsage(): NodeJS.MemoryUsage;
      cwd(): string;
    }
    
    interface ProcessEnv {
      [key: string]: string | undefined;
    }
    
    interface Require {
      (id: string): any;
    }
    
    interface MemoryUsage {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    }
    
    type Timeout = number;
  }
}

export {};
