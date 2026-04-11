const TOKEN_KEY = "queda.token";
const USER_KEY = "queda.user";
const ORGANIZATION_KEY = "queda.organization_id";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser<T>() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredUser<T>(user: T) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem(USER_KEY);
}

export function getStoredOrganizationId() {
  return localStorage.getItem(ORGANIZATION_KEY);
}

export function setStoredOrganizationId(organizationId: string) {
  localStorage.setItem(ORGANIZATION_KEY, organizationId);
}

export function clearStoredOrganizationId() {
  localStorage.removeItem(ORGANIZATION_KEY);
}
