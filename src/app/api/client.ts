export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers: customHeaders, ...fetchOptions } = options;

  const headers = new Headers(customHeaders);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "Request failed";
    throw new ApiError(message, response.status);
  }

  return data as T;
}
