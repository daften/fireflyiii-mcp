import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchRuleGroups(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchRuleGroup(client: FireflyClient, id: string): Promise<UnwrappedSingle>;
export declare function createRuleGroup(client: FireflyClient, params: {
    title: string;
    description?: string;
    active?: boolean;
}): Promise<UnwrappedSingle>;
export declare function updateRuleGroup(client: FireflyClient, id: string, params: {
    title?: string;
    description?: string;
    active?: boolean;
}): Promise<UnwrappedSingle>;
export declare function deleteRuleGroup(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
type RuleTriggerInput = {
    type: string;
    value: string;
    prohibited?: boolean;
    active?: boolean;
    stop_processing?: boolean;
    order?: number;
};
type RuleActionInput = {
    type: string;
    value: string | null;
    active?: boolean;
    stop_processing?: boolean;
    order?: number;
};
export declare function fetchRules(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchRule(client: FireflyClient, id: string): Promise<UnwrappedSingle>;
export declare function createRule(client: FireflyClient, params: {
    title: string;
    rule_group_id: string;
    trigger: string;
    triggers: RuleTriggerInput[];
    actions: RuleActionInput[];
    description?: string;
    active?: boolean;
    strict?: boolean;
    stop_processing?: boolean;
}): Promise<UnwrappedSingle>;
export declare function updateRule(client: FireflyClient, id: string, params: {
    title?: string;
    rule_group_id?: string;
    trigger?: string;
    triggers?: RuleTriggerInput[];
    actions?: RuleActionInput[];
    description?: string;
    active?: boolean;
    strict?: boolean;
    stop_processing?: boolean;
}): Promise<UnwrappedSingle>;
export declare function deleteRule(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function triggerRuleGroup(client: FireflyClient, id: string, params: {
    start?: string;
    end?: string;
    accounts?: number[];
}): Promise<{
    triggered: true;
    id: string;
}>;
export declare function triggerRule(client: FireflyClient, id: string, params: {
    start?: string;
    end?: string;
    accounts?: number[];
}): Promise<{
    triggered: true;
    id: string;
}>;
export declare function testRuleGroup(client: FireflyClient, id: string, params: {
    start?: string;
    end?: string;
    accounts?: number[];
    search_limit?: number;
    triggered_limit?: number;
}): Promise<UnwrappedList>;
export declare function testRule(client: FireflyClient, id: string, params: {
    start?: string;
    end?: string;
    accounts?: number[];
    search_limit?: number;
    triggered_limit?: number;
}): Promise<UnwrappedList>;
export declare function registerRuleTools(server: McpServer, client: FireflyClient): void;
export {};
//# sourceMappingURL=rules.d.ts.map