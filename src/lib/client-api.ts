import axios from "axios";
export const api = axios.create({ baseURL: "/api", timeout: 15000 });
export const identity = (userId: string) => ({ headers: { "x-user-id": userId } });
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error))
    return (
      error.response?.data?.error?.message ??
      "We couldn't connect. Please check your connection and try again."
    );
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
export function errorFields(error: unknown): Record<string, string> {
  return axios.isAxiosError(error) ? (error.response?.data?.error?.fields ?? {}) : {};
}
