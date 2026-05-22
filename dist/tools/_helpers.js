import { z } from 'zod';
import { formatError } from '../client.js';
export function defineTool(server, name, config, fetch) {
    // registerTool is generic in the SDK; the cast avoids fighting its complex overload resolution
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.registerTool(name, config, async (args) => {
        try {
            const result = await fetch(args);
            return {
                content: [{
                        type: 'text',
                        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                    }],
            };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
//# sourceMappingURL=_helpers.js.map