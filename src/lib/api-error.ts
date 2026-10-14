/**
 * Read an API error. Responses from the edge (Cloud Armor, rate limits)
 * are HTML pages rather than JSON, so parsing must not be assumed to work.
 */
export async function responseError(res: Response, fallback: string) {
  const data = (await res.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  if (typeof data?.error === "string" && data.error)
    return new Error(data.error);
  if (res.status === 403)
    return new Error(
      "リクエストがセキュリティ検査で拒否されました。入力内容を見直して再試行してください。",
    );
  if (res.status === 429)
    return new Error(
      "リクエストが集中しています。しばらく待ってから再試行してください。",
    );
  return new Error(fallback);
}
