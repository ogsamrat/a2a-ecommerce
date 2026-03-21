export class ApiClientError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const value = (data as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
  }
  return `Request failed (${status})`;
}

export async function apiRequest<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const data = await safeJson(response);

  if (!response.ok) {
    throw new ApiClientError(
      readErrorMessage(data, response.status),
      response.status,
      data,
    );
  }

  if (typeof data === "object" && data !== null && "error" in data) {
    throw new ApiClientError(
      readErrorMessage(data, response.status),
      response.status,
      data,
    );
  }

  return (data as T) ?? ({} as T);
}

export function decodeTxnB64(unsignedTxn: string): Uint8Array {
  const binary = atob(unsignedTxn);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeTxnB64(signedTxn: Uint8Array): string {
  return btoa(String.fromCharCode(...Array.from(signedTxn)));
}

export async function resetApiState(): Promise<{
  ok: boolean;
  warning?: string;
  error?: string;
}> {
  try {
    const data = await apiRequest<{
      success?: boolean;
      demoMode?: boolean;
      warning?: string;
    }>("/api/init", { method: "POST" });

    const initOk = data.success !== false || data.demoMode === true;
    return {
      ok: initOk,
      warning: data.warning,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to reset API state",
    };
  }
}
