import axios from "axios";

import { apiBaseUrl } from "../config/runtime";
import { getStoredOrganizationId, getStoredToken } from "../lib/storage";

export const api = axios.create({
  baseURL: apiBaseUrl,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const organizationId = getStoredOrganizationId();
  if (organizationId) {
    config.headers["X-Organization-Id"] = organizationId;
  }

  return config;
});

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return (
      (error.response?.data as { message?: string } | undefined)?.message ||
      error.message
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Ocorreu um erro inesperado.";
}
