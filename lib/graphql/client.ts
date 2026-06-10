import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client/core";
import { GRAPHQL_API } from "../config";

/**
 * Apollo client for the Intuned platform GraphQL (Hasura), authenticated with the
 * given bearer token. Recreate it whenever the access token changes.
 */
export function createApolloClient(accessToken: string): ApolloClient {
  return new ApolloClient({
    link: new HttpLink({
      uri: GRAPHQL_API,
      headers: { authorization: `Bearer ${accessToken}` },
      fetch,
    }),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: { fetchPolicy: "no-cache" },
      mutate: { fetchPolicy: "no-cache" },
    },
  });
}
