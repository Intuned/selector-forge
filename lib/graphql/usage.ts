import { gql, type TypedDocumentNode } from "@apollo/client/core";
import { getAccessToken } from "../auth";
import { decodeJwt } from "../auth/jwt";
import { createApolloClient } from "./client";

/**
 * Selector-creation usage for the active workspace: the total used this billing
 * period plus the plan-included amount. Both live on the workspace's billing_info
 * row (mirrors the platform's `job_run` metering).
 */

interface SelectorCreationUsageRow {
  intuned_period_selector_creation_value: number | null;
  current_period_plan_included_selector_creation_credit: number | null;
}

interface SelectorCreationUsageData {
  billing_info: SelectorCreationUsageRow[];
}

interface SelectorCreationUsageVariables {
  workspaceId: string;
}

const SELECTOR_CREATION_USAGE_QUERY: TypedDocumentNode<
  SelectorCreationUsageData,
  SelectorCreationUsageVariables
> = gql`
  query SelectorCreationUsage($workspaceId: uuid!) {
    billing_info(where: { workspace_id: { _eq: $workspaceId } }, limit: 1) {
      intuned_period_selector_creation_value
      current_period_plan_included_selector_creation_credit
    }
  }
`;

export interface SelectorCreationUsage {
  /** Selector creations used in the current billing period. */
  used: number;
  /** Selector creations included in the workspace's plan. */
  included: number;
}

/**
 * Query total selector-creation usage + the plan-included amount for the active
 * workspace. Scoped by the workspace id from the access token: Hasura RLS already
 * filters billing_info by workspace, and the explicit filter keeps the query
 * well-scoped (per the CLI's GraphQL scoping rule).
 */
export async function getSelectorCreationUsage(): Promise<SelectorCreationUsage> {
  const token = await getAccessToken();
  const workspaceId = decodeJwt(token)?.claims.workspaceId;
  if (!workspaceId) {
    throw new Error("Access token has no workspace id; cannot query usage.");
  }

  const client = createApolloClient(token);
  const { data } = await client.query({
    query: SELECTOR_CREATION_USAGE_QUERY,
    variables: { workspaceId },
  });

  const row = data?.billing_info?.[0];
  return {
    used: row?.intuned_period_selector_creation_value ?? 0,
    included: row?.current_period_plan_included_selector_creation_credit ?? 0,
  };
}
