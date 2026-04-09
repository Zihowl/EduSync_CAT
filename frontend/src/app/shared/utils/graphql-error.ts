export function getGraphQLErrorMessage(error: unknown, fallbackMessage = 'Ocurrió un error inesperado.'): string {
  const graphQLErrors = [
    ...(Array.isArray((error as any)?.graphQLErrors) ? (error as any).graphQLErrors : []),
    ...(Array.isArray((error as any)?.errors) ? (error as any).errors : []),
    ...(Array.isArray((error as any)?.networkError?.result?.errors) ? (error as any).networkError.result.errors : []),
  ];

  const firstMessage = graphQLErrors
    .map((entry: any) => String(entry?.message ?? '').trim())
    .find((message: string) => message.length > 0);

  if (firstMessage) {
    return normalizeErrorMessage(firstMessage);
  }

  const rawMessage = String((error as any)?.message ?? '').trim();
  if (rawMessage.length > 0) {
    return normalizeErrorMessage(rawMessage);
  }

  return fallbackMessage;
}

function normalizeErrorMessage(message: string): string {
  return message
    .replace(/^GraphQL error:\s*/i, '')
    .replace(/^ApolloError:\s*/i, '')
    .trim();
}
