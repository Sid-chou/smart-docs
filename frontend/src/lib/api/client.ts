import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/lib/stores/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Client-side helper to decode and check if JWT is expired or close to expiring
function isTokenExpired(token: string): boolean {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return true;
    
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    
    const { exp } = JSON.parse(jsonPayload);
    if (!exp) return true;
    
    // Check if token expires in the next 10 seconds (buffer to handle network latency)
    const bufferSeconds = 10;
    return Date.now() / 1000 + bufferSeconds > exp;
  } catch (err) {
    return true;
  }
}

let refreshPromise: Promise<string | null> | null = null;

// Thread-safe token acquisition. Refreshes if expired.
async function getValidToken(): Promise<string | null> {
  const store = useAuthStore.getState();
  let token = store.accessToken;

  if (!token) {
    return null;
  }

  if (isTokenExpired(token)) {
    // If a refresh is already in progress, await that same operation
    if (refreshPromise) {
      return refreshPromise;
    }

    const storedRefreshToken = store.refreshToken;
    if (!storedRefreshToken) {
      store.logout();
      return null;
    }

    refreshPromise = (async () => {
      try {
        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refresh_token: storedRefreshToken,
        });
        const { access_token, refresh_token } = response.data;

        // Save fresh tokens to Zustand store
        store.login(
          { access_token, refresh_token },
          store.user
        );
        return access_token;
      } catch (err) {
        console.error("Preemptive token refresh failed:", err);
        store.logout();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  return token;
}

// Request Interceptor: Attach fresh access token, refreshing if necessary
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await getValidToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.error("Failed to attach authorization header:", err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Catch normalization of errors and ultimate fallback 401s
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Normalize error.response.data.detail to string
    if (error.response && error.response.data) {
      const data = error.response.data as any;
      if (data.detail !== undefined) {
        if (Array.isArray(data.detail)) {
          const mapped = data.detail
            .map((err: any) => {
              const field = err.loc ? err.loc[err.loc.length - 1] : "field";
              return `${field}: ${err.msg}`;
            })
            .join(", ");
          data.detail = mapped;
        } else if (typeof data.detail !== "string") {
          data.detail = "An unexpected error occurred";
        }
      } else {
        data.detail = "An unexpected error occurred";
      }
    } else {
      // Mock response structure for network/unknown errors
      error.response = {
        ...error.response,
        data: {
          detail: error.message || "An unexpected error occurred",
        },
      } as any;
    }

    // If a request still returns 401 (e.g. revoked key, deleted user account), force logout
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }

    return Promise.reject(error);
  }
);


