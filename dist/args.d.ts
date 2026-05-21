import { type ToolFilterOptions } from './tools/index.js';
export interface ParsedArgs {
    transport: 'stdio' | 'http';
    host: string;
    port: number;
    portWasExplicit: boolean;
    filterOptions: ToolFilterOptions;
}
export declare function parseArgs(args: string[]): ParsedArgs;
//# sourceMappingURL=args.d.ts.map