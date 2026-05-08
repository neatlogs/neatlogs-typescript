/**
 * In-process MCP server for Customer CRM tools.
 *
 * Exposes tools:
 *   - get_tickets: fetch support tickets for an account
 *   - get_usage_metrics: fetch product usage metrics
 *   - get_crm_data: fetch CRM data (NPS, contract, CSM)
 *   - create_alert: create an alert/escalation
 *
 * Modeled after neatlogs backend MCP server pattern (vorflux/mcp-server).
 * Uses @modelcontextprotocol/sdk McpServer with in-memory transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { log } from 'neatlogs';

// ---------------------------------------------------------------------------
// Mock data stores
// ---------------------------------------------------------------------------

const TICKETS: Record<string, Array<{ id: string; subject: string; priority: string; status: string; createdAt: string }>> = {
  'acct-101': [
    { id: 'TK-1001', subject: 'Dashboard loading slow', priority: 'high', status: 'open', createdAt: '2026-05-03T10:00:00Z' },
    { id: 'TK-1002', subject: 'API rate limiting hit', priority: 'medium', status: 'open', createdAt: '2026-05-04T14:30:00Z' },
    { id: 'TK-1003', subject: 'Need SSO setup help', priority: 'low', status: 'resolved', createdAt: '2026-04-28T09:00:00Z' },
  ],
  'acct-202': [
    { id: 'TK-2001', subject: 'Cannot export reports', priority: 'high', status: 'open', createdAt: '2026-05-05T11:00:00Z' },
    { id: 'TK-2002', subject: 'Billing question about overages', priority: 'medium', status: 'open', createdAt: '2026-05-02T16:00:00Z' },
  ],
  'acct-303': [
    { id: 'TK-3001', subject: 'How to integrate webhook', priority: 'low', status: 'open', createdAt: '2026-05-01T08:00:00Z' },
    { id: 'TK-3002', subject: 'Feature request: dark mode', priority: 'low', status: 'open', createdAt: '2026-04-25T12:00:00Z' },
    { id: 'TK-3003', subject: 'Login issues on mobile', priority: 'high', status: 'escalated', createdAt: '2026-05-05T17:00:00Z' },
    { id: 'TK-3004', subject: 'Data sync delayed', priority: 'critical', status: 'open', createdAt: '2026-05-06T06:00:00Z' },
  ],
};

const USAGE: Record<string, { dau: number; mau: number; apiCalls: number; featuresUsed: number; totalFeatures: number; lastActive: string }> = {
  'acct-101': { dau: 450, mau: 1200, apiCalls: 85000, featuresUsed: 18, totalFeatures: 25, lastActive: '2026-05-06' },
  'acct-202': { dau: 30, mau: 85, apiCalls: 3200, featuresUsed: 6, totalFeatures: 25, lastActive: '2026-05-04' },
  'acct-303': { dau: 5, mau: 12, apiCalls: 150, featuresUsed: 3, totalFeatures: 25, lastActive: '2026-04-28' },
};

const CRM: Record<string, { nps: number; contractEnd: string; tier: string; csm: string; lastQbr: string; mrr: number }> = {
  'acct-101': { nps: 72, contractEnd: '2027-01-15', tier: 'enterprise', csm: 'Sarah Chen', lastQbr: '2026-04-10', mrr: 12500 },
  'acct-202': { nps: 45, contractEnd: '2026-08-30', tier: 'pro', csm: 'James Park', lastQbr: '2026-03-20', mrr: 2400 },
  'acct-303': { nps: 22, contractEnd: '2026-06-15', tier: 'starter', csm: 'Maria Lopez', lastQbr: '2026-02-01', mrr: 450 },
};

// ---------------------------------------------------------------------------
// Tool registrars (following neatlogs backend MCP pattern)
// ---------------------------------------------------------------------------

function registerGetTickets(server: McpServer): void {
  server.tool(
    'get_tickets',
    'Fetch support tickets for an account. Returns array of tickets with id, subject, priority, status, and createdAt.',
    { account_id: z.string().describe('The account identifier (e.g. acct-101)') },
    async ({ account_id }) => ({
      content: [{ type: 'text', text: JSON.stringify(TICKETS[account_id] ?? []) }],
    }),
  );
}

function registerGetUsageMetrics(server: McpServer): void {
  server.tool(
    'get_usage_metrics',
    'Fetch product usage metrics for an account. Returns DAU, MAU, API calls, feature adoption, and last active date.',
    { account_id: z.string().describe('The account identifier') },
    async ({ account_id }) => ({
      content: [{ type: 'text', text: JSON.stringify(USAGE[account_id] ?? {}) }],
    }),
  );
}

function registerGetCrmData(server: McpServer): void {
  server.tool(
    'get_crm_data',
    'Fetch CRM data for an account. Returns NPS, contract end date, tier, assigned CSM, last QBR date, and MRR.',
    { account_id: z.string().describe('The account identifier') },
    async ({ account_id }) => ({
      content: [{ type: 'text', text: JSON.stringify(CRM[account_id] ?? {}) }],
    }),
  );
}

function registerCreateAlert(server: McpServer): void {
  server.tool(
    'create_alert',
    'Create an alert/escalation for an account. Used to flag at-risk accounts for immediate CSM attention.',
    {
      account_id: z.string().describe('The account identifier'),
      severity: z.enum(['info', 'warning', 'critical']).describe('Alert severity level'),
      message: z.string().describe('Human-readable alert message'),
    },
    async ({ account_id, severity, message }) => {
      const alertId = `ALT-${Date.now().toString(36)}`;
      log('MCP: alert created {alertId} ({severity}) for {accountId}', { alertId, severity, accountId: account_id });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ alertId, account_id, severity, message, created: new Date().toISOString() }),
        }],
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

const TOOL_REGISTRARS: Record<string, (server: McpServer) => void> = {
  get_tickets: registerGetTickets,
  get_usage_metrics: registerGetUsageMetrics,
  get_crm_data: registerGetCrmData,
  create_alert: registerCreateAlert,
};

export function createCrmMcpServer(): McpServer {
  const server = new McpServer({ name: 'customer-crm', version: '1.0.0' });

  for (const [name, register] of Object.entries(TOOL_REGISTRARS)) {
    register(server);
    log('MCP: registered tool {name}', { name });
  }

  return server;
}

export const TOOL_NAMES = Object.keys(TOOL_REGISTRARS);
