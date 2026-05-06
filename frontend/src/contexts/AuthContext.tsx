import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import axios from "axios";

import { api, getErrorMessage } from "../services/api";
import {
  clearStoredToken,
  clearStoredOrganizationId,
  clearStoredUser,
  getStoredOrganizationId,
  getStoredToken,
  getStoredUser,
  setStoredOrganizationId,
  setStoredToken,
  setStoredUser,
} from "../lib/storage";
import type { Organization, OrganizationRole, User } from "../types/api";

type AuthPayload = {
  token: string;
  user: User;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  activeOrganizationId: string | null;
  activeOrganization: Organization | null;
  activeRole: OrganizationRole | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    organizationName: string,
    organizationType: string,
  ) => Promise<void>;
  logout: () => void;
  setActiveOrganizationId: (organizationId: string) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getSafeMemberships(user: User | null | undefined) {
  if (!user || !Array.isArray(user.memberships)) {
    return [] as User["memberships"];
  }

  return user.memberships.filter(
    (membership) =>
      membership &&
      membership.organization &&
      typeof membership.organization.id === "number",
  );
}

function normalizeUser(candidate: User | null | undefined) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const memberships = getSafeMemberships(candidate);

  return {
    ...candidate,
    globalRole: candidate.globalRole || "user",
    activeRole: candidate.activeRole || null,
    activeOrganizationId:
      typeof candidate.activeOrganizationId === "number"
        ? candidate.activeOrganizationId
        : null,
    activeOrganization: candidate.activeOrganization || null,
    memberships,
    createdAt: candidate.createdAt || null,
    updatedAt: candidate.updatedAt || null,
  } satisfies User;
}

function resolveActiveOrganizationId(
  nextUser: User | null,
  preferredOrganizationId: string | null,
) {
  if (!nextUser) {
    return null;
  }

  const memberships = getSafeMemberships(nextUser);

  if (
    preferredOrganizationId &&
    memberships.some(
      (membership) => String(membership.organization.id) === preferredOrganizationId,
    )
  ) {
    return preferredOrganizationId;
  }

  if (nextUser.activeOrganizationId) {
    return String(nextUser.activeOrganizationId);
  }

  if (memberships[0]) {
    return String(memberships[0].organization.id);
  }

  return null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const initialUser = normalizeUser(getStoredUser<User>());
  const initialToken = getStoredToken();
  const [user, setUser] = useState<User | null>(initialUser);
  const [token, setToken] = useState<string | null>(initialToken);
  const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(
    getStoredOrganizationId(),
  );
  const [loading, setLoading] = useState(Boolean(initialToken));
  const userRef = useRef<User | null>(initialUser);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  function applySession(nextUser: User | null, nextToken: string | null) {
    setUser(nextUser);
    setToken(nextToken);

    const nextOrganizationId = resolveActiveOrganizationId(
      nextUser,
      getStoredOrganizationId(),
    );
    setActiveOrganizationIdState(nextOrganizationId);

    if (nextUser) {
      setStoredUser(nextUser);
    } else {
      clearStoredUser();
    }

    if (nextToken) {
      setStoredToken(nextToken);
    } else {
      clearStoredToken();
    }

    if (nextOrganizationId) {
      setStoredOrganizationId(nextOrganizationId);
    } else {
      clearStoredOrganizationId();
    }
  }

  useEffect(() => {
    if (!token) {
      clearStoredUser();
      clearStoredToken();
      clearStoredOrganizationId();
    }
  }, [token]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const nextOrganizationId = resolveActiveOrganizationId(user, activeOrganizationId);

    if (nextOrganizationId !== activeOrganizationId) {
      setActiveOrganizationIdState(nextOrganizationId);
      if (nextOrganizationId) {
        setStoredOrganizationId(nextOrganizationId);
      } else {
        clearStoredOrganizationId();
      }
    }
  }, [activeOrganizationId, user]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get<{ user: User }>("/me");
        const nextUser = normalizeUser(response.data.user);

        if (!nextUser) {
          throw new Error("Sessao local invalida.");
        }

        if (!cancelled) {
          applySession(nextUser, token);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const status = axios.isAxiosError(error) ? error.response?.status || 0 : 0;
        const hadStoredOrganizationId = Boolean(getStoredOrganizationId());

        if (status === 403 && hadStoredOrganizationId) {
          clearStoredOrganizationId();

          try {
            const retryResponse = await api.get<{ user: User }>("/me");
            const retryUser = normalizeUser(retryResponse.data.user);

            if (!retryUser) {
              throw new Error("Sessao local invalida.");
            }

            if (!cancelled) {
              applySession(retryUser, token);
            }
            return;
          } catch (retryError) {
            if (cancelled) {
              return;
            }

            if (
              axios.isAxiosError(retryError) &&
              [401, 403].includes(retryError.response?.status || 0)
            ) {
              applySession(null, null);
            } else if (!userRef.current) {
              applySession(null, null);
            }
            return;
          }
        }

        if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status || 0)) {
          applySession(null, null);
        } else if (!userRef.current) {
          applySession(null, null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function persistAuth(promise: Promise<{ data: AuthPayload }>) {
    setLoading(true);

    try {
      const response = await promise;
      const nextUser = normalizeUser(response.data.user);

      if (!nextUser) {
        throw new Error("Resposta de autenticacao invalida.");
      }

      applySession(nextUser, response.data.token);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    applySession(null, null);
  }

  const memberships = getSafeMemberships(user);
  const activeOrganization =
    memberships.find(
      (membership) => String(membership.organization.id) === activeOrganizationId,
    )?.organization || user?.activeOrganization || null;
  const activeRole =
    memberships.find(
      (membership) => String(membership.organization.id) === activeOrganizationId,
    )?.role || user?.activeRole || null;

  const value: AuthContextValue = {
    user,
    token,
    activeOrganizationId,
    activeOrganization,
    activeRole,
    isAuthenticated: Boolean(token && user),
    loading,
    async login(email, password) {
      await persistAuth(api.post("/auth/login", { email, password }));
    },
    async register(name, email, password, organizationName, organizationType) {
      await persistAuth(
        api.post("/auth/register", {
          name,
          email,
          password,
          organizationName,
          organizationType,
        }),
      );
    },
    logout,
    setActiveOrganizationId(organizationId) {
      setActiveOrganizationIdState(organizationId);
      setStoredOrganizationId(organizationId);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
