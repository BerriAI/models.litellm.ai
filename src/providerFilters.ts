export interface SearchableProvider {
  provider: string;
  display_name: string;
  endpoints: Record<string, boolean>;
}

export function supportsEndpoint(
  provider: SearchableProvider,
  endpoint: string,
  bridgesToChatCompletion = false,
): boolean {
  return (
    !endpoint ||
    provider.endpoints[endpoint] === true ||
    (bridgesToChatCompletion && provider.endpoints.chat_completions === true)
  );
}

export function filterProviders<T extends SearchableProvider>(
  providers: T[],
  query: string,
  endpoint: string,
  bridgesToChatCompletion = false,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const matching = providers.filter(
    (provider) =>
      provider.provider.toLowerCase().includes(normalizedQuery) ||
      provider.display_name.toLowerCase().includes(normalizedQuery),
  );
  const visible = matching.filter((provider) =>
    supportsEndpoint(provider, endpoint, bridgesToChatCompletion),
  );
  return { matching, visible, hiddenCount: matching.length - visible.length };
}
