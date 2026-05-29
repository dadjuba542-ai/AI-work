// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeJson<T = any>(res: Response): Promise<T> {
  try {
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
