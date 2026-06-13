"use client";

import { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth";
import { toast } from "sonner";

interface DocumentItem {
  id: string;
  original_filename: string;
  status: string;
  error_message?: string;
}

export function useDocumentStatusManager() {
  const { isAuthenticated } = useAuthStore();
  const previousStatuses = useRef<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ["documents-status-poll"],
    queryFn: async () => {
      const res = await apiClient.get("/documents/?page=1&page_size=100");
      return res.data.items as DocumentItem[];
    },
    refetchInterval: 8000,
    enabled: isAuthenticated,
    refetchIntervalInBackground: false, // pauses when tab is in background
  });

  useEffect(() => {
    if (!data) return;

    data.forEach((doc) => {
      const prevStatus = previousStatuses.current[doc.id];
      const newStatus = doc.status;

      if (prevStatus && prevStatus !== newStatus) {
        if (prevStatus === "pending") {
          if (newStatus === "indexed") {
            toast.success(`${doc.original_filename} is ready`);
          } else if (newStatus.startsWith("failed")) {
            toast.error(
              `${doc.original_filename} failed: ${doc.error_message ?? "Unknown error"}`
            );
          }
        }
      }

      // Update ref with latest status
      previousStatuses.current[doc.id] = newStatus;
    });
  }, [data]);
}
