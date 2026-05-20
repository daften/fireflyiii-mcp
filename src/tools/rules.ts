import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import {
  unwrapList, unwrapSingle,
  type JsonApiListResponse, type JsonApiSingleResponse,
  type UnwrappedList, type UnwrappedSingle,
} from '../transform.js';

// ---- Rule group fetch + CRUD ----

export async function fetchRuleGroups(
  client: FireflyClient,
  params: { page?: number; limit?: number }
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
  params: { title: string; description?: string; active?: boolean }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/rule-groups', params);
  return unwrapSingle(response);
}

export async function updateRuleGroup(
  client: FireflyClient,
  id: string,
  params: { title?: string; description?: string; active?: boolean }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/rule-groups/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteRuleGroup(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
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
  params: { page?: number; limit?: number }
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
  }
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
  }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/rules/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteRule(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/rules/${id}`);
  return { deleted: true, id };
}

// registerRuleTools added in Task 4
export function registerRuleTools(_server: McpServer, _client: FireflyClient): void { void z; void formatError; }
