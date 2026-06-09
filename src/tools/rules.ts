import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import {
  type JsonApiListResponse,
  type JsonApiSingleResponse,
  type UnwrappedList,
  type UnwrappedSingle,
  unwrapList,
  unwrapSingle,
} from '../transform.js';
import type { QueryParams } from '../types.js';
import { DELETE_ANNOTATIONS, READ_ANNOTATIONS, UPDATE_ANNOTATIONS, WRITE_ANNOTATIONS } from './_annotations.js';
import { dateSchema, defineTool } from './_helpers.js';

// ---- Rule group fetch + CRUD ----

export async function fetchRuleGroups(
  client: FireflyClient,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/rule-groups', query);
  return unwrapList(response);
}

export async function fetchRuleGroup(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/rule-groups/${id}`);
  return unwrapSingle(response);
}

export async function createRuleGroup(
  client: FireflyClient,
  params: { title: string; description?: string; active?: boolean },
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/rule-groups', params);
  return unwrapSingle(response);
}

export async function updateRuleGroup(
  client: FireflyClient,
  id: string,
  params: { title?: string; description?: string; active?: boolean },
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/rule-groups/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteRuleGroup(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/rule-groups/${id}`);
  return { deleted: true, id };
}

// ---- Rule fetch + CRUD ----

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

export async function fetchRules(
  client: FireflyClient,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/rules', query);
  return unwrapList(response);
}

export async function fetchRule(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/rules/${id}`);
  return unwrapSingle(response);
}

export async function createRule(
  client: FireflyClient,
  params: {
    title: string;
    rule_group_id: string;
    trigger: string;
    triggers: RuleTriggerInput[];
    actions: RuleActionInput[];
    description?: string;
    active?: boolean;
    strict?: boolean;
    stop_processing?: boolean;
  },
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/rules', params);
  return unwrapSingle(response);
}

export async function updateRule(
  client: FireflyClient,
  id: string,
  params: {
    title?: string;
    rule_group_id?: string;
    trigger?: string;
    triggers?: RuleTriggerInput[];
    actions?: RuleActionInput[];
    description?: string;
    active?: boolean;
    strict?: boolean;
    stop_processing?: boolean;
  },
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/rules/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteRule(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/rules/${id}`);
  return { deleted: true, id };
}

// ---- Trigger and test operations ----

export async function triggerRuleGroup(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; accounts?: number[] },
): Promise<{ triggered: true; id: string }> {
  const query: QueryParams = {};
  if (params.start) query.start = params.start;
  if (params.end) query.end = params.end;
  if (params.accounts?.length) query['accounts[]'] = params.accounts;
  await client.post<void>(`/rule-groups/${id}/trigger`, {}, query);
  return { triggered: true, id };
}

export async function triggerRule(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; accounts?: number[] },
): Promise<{ triggered: true; id: string }> {
  const query: QueryParams = {};
  if (params.start) query.start = params.start;
  if (params.end) query.end = params.end;
  if (params.accounts?.length) query['accounts[]'] = params.accounts;
  await client.post<void>(`/rules/${id}/trigger`, {}, query);
  return { triggered: true, id };
}

export async function testRuleGroup(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; accounts?: number[]; search_limit?: number; triggered_limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = {};
  if (params.start) query.start = params.start;
  if (params.end) query.end = params.end;
  if (params.accounts?.length) query['accounts[]'] = params.accounts;
  if (params.search_limit !== undefined) query.search_limit = params.search_limit;
  if (params.triggered_limit !== undefined) query.triggered_limit = params.triggered_limit;
  const response = await client.get<JsonApiListResponse>(`/rule-groups/${id}/test`, query);
  return unwrapList(response);
}

export async function fetchRuleGroupRules(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>(`/rule-groups/${id}/rules`, query);
  return unwrapList(response);
}

export async function testRule(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; accounts?: number[]; search_limit?: number; triggered_limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = {};
  if (params.start) query.start = params.start;
  if (params.end) query.end = params.end;
  if (params.accounts?.length) query['accounts[]'] = params.accounts;
  if (params.search_limit !== undefined) query.search_limit = params.search_limit;
  if (params.triggered_limit !== undefined) query.triggered_limit = params.triggered_limit;
  const response = await client.get<JsonApiListResponse>(`/rules/${id}/test`, query);
  return unwrapList(response);
}

const triggerTypeSchema = z
  .string()
  .describe(
    'Trigger type. Common values: from_account_starts, from_account_ends, from_account_is, from_account_contains, to_account_starts, to_account_ends, to_account_is, to_account_contains, amount_less, amount_exactly, amount_more, description_starts, description_ends, description_contains, description_is, transaction_type, category_is, budget_is, tag_is, currency_is, has_attachments, has_no_category, has_any_category, has_no_budget, has_any_budget, has_no_tag, has_any_tag, notes_contains, notes_starts, notes_end, notes_are, no_notes, any_notes, source_account_is, destination_account_is, source_account_starts',
  );

