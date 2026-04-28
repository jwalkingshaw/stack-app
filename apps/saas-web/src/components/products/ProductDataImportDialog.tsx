"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { FullscreenFormModal } from "@/components/ui/modal-shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useMarketContext } from "@/components/market-context";

type FamilyOption = {
  id: string;
  code: string;
  name: string;
};

type ChannelOption = {
  id: string;
  code: string;
  name: string;
};

type TemplateSource = "family" | "channel";

type ValidationSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  updateRows: number;
  createRows: number;
  deleteRows: number;
  assetLinkRows: number;
  invalidPreview: Array<{ rowNumber: number; errors: string[] }>;
};

interface ProductDataImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
}

export function ProductDataImportDialog({
  open,
  onOpenChange,
  tenantSlug,
}: ProductDataImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { markets, channels, locales, destinations, selectedMarketId, selectedLocaleId } = useMarketContext();

  const [families, setFamilies] = useState<FamilyOption[]>([]);
  const [channelTemplates, setChannelTemplates] = useState<ChannelOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  // Intent is always "both" — per-row Action column in the CSV controls create/update/delete
  const intent = "both" as const;
  const [templateSource, setTemplateSource] = useState<TemplateSource>("family");
  const [familyId, setFamilyId] = useState<string>("");
  const [channelId, setChannelId] = useState<string>("");
  const [scopeChannelId, setScopeChannelId] = useState<string>("");
  const [scopeMarketId, setScopeMarketId] = useState<string>("");
  const [scopeLocaleId, setScopeLocaleId] = useState<string>("");
  const [scopeDestinationId, setScopeDestinationId] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<{ appliedRows: number; failedRows: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingMeta(true);
    void Promise.all([
      fetch(`/api/${tenantSlug}/product-families`)
        .then((response) => response.json())
        .then((payload) => (Array.isArray(payload?.data) ? payload.data : [])),
      fetch(`/api/${tenantSlug}/output-profiles`)
        .then((response) => response.json())
        .then((payload) => (Array.isArray(payload?.data) ? payload.data : [])),
    ])
      .then(([familyData, channelData]) => {
        setFamilies(
          familyData.map((item: Record<string, unknown>) => ({
            id: String(item.id || ""),
            code: String(item.code || ""),
            name: String(item.name || ""),
          }))
        );
        setChannelTemplates(
          channelData.map((item: Record<string, unknown>) => ({
            id: String(item.id || ""),
            code: String(item.code || ""),
            name: String(item.name || ""),
          }))
        );
      })
      .catch(() => {
        toast.error("Failed to load import options.");
      })
      .finally(() => setLoadingMeta(false));
  }, [open, tenantSlug]);

  useEffect(() => {
    if (!open) {
      setTemplateSource("family");
      setFamilyId("");
      setChannelId("");
      setScopeChannelId("");
      setScopeMarketId("");
      setScopeLocaleId("");
      setScopeDestinationId("");
      setSelectedFile(null);
      setJobId(null);
      setSummary(null);
      setSubmitting(false);
      setCompleted(null);
      return;
    }

    setScopeMarketId(selectedMarketId || "");
    setScopeLocaleId(selectedLocaleId || "");
  }, [open, selectedLocaleId, selectedMarketId]);

  const selectedFamily = useMemo(
    () => families.find((family) => family.id === familyId) || null,
    [families, familyId]
  );
  const selectedChannel = useMemo(
    () => channelTemplates.find((channel) => channel.id === channelId) || null,
    [channelTemplates, channelId]
  );

  const canDownloadTemplate =
    templateSource === "family" ? Boolean(familyId) : Boolean(channelId);
  const canValidate =
    selectedFile && (templateSource === "family" ? Boolean(familyId) : Boolean(channelId));

  const handleDownloadTemplate = async () => {
    if (!canDownloadTemplate) return;
    const search = new URLSearchParams();
    if (templateSource === "family") {
      search.set("family", familyId);
    } else {
      search.set("channel", channelId);
      if (familyId) search.set("family", familyId);
    }
    try {
      const response = await fetch(`/api/${tenantSlug}/imports/templates/product-data?${search.toString()}`);
      if (!response.ok) {
        throw new Error();
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `product-data-template-${templateSource}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template.");
    }
  };

  const buildJobPayload = () => ({
    intent,
    template_source: templateSource,
    family_id: familyId || null,
    channel_id: channelId || null,
    scope: {
      marketId: scopeMarketId || null,
      channelId: scopeChannelId || null,
      localeId: scopeLocaleId || null,
      destinationId: scopeDestinationId || null,
    },
    source_filename: selectedFile?.name || null,
  });

  const ensureJob = async () => {
    if (jobId) return jobId;
    const response = await fetch(`/api/${tenantSlug}/imports/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildJobPayload()),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.data?.id) {
      throw new Error(payload?.error || "Failed to create import job.");
    }
    setJobId(String(payload.data.id));
    return String(payload.data.id);
  };

  const handleValidate = async () => {
    if (!selectedFile) return;
    setSubmitting(true);
    setCompleted(null);
    try {
      const currentJobId = await ensureJob();
      const uploadData = new FormData();
      uploadData.append("file", selectedFile);

      const uploadResponse = await fetch(`/api/${tenantSlug}/imports/jobs/${currentJobId}/upload`, {
        method: "POST",
        body: uploadData,
      });
      const uploadPayload = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) {
        throw new Error(uploadPayload?.error || "Failed to upload CSV.");
      }

      const validateResponse = await fetch(`/api/${tenantSlug}/imports/jobs/${currentJobId}/validate`, {
        method: "POST",
      });
      const validatePayload = await validateResponse.json().catch(() => ({}));
      if (!validateResponse.ok) {
        throw new Error(validatePayload?.error || "Failed to validate import.");
      }

      setSummary(validatePayload.data as ValidationSummary);
      toast.success("Import validation complete.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to validate import.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRun = async () => {
    if (!jobId) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/imports/jobs/${jobId}/run`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to run import.");
      }
      setCompleted(payload.data as { appliedRows: number; failedRows: number });
      toast.success("Product data import completed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run import.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FullscreenFormModal
      open={open}
      onOpenChange={onOpenChange}
      onBack={() => onOpenChange(false)}
      title="Product Data Import"
      onPrimaryAction={summary ? handleRun : handleValidate}
      primaryActionLabel={summary ? "Run Import" : "Validate Import"}
      primaryActionLoading={submitting}
      primaryActionDisabled={summary ? !jobId || summary.validRows === 0 : !canValidate}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Template Context</label>
            <Select
              value={templateSource}
              onValueChange={(value) => {
                setTemplateSource(value as TemplateSource);
                setSummary(null);
                setCompleted(null);
                setJobId(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="family">Family Template</SelectItem>
                <SelectItem value="channel">Channel Template</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Family</label>
            <Select
              value={familyId || "__none__"}
              onValueChange={(value) => {
                setFamilyId(value === "__none__" ? "" : value);
                setSummary(null);
                setCompleted(null);
                setJobId(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingMeta ? "Loading..." : "Select family"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No family selected</SelectItem>
                {families.map((family) => (
                  <SelectItem key={family.id} value={family.id}>
                    {family.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Channel</label>
            <Select
              value={channelId || "__none__"}
              onValueChange={(value) => {
                setChannelId(value === "__none__" ? "" : value);
                setSummary(null);
                setCompleted(null);
                setJobId(null);
              }}
              disabled={templateSource !== "channel"}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingMeta ? "Loading..." : "Select channel"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No channel selected</SelectItem>
                {channelTemplates.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Template</h3>
              <p className="text-sm text-muted-foreground">
                Download a CSV with field names in the headers, fill it in, then upload it back into Stackcess.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <a href={`/api/${tenantSlug}/assets/reference-export`}>
                  <FileUp className="mr-2 h-4 w-4" />
                  Asset Refs
                </a>
              </Button>
              <Button variant="outline" onClick={handleDownloadTemplate} disabled={!canDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">CSV File</label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setSelectedFile(file);
                  setSummary(null);
                  setCompleted(null);
                  setJobId(null);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Selected File</label>
              <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                {selectedFile?.name || "No CSV selected"}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div>
            <h3 className="text-sm font-semibold">Write Scope</h3>
            <p className="text-sm text-muted-foreground">
              Scope controls where imported field values and asset links are written.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Market</label>
              <Select value={scopeMarketId || "__none__"} onValueChange={(value) => setScopeMarketId(value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Global" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Global</SelectItem>
                  {markets.map((market) => (
                    <SelectItem key={market.id} value={market.id}>
                      {market.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Channel Scope</label>
              <Select value={scopeChannelId || "__none__"} onValueChange={(value) => setScopeChannelId(value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Global" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Global</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Locale</label>
              <Select value={scopeLocaleId || "__none__"} onValueChange={(value) => setScopeLocaleId(value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Global" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Global</SelectItem>
                  {locales.map((locale) => (
                    <SelectItem key={locale.id} value={locale.id}>
                      {locale.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Destination</label>
              <Select value={scopeDestinationId || "__none__"} onValueChange={(value) => setScopeDestinationId(value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Global" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Global</SelectItem>
                  {destinations.map((destination) => (
                    <SelectItem key={destination.id} value={destination.id}>
                      {destination.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {summary ? (
          <section className="space-y-4 rounded-lg border border-border/60 bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Validation Summary</h3>
                <p className="text-sm text-muted-foreground">
                  Review the split between updates, creates, deletes, and invalid rows before you run the import.
                </p>
              </div>
              {jobId && summary.invalidRows > 0 ? (
                <Button variant="outline" asChild>
                  <a href={`/api/${tenantSlug}/imports/jobs/${jobId}/errors.csv`}>
                    <FileUp className="mr-2 h-4 w-4" />
                    Download Errors
                  </a>
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-border/60 p-3 text-sm">
                <div className="text-muted-foreground">Valid Rows</div>
                <div className="mt-1 text-xl font-semibold">{summary.validRows}</div>
              </div>
              <div className="rounded-md border border-border/60 p-3 text-sm">
                <div className="text-muted-foreground">Update</div>
                <div className="mt-1 text-xl font-semibold">{summary.updateRows}</div>
              </div>
              <div className="rounded-md border border-border/60 p-3 text-sm">
                <div className="text-muted-foreground">Create</div>
                <div className="mt-1 text-xl font-semibold">{summary.createRows}</div>
              </div>
              <div className="rounded-md border border-border/60 p-3 text-sm">
                <div className="text-muted-foreground">Delete</div>
                <div className="mt-1 text-xl font-semibold">{summary.deleteRows ?? 0}</div>
              </div>
            </div>

            {(summary.deleteRows ?? 0) > 0 ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
                <div className="text-sm font-semibold text-destructive">
                  {summary.deleteRows} product(s) will be permanently deleted. This cannot be undone.
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Make sure you have reviewed the delete rows before running the import.
                </div>
              </div>
            ) : null}

            {summary.invalidRows > 0 ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <div className="text-sm font-medium text-destructive">
                  {summary.invalidRows} row(s) need attention before they can be applied.
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {summary.invalidPreview.map((item) => (
                    <div key={item.rowNumber}>
                      Row {item.rowNumber}: {item.errors.join(" ")}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {summary.invalidRows === 0 ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                All rows passed validation.
              </div>
            ) : null}
          </section>
        ) : null}

        {completed ? (
          <section className="space-y-3">
            <div className={`rounded-lg border p-4 text-sm ${completed.failedRows > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              Applied {completed.appliedRows} row(s).{completed.failedRows > 0 ? ` ${completed.failedRows} row(s) failed during run.` : ""}
            </div>
            {completed.failedRows > 0 && jobId ? (
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/${tenantSlug}/imports/jobs/${jobId}/errors.csv`}>
                  <FileUp className="mr-2 h-4 w-4" />
                  Download Run Errors
                </a>
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>
    </FullscreenFormModal>
  );
}
