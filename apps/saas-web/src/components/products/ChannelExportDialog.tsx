"use client";

import { useEffect, useMemo, useState } from "react";
import { CenteredFormModal } from "@/components/ui/modal-shells";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useMarketContext } from "@/components/market-context";

type ChannelOption = {
  id: string;
  code: string;
  name: string;
};

interface ChannelExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  productIds: string[];
}

export function ChannelExportDialog({
  open,
  onOpenChange,
  tenantSlug,
  productIds,
}: ChannelExportDialogProps) {
  const {
    selectedMarketId,
    selectedChannelId,
    selectedLocaleId,
    selectedDestinationId,
    selectedChannel,
    selectedLocale,
    selectedDestination,
  } = useMarketContext();
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [channelId, setChannelId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    void fetch(`/api/${tenantSlug}/output-profiles`)
      .then((response) => response.json())
      .then((payload) => {
        const items = Array.isArray(payload?.data) ? payload.data : [];
        setChannels(
          items.map((item: Record<string, unknown>) => ({
            id: String(item.id || ""),
            code: String(item.code || ""),
            name: String(item.name || ""),
          }))
        );
      })
      .catch(() => {
        toast.error("Failed to load destinations.");
      });
  }, [open, tenantSlug]);

  const selectedExportChannel = useMemo(
    () => channels.find((channel) => channel.id === channelId) || null,
    [channelId, channels]
  );

  const handleExport = async () => {
    if (!channelId || productIds.length === 0) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/products/export/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: channelId,
          product_ids: productIds,
          market_id: selectedMarketId,
          channel_id: selectedChannelId,
          channel_code: selectedChannel?.code ?? null,
          locale_id: selectedLocaleId,
          locale_code: selectedLocale?.code ?? null,
          destination_id: selectedDestinationId,
          destination_code: selectedDestination?.code ?? null,
          format: "csv",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to export channel data.");
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("text/csv")) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Export did not return a CSV file."
        );
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Export returned an empty file.");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filenameMatch = response.headers
        .get("content-disposition")
        ?.match(/filename=\"?([^\";]+)\"?/i);
      link.download = filenameMatch?.[1] ?? `${selectedExportChannel?.code || "syndication-export"}-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Syndication export started.");
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export syndication data.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <CenteredFormModal
      open={open}
      onOpenChange={onOpenChange}
      onCancel={() => onOpenChange(false)}
      onPrimaryAction={handleExport}
      primaryActionLabel="Export CSV"
      primaryActionLoading={loading}
      primaryActionDisabled={!channelId || productIds.length === 0}
      title="Syndication Export"
      description="Export the current product set using a selected syndication destination."
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Destination</label>
        <Select value={channelId} onValueChange={setChannelId}>
          <SelectTrigger>
            <SelectValue placeholder="Select destination" />
          </SelectTrigger>
          <SelectContent>
            {channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
        Exporting {productIds.length} product{productIds.length === 1 ? "" : "s"} with the current market, language,
        and destination scope.
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
    </CenteredFormModal>
  );
}