const actionTypeSchema = z
  .string()
  .describe(
    'Action type. Common values: user_action, set_category, clear_category, set_budget, clear_budget, add_tag, remove_tag, remove_all_tags, set_description, append_description, prepend_description, set_source_account, set_destination_account, set_notes, append_notes, prepend_notes, clear_notes, link_to_bill, convert_withdrawal, convert_deposit, convert_transfer, delete_transaction',
  );

const triggerObjectSchema = z.object({
  type: triggerTypeSchema.describe('Trigger type'),
  value: z.string().describe('Value the trigger matches against'),
  prohibited: z.boolean().optional().describe('Negate this trigger (IS becomes IS NOT)'),
  active: z.boolean().optional().default(true),
  stop_processing: z.boolean().optional().default(false),
  order: z.number().int().optional(),
});

const actionObjectSchema = z.object({
  type: actionTypeSchema.describe('Action type'),
  value: z.string().nullable().describe('Value for the action (empty string for clear/boolean actions)'),
  active: z.boolean().optional().default(true),
  stop_processing: z.boolean().optional().default(false),
  order: z.number().int().optional(),
});

export function registerRuleTools(server: McpServer, client: FireflyClient): void {
  // ---- Rule Group tools ----

  defineTool(
    server,
    'get_rule_groups',
    {
      title: 'Get Rule Groups',
      description: 'Get all rule groups from Firefly III.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ page, limit }) => fetchRuleGroups(client, { page: page, limit: limit }),
  );

  defineTool(
    server,
    'get_rule_group',
    {
      title: 'Get Rule Group',
      description: 'Get a single rule group by its numeric ID. Use get_rule_groups to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Rule group ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => fetchRuleGroup(client, id),
  );

  defineTool(
    server,
    'create_rule_group',
    {
      title: 'Create Rule Group',
      description: 'Create a new rule group in Firefly III.',
      inputSchema: {
        title: z.string().describe('Rule group name'),
        description: z.string().optional().describe('Description'),
        active: z.boolean().optional().default(true).describe('Whether the group is active'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    ({ title, description, active }) =>
      createRuleGroup(client, {
        title: title,
        description: description,
        active: active,
      }),
  );

  defineTool(
    server,
    'update_rule_group',
    {
      title: 'Update Rule Group',
      description:
        'Update an existing rule group. Only fields provided will be changed. Use get_rule_group to confirm the ID before updating.',
      inputSchema: {
        id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
        title: z.string().optional().describe('Rule group name'),
        description: z.string().optional().describe('Description'),
        active: z.boolean().optional().describe('Whether the group is active'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, title, description, active }) =>
      updateRuleGroup(client, id, {
        title: title,
        description: description,
        active: active,
      }),
  );

  defineTool(
    server,
    'delete_rule_group',
    {
      title: 'Delete Rule Group',
      description:
        'Permanently delete a rule group and all its rules from Firefly III. **This action cannot be undone.** Use get_rule_group to confirm before deleting.',
      inputSchema: {
        id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteRuleGroup(client, id),
  );

  // ---- Rule tools ----

  defineTool(
    server,
    'get_rules',
    {
      title: 'Get Rules',
      description: 'Get all automation rules from Firefly III.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ page, limit }) => fetchRules(client, { page: page, limit: limit }),
  );

  defineTool(
    server,
    'get_rule',
    {
      title: 'Get Rule',
      description: 'Get a single automation rule by its numeric ID. Use get_rules to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Rule ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => fetchRule(client, id),
  );

  defineTool(
    server,
    'create_rule',
    {
      title: 'Create Rule',
      description: 'Create a new automation rule in Firefly III. Use get_rule_groups to find a valid rule_group_id.',
      inputSchema: {
        title: z.string().describe('Rule name'),
        rule_group_id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
        trigger: z
          .enum(['store-journal', 'update-journal'])
          .describe(
            'When this rule fires: store-journal (on transaction creation) or update-journal (on transaction update)',
          ),
        triggers: z.array(triggerObjectSchema).min(1).describe('List of trigger conditions'),
        actions: z.array(actionObjectSchema).min(1).describe('List of actions to perform when triggers match'),
        description: z.string().optional().describe('Description'),
        active: z.boolean().optional().default(true).describe('Whether the rule is active'),
        strict: z.boolean().optional().default(true).describe('ALL triggers must match (true) or ANY trigger (false)'),
        stop_processing: z
          .boolean()
          .optional()
          .default(false)
          .describe('Stop processing further rules after this one matches'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    ({ title, rule_group_id, trigger, triggers, actions, description, active, strict, stop_processing }) =>
      createRule(client, {
        title: title,
        rule_group_id: rule_group_id,
        trigger: trigger,
        triggers: triggers,
        actions: actions,
        description: description,
        active: active,
        strict: strict,
        stop_processing: stop_processing,
      }),
  );

  defineTool(
    server,
    'update_rule',
    {
      title: 'Update Rule',
      description:
        'Update an existing automation rule. Only fields provided will be changed. Use get_rule to confirm the ID before updating.',
      inputSchema: {
        id: z.string().describe('Rule ID — use get_rules to find valid IDs'),
        title: z.string().optional().describe('Rule name'),
        rule_group_id: z.string().optional().describe('Rule group ID'),
        trigger: z.enum(['store-journal', 'update-journal']).optional().describe('When this rule fires'),
        triggers: z.array(triggerObjectSchema).min(1).optional().describe('List of trigger conditions'),
        actions: z.array(actionObjectSchema).min(1).optional().describe('List of actions'),
        description: z.string().optional().describe('Description'),
        active: z.boolean().optional().describe('Whether the rule is active'),
        strict: z.boolean().optional().describe('ALL triggers must match (true) or ANY trigger (false)'),
        stop_processing: z.boolean().optional().describe('Stop processing further rules after this one'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, title, rule_group_id, trigger, triggers, actions, description, active, strict, stop_processing }) =>
      updateRule(client, id, {
        title: title,
        rule_group_id: rule_group_id,
        trigger: trigger,
        triggers: triggers,
        actions: actions,
        description: description,
        active: active,
        strict: strict,
        stop_processing: stop_processing,
      }),
  );

  defineTool(
    server,
    'delete_rule',
    {
      title: 'Delete Rule',
      description:
        'Permanently delete an automation rule from Firefly III. **This action cannot be undone.** Use get_rule to confirm before deleting.',
      inputSchema: {
        id: z.string().describe('Rule ID — use get_rules to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteRule(client, id),
  );

  // ---- Trigger and test tools ----

  defineTool(
    server,
    'get_rule_group_rules',
    {
      title: 'Get Rule Group Rules',
      description:
        'Get all rules belonging to a specific rule group. Use get_rule_groups to find valid rule group IDs.',
      inputSchema: {
        id: z.string().describe('Rule group ID'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id, page, limit }) =>
      fetchRuleGroupRules(client, id, {
        page: page,
        limit: limit,
      }),
  );

  defineTool(
    server,
    'trigger_rule_group',
    {
      title: 'Trigger Rule Group',
      description:
        'Manually run all rules in a rule group against existing transactions. Use get_rule_groups to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
        start: dateSchema.optional().describe('Filter transactions from this date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('Filter transactions to this date (YYYY-MM-DD)'),
        accounts: z.array(z.number().int().positive()).optional().describe('Limit to these account IDs'),
      },
      annotations: { openWorldHint: true },
    },
    ({ id, start, end, accounts }) =>
      triggerRuleGroup(client, id, {
        start: start,
        end: end,
        accounts: accounts,
      }),
  );

  defineTool(
    server,
    'trigger_rule',
    {
      title: 'Trigger Rule',
      description: 'Manually run a single rule against existing transactions. Use get_rules to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Rule ID — use get_rules to find valid IDs'),
        start: dateSchema.optional().describe('Filter transactions from this date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('Filter transactions to this date (YYYY-MM-DD)'),
        accounts: z.array(z.number().int().positive()).optional().describe('Limit to these account IDs'),
      },
      annotations: { openWorldHint: true },
    },
    ({ id, start, end, accounts }) =>
      triggerRule(client, id, {
        start: start,
        end: end,
        accounts: accounts,
      }),
  );

  defineTool(
    server,
    'test_rule_group',
    {
      title: 'Test Rule Group',
      description:
        'Dry-run a rule group against existing transactions and return matching transactions without applying any changes. Use get_rule_groups to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Rule group ID — use get_rule_groups to find valid IDs'),
        start: dateSchema.optional().describe('Filter transactions from this date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('Filter transactions to this date (YYYY-MM-DD)'),
        accounts: z.array(z.number().int().positive()).optional().describe('Limit to these account IDs'),
        search_limit: z.number().int().positive().optional().describe('Maximum number of transactions to search'),
        triggered_limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum number of triggered transactions to return'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id, start, end, accounts, search_limit, triggered_limit }) =>
      testRuleGroup(client, id, {
        start: start,
        end: end,
        accounts: accounts,
        search_limit: search_limit,
        triggered_limit: triggered_limit,
      }),
  );

  defineTool(
    server,
    'test_rule',
    {
      title: 'Test Rule',
      description:
        'Dry-run a single rule against existing transactions and return matching transactions without applying any changes. Use get_rules to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Rule ID — use get_rules to find valid IDs'),
        start: dateSchema.optional().describe('Filter transactions from this date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('Filter transactions to this date (YYYY-MM-DD)'),
        accounts: z.array(z.number().int().positive()).optional().describe('Limit to these account IDs'),
        search_limit: z.number().int().positive().optional().describe('Maximum number of transactions to search'),
        triggered_limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum number of triggered transactions to return'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id, start, end, accounts, search_limit, triggered_limit }) =>
      testRule(client, id, {
        start: start,
        end: end,
        accounts: accounts,
        search_limit: search_limit,
        triggered_limit: triggered_limit,
      }),
  );
}
