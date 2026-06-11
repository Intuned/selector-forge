import { gql, type TypedDocumentNode } from "@apollo/client/core";
import { createApolloClient } from "./client";

/**
 * Human-readable name of the active workspace, resolved from its id. Auth tokens
 * carry only the workspace id, so the popup's workspace switcher gets the name
 * from here (via the auth layer) rather than hardcoding it.
 */

interface WorkspaceNameRow {
  name: string;
}

interface WorkspaceNameData {
  workspace: WorkspaceNameRow[];
}

interface WorkspaceNameVariables {
  workspaceId: string;
}

const WORKSPACE_NAME_QUERY: TypedDocumentNode<
  WorkspaceNameData,
  WorkspaceNameVariables
> = gql`
  query WorkspaceName($workspaceId: uuid!) {
    workspace(where: { id: { _eq: $workspaceId } }, limit: 1) {
      name
    }
  }
`;

/**
 * Fetch the workspace name for `workspaceId` using the given bearer token. Returns
 * `null` when the workspace can't be resolved (Hasura RLS already scopes the
 * `workspace` table, and the explicit filter keeps the query well-scoped).
 */
export async function fetchWorkspaceName(
  accessToken: string,
  workspaceId: string
): Promise<string | null> {
  const client = createApolloClient(accessToken);
  const { data } = await client.query({
    query: WORKSPACE_NAME_QUERY,
    variables: { workspaceId },
  });
  console.log("[selector-extension] fetched workspace name", {
    workspaceId,
    name: data?.workspace?.[0]?.name,
  });
  return data?.workspace?.[0]?.name ?? null;
}
