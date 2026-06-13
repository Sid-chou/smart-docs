import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";

interface DocumentItem {
  id: string;
  filename: string;
  original_filename: string;
  status: string;
  is_indexed: boolean;
  error_message?: string;
}

export function useDocumentPoller() {
  const { isAuthenticated } = useAuthStore();
  const prevStatuses = useRef<Record<string, string>>({});

  // Fetch the first page of documents periodically to monitor statuses
  const { data } = useQuery({
    queryKey: ["documents-polling"],
    queryFn: async () => {
      const res = await api.get("/documents/?page=1&page_size=50");
      return res.data.items as DocumentItem[];
    },
    enabled: isAuthenticated,
    refetchInterval: 8000, // Poll every 8 seconds
  });

  useEffect(() => {
    if (!data) return;

    data.forEach((doc) => {
      const prevStatus = prevStatuses.current[doc.id];
      const currentStatus = doc.status;

      // Only notify when status transitions away from pending
      if (prevStatus === "pending" && currentStatus !== "pending") {
        if (currentStatus === "indexed") {
          toast.success(`"${doc.original_filename}" is ready!`, {
            description: "Document contents have been successfully indexed.",
          });
        } else if (currentStatus === "failed_unreadable") {
          toast.error(`"${doc.original_filename}" cannot be indexed`, {
            description: doc.error_message || "The file has no readable text layer.",
            duration: 10000,
          });
        } else if (currentStatus === "failed_error") {
          toast.error(`"${doc.original_filename}" indexing failed`, {
            description: doc.error_message || "An unexpected error occurred. Please try again.",
            duration: 10000,
          });
        }
      }

      // Update ref snapshot
      prevStatuses.current[doc.id] = currentStatus;
    });
  }, [data]);
}
