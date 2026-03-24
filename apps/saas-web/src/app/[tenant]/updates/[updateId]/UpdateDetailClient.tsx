"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  Files,
  Folder,
  GripVertical,
  ImageIcon,
  Link2,
  Megaphone,
  Package,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  richTextToPlainText,
  sanitizeSimpleRichTextHtml,
  SIMPLE_RICH_TEXT_CONTENT_CLASS,
  SimpleRichTextEditor,
} from "@/components/ui/simple-rich-text-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type UpdateRecord = {
  id: string;
  title: string;
  summary: string | null;
  urgency: "low" | "normal" | "high" | "critical";
  status: "draft" | "scheduled" | "published" | "archived" | "canceled";
  event_label: string | null;
  labels: string[];
  message_json: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  due_at: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  updated_at: string;
};

type KitItemType = "product" | "asset" | "url" | "text" | "email" | "social";

type KitItem = {
  id: string;
  item_type: KitItemType;
  product_id: string | null;
  asset_id: string | null;
  url: string | null;
  title: string | null;
  description: string | null;
  content_json?: Record<string, unknown> | null;
  sort_order: number;
  market_ids?: string[];
  channel_ids?: string[];
  locale_ids?: string[];
  metadata?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AnalyticsRecipient = {
  id: string;
  partnerOrganizationId: string | null;
  partnerOrganizationName?: string | null;
  status: string;
  openedAt: string | null;
  acknowledgedAt: string | null;
  activatedAt: string | null;
  dueAt: string | null;
};

type AnalyticsMetrics = {
  recipientCount: number;
  openRate: number;
  acknowledgeRate: number;
  activationRate: number;
  overdueRecipientCount: number;
  publicShareOpenCount?: number;
  uniquePublicViewerCount?: number;
};

type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  type: string | null;
  parentId: string | null;
  imageUrl: string | null;
};

type AssetOption = {
  id: string;
  filename: string;
  fileType: string | null;
  folderId: string | null;
  previewUrl: string | null;
  mimeType: string | null;
};

type AssetFolderOption = {
  id: string;
  name: string;
  path: string;
};

type UpdateComposerStep = "compose" | "build" | "audience" | "review" | "analytics";
type DeliveryMode = "partners" | "share_link" | "partners_and_link";

type BuildEmailDraft = {
  label: string;
  subjectLine: string;
  heroAssetId: string | null;
  headline: string;
  bodyCopy: string;
  ctaLabel: string;
};

type BuildSocialDraft = {
  label: string;
  caption: string;
  assetId: string | null;
};

type AssetPickerContext = "compose" | "build_email" | "build_social";

type DeliveryChannel = "in_app" | "email";

type PartnerRecipientOption = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  accessLevel: "view" | "edit";
};

type PendingPartnerInvite = {
  id: string;
  email: string;
  expiresAt: string | null;
};

type ShareSetOption = {
  id: string;
  moduleKey: "assets" | "products";
  name: string;
  itemCount: number;
};

interface UpdateDetailClientProps {
  tenantSlug: string;
  updateId: string;
}

function formatDate(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatDeliveryChannelLabel(channel: string): string {
  if (channel === "in_app") return "Workspace";
  if (channel === "email") return "Email";
  return channel;
}

function formatDeliveryModeLabel(mode: DeliveryMode): string {
  if (mode === "partners") return "Partners";
  if (mode === "share_link") return "Share Link Only";
  return "Partners + Share Link";
}

function formatLabelValue(value: string | null | undefined): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "-";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getTextContent(contentJson: Record<string, unknown> | null | undefined): string {
  if (!contentJson || typeof contentJson !== "object") return "";
  const direct = contentJson.text;
  if (typeof direct === "string") return direct;
  const body = contentJson.body;
  if (typeof body === "string") return body;
  const value = contentJson.value;
  if (typeof value === "string") return value;
  return "";
}

function matchesSearch(term: string, ...parts: Array<string | null | undefined>): boolean {
  if (!term) return true;
  return parts.some((part) => String(part || "").toLowerCase().includes(term));
}

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function productTypeLabel(value: string | null): string {
  if (!value) return "Product";
  if (value === "variant") return "Variant";
  if (value === "standalone") return "Standalone";
  if (value === "parent") return "Parent";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const DEFAULT_BUILD_EMAIL_DRAFT: BuildEmailDraft = {
  label: "",
  subjectLine: "",
  heroAssetId: null,
  headline: "",
  bodyCopy: "",
  ctaLabel: "",
};

const DEFAULT_BUILD_SOCIAL_DRAFT: BuildSocialDraft = {
  label: "",
  caption: "",
  assetId: null,
};

function normalizeAudienceSettingsPayload(params: {
  deliveryMode: DeliveryMode;
  partnerOrganizationIds: string[];
  deliveryChannels: DeliveryChannel[];
}) {
  const partnerOrganizationIds = Array.from(
    new Set(params.partnerOrganizationIds.filter((value) => typeof value === "string" && value.trim()))
  );
  const deliveryChannels = Array.from(
    new Set(
      params.deliveryChannels.filter(
        (channel): channel is DeliveryChannel =>
          channel === "in_app" || channel === "email"
      )
    )
  );
  if (!deliveryChannels.includes("in_app")) deliveryChannels.unshift("in_app");
  return {
    deliveryMode: params.deliveryMode,
    partnerOrganizationIds,
    deliveryChannels,
  };
}

function audienceSettingsSignature(payload: {
  deliveryMode: DeliveryMode;
  partnerOrganizationIds: string[];
  deliveryChannels: DeliveryChannel[];
}): string {
  return JSON.stringify({
    deliveryMode: payload.deliveryMode,
    partnerOrganizationIds: [...payload.partnerOrganizationIds].sort(),
    deliveryChannels: [...payload.deliveryChannels].sort(),
  });
}

export function UpdateDetailClient({ tenantSlug, updateId }: UpdateDetailClientProps) {
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateRecord | null>(null);
  const [kitItems, setKitItems] = useState<KitItem[]>([]);
  const [analyticsRecipients, setAnalyticsRecipients] = useState<AnalyticsRecipient[]>([]);
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [scheduleFor, setScheduleFor] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [kitErrorMessage, setKitErrorMessage] = useState<string | null>(null);
  const [kitSuccessMessage, setKitSuccessMessage] = useState<string | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [draggedKitItemId, setDraggedKitItemId] = useState<string | null>(null);
  const [dragOverKitItemId, setDragOverKitItemId] = useState<string | null>(null);
  const [activeAddType, setActiveAddType] = useState<"product" | "asset">("product");
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  const [productsCatalog, setProductsCatalog] = useState<ProductOption[]>([]);
  const [assetsCatalog, setAssetsCatalog] = useState<AssetOption[]>([]);
  const [assetFolders, setAssetFolders] = useState<AssetFolderOption[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetPickerContext, setAssetPickerContext] = useState<AssetPickerContext>("compose");
  const [productPickerSearch, setProductPickerSearch] = useState("");
  const [assetPickerSearch, setAssetPickerSearch] = useState("");
  const [assetFolderFilter, setAssetFolderFilter] = useState("all");
  const [assetPanelView, setAssetPanelView] = useState<"folders" | "assets">("folders");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [expandedProductGroupIds, setExpandedProductGroupIds] = useState<Set<string>>(new Set());
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [buildFormType, setBuildFormType] = useState<"email" | "social">("email");
  const [buildEmailDraft, setBuildEmailDraft] = useState<BuildEmailDraft>(DEFAULT_BUILD_EMAIL_DRAFT);
  const [buildSocialDraft, setBuildSocialDraft] = useState<BuildSocialDraft>(DEFAULT_BUILD_SOCIAL_DRAFT);
  const [promotionPreviewItem, setPromotionPreviewItem] = useState<KitItem | null>(null);
  const [buildAddBusy, setBuildAddBusy] = useState(false);
  const [buildAddError, setBuildAddError] = useState<string | null>(null);
  const [kitDrawerOpen, setKitDrawerOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [sharePublicEnabled, setSharePublicEnabled] = useState(false);
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareErrorMessage, setShareErrorMessage] = useState<string | null>(null);
  const [shareSuccessMessage, setShareSuccessMessage] = useState<string | null>(null);
  const [shareCopyLabel, setShareCopyLabel] = useState("Copy link");
  const [shareAvailable, setShareAvailable] = useState(true);
  const [onboardingShareSetIds, setOnboardingShareSetIds] = useState<string[]>([]);
  const [onboardingShareSetOptions, setOnboardingShareSetOptions] = useState<ShareSetOption[]>([]);
  const [onboardingShareSetLoading, setOnboardingShareSetLoading] = useState(false);
  const [onboardingShareSetError, setOnboardingShareSetError] = useState<string | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [activeStep, setActiveStep] = useState<UpdateComposerStep>("compose");
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("partners");
  const [deliveryChannels, setDeliveryChannels] = useState<DeliveryChannel[]>(["in_app", "email"]);
  const [partnerRecipients, setPartnerRecipients] = useState<PartnerRecipientOption[]>([]);
  const [pendingPartnerInvites, setPendingPartnerInvites] = useState<PendingPartnerInvite[]>([]);
  const [selectedPartnerOrganizationIds, setSelectedPartnerOrganizationIds] = useState<string[]>([]);
  const [partnerRecipientsLoading, setPartnerRecipientsLoading] = useState(false);
  const [partnerRecipientsLoaded, setPartnerRecipientsLoaded] = useState(false);
  const [partnerRecipientsError, setPartnerRecipientsError] = useState<string | null>(null);
  const [audienceAutosaveState, setAudienceAutosaveState] = useState<
    "idle" | "unsaved" | "saving" | "saved" | "error"
  >("idle");
  const [messageBodyHtml, setMessageBodyHtml] = useState("");
  const [messageAutosaveState, setMessageAutosaveState] = useState<
    "idle" | "unsaved" | "saving" | "saved" | "error"
  >("idle");
  const audienceAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audienceAutosaveReadyRef = useRef(false);
  const audienceSaveInFlightRef = useRef(false);
  const lastSavedAudienceSignatureRef = useRef<string>("");
  const messageAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageAutosaveReadyRef = useRef(false);
  const lastSavedMessageSignatureRef = useRef<string>("");
  const initializedAudienceStateUpdateIdRef = useRef<string | null>(null);
  const initializedBuildAndMessageStateUpdateIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [updateRes, kitRes, analyticsRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/updates/${updateId}`, { cache: "no-store" }),
        fetch(`/api/${tenantSlug}/updates/${updateId}/kit-items`, { cache: "no-store" }),
        fetch(`/api/${tenantSlug}/updates/${updateId}/analytics`, { cache: "no-store" }),
      ]);

      if (!updateRes.ok) {
        const payload = await updateRes.json().catch(() => ({}));
        setErrorMessage(payload.error || "Failed to load update.");
        setLoading(false);
        return;
      }

      const updatePayload = await updateRes.json().catch(() => ({}));
      setUpdate(updatePayload?.data || null);

      const kitPayload = kitRes.ok ? await kitRes.json().catch(() => ({})) : {};
      setKitItems(Array.isArray(kitPayload?.data) ? kitPayload.data : []);

      const analyticsPayload = analyticsRes.ok ? await analyticsRes.json().catch(() => ({})) : {};
      setAnalyticsRecipients(
        Array.isArray(analyticsPayload?.data?.recipients) ? analyticsPayload.data.recipients : []
      );
      setMetrics(analyticsPayload?.data?.metrics || null);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, updateId]);

  const loadProductsCatalog = useCallback(async () => {
    if (productsLoaded || productsLoading) return;
    setProductsLoading(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/products`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setKitErrorMessage(payload?.error || "Failed to load products for kit composer.");
        return;
      }
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const mapped: ProductOption[] = rows
        .map((row: Record<string, unknown>) => {
          const primaryImageUrl =
            typeof row?.primary_image_url === "string"
              ? row.primary_image_url
              : typeof row?.primaryImageUrl === "string"
                ? row.primaryImageUrl
                : typeof row?.image_url === "string"
                  ? row.image_url
                  : typeof row?.imageUrl === "string"
                    ? row.imageUrl
                    : null;
          const primaryImageAssetId =
            typeof row?.primary_image_asset_id === "string"
              ? row.primary_image_asset_id
              : typeof row?.primaryImageAssetId === "string"
                ? row.primaryImageAssetId
                : null;

          return {
            id: String(row?.id || ""),
            name: String(row?.product_name || row?.sku || row?.id || "").trim(),
            sku: typeof row?.sku === "string" ? row.sku : null,
            type: typeof row?.type === "string" ? row.type.toLowerCase() : null,
            parentId:
              typeof row?.parent_id === "string"
                ? row.parent_id
                : typeof row?.parentId === "string"
                  ? row.parentId
                  : null,
            imageUrl:
              primaryImageUrl ||
              (primaryImageAssetId
                ? `/api/${tenantSlug}/assets/${primaryImageAssetId}/preview`
                : null),
          };
        })
        .filter((row: ProductOption) => row.id.length > 0 && row.name.length > 0)
        .sort((a: ProductOption, b: ProductOption) => a.name.localeCompare(b.name));

      // Backfill product preview images from product links when product rows do not include image fields.
      const nextProducts = [...mapped];
      try {
        const slots = ["image_front", "image_back", "image_left", "image_right"];
        const slotPayloads = await Promise.all(
          slots.map(async (slot) => {
            const query = new URLSearchParams({ document_slot_code: slot });
            const response = await fetch(`/api/${tenantSlug}/product-links?${query.toString()}`, {
              cache: "no-store",
            });
            if (!response.ok) return [];
            const payload = await response.json().catch(() => ({}));
            return Array.isArray(payload?.data) ? payload.data : [];
          })
        );

        const previewByProductId = new Map<string, string>();
        for (const slotRows of slotPayloads) {
          for (const row of slotRows) {
            const link = (row || {}) as Record<string, unknown>;
            const productId = typeof link.product_id === "string" ? link.product_id : "";
            const assetId =
              typeof link.asset_id === "string"
                ? link.asset_id
                : typeof (link.dam_assets as Record<string, unknown> | undefined)?.id === "string"
                  ? String((link.dam_assets as Record<string, unknown>).id)
                  : "";
            if (!productId || !assetId || previewByProductId.has(productId)) continue;
            previewByProductId.set(productId, `/api/${tenantSlug}/assets/${assetId}/preview`);
          }
        }

        for (let index = 0; index < nextProducts.length; index += 1) {
          const row = nextProducts[index];
          if (row.imageUrl) continue;
          const linkedPreview = previewByProductId.get(row.id);
          if (linkedPreview) {
            nextProducts[index] = { ...row, imageUrl: linkedPreview };
          }
        }
      } catch {
        // Keep list usable when link-derived previews are unavailable.
      }

      // Variants inherit parent thumbnail when they do not have their own image.
      const imageByProductId = new Map(nextProducts.map((row) => [row.id, row.imageUrl] as const));
      const withInheritedImages = nextProducts.map((row) => {
        if (row.imageUrl || !row.parentId) return row;
        const parentImageUrl = imageByProductId.get(row.parentId) || null;
        return parentImageUrl ? { ...row, imageUrl: parentImageUrl } : row;
      });

      setProductsCatalog(withInheritedImages);
      setProductsLoaded(true);
    } finally {
      setProductsLoading(false);
    }
  }, [productsLoaded, productsLoading, tenantSlug]);

  const loadAssetsCatalog = useCallback(async () => {
    if (assetsLoaded || assetsLoading) return;
    setAssetsLoading(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/assets`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setKitErrorMessage(payload?.error || "Failed to load assets for kit composer.");
        return;
      }
      const rows = Array.isArray(payload?.data?.assets)
        ? payload.data.assets
        : Array.isArray(payload?.assets)
          ? payload.assets
          : [];
      const folderRows = Array.isArray(payload?.data?.folders)
        ? payload.data.folders
        : Array.isArray(payload?.folders)
          ? payload.folders
          : [];
      const mapped: AssetOption[] = rows
        .map((row: Record<string, unknown>) => ({
          id: String(row?.id || ""),
          filename: String(row?.originalFilename || row?.filename || row?.id || "").trim(),
          fileType:
            typeof row?.fileType === "string"
              ? row.fileType
              : typeof row?.file_type === "string"
                ? row.file_type
                : null,
          folderId:
            typeof row?.folderId === "string"
              ? row.folderId
              : typeof row?.folder_id === "string"
                ? row.folder_id
                : null,
          previewUrl:
            typeof row?.previewUrl === "string"
              ? row.previewUrl
              : typeof row?.s3_url === "string"
                ? row.s3_url
                : typeof row?.s3Url === "string"
                  ? row.s3Url
                  : null,
          mimeType:
            typeof row?.mimeType === "string"
              ? row.mimeType
              : typeof row?.mime_type === "string"
                ? row.mime_type
                : null,
        }))
        .filter((row: AssetOption) => row.id.length > 0 && row.filename.length > 0)
        .sort((a: AssetOption, b: AssetOption) => a.filename.localeCompare(b.filename));
      setAssetsCatalog(mapped);
      setAssetFolders(
        folderRows
          .map((row: Record<string, unknown>) => {
            const id = typeof row?.id === "string" ? row.id : "";
            const name = typeof row?.name === "string" ? row.name : "";
            const path =
              typeof row?.path === "string" && row.path.trim().length > 0
                ? row.path
                : name;
            return { id, name, path };
          })
          .filter((row: AssetFolderOption) => row.id.length > 0)
          .sort((a: AssetFolderOption, b: AssetFolderOption) => a.path.localeCompare(b.path))
      );
      setAssetsLoaded(true);
    } finally {
      setAssetsLoading(false);
    }
  }, [assetsLoaded, assetsLoading, tenantSlug]);

  const loadPartnerRecipientOptions = useCallback(async () => {
    if (partnerRecipientsLoaded || partnerRecipientsLoading) return;
    setPartnerRecipientsLoading(true);
    setPartnerRecipientsError(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/team`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPartnerRecipientsError(payload?.error || "Failed to load partner recipients.");
        return;
      }
      const data = payload?.data || {};
      const relationships = Array.isArray(data.partner_relationships)
        ? (data.partner_relationships as Array<Record<string, unknown>>)
        : [];
      const options = relationships
        .map((row) => {
          const partner =
            row.partner_organization && typeof row.partner_organization === "object"
              ? (row.partner_organization as Record<string, unknown>)
              : null;
          const id = partner && typeof partner.id === "string" ? partner.id : "";
          const name = partner && typeof partner.name === "string" ? partner.name.trim() : "";
          if (!id || !name) return null;
          return {
            id,
            name,
            slug: partner && typeof partner.slug === "string" ? partner.slug : null,
            status: typeof row.status === "string" ? row.status : "active",
            accessLevel:
              row.access_level === "edit" || row.access_level === "view"
                ? (row.access_level as "view" | "edit")
                : "view",
          } as PartnerRecipientOption;
        })
        .filter((row): row is PartnerRecipientOption => Boolean(row))
        .sort((a, b) => a.name.localeCompare(b.name));

      const invites = Array.isArray(data.pending_invitations)
        ? (data.pending_invitations as Array<Record<string, unknown>>)
        : [];
      const pendingInvites = invites
        .filter((row) => row.invitation_type === "partner")
        .map((row) => ({
          id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
          email: typeof row.email === "string" ? row.email : "Unknown email",
          expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
        }))
        .sort((a, b) => a.email.localeCompare(b.email));

      setPartnerRecipients(options);
      setPendingPartnerInvites(pendingInvites);
      setPartnerRecipientsLoaded(true);
    } finally {
      setPartnerRecipientsLoading(false);
    }
  }, [partnerRecipientsLoaded, partnerRecipientsLoading, tenantSlug]);


  const loadOnboardingShareSetOptions = useCallback(async () => {
    setOnboardingShareSetLoading(true);
    setOnboardingShareSetError(null);
    try {
      const query = new URLSearchParams({
        module: "all",
        page: "1",
        pageSize: "200",
      });
      const response = await fetch(`/api/${tenantSlug}/sharing/sets?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOnboardingShareSetError(payload?.error || "Failed to load share sets.");
        setOnboardingShareSetOptions([]);
        return;
      }

      const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
      const productSets = Array.isArray((data as Record<string, unknown>).product_sets)
        ? ((data as Record<string, unknown>).product_sets as Array<Record<string, unknown>>)
        : [];
      const assetSets = Array.isArray((data as Record<string, unknown>).asset_sets)
        ? ((data as Record<string, unknown>).asset_sets as Array<Record<string, unknown>>)
        : [];

      const options: ShareSetOption[] = [...productSets, ...assetSets]
        .map((row) => {
          const id = String(row.id || "").trim();
          const moduleKey = String(row.module_key || "").trim().toLowerCase();
          const name = String(row.name || "").trim();
          if (!id || !name) return null;
          if (moduleKey !== "assets" && moduleKey !== "products") return null;
          return {
            id,
            moduleKey: moduleKey as "assets" | "products",
            name,
            itemCount: Number.isFinite(Number(row.item_count)) ? Number(row.item_count) : 0,
          } satisfies ShareSetOption;
        })
        .filter((option): option is ShareSetOption => Boolean(option))
        .sort((a, b) => a.name.localeCompare(b.name));

      setOnboardingShareSetOptions(options);
    } finally {
      setOnboardingShareSetLoading(false);
    }
  }, [tenantSlug]);

  const loadShareSettings = useCallback(async () => {
    setShareLoading(true);
    setShareErrorMessage(null);
    setShareSuccessMessage(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/updates/${updateId}/share`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) {
          setShareAvailable(false);
          return;
        }
        setShareErrorMessage(payload?.error || "Failed to load share link settings.");
        return;
      }
      setShareAvailable(true);
      setSharePublicEnabled(Boolean(payload?.publicEnabled));
      setShareExpiresAt(toLocalDateTimeInput(typeof payload?.expiresAt === "string" ? payload.expiresAt : null));
      setShareUrl(typeof payload?.shareUrl === "string" ? payload.shareUrl : "");
      setOnboardingShareSetIds(
        Array.isArray(payload?.onboardingShareSetIds)
          ? payload.onboardingShareSetIds
              .filter((value: unknown): value is string => typeof value === "string")
              .map((value: string) => value.trim())
              .filter((value: string) => value.length > 0)
          : []
      );
    } finally {
      setShareLoading(false);
    }
  }, [tenantSlug, updateId]);

  const saveAudienceSettings = useCallback(async (options?: { silent?: boolean }) => {
    if (!update) return;
    const silent = options?.silent === true;
    if (audienceSaveInFlightRef.current) return;
    audienceSaveInFlightRef.current = true;
    setAudienceAutosaveState("saving");

    try {
      const normalized = normalizeAudienceSettingsPayload({
        deliveryMode,
        partnerOrganizationIds: selectedPartnerOrganizationIds,
        deliveryChannels,
      });
      const currentMetadata =
        update.metadata && typeof update.metadata === "object"
          ? (update.metadata as Record<string, unknown>)
          : {};
      const nextMetadata: Record<string, unknown> = {
        ...currentMetadata,
        audience: {
          deliveryMode: normalized.deliveryMode,
          partnerOrganizationIds: normalized.partnerOrganizationIds,
          deliveryChannels: normalized.deliveryChannels,
          updatedAt: new Date().toISOString(),
        },
      };

      const response = await fetch(`/api/${tenantSlug}/updates/${updateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: nextMetadata }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (!silent) {
          setErrorMessage(payload?.error || "Failed to save audience settings.");
        }
        setAudienceAutosaveState("error");
        return;
      }

      setUpdate((payload?.data as UpdateRecord) || null);
      lastSavedAudienceSignatureRef.current = audienceSettingsSignature(normalized);
      setAudienceAutosaveState("saved");
    } finally {
      audienceSaveInFlightRef.current = false;
    }
  }, [
    deliveryChannels,
    deliveryMode,
    selectedPartnerOrganizationIds,
    tenantSlug,
    update,
    updateId,
  ]);

  const saveMessageBody = useCallback(async () => {
    if (!update) return;
    if (messageAutosaveTimerRef.current) {
      clearTimeout(messageAutosaveTimerRef.current);
      messageAutosaveTimerRef.current = null;
    }
    setMessageAutosaveState("saving");
    try {
      const currentMessageJson =
        update.message_json && typeof update.message_json === "object"
          ? (update.message_json as Record<string, unknown>)
          : {};
      const nextMessageJson: Record<string, unknown> = {
        ...currentMessageJson,
        body_html: messageBodyHtml,
      };
      const response = await fetch(`/api/${tenantSlug}/updates/${updateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageJson: nextMessageJson }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessageAutosaveState("error");
        console.error("Failed to save message body:", payload?.error);
        return;
      }
      setUpdate((payload?.data as UpdateRecord) || null);
      lastSavedMessageSignatureRef.current = messageBodyHtml;
      setMessageAutosaveState("saved");
    } catch {
      setMessageAutosaveState("error");
    }
  }, [messageBodyHtml, tenantSlug, update, updateId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadShareSettings();
  }, [loadShareSettings]);

  useEffect(() => {
    void loadOnboardingShareSetOptions();
  }, [loadOnboardingShareSetOptions]);

  useEffect(() => {
    if (!update?.scheduled_for) return;
    const date = new Date(update.scheduled_for);
    if (Number.isNaN(date.getTime())) return;
    const isoLocal = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    setScheduleFor(isoLocal);
    setPublishMode("schedule");
  }, [update?.scheduled_for]);

  useEffect(() => {
    if (activeStep !== "audience" && activeStep !== "review") return;
    void loadPartnerRecipientOptions();
  }, [activeStep, loadPartnerRecipientOptions]);

  useEffect(() => {
    if (activeStep !== "build") return;
    void loadAssetsCatalog();
  }, [activeStep, loadAssetsCatalog]);

  useEffect(() => {
    if (!update?.id) return;
    if (initializedAudienceStateUpdateIdRef.current === update.id) return;
    initializedAudienceStateUpdateIdRef.current = update.id;

    const metadata =
      update?.metadata && typeof update.metadata === "object"
        ? (update.metadata as Record<string, unknown>)
        : {};
    const audience =
      metadata.audience && typeof metadata.audience === "object"
        ? (metadata.audience as Record<string, unknown>)
        : {};

    const nextDeliveryModeRaw =
      typeof audience.deliveryMode === "string" ? audience.deliveryMode : "partners";
    const nextDeliveryMode: DeliveryMode =
      nextDeliveryModeRaw === "share_link" || nextDeliveryModeRaw === "partners_and_link"
        ? nextDeliveryModeRaw
        : "partners";

    const nextPartnerOrganizationIds = Array.isArray(audience.partnerOrganizationIds)
      ? audience.partnerOrganizationIds
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const nextDeliveryChannels: DeliveryChannel[] = Array.isArray(audience.deliveryChannels)
      ? audience.deliveryChannels
          .filter(
            (value): value is DeliveryChannel =>
              value === "in_app" || value === "email"
          )
      : ["in_app", "email"];

    const normalized = normalizeAudienceSettingsPayload({
      deliveryMode: nextDeliveryMode,
      partnerOrganizationIds: nextPartnerOrganizationIds,
      deliveryChannels: nextDeliveryChannels,
    });

    setDeliveryMode(normalized.deliveryMode);
    setSelectedPartnerOrganizationIds(normalized.partnerOrganizationIds);
    setDeliveryChannels(normalized.deliveryChannels);
    lastSavedAudienceSignatureRef.current = audienceSettingsSignature(normalized);
    audienceAutosaveReadyRef.current = true;
    setAudienceAutosaveState("saved");
  }, [update?.id, update?.metadata]);

  useEffect(() => {
    if (!partnerRecipientsLoaded) return;
    const activeIds = new Set(
      partnerRecipients
        .filter((row) => row.status.toLowerCase() === "active")
        .map((row) => row.id)
    );
    if (activeIds.size === 0) {
      setSelectedPartnerOrganizationIds([]);
      return;
    }
    setSelectedPartnerOrganizationIds((current) => current.filter((id) => activeIds.has(id)));
  }, [partnerRecipients, partnerRecipientsLoaded]);

  useEffect(() => {
    if (!update?.id) return;
    if (initializedBuildAndMessageStateUpdateIdRef.current === update.id) return;
    initializedBuildAndMessageStateUpdateIdRef.current = update.id;

    // Initialize message body HTML
    const bodyHtml =
      update?.message_json && typeof (update.message_json as Record<string, unknown>).body_html === "string"
        ? String((update.message_json as Record<string, unknown>).body_html)
        : "";
    setMessageBodyHtml(bodyHtml);
    lastSavedMessageSignatureRef.current = bodyHtml;
    messageAutosaveReadyRef.current = true;
    setMessageAutosaveState("saved");
  }, [update?.id, update?.message_json]);

  const messageBlocks = useMemo(() => {
    const blocks = (update?.message_json as { blocks?: unknown })?.blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const text = typeof row.text === "string" ? row.text.trim() : "";
        return text ? text : null;
      })
      .filter((value): value is string => Boolean(value));
  }, [update?.message_json]);

  const productById = useMemo(
    () => new Map(productsCatalog.map((product) => [product.id, product] as const)),
    [productsCatalog]
  );
  const assetById = useMemo(
    () => new Map(assetsCatalog.map((asset) => [asset.id, asset] as const)),
    [assetsCatalog]
  );

  const resolveProductLabel = (productId: string | null): string => {
    if (!productId) return "Unknown product";
    const option = productById.get(productId);
    if (!option) return `Product ${productId}`;
    return option.sku ? `${option.name} (${option.sku})` : option.name;
  };

  const resolveAssetLabel = (assetId: string | null): string => {
    if (!assetId) return "Unknown asset";
    const option = assetById.get(assetId);
    if (!option) return `Asset ${assetId}`;
    return option.fileType ? `${option.filename} (${option.fileType})` : option.filename;
  };

  const isImageAsset = (asset: AssetOption | null | undefined) => {
    if (!asset) return false;
    const type = (asset.fileType || "").toLowerCase();
    const mime = (asset.mimeType || "").toLowerCase();
    return type.includes("image") || mime.startsWith("image/");
  };

  const assetPreviewPath = (assetId: string) => `/api/${tenantSlug}/assets/${assetId}/preview`;

  const kitAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          kitItems
            .filter((item) => item.item_type === "asset" && typeof item.asset_id === "string")
            .map((item) => item.asset_id as string)
        )
      ),
    [kitItems]
  );

  const kitAssetOptions = useMemo(
    () =>
      kitAssetIds.map((assetId) => {
        const found = assetById.get(assetId);
        if (found) return found;
        return {
          id: assetId,
          filename: `Asset ${assetId}`,
          fileType: null,
          folderId: null,
          previewUrl: null,
          mimeType: null,
        } as AssetOption;
      }),
    [assetById, kitAssetIds]
  );

  const imageAssetOptions = useMemo(
    () =>
      kitAssetOptions.filter((asset) => {
        const type = (asset.fileType || "").toLowerCase();
        const mime = (asset.mimeType || "").toLowerCase();
        return type.includes("image") || mime.startsWith("image/");
      }),
    [kitAssetOptions]
  );

  const socialAssetOptions = useMemo(
    () =>
      kitAssetOptions.filter((asset) => {
        const type = (asset.fileType || "").toLowerCase();
        const mime = (asset.mimeType || "").toLowerCase();
        return (
          type.includes("image") ||
          type.includes("video") ||
          mime.startsWith("image/") ||
          mime.startsWith("video/")
        );
      }),
    [kitAssetOptions]
  );

  const selectedEmailHeroAsset = buildEmailDraft.heroAssetId
    ? kitAssetOptions.find((asset) => asset.id === buildEmailDraft.heroAssetId) || null
    : null;
  const selectedSocialAsset = buildSocialDraft.assetId
    ? kitAssetOptions.find((asset) => asset.id === buildSocialDraft.assetId) || null
    : null;

  const selectedSocialIsVideo = Boolean(
    selectedSocialAsset &&
      (((selectedSocialAsset.fileType || "").toLowerCase().includes("video")) ||
        ((selectedSocialAsset.mimeType || "").toLowerCase().startsWith("video/")))
  );

  const sortedKitItems = useMemo(
    () =>
      [...kitItems].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
        const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
        return aCreated - bCreated;
      }),
    [kitItems]
  );

  const isPublished = update?.status === "published";
  const isScheduled = update?.status === "scheduled";
  const isLiveOrScheduled = isPublished || isScheduled;
  const orderedSteps = useMemo<UpdateComposerStep[]>(
    () =>
      isPublished
        ? ["compose", "build", "audience", "review", "analytics"]
        : ["compose", "build", "audience", "review"],
    [isPublished]
  );
  const stepLabels: Record<UpdateComposerStep, string> = {
    compose: "Kit",
    build: "Promotion",
    audience: "Share",
    review: "Publish",
    analytics: "Analytics",
  };
  const stepDescriptions: Record<UpdateComposerStep, string> = {
    compose: "Add products, assets & message",
    build: "Email & social templates",
    audience: "Partners & share link",
    review: "Review & publish",
    analytics: "Recipient engagement",
  };
  const currentStepIndex = Math.max(
    orderedSteps.findIndex((step) => step === activeStep),
    0
  );
  const selectedDeliveryChannels = Array.from(
    new Set<DeliveryChannel>(["in_app", ...deliveryChannels.filter((channel) => channel !== "in_app")])
  );
  const activePartnerRecipients = useMemo(
    () => partnerRecipients.filter((row) => row.status.toLowerCase() === "active"),
    [partnerRecipients]
  );
  const partnerDeliveryEnabled = deliveryMode === "partners" || deliveryMode === "partners_and_link";
  const shareLinkDeliveryEnabled =
    deliveryMode === "share_link" || deliveryMode === "partners_and_link";
  const partnerRecipientIdsForDelivery = partnerDeliveryEnabled ? selectedPartnerOrganizationIds : [];
  const partnerAudienceReady = !partnerDeliveryEnabled || partnerRecipientIdsForDelivery.length > 0;
  const shareLinkAudienceReady =
    !shareLinkDeliveryEnabled || shareAvailable;
  const allowNoRecipientsForPublicLink =
    !partnerDeliveryEnabled &&
    shareLinkDeliveryEnabled &&
    partnerRecipientIdsForDelivery.length === 0 &&
    shareAvailable;
  const audienceSelectionReady = partnerAudienceReady && shareLinkAudienceReady;
  const canPublishOrSchedule =
    Boolean(update?.title?.trim()) &&
    audienceSelectionReady &&
    update?.status !== "archived" &&
    update?.status !== "canceled";
  const canEditBuildAssets =
    update?.status !== "archived" && update?.status !== "canceled";
  const publishBlockingReason =
    !partnerAudienceReady
      ? "Select at least one partner recipient."
      : !shareLinkAudienceReady
        ? "Share links are unavailable for your current role. Choose Partner delivery instead."
        : null;
  const audienceAutosaveStatusLabel =
    audienceAutosaveState === "saving"
      ? "Saving..."
      : audienceAutosaveState === "saved"
        ? "Saved"
        : audienceAutosaveState === "error"
          ? "Autosave failed"
          : audienceAutosaveState === "unsaved"
            ? "Unsaved changes"
            : "Ready";
  const audienceAutosaveStatusClassName =
    audienceAutosaveState === "error"
      ? "text-destructive"
      : audienceAutosaveState === "saving"
        ? "text-muted-foreground"
        : audienceAutosaveState === "unsaved"
          ? "text-amber-700"
          : "text-emerald-700";
  const deliverySummaryLabel = selectedDeliveryChannels
    .map((channel) => formatDeliveryChannelLabel(channel))
    .join(", ");
  const deliveryModeSummaryLabel = formatDeliveryModeLabel(deliveryMode);


  useEffect(() => {
    if (activeStep !== "audience") return;
    if (!audienceAutosaveReadyRef.current) return;
    if (partnerDeliveryEnabled && !partnerRecipientsLoaded) return;

    const normalized = normalizeAudienceSettingsPayload({
      deliveryMode,
      partnerOrganizationIds: selectedPartnerOrganizationIds,
      deliveryChannels,
    });
    const signature = audienceSettingsSignature(normalized);
    if (signature === lastSavedAudienceSignatureRef.current) {
      setAudienceAutosaveState("saved");
      return;
    }

    setAudienceAutosaveState("unsaved");
    if (audienceAutosaveTimerRef.current) {
      clearTimeout(audienceAutosaveTimerRef.current);
    }
    audienceAutosaveTimerRef.current = setTimeout(() => {
      void saveAudienceSettings({ silent: true });
    }, 700);

    return () => {
      if (audienceAutosaveTimerRef.current) {
        clearTimeout(audienceAutosaveTimerRef.current);
      }
    };
  }, [
    activeStep,
    deliveryMode,
    selectedPartnerOrganizationIds,
    deliveryChannels,
    partnerDeliveryEnabled,
    partnerRecipientsLoaded,
    saveAudienceSettings,
  ]);

  useEffect(() => {
    return () => {
      if (audienceAutosaveTimerRef.current) {
        clearTimeout(audienceAutosaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeStep !== "compose") return;
    if (!messageAutosaveReadyRef.current) return;
    if (messageBodyHtml === lastSavedMessageSignatureRef.current) {
      setMessageAutosaveState("saved");
      return;
    }
    setMessageAutosaveState("unsaved");
    if (messageAutosaveTimerRef.current) {
      clearTimeout(messageAutosaveTimerRef.current);
    }
    messageAutosaveTimerRef.current = setTimeout(() => {
      void saveMessageBody();
    }, 900);
    return () => {
      if (messageAutosaveTimerRef.current) {
        clearTimeout(messageAutosaveTimerRef.current);
      }
    };
  }, [activeStep, messageBodyHtml, saveMessageBody]);

  useEffect(() => {
    if (orderedSteps.includes(activeStep)) return;
    setActiveStep("review");
  }, [activeStep, orderedSteps]);

  const selectedProducts = useMemo(
    () => productsCatalog.filter((row) => selectedProductIds.has(row.id)),
    [productsCatalog, selectedProductIds]
  );

  const productsById = useMemo(
    () => new Map(productsCatalog.map((row) => [row.id, row] as const)),
    [productsCatalog]
  );

  const variantsByParentId = useMemo(() => {
    const map = new Map<string, ProductOption[]>();
    for (const row of productsCatalog) {
      if (row.type !== "variant" || !row.parentId || !productsById.has(row.parentId)) continue;
      const list = map.get(row.parentId) || [];
      list.push(row);
      map.set(row.parentId, list);
    }
    map.forEach((list) =>
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    );
    return map;
  }, [productsById, productsCatalog]);

  const topLevelProducts = useMemo(
    () =>
      productsCatalog
        .filter(
          (row) => row.type !== "variant" || !row.parentId || !productsById.has(row.parentId)
        )
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [productsById, productsCatalog]
  );

  const productPickerRows = useMemo(() => {
    const term = productPickerSearch.trim().toLowerCase();
    const hasSearch = term.length > 0;
    const matchesRow = (row: ProductOption) =>
      matchesSearch(term, row.name, row.sku, row.id, row.type);

    const rows: Array<{
      product: ProductOption;
      depth: 0 | 1;
      expandable: boolean;
      expanded: boolean;
      childCount: number;
    }> = [];

    for (const root of topLevelProducts) {
      const variants = variantsByParentId.get(root.id) || [];
      const matchingVariants = hasSearch ? variants.filter(matchesRow) : variants;
      const rootMatches = hasSearch ? matchesRow(root) : true;
      const includeRoot = hasSearch ? rootMatches || matchingVariants.length > 0 : true;
      if (!includeRoot) continue;

      const expandable = variants.length > 0;
      const expanded = expandable && (hasSearch || expandedProductGroupIds.has(root.id));
      rows.push({
        product: root,
        depth: 0,
        expandable,
        expanded,
        childCount: variants.length,
      });

      if (expanded) {
        const visibleVariants = hasSearch ? matchingVariants : variants;
        for (const variant of visibleVariants) {
          rows.push({
            product: variant,
            depth: 1,
            expandable: false,
            expanded: false,
            childCount: 0,
          });
        }
      }
    }

    return rows;
  }, [expandedProductGroupIds, productPickerSearch, topLevelProducts, variantsByParentId]);

  const selectedAssets = useMemo(
    () => assetsCatalog.filter((row) => selectedAssetIds.has(row.id)),
    [assetsCatalog, selectedAssetIds]
  );

  const assetPickerSourceRows = useMemo(() => {
    if (assetPickerContext === "build_email") return imageAssetOptions;
    if (assetPickerContext === "build_social") return socialAssetOptions;
    return assetsCatalog;
  }, [assetPickerContext, assetsCatalog, imageAssetOptions, socialAssetOptions]);

  const filteredAssetPickerRows = useMemo(() => {
    const term = assetPickerSearch.trim().toLowerCase();
    return assetPickerSourceRows.filter((row) => {
      const matchesFolder =
        assetFolderFilter === "all"
          ? true
          : assetFolderFilter === "unfiled"
            ? !row.folderId
            : row.folderId === assetFolderFilter;
      if (!matchesFolder) return false;
      if (!term) return true;
      return matchesSearch(term, row.filename, row.fileType, row.id);
    });
  }, [assetFolderFilter, assetPickerSearch, assetPickerSourceRows]);

  useEffect(() => {
    if (activeAddType === "product") {
      void loadProductsCatalog();
    } else if (activeAddType === "asset") {
      void loadAssetsCatalog();
    }
  }, [activeAddType, loadAssetsCatalog, loadProductsCatalog]);

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleProductGroupExpansion = (productId: string) => {
    setExpandedProductGroupIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((current) => {
      if (assetPickerContext !== "compose") {
        if (current.has(assetId)) return new Set<string>();
        return new Set<string>([assetId]);
      }
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const openBuildAssetPicker = async (context: Extract<AssetPickerContext, "build_email" | "build_social">) => {
    await loadAssetsCatalog();
    setAssetPickerContext(context);
    setAssetPickerSearch("");
    setAssetFolderFilter("all");
    const selectedId =
      context === "build_email" ? buildEmailDraft.heroAssetId : buildSocialDraft.assetId;
    setSelectedAssetIds(selectedId ? new Set([selectedId]) : new Set());
    setShowAssetPicker(true);
  };

  const applyAssetSelection = () => {
    const ids = Array.from(selectedAssetIds);
    if (assetPickerContext === "build_email") {
      setBuildEmailDraft((current) => ({ ...current, heroAssetId: ids[0] || null }));
      setShowAssetPicker(false);
      return;
    }
    if (assetPickerContext === "build_social") {
      setBuildSocialDraft((current) => ({ ...current, assetId: ids[0] || null }));
      setShowAssetPicker(false);
      return;
    }
    setShowAssetPicker(false);
  };


  const handleAddPromotion = async () => {
    setBuildAddError(null);
    setBuildAddBusy(true);
    try {
      const sortStart = (sortedKitItems.length > 0 ? Math.max(...sortedKitItems.map((row) => row.sort_order)) : 0) + 100;
      let payload: Record<string, unknown>;
      if (buildFormType === "email") {
        if (!buildEmailDraft.label.trim()) {
          setBuildAddError("Label is required.");
          return;
        }
        payload = {
          itemType: "email",
          title: buildEmailDraft.label.trim(),
          contentJson: buildEmailDraft,
          sortOrder: sortStart,
        };
      } else {
        if (!buildSocialDraft.label.trim()) {
          setBuildAddError("Label is required.");
          return;
        }
        payload = {
          itemType: "social",
          title: buildSocialDraft.label.trim(),
          contentJson: buildSocialDraft,
          sortOrder: sortStart,
        };
      }
      const response = await fetch(`/api/${tenantSlug}/updates/${updateId}/kit-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseJson = (await response.json().catch(() => ({}))) as { error?: string; data?: KitItem[] };
      if (!response.ok) {
        setBuildAddError(responseJson.error || "Failed to add promotion.");
        return;
      }
      const created = Array.isArray(responseJson.data) ? responseJson.data : [];
      if (created.length > 0) {
        setKitItems((current) => [...current, ...created]);
      } else {
        await load();
      }
      setKitDrawerOpen(true);
      if (buildFormType === "email") {
        setBuildEmailDraft(DEFAULT_BUILD_EMAIL_DRAFT);
      } else {
        setBuildSocialDraft(DEFAULT_BUILD_SOCIAL_DRAFT);
      }
    } catch {
      setBuildAddError("Failed to add promotion.");
    } finally {
      setBuildAddBusy(false);
    }
  };

  const resetKitFeedback = () => {
    setKitErrorMessage(null);
    setKitSuccessMessage(null);
  };

  const resetShareFeedback = () => {
    setShareErrorMessage(null);
    setShareSuccessMessage(null);
  };

  const updateShareSettings = async (params: {
    publicEnabled?: boolean;
    expiresAt?: string | null;
    onboardingShareSetIds?: string[];
    regenerateToken?: boolean;
    successMessage?: string;
  }) => {
    setShareSaving(true);
    resetShareFeedback();
    try {
      const body: Record<string, unknown> = {};
      if (typeof params.publicEnabled === "boolean") body.publicEnabled = params.publicEnabled;
      if (typeof params.expiresAt === "string") body.expiresAt = params.expiresAt;
      if (Array.isArray(params.onboardingShareSetIds)) {
        body.onboardingShareSetIds = params.onboardingShareSetIds;
      }
      if (params.regenerateToken) body.regenerateToken = true;
      const response = await fetch(`/api/${tenantSlug}/updates/${updateId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setShareErrorMessage(payload?.error || "Failed to update share link settings.");
        return;
      }
      setSharePublicEnabled(Boolean(payload?.publicEnabled));
      setShareExpiresAt(toLocalDateTimeInput(typeof payload?.expiresAt === "string" ? payload.expiresAt : null));
      setShareUrl(typeof payload?.shareUrl === "string" ? payload.shareUrl : "");
      setOnboardingShareSetIds(
        Array.isArray(payload?.onboardingShareSetIds)
          ? payload.onboardingShareSetIds
              .filter((value: unknown): value is string => typeof value === "string")
              .map((value: string) => value.trim())
              .filter((value: string) => value.length > 0)
          : Array.isArray(params.onboardingShareSetIds)
            ? params.onboardingShareSetIds
            : []
      );
      setShareSuccessMessage(params.successMessage || "Share settings saved.");
    } finally {
      setShareSaving(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const resp = await fetch(`/api/${tenantSlug}/updates/${updateId}/duplicate`, { method: "POST" });
      const json = (await resp.json()) as { success?: boolean; data?: { id: string }; error?: string };
      if (!resp.ok || !json.data?.id) {
        alert(json.error || "Failed to duplicate kit. Please try again.");
        return;
      }
      window.location.href = `/${tenantSlug}/updates/${json.data.id}`;
    } catch {
      alert("Failed to duplicate kit. Please try again.");
    } finally {
      setDuplicating(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopyLabel("Copied");
      setTimeout(() => setShareCopyLabel("Copy link"), 1500);
    } catch {
      setShareCopyLabel("Copy failed");
      setTimeout(() => setShareCopyLabel("Copy link"), 1500);
    }
  };

  const toggleOnboardingShareSet = (shareSetId: string) => {
    setOnboardingShareSetIds((current) =>
      current.includes(shareSetId)
        ? current.filter((id) => id !== shareSetId)
        : [...current, shareSetId]
    );
  };

  const togglePartnerRecipientSelection = (partnerOrganizationId: string) => {
    setSelectedPartnerOrganizationIds((current) =>
      current.includes(partnerOrganizationId)
        ? current.filter((id) => id !== partnerOrganizationId)
        : [...current, partnerOrganizationId]
    );
  };

  const selectAllPartnerRecipients = () => {
    setSelectedPartnerOrganizationIds(activePartnerRecipients.map((row) => row.id));
  };

  const clearPartnerRecipientSelection = () => {
    setSelectedPartnerOrganizationIds([]);
  };

  const setEmailDeliveryEnabled = (enabled: boolean) => {
    setDeliveryChannels((current) => {
      const next = current.filter((channel) => channel !== "email") as DeliveryChannel[];
      if (enabled) next.push("email");
      return next;
    });
  };

  const saveDraft = async () => {
    if (!update || update.status !== "draft") return;
    setRunningAction("save_draft");
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/updates/${updateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload.error || "Failed to save draft.");
        return;
      }
      setSuccessMessage("Draft saved.");
      await load();
    } finally {
      setRunningAction(null);
    }
  };

  const runAction = async (action: "publish" | "schedule" | "remind") => {
    setRunningAction(action);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if ((action === "publish" || action === "schedule") && !canPublishOrSchedule) {
        setErrorMessage(publishBlockingReason || "Complete required fields before publishing.");
        return;
      }
      const body: Record<string, unknown> = {};
      const recipientSelection = { partnerOrganizationIds: partnerRecipientIdsForDelivery };
      const allowNoRecipients = allowNoRecipientsForPublicLink;
      // Auto-enable share link if publishing with share link delivery
      if ((action === "publish" || action === "schedule") && shareLinkDeliveryEnabled && !sharePublicEnabled) {
        await updateShareSettings({ publicEnabled: true });
      }
      if (action === "publish") {
        body.recipientSelection = recipientSelection;
        body.deliveryChannels = selectedDeliveryChannels;
        body.allowNoRecipients = allowNoRecipients;
      } else if (action === "schedule") {
        if (!scheduleFor) {
          setErrorMessage("Set a future schedule datetime first.");
          return;
        }
        body.scheduledFor = new Date(scheduleFor).toISOString();
        body.recipientSelection = recipientSelection;
        body.deliveryChannels = selectedDeliveryChannels;
        body.allowNoRecipients = allowNoRecipients;
      } else if (action === "remind") {
        body.deliveryChannels = selectedDeliveryChannels;
        if (partnerRecipientIdsForDelivery.length > 0) {
          body.partnerOrganizationIds = partnerRecipientIdsForDelivery;
        }
      }

      const response = await fetch(`/api/${tenantSlug}/updates/${updateId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload.error || `Failed to ${action} update.`);
        return;
      }

      setSuccessMessage(
        action === "publish"
          ? "Update published."
          : action === "schedule"
            ? "Update scheduled."
            : "Reminder sent."
      );
      await load();
    } finally {
      setRunningAction(null);
    }
  };

  const buildInlinePayloads = (): { ok: true; payloads: Record<string, unknown>[] } | { ok: false; error: string } => {
    const sortStart = Math.max(...sortedKitItems.map((row) => row.sort_order), 0) + 100;

    if (activeAddType === "product") {
      const productIds = Array.from(selectedProductIds);
      if (productIds.length === 0) return { ok: false, error: "Select one or more products." };
      return {
        ok: true,
        payloads: productIds.map((productId, index) => ({
          itemType: "product",
          title: null,
          description: null,
          productId,
          sortOrder: sortStart + index * 100,
        })),
      };
    }

    if (activeAddType === "asset") {
      const assetIds = Array.from(selectedAssetIds);
      if (assetIds.length === 0) return { ok: false, error: "Select one or more assets." };
      return {
        ok: true,
        payloads: assetIds.map((assetId, index) => ({
          itemType: "asset",
          title: null,
          description: null,
          assetId,
          sortOrder: sortStart + index * 100,
        })),
      };
    }

    return { ok: false, error: "Unknown item type." };
  };

  const handleAddInlineItems = async () => {
    if (!activeAddType) return;
    resetKitFeedback();
    const built = buildInlinePayloads();
    if (!built.ok) {
      setKitErrorMessage(built.error);
      return;
    }

    setKitBusy(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/updates/${updateId}/kit-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          built.payloads.length === 1 ? built.payloads[0] : { items: built.payloads }
        ),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setKitErrorMessage(payload?.error || "Failed to add kit item.");
        return;
      }
      const created = Array.isArray(payload?.data) ? payload.data : [];
      if (created.length > 0) {
        setKitItems((current) => [...current, ...created]);
      } else {
        await load();
      }
      setKitSuccessMessage(
        built.payloads.length === 1
          ? "Kit item added."
          : `${built.payloads.length} kit items added.`
      );
      setKitDrawerOpen(true);
      setSelectedProductIds(new Set());
      setSelectedAssetIds(new Set());
      setProductPickerSearch("");
      setAssetPickerSearch("");
      setAssetFolderFilter("all");
      setAssetPanelView("folders");
    } finally {
      setKitBusy(false);
    }
  };

  const deleteItem = async (item: KitItem) => {
    resetKitFeedback();
    const confirmed = window.confirm("Remove this kit item?");
    if (!confirmed) return;

    setKitBusy(true);
    try {
      const response = await fetch(`/api/${tenantSlug}/updates/${updateId}/kit-items/${item.id}`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setKitErrorMessage(result?.error || "Failed to delete kit item.");
        return;
      }
      setKitItems((current) => current.filter((row) => row.id !== item.id));
      setKitSuccessMessage("Kit item removed.");
    } finally {
      setKitBusy(false);
    }
  };

  const persistKitOrder = async (ordered: KitItem[]) => {
    const normalized = ordered.map((row, idx) => ({
      ...row,
      sort_order: (idx + 1) * 100,
    }));

    setKitBusy(true);
    try {
      const responses = await Promise.all(
        normalized.map((row) =>
          fetch(`/api/${tenantSlug}/updates/${updateId}/kit-items/${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: row.sort_order }),
          })
        )
      );

      for (const response of responses) {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          setKitErrorMessage(payload?.error || "Failed to reorder kit items.");
          return;
        }
      }

      setKitItems(normalized);
      setKitSuccessMessage("Kit order updated.");
    } finally {
      setKitBusy(false);
    }
  };

  const moveKitItem = async (sourceId: string, targetId: string) => {
    const current = [...sortedKitItems];
    const sourceIndex = current.findIndex((row) => row.id === sourceId);
    const targetIndex = current.findIndex((row) => row.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

    const reordered = [...current];
    const [moving] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moving);
    await persistKitOrder(reordered);
  };

  const reorderItem = async (itemId: string, direction: -1 | 1) => {
    resetKitFeedback();
    const current = [...sortedKitItems];
    const index = current.findIndex((row) => row.id === itemId);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return;

    const reordered = [...current];
    const moving = reordered[index];
    reordered[index] = reordered[nextIndex];
    reordered[nextIndex] = moving;
    await persistKitOrder(reordered);
  };

  const handleKitDragStart = (event: DragEvent<HTMLDivElement>, itemId: string) => {
    if (kitBusy) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
    setDraggedKitItemId(itemId);
    setDragOverKitItemId(null);
  };

  const handleKitDragOver = (event: DragEvent<HTMLDivElement>, itemId: string) => {
    if (kitBusy || !draggedKitItemId || draggedKitItemId === itemId) return;
    event.preventDefault();
    if (dragOverKitItemId !== itemId) {
      setDragOverKitItemId(itemId);
    }
  };

  const handleKitDrop = async (event: DragEvent<HTMLDivElement>, targetItemId: string) => {
    event.preventDefault();
    const sourceId = draggedKitItemId || event.dataTransfer.getData("text/plain");
    setDragOverKitItemId(null);
    setDraggedKitItemId(null);
    if (!sourceId || sourceId === targetItemId) return;
    await moveKitItem(sourceId, targetItemId);
  };

  const handleKitDragEnd = () => {
    setDraggedKitItemId(null);
    setDragOverKitItemId(null);
  };

  const canEditKit = update?.status !== "archived" && update?.status !== "canceled";

  return (
    <PageContentContainer mode="form" padding="page" className="space-y-4">
      <PageHeader
        title="Update Detail"
        backHref={`/${tenantSlug}/updates`}
        backLabel="Back to Updates"
        sticky={false}
        actions={[
          {
            label: duplicating ? "Duplicating..." : "Duplicate Kit",
            icon: Files,
            onClick: () => void handleDuplicate(),
            variant: "outline",
            disabled: duplicating || loading || !isPublished,
          },
        ]}
      />

      {loading ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-white p-5">
              <div className="animate-pulse space-y-4">
                <div className="h-7 w-64 rounded bg-gray-200" />
                <div className="h-4 w-96 max-w-full rounded bg-gray-200" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={`meta-skeleton-${index}`} className="space-y-2">
                      <div className="h-3 w-20 rounded bg-gray-200" />
                      <div className="h-4 w-24 rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
                <div className="h-20 w-full rounded bg-gray-200" />
                <div className="flex gap-2">
                  <div className="h-9 w-28 rounded bg-gray-200" />
                  <div className="h-9 w-32 rounded bg-gray-200" />
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-white p-5">
              <div className="animate-pulse space-y-3">
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="h-16 w-full rounded bg-gray-200" />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-white p-5">
              <div className="animate-pulse space-y-3">
                <div className="h-5 w-40 rounded bg-gray-200" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={`analytics-skeleton-${index}`} className="space-y-2">
                      <div className="h-3 w-20 rounded bg-gray-200" />
                      <div className="h-5 w-10 rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : !update ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
            Update not found.
          </div>
      ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-white p-5">
              <h1 className="text-xl font-semibold text-foreground">{update.title}</h1>
              {update.summary ? (
                <p className="mt-2 text-sm text-muted-foreground">{update.summary}</p>
              ) : null}

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-sm font-medium text-foreground">{formatLabelValue(update.status)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Urgency</p>
                    <p className="text-sm font-medium text-foreground">{formatLabelValue(update.urgency)}</p>
                  </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due</p>
                  <p className="text-sm font-medium text-foreground">{formatDate(update.due_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Published</p>
                  <p className="text-sm font-medium text-foreground">{formatDate(update.published_at)}</p>
                </div>
              </div>

              {messageBodyHtml ? (
                <div className="mt-5 rounded-md border border-border bg-muted/20 p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Message
                  </p>
                  <div
                    className={`text-sm text-foreground ${SIMPLE_RICH_TEXT_CONTENT_CLASS}`}
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: sanitizeSimpleRichTextHtml(messageBodyHtml) }}
                  />
                </div>
              ) : messageBlocks.length > 0 ? (
                <div className="mt-5 rounded-md border border-border bg-muted/20 p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Message
                  </p>
                  <div className="space-y-2 text-sm text-foreground">
                    {messageBlocks.map((block, index) => (
                      <p key={`${index}-${block.slice(0, 10)}`}>{block}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 rounded-md border border-border bg-muted/10 p-3">
                <div
                  className={`grid gap-2 ${
                    orderedSteps.length > 4
                      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
                      : "grid-cols-2 sm:grid-cols-4"
                  }`}
                >
                  {orderedSteps.map((step, index) => (
                    <button
                      key={step}
                      type="button"
                      className={`group flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                        index < currentStepIndex
                          ? "border-[var(--color-accent-blue)] bg-[var(--color-accent-blue)]/10"
                          : activeStep === step
                            ? "border-[var(--color-accent-blue)] bg-background"
                            : "border-border bg-background hover:border-[var(--color-accent-blue)]/40"
                      }`}
                      aria-label={`${index + 1}. ${stepLabels[step]}`}
                      title={stepLabels[step]}
                      onClick={() => setActiveStep(step)}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                          index < currentStepIndex
                            ? "border-[var(--color-accent-blue)] bg-[var(--color-accent-blue)] text-white"
                            : activeStep === step
                              ? "border-[var(--color-accent-blue)] bg-background text-[var(--color-accent-blue)]"
                              : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {index < currentStepIndex ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-xs font-semibold transition-colors ${
                            index < currentStepIndex || activeStep === step
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {stepLabels[step]}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {stepDescriptions[step]}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Saved {formatDate(update.updated_at)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {update.status === "draft" ? (
                      <Button
                        variant="secondary"
                        onClick={() => void saveDraft()}
                        disabled={runningAction !== null}
                      >
                        {runningAction === "save_draft" ? "Saving..." : "Save Draft"}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={() => setActiveStep(orderedSteps[Math.max(0, currentStepIndex - 1)])}
                      disabled={currentStepIndex === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={() =>
                        setActiveStep(
                          orderedSteps[Math.min(orderedSteps.length - 1, currentStepIndex + 1)]
                        )
                      }
                      disabled={currentStepIndex === orderedSteps.length - 1}
                    >
                      Next Step
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {activeStep === "compose" ? (
              <div className="space-y-4">
              <div className="rounded-lg border border-border bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Message</h2>
                    <p className="text-sm text-muted-foreground">
                      Write a message to accompany this kit. Recipients will see this at the top of the update.
                    </p>
                  </div>
                  <span className={`text-xs ${
                    messageAutosaveState === "saving" ? "text-muted-foreground" :
                    messageAutosaveState === "error" ? "text-destructive" :
                    messageAutosaveState === "unsaved" ? "text-amber-700" :
                    "text-emerald-700"
                  }`}>
                    {messageAutosaveState === "saving" ? "Saving..." :
                     messageAutosaveState === "error" ? "Autosave failed" :
                     messageAutosaveState === "unsaved" ? "Unsaved changes" :
                     messageAutosaveState === "saved" ? "Saved" : ""}
                  </span>
                </div>
                <div className="mt-3">
                  <SimpleRichTextEditor
                    value={messageBodyHtml}
                    onChange={(html) => {
                      if (!canEditKit) return;
                      setMessageBodyHtml(html);
                    }}
                    placeholder="Tell recipients why you're sending this kit, what to look out for, or any actions required..."
                    disabled={!canEditKit}
                    minHeightClassName="min-h-[120px]"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Kit Items</h2>
                    <p className="text-sm text-muted-foreground">
                      Add products, assets, links, and text that recipients will access.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPreviewSheetOpen(true)}>
                    <Eye className="h-4 w-4" />
                    Partner Preview
                  </Button>
                </div>

              {!canEditKit ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Kit editing is disabled for archived or canceled updates.
                </p>
              ) : null}

              {kitErrorMessage ? (
                <p className="mt-3 text-sm text-destructive">{kitErrorMessage}</p>
              ) : null}
              {kitSuccessMessage ? (
                <p className="mt-3 text-sm text-emerald-700">{kitSuccessMessage}</p>
              ) : null}

                {/* Add items — tab switcher + inline panels */}
                {canEditKit ? (
                  <div className="mt-4">
                    <Tabs
                      value={activeAddType}
                      onValueChange={(v) => {
                        resetKitFeedback();
                        const next = v as "product" | "asset";
                        setActiveAddType(next);
                        if (next === "product") {
                          setSelectedProductIds(new Set());
                          setProductPickerSearch("");
                        } else {
                          setSelectedAssetIds(new Set());
                          setAssetPickerSearch("");
                          setAssetFolderFilter("all");
                          setAssetPanelView("folders");
                        }
                      }}
                    >
                      <TabsList className="mb-3">
                        <TabsTrigger value="product" className="gap-1.5" disabled={kitBusy}>
                          <Package className="h-3.5 w-3.5" /> Products
                        </TabsTrigger>
                        <TabsTrigger value="asset" className="gap-1.5" disabled={kitBusy}>
                          <ImageIcon className="h-3.5 w-3.5" /> Assets
                        </TabsTrigger>
                      </TabsList>

                      {/* Products panel */}
                      <TabsContent value="product" className="mt-0">
                        <div className="overflow-hidden rounded-lg border border-border bg-background">
                          <div className="border-b border-border px-3 py-2.5">
                            <Input
                              value={productPickerSearch}
                              onChange={(e) => setProductPickerSearch(e.target.value)}
                              placeholder="Search products by name, SKU, or ID..."
                              className="h-8"
                            />
                          </div>
                          <div className="max-h-64 overflow-y-auto px-3 py-2">
                            {productsLoading ? (
                              <p className="py-6 text-center text-sm text-muted-foreground">Loading products...</p>
                            ) : productPickerRows.length === 0 ? (
                              <p className="py-6 text-center text-sm text-muted-foreground">No matching products.</p>
                            ) : (
                              <div className="space-y-0.5">
                                {productPickerRows.map((row) => {
                                  const product = row.product;
                                  const checked = selectedProductIds.has(product.id);
                                  return (
                                    <div
                                      key={product.id}
                                      className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors ${row.depth === 1 ? "ml-5" : ""} ${checked ? "bg-[var(--color-accent-blue)]/10" : "hover:bg-muted/40"}`}
                                      onClick={() => toggleProductSelection(product.id)}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleProductSelection(product.id)}
                                        className="shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      {row.depth === 0 && row.expandable ? (
                                        <button
                                          type="button"
                                          className="shrink-0 text-muted-foreground hover:text-foreground"
                                          onClick={(e) => { e.stopPropagation(); toggleProductGroupExpansion(product.id); }}
                                        >
                                          {row.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        </button>
                                      ) : (
                                        <span className="w-3.5 shrink-0" />
                                      )}
                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/20">
                                        {product.imageUrl ? (
                                          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                                        ) : (
                                          <Package className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                          {productTypeLabel(product.type)}{product.sku ? ` · ${product.sku}` : ""}{row.depth === 0 && row.expandable ? ` · ${row.childCount} variants` : ""}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
                            <p className="text-xs text-muted-foreground">{selectedProductIds.size} selected</p>
                            <Button size="sm" onClick={() => void handleAddInlineItems()} disabled={kitBusy || selectedProductIds.size === 0}>
                              {kitBusy ? "Adding..." : `Add ${selectedProductIds.size > 0 ? selectedProductIds.size : ""} product${selectedProductIds.size !== 1 ? "s" : ""} →`}
                            </Button>
                          </div>
                        </div>
                      </TabsContent>

                      {/* Assets panel */}
                      <TabsContent value="asset" className="mt-0">
                        {assetPanelView === "folders" ? (
                          <div className="overflow-hidden rounded-lg border border-border bg-background">
                            {assetsLoading ? (
                              <p className="py-8 text-center text-sm text-muted-foreground">Loading assets...</p>
                            ) : (
                              <div className="divide-y divide-gray-100">
                                <button
                                  type="button"
                                  onClick={() => { setAssetFolderFilter("all"); setAssetPanelView("assets"); }}
                                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-foreground transition-colors hover:bg-muted/40"
                                >
                                  <Files className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  <span className="flex-1 text-sm font-medium text-foreground">All assets</span>
                                  <span className="text-xs text-muted-foreground">{assetPickerSourceRows.length}</span>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </button>
                                {assetFolders.map((folder) => {
                                  const count = assetPickerSourceRows.filter((a) => a.folderId === folder.id).length;
                                  return (
                                    <button
                                      key={folder.id}
                                      type="button"
                                      onClick={() => { setAssetFolderFilter(folder.id); setAssetPanelView("assets"); }}
                                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-foreground transition-colors hover:bg-muted/40"
                                    >
                                      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      <span className="flex-1 text-sm text-foreground">{folder.name}</span>
                                      <span className="text-xs text-muted-foreground">{count}</span>
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                  );
                                })}
                                {(() => {
                                  const unfiledCount = assetPickerSourceRows.filter((a) => !a.folderId).length;
                                  return unfiledCount > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => { setAssetFolderFilter("unfiled"); setAssetPanelView("assets"); }}
                                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-foreground transition-colors hover:bg-muted/40"
                                    >
                                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      <span className="flex-1 text-sm text-foreground">Unfiled</span>
                                      <span className="text-xs text-muted-foreground">{unfiledCount}</span>
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                  ) : null;
                                })()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="overflow-hidden rounded-lg border border-border bg-background">
                            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
                              <button
                                type="button"
                                onClick={() => { setAssetPanelView("folders"); setSelectedAssetIds(new Set()); setAssetPickerSearch(""); }}
                                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <ChevronRight className="h-3 w-3 rotate-180" />
                                Folders
                              </button>
                              <span className="text-xs text-muted-foreground">/</span>
                              <span className="text-xs font-medium">
                                {assetFolderFilter === "all" ? "All assets" : assetFolderFilter === "unfiled" ? "Unfiled" : (assetFolders.find((f) => f.id === assetFolderFilter)?.name ?? "Folder")}
                              </span>
                            </div>
                            <div className="border-b border-border px-3 py-2.5">
                              <Input
                                value={assetPickerSearch}
                                onChange={(e) => setAssetPickerSearch(e.target.value)}
                                placeholder="Search by filename or type..."
                                className="h-8"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto p-3">
                              {filteredAssetPickerRows.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">No matching assets.</p>
                              ) : (
                                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                                  {filteredAssetPickerRows.map((asset) => {
                                    const checked = selectedAssetIds.has(asset.id);
                                    return (
                                      <button
                                        key={asset.id}
                                        type="button"
                                        title={asset.filename}
                                        onClick={() => toggleAssetSelection(asset.id)}
                                        className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${checked ? "border-[var(--color-accent-blue)] ring-2 ring-[var(--color-accent-blue)]/30" : "border-border hover:border-muted-foreground"}`}
                                      >
                                        {isImageAsset(asset) ? (
                                          <img src={assetPreviewPath(asset.id)} alt={asset.filename} className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center bg-muted/30 text-xs font-semibold uppercase text-muted-foreground">
                                            {asset.fileType || "FILE"}
                                          </div>
                                        )}
                                        {checked && (
                                          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-accent-blue)]/20">
                                            <div className="rounded-full bg-[var(--color-accent-blue)] p-0.5">
                                              <Check className="h-3 w-3 text-white" />
                                            </div>
                                          </div>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-muted-foreground">
                                  {selectedAssetIds.size > 0 ? `${selectedAssetIds.size} selected` : `${filteredAssetPickerRows.length} asset${filteredAssetPickerRows.length !== 1 ? "s" : ""}`}
                                </p>
                                {filteredAssetPickerRows.length > 0 && selectedAssetIds.size < filteredAssetPickerRows.length ? (
                                  <button
                                    type="button"
                                    className="text-xs text-[var(--color-accent-blue)] hover:underline"
                                    onClick={() => setSelectedAssetIds(new Set(filteredAssetPickerRows.map((a) => a.id)))}
                                  >
                                    Select all{assetFolderFilter !== "all" ? " in folder" : ""}
                                  </button>
                                ) : selectedAssetIds.size > 0 ? (
                                  <button
                                    type="button"
                                    className="text-xs text-muted-foreground hover:underline"
                                    onClick={() => setSelectedAssetIds(new Set())}
                                  >
                                    Clear
                                  </button>
                                ) : null}
                              </div>
                              <Button size="sm" onClick={() => void handleAddInlineItems()} disabled={kitBusy || selectedAssetIds.size === 0}>
                                {kitBusy ? "Adding..." : `Add ${selectedAssetIds.size > 0 ? selectedAssetIds.size : ""} asset${selectedAssetIds.size !== 1 ? "s" : ""} →`}
                              </Button>
                            </div>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : null}

                {/* Kit item cards - full width */}
                <div className="mt-4 space-y-2">
                  {sortedKitItems.map((item) => {
                    const textBody = getTextContent(item.content_json || {}).trim();
                    const isAnnouncementText = item.item_type === "text" && `${item.title || ""} ${item.description || ""}`.toLowerCase().includes("announcement");
                    const customTitle = (item.title || "").trim();
                    const contentJson = (item.content_json || {}) as Record<string, unknown>;
                    const displayName = (() => {
                      if (customTitle && customTitle.toLowerCase() !== item.item_type) return customTitle;
                      if (item.item_type === "product") return resolveProductLabel(item.product_id);
                      if (item.item_type === "asset") return resolveAssetLabel(item.asset_id);
                      if (item.item_type === "url") return item.url || "Link";
                      if (item.item_type === "email") return "Email";
                      if (item.item_type === "social") return "Social Post";
                      if (textBody) return textBody.split("\n")[0];
                      return isAnnouncementText ? "Announcement" : "Text";
                    })();
                    const itemTypeLabel = (() => {
                      if (item.item_type === "email") return typeof contentJson.subjectLine === "string" && contentJson.subjectLine ? `Email · ${String(contentJson.subjectLine).slice(0, 40)}` : "Email";
                      if (item.item_type === "social") return typeof contentJson.caption === "string" && contentJson.caption ? `Social Post · ${String(contentJson.caption).slice(0, 40)}` : "Social Post";
                      if (isAnnouncementText) return "Announcement";
                      return item.item_type.charAt(0).toUpperCase() + item.item_type.slice(1);
                    })();
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                          dragOverKitItemId === item.id
                            ? "border-[var(--color-accent-blue)] bg-[var(--color-accent-blue)]/5"
                            : "border-border bg-background"
                        } ${canEditKit && !kitBusy ? "cursor-grab" : ""}`}
                        draggable={canEditKit && !kitBusy}
                        onDragStart={(event) => handleKitDragStart(event, item.id)}
                        onDragOver={(event) => handleKitDragOver(event, item.id)}
                        onDrop={(event) => void handleKitDrop(event, item.id)}
                        onDragEnd={handleKitDragEnd}
                      >
                        {canEditKit ? (
                          <div className="shrink-0 text-muted-foreground/40" title="Drag to reorder">
                            <GripVertical className="h-4 w-4" />
                          </div>
                        ) : null}
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/20">
                          {item.item_type === "product" && item.product_id && productById.get(item.product_id)?.imageUrl ? (
                            <img src={productById.get(item.product_id)?.imageUrl || ""} alt={resolveProductLabel(item.product_id)} className="h-full w-full object-cover" />
                          ) : item.item_type === "asset" && item.asset_id && isImageAsset(assetById.get(item.asset_id)) ? (
                            <img src={assetPreviewPath(item.asset_id)} alt={resolveAssetLabel(item.asset_id)} className="h-full w-full object-cover" />
                          ) : item.item_type === "product" ? (
                            <Package className="h-5 w-5 text-muted-foreground" />
                          ) : item.item_type === "asset" ? (
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          ) : item.item_type === "url" ? (
                            <Link2 className="h-5 w-5 text-muted-foreground" />
                          ) : item.item_type === "email" ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                          ) : item.item_type === "social" ? (
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          ) : isAnnouncementText ? (
                            <Megaphone className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <FileText className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                          <p className="text-xs text-muted-foreground">{itemTypeLabel}</p>
                        </div>
                        {(item.item_type === "email" || item.item_type === "social") ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setPromotionPreviewItem(item)}
                          >
                            Preview
                          </Button>
                        ) : null}
                        {canEditKit ? (
                          <button
                            type="button"
                            className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                            onClick={() => void deleteItem(item)}
                            disabled={kitBusy}
                            title="Remove item"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {sortedKitItems.length === 0 && activeAddType === null ? (
                    <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/40">
                        <Plus className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No items yet</p>
                      <p className="mt-1 text-xs text-muted-foreground">Use the buttons above to add products, assets, links, and text.</p>
                    </div>
                  ) : null}
                </div>

                {/* Promotion Preview Sheet (compose step) */}
                <Sheet open={promotionPreviewItem !== null} onOpenChange={(open) => { if (!open) setPromotionPreviewItem(null); }}>
                  <SheetContent side="right" className="w-[520px] sm:max-w-none">
                    <SheetHeader>
                      <SheetTitle>{promotionPreviewItem?.item_type === "social" ? "Social Post Preview" : "Email Preview"}</SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto px-6 py-5">
                      {promotionPreviewItem?.item_type === "email" ? (() => {
                        const c = (promotionPreviewItem.content_json || {}) as Record<string, unknown>;
                        const heroId = typeof c.heroAssetId === "string" ? c.heroAssetId : null;
                        const headlineHtml = typeof c.headline === "string" ? sanitizeSimpleRichTextHtml(c.headline) : "";
                        const bodyHtml = typeof c.bodyCopy === "string" ? sanitizeSimpleRichTextHtml(c.bodyCopy) : "";
                        const headlinePlain = typeof c.headline === "string" ? richTextToPlainText(c.headline) : "";
                        const bodyPlain = typeof c.bodyCopy === "string" ? richTextToPlainText(c.bodyCopy) : "";
                        return (
                          <div className="rounded border border-border bg-white p-4">
                            {typeof c.subjectLine === "string" && c.subjectLine ? (
                              <p className="mb-3 text-xs text-muted-foreground">Subject: {c.subjectLine as string}</p>
                            ) : null}
                            {heroId ? (
                              <div className="mb-3 h-48 w-full overflow-hidden rounded border border-border bg-muted/20">
                                <img src={assetPreviewPath(heroId)} alt="Hero" className="h-full w-full object-contain" />
                              </div>
                            ) : null}
                            {headlinePlain ? (
                              <div className={`mb-2 text-black ${SIMPLE_RICH_TEXT_CONTENT_CLASS}`} dangerouslySetInnerHTML={{ __html: headlineHtml }} />
                            ) : (
                              <p className="mb-2 text-lg font-semibold text-muted-foreground">Headline preview</p>
                            )}
                            {bodyPlain ? (
                              <div className={`text-sm text-black ${SIMPLE_RICH_TEXT_CONTENT_CLASS}`} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                            ) : (
                              <p className="text-sm text-muted-foreground">Body copy preview</p>
                            )}
                            {typeof c.ctaLabel === "string" && c.ctaLabel ? (
                              <div className="mt-4 flex justify-center">
                                <Button size="sm" disabled>{c.ctaLabel as string}</Button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })() : promotionPreviewItem?.item_type === "social" ? (() => {
                        const c = (promotionPreviewItem.content_json || {}) as Record<string, unknown>;
                        const assetId = typeof c.assetId === "string" ? c.assetId : null;
                        const previewAsset = assetId ? kitAssetOptions.find((a) => a.id === assetId) || null : null;
                        const isVideo = Boolean(previewAsset && (
                          (previewAsset.fileType || "").toLowerCase().includes("video") ||
                          (previewAsset.mimeType || "").toLowerCase().startsWith("video/")
                        ));
                        return (
                          <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                            {typeof c.caption === "string" && c.caption ? (
                              <div className="border-b border-border px-4 py-3">
                                <p className="text-sm text-foreground">{c.caption as string}</p>
                              </div>
                            ) : null}
                            <div className="w-full bg-muted/20">
                              {assetId ? (
                                isVideo ? (
                                  <video src={assetPreviewPath(assetId)} className="w-full" autoPlay loop playsInline controls muted />
                                ) : (
                                  <img src={assetPreviewPath(assetId)} alt="Social asset" className="w-full" />
                                )
                              ) : (
                                <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">No asset selected</div>
                              )}
                            </div>
                          </div>
                        );
                      })() : null}
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Partner Preview Sheet */}
                <Sheet open={previewSheetOpen} onOpenChange={setPreviewSheetOpen}>
                  <SheetContent side="right" className="w-[560px] sm:max-w-none">
                    <SheetHeader>
                      <SheetTitle>Partner Preview</SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                      {update ? (
                        <>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{update.urgency}</p>
                            <h3 className="mt-1 text-base font-semibold text-foreground">{update.title}</h3>
                            {update.due_at ? (
                              <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(update.due_at)}</p>
                            ) : null}
                          </div>
                          {messageBodyHtml ? (
                            <div className={`text-sm text-muted-foreground ${SIMPLE_RICH_TEXT_CONTENT_CLASS}`} dangerouslySetInnerHTML={{ __html: sanitizeSimpleRichTextHtml(messageBodyHtml) }} />
                          ) : null}
                        </>
                      ) : null}
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Kit</p>
                        {sortedKitItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No items added yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {sortedKitItems.map((item) => {
                              const textBodyPreview = getTextContent(item.content_json || {}).trim();
                              const customTitlePreview = (item.title || "").trim();
                              const previewName = (() => {
                                if (customTitlePreview && customTitlePreview.toLowerCase() !== item.item_type) return customTitlePreview;
                                if (item.item_type === "product") return resolveProductLabel(item.product_id);
                                if (item.item_type === "asset") return resolveAssetLabel(item.asset_id);
                                if (item.item_type === "url") return item.url || "Link";
                                if (textBodyPreview) return textBodyPreview.split("\n")[0];
                                return "Text";
                              })();
                              return (
                                <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/20">
                                    {item.item_type === "product" && item.product_id && productById.get(item.product_id)?.imageUrl ? (
                                      <img src={productById.get(item.product_id)?.imageUrl || ""} alt={previewName} className="h-full w-full object-cover" />
                                    ) : item.item_type === "asset" && item.asset_id && isImageAsset(assetById.get(item.asset_id)) ? (
                                      <img src={assetPreviewPath(item.asset_id)} alt={previewName} className="h-full w-full object-cover" />
                                    ) : item.item_type === "product" ? (
                                      <Package className="h-4 w-4 text-muted-foreground" />
                                    ) : item.item_type === "asset" ? (
                                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                    ) : item.item_type === "url" ? (
                                      <Link2 className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{previewName}</p>
                                    <p className="text-xs capitalize text-muted-foreground">{item.item_type}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
              </div>
            ) : null}

            {activeStep === "build" ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-white p-5">
                  <h2 className="text-base font-semibold text-foreground">Promotion Assets</h2>

                  <Dialog open={showAssetPicker} onOpenChange={setShowAssetPicker}>
                    <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
                      <DialogHeader className="border-b border-border px-6 py-4">
                        <DialogTitle>
                          {assetPickerContext === "build_email"
                            ? "Select Hero Image"
                            : assetPickerContext === "build_social"
                              ? "Select Social Asset"
                              : "Select Assets"}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="flex h-[70vh] flex-col">
                        <div className="grid gap-3 border-b border-border px-6 py-3 md:grid-cols-3">
                          <div className="md:col-span-2">
                            <Input
                              value={assetPickerSearch}
                              onChange={(event) => setAssetPickerSearch(event.target.value)}
                              placeholder={
                                assetPickerContext === "compose"
                                  ? "Search assets by filename, type, or ID"
                                  : "Search kit assets by filename, type, or ID"
                              }
                            />
                          </div>
                          <Select value={assetFolderFilter} onValueChange={setAssetFolderFilter}>
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue placeholder="All folders" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All folders</SelectItem>
                              <SelectItem value="unfiled">Unfiled</SelectItem>
                              {assetFolders.map((folder) => (
                                <SelectItem key={folder.id} value={folder.id}>
                                  {folder.path}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 overflow-auto px-6 py-3">
                          {assetsLoading ? (
                            <p className="text-sm text-muted-foreground">Loading assets...</p>
                          ) : filteredAssetPickerRows.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No matching assets.</p>
                          ) : (
                            <div className="space-y-1">
                              {filteredAssetPickerRows.map((asset) => {
                                const checked = selectedAssetIds.has(asset.id);
                                return (
                                  <label
                                    key={asset.id}
                                    className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 ${
                                      checked ? "border-[var(--color-accent-blue)] bg-muted/40" : "border-border"
                                    }`}
                                  >
                                    <input
                                      type={assetPickerContext === "compose" ? "checkbox" : "radio"}
                                      name={
                                        assetPickerContext === "compose"
                                          ? undefined
                                          : "build-asset-picker"
                                      }
                                      checked={checked}
                                      onChange={() => toggleAssetSelection(asset.id)}
                                    />
                                    <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-border bg-muted/20">
                                      {isImageAsset(asset) ? (
                                        <img
                                          src={assetPreviewPath(asset.id)}
                                          alt={asset.filename}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                          {asset.fileType || "FILE"}
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-foreground">
                                        {asset.filename}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {asset.fileType || "asset"}
                                      </p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-stretch justify-between border-t border-border">
                          <p className="flex items-center px-6 text-xs text-muted-foreground">
                            {selectedAssetIds.size} selected
                          </p>
                          <div className="flex">
                            {assetPickerContext === "compose" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-full rounded-none px-5"
                                onClick={() =>
                                  setSelectedAssetIds(
                                    new Set(filteredAssetPickerRows.map((row) => row.id))
                                  )
                                }
                                disabled={filteredAssetPickerRows.length === 0}
                              >
                                Select all shown
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-full rounded-none border-l border-border px-5"
                              onClick={() => setSelectedAssetIds(new Set())}
                            >
                              Clear
                            </Button>
                            <Button
                              type="button"
                              className="h-full rounded-none rounded-br-lg border-l border-border px-5"
                              onClick={applyAssetSelection}
                            >
                              {assetPickerContext === "compose" ? "Use Selection" : "Use Asset"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Promotion form — tabs for Email / Social */}
                  <div className="mt-4">
                    <Tabs value={buildFormType} onValueChange={(v) => { setBuildFormType(v as "email" | "social"); setBuildAddError(null); }}>
                      <TabsList className="mb-4">
                        <TabsTrigger value="email" className="gap-1.5" disabled={buildAddBusy}>
                          Email
                        </TabsTrigger>
                        <TabsTrigger value="social" className="gap-1.5" disabled={buildAddBusy}>
                          Social Post
                        </TabsTrigger>
                      </TabsList>

                      {/* Email form */}
                      <TabsContent value="email" className="mt-0 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Label *</label>
                          <Input
                            value={buildEmailDraft.label}
                            onChange={(e) => setBuildEmailDraft((c) => ({ ...c, label: e.target.value }))}
                            disabled={!canEditBuildAssets || buildAddBusy}
                            placeholder='e.g. "Launch teaser email"'
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Subject line</label>
                          <Input
                            value={buildEmailDraft.subjectLine}
                            onChange={(e) => setBuildEmailDraft((c) => ({ ...c, subjectLine: e.target.value }))}
                            disabled={!canEditBuildAssets || buildAddBusy}
                            placeholder="Introducing the new release..."
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Hero image</label>
                          <div
                            className="relative w-full overflow-hidden rounded-md border border-dashed border-border bg-muted/20"
                            style={{ aspectRatio: "2.5 / 1" }}
                          >
                            {selectedEmailHeroAsset ? (
                              <img
                                src={assetPreviewPath(selectedEmailHeroAsset.id)}
                                alt={selectedEmailHeroAsset.filename}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <button
                                type="button"
                                className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60"
                                onClick={() => void openBuildAssetPicker("build_email")}
                                disabled={!canEditBuildAssets || buildAddBusy}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                <span className="text-xs">Click to select hero image</span>
                              </button>
                            )}
                            {selectedEmailHeroAsset ? (
                              <div className="absolute bottom-2 right-2 flex gap-1">
                                <button
                                  type="button"
                                  className="rounded bg-black/60 px-2 py-1 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
                                  onClick={() => void openBuildAssetPicker("build_email")}
                                  disabled={!canEditBuildAssets || buildAddBusy}
                                >
                                  Change
                                </button>
                                <button
                                  type="button"
                                  className="rounded bg-black/60 px-2 py-1 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
                                  onClick={() => setBuildEmailDraft((c) => ({ ...c, heroAssetId: null }))}
                                  disabled={!canEditBuildAssets || buildAddBusy}
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Headline</label>
                          <SimpleRichTextEditor
                            value={buildEmailDraft.headline}
                            onChange={(value) => setBuildEmailDraft((c) => ({ ...c, headline: value }))}
                            disabled={!canEditBuildAssets || buildAddBusy}
                            placeholder="Meet the Future of..."
                            minHeightClassName="min-h-[100px]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Body copy</label>
                          <SimpleRichTextEditor
                            value={buildEmailDraft.bodyCopy}
                            onChange={(value) => setBuildEmailDraft((c) => ({ ...c, bodyCopy: value }))}
                            disabled={!canEditBuildAssets || buildAddBusy}
                            placeholder="Explain key benefits and launch message..."
                            minHeightClassName="min-h-[160px]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">CTA label</label>
                          <Input
                            value={buildEmailDraft.ctaLabel}
                            onChange={(e) => setBuildEmailDraft((c) => ({ ...c, ctaLabel: e.target.value }))}
                            disabled={!canEditBuildAssets || buildAddBusy}
                            placeholder="Order now"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!buildEmailDraft.label.trim() || buildAddBusy}
                            onClick={() => {
                              const draft = buildEmailDraft;
                              setPromotionPreviewItem({
                                id: "__preview__",
                                item_type: "email",
                                product_id: null,
                                asset_id: null,
                                url: null,
                                title: draft.label,
                                description: null,
                                content_json: draft as unknown as Record<string, unknown>,
                                sort_order: 0,
                                market_ids: [],
                                channel_ids: [],
                                locale_ids: [],
                                metadata: {},
                                created_by: null,
                                created_at: null,
                                updated_at: null,
                              });
                            }}
                          >
                            Preview
                          </Button>
                          <Button
                            type="button"
                            disabled={!canEditBuildAssets || buildAddBusy || !buildEmailDraft.label.trim()}
                            onClick={() => void handleAddPromotion()}
                          >
                            {buildAddBusy ? "Adding..." : "Add to Kit →"}
                          </Button>
                        </div>
                      </TabsContent>

                      {/* Social Post form */}
                      <TabsContent value="social" className="mt-0 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Label *</label>
                          <Input
                            value={buildSocialDraft.label}
                            onChange={(e) => setBuildSocialDraft((c) => ({ ...c, label: e.target.value }))}
                            disabled={!canEditBuildAssets || buildAddBusy}
                            placeholder='e.g. "Instagram launch post"'
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Caption</label>
                          <Textarea
                            rows={4}
                            value={buildSocialDraft.caption}
                            onChange={(e) => setBuildSocialDraft((c) => ({ ...c, caption: e.target.value }))}
                            disabled={!canEditBuildAssets || buildAddBusy}
                            placeholder="Write a reusable social caption..."
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Image or video</label>
                          <div
                            className="relative w-full overflow-hidden rounded-md border border-dashed border-border bg-muted/20"
                            style={{ aspectRatio: "1 / 1" }}
                          >
                            {selectedSocialAsset ? (
                              selectedSocialIsVideo ? (
                                <video src={assetPreviewPath(selectedSocialAsset.id)} className="h-full w-full object-contain" autoPlay loop playsInline muted />
                              ) : (
                                <img src={assetPreviewPath(selectedSocialAsset.id)} alt={selectedSocialAsset.filename} className="h-full w-full object-contain" />
                              )
                            ) : (
                              <button
                                type="button"
                                className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60"
                                onClick={() => void openBuildAssetPicker("build_social")}
                                disabled={!canEditBuildAssets || buildAddBusy}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                <span className="text-xs">Click to select image or video</span>
                              </button>
                            )}
                            {selectedSocialAsset ? (
                              <div className="absolute bottom-2 right-2 flex gap-1">
                                <button
                                  type="button"
                                  className="rounded bg-black/60 px-2 py-1 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
                                  onClick={() => void openBuildAssetPicker("build_social")}
                                  disabled={!canEditBuildAssets || buildAddBusy}
                                >
                                  Change
                                </button>
                                <button
                                  type="button"
                                  className="rounded bg-black/60 px-2 py-1 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
                                  onClick={() => setBuildSocialDraft((c) => ({ ...c, assetId: null }))}
                                  disabled={!canEditBuildAssets || buildAddBusy}
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!buildSocialDraft.label.trim() || buildAddBusy}
                            onClick={() => {
                              const draft = buildSocialDraft;
                              setPromotionPreviewItem({
                                id: "__preview__",
                                item_type: "social",
                                product_id: null,
                                asset_id: null,
                                url: null,
                                title: draft.label,
                                description: null,
                                content_json: draft as unknown as Record<string, unknown>,
                                sort_order: 0,
                                market_ids: [],
                                channel_ids: [],
                                locale_ids: [],
                                metadata: {},
                                created_by: null,
                                created_at: null,
                                updated_at: null,
                              });
                            }}
                          >
                            Preview
                          </Button>
                          <Button
                            type="button"
                            disabled={!canEditBuildAssets || buildAddBusy || !buildSocialDraft.label.trim()}
                            onClick={() => void handleAddPromotion()}
                          >
                            {buildAddBusy ? "Adding..." : "Add to Kit →"}
                          </Button>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>

                  {buildAddError ? (
                    <p className="mt-2 text-sm text-destructive">{buildAddError}</p>
                  ) : null}

                  {/* Added promotions list */}
                  {(() => {
                    const promotionItems = sortedKitItems.filter(
                      (item) => item.item_type === "email" || item.item_type === "social"
                    );
                    if (promotionItems.length === 0) return null;
                    return (
                      <div className="mt-6">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Added promotions</p>
                        <div className="space-y-2">
                          {promotionItems.map((item) => {
                            const contentJson = (item.content_json || {}) as Record<string, unknown>;
                            const subtitle = item.item_type === "email"
                              ? `Email${typeof contentJson.subjectLine === "string" && contentJson.subjectLine ? ` · ${String(contentJson.subjectLine).slice(0, 50)}` : ""}`
                              : `Social Post${typeof contentJson.caption === "string" && contentJson.caption ? ` · ${String(contentJson.caption).slice(0, 50)}` : ""}`;
                            return (
                              <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40">
                                  {item.item_type === "email" ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                  ) : (
                                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">{item.title || (item.item_type === "email" ? "Email" : "Social Post")}</p>
                                  <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setPromotionPreviewItem(item)}
                                >
                                  Preview
                                </Button>
                                {canEditBuildAssets ? (
                                  <button
                                    type="button"
                                    className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                                    onClick={() => void deleteItem(item)}
                                    title="Remove"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Promotion preview Sheet */}
                  <Sheet open={promotionPreviewItem !== null} onOpenChange={(open) => { if (!open) setPromotionPreviewItem(null); }}>
                    <SheetContent side="right" className="w-[520px] sm:max-w-none">
                      <SheetHeader>
                        <SheetTitle>{promotionPreviewItem?.item_type === "social" ? "Social Post Preview" : "Email Preview"}</SheetTitle>
                      </SheetHeader>
                      <div className="flex-1 overflow-y-auto px-6 py-5">
                        {promotionPreviewItem?.item_type === "email" ? (() => {
                          const c = (promotionPreviewItem.content_json || {}) as Record<string, unknown>;
                          const heroId = typeof c.heroAssetId === "string" ? c.heroAssetId : null;
                          const headlineHtml = typeof c.headline === "string" ? sanitizeSimpleRichTextHtml(c.headline) : "";
                          const bodyHtml = typeof c.bodyCopy === "string" ? sanitizeSimpleRichTextHtml(c.bodyCopy) : "";
                          const headlinePlain = typeof c.headline === "string" ? richTextToPlainText(c.headline) : "";
                          const bodyPlain = typeof c.bodyCopy === "string" ? richTextToPlainText(c.bodyCopy) : "";
                          return (
                            <div className="rounded border border-border bg-white p-4">
                              {typeof c.subjectLine === "string" && c.subjectLine ? (
                                <p className="mb-3 text-xs text-muted-foreground">Subject: {c.subjectLine as string}</p>
                              ) : null}
                              {heroId ? (
                                <div className="mb-3 h-48 w-full overflow-hidden rounded border border-border bg-muted/20">
                                  <img src={assetPreviewPath(heroId)} alt="Hero" className="h-full w-full object-contain" />
                                </div>
                              ) : null}
                              {headlinePlain ? (
                                <div className={`mb-2 text-black ${SIMPLE_RICH_TEXT_CONTENT_CLASS}`} dangerouslySetInnerHTML={{ __html: headlineHtml }} />
                              ) : (
                                <p className="mb-2 text-lg font-semibold text-muted-foreground">Headline preview</p>
                              )}
                              {bodyPlain ? (
                                <div className={`text-sm text-black ${SIMPLE_RICH_TEXT_CONTENT_CLASS}`} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                              ) : (
                                <p className="text-sm text-muted-foreground">Body copy preview</p>
                              )}
                              {typeof c.ctaLabel === "string" && c.ctaLabel ? (
                                <div className="mt-4 flex justify-center">
                                  <Button size="sm" disabled>{c.ctaLabel as string}</Button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })() : promotionPreviewItem?.item_type === "social" ? (() => {
                          const c = (promotionPreviewItem.content_json || {}) as Record<string, unknown>;
                          const assetId = typeof c.assetId === "string" ? c.assetId : null;
                          const previewAsset = assetId ? kitAssetOptions.find((a) => a.id === assetId) || null : null;
                          const isVideo = Boolean(previewAsset && (
                            (previewAsset.fileType || "").toLowerCase().includes("video") ||
                            (previewAsset.mimeType || "").toLowerCase().startsWith("video/")
                          ));
                          return (
                            <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                              {typeof c.caption === "string" && c.caption ? (
                                <div className="border-b border-border px-4 py-3">
                                  <p className="text-sm text-foreground">{c.caption as string}</p>
                                </div>
                              ) : null}
                              <div className="w-full bg-muted/20">
                                {assetId ? (
                                  isVideo ? (
                                    <video src={assetPreviewPath(assetId)} className="w-full" autoPlay loop playsInline controls muted />
                                  ) : (
                                    <img src={assetPreviewPath(assetId)} alt="Social asset" className="w-full" />
                                  )
                                ) : (
                                  <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">No asset selected</div>
                                )}
                              </div>
                            </div>
                          );
                        })() : null}
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>
            ) : null}

            {activeStep === "audience" ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-white p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Share</h2>
                      <p className="text-sm text-muted-foreground">
                        Choose how this kit is delivered to recipients.
                      </p>
                    </div>
                    <span className={`text-xs ${audienceAutosaveStatusClassName}`}>{audienceAutosaveStatusLabel}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {([
                      {
                        mode: "partners" as const,
                        label: "Send to Partners",
                        description: "Notify selected partner organisations via the app and optionally email.",
                        icon: (
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                          </svg>
                        ),
                      },
                      {
                        mode: "share_link" as const,
                        label: "Share Link",
                        description: "Generate a public link — anyone with it can view the kit.",
                        icon: (
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                          </svg>
                        ),
                      },
                      {
                        mode: "partners_and_link" as const,
                        label: "Partners + Link",
                        description: "Send to partners and also create a public share link.",
                        icon: (
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                          </svg>
                        ),
                      },
                    ] as const).map(({ mode, label, description, icon }) => (
                      <button
                        key={mode}
                        type="button"
                        className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${
                          deliveryMode === mode
                            ? "border-[var(--color-accent-blue)] bg-[var(--color-accent-blue)]/5 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-[var(--color-accent-blue)]/40 hover:text-foreground"
                        }`}
                        onClick={() => setDeliveryMode(mode)}
                      >
                        <span className={deliveryMode === mode ? "text-[var(--color-accent-blue)]" : "text-muted-foreground"}>
                          {icon}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-foreground">{label}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {shareLinkDeliveryEnabled && !shareAvailable ? (
                    <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      Share links are unavailable for your current role. Choose Partner delivery instead.
                    </p>
                  ) : null}

                  {partnerDeliveryEnabled ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-md border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">Partner recipients</p>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={selectAllPartnerRecipients}
                              disabled={partnerRecipientsLoading || activePartnerRecipients.length === 0}
                            >
                              Select all
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={clearPartnerRecipientSelection}
                              disabled={selectedPartnerOrganizationIds.length === 0}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Select connected partner organizations to receive this update.
                        </p>
                        {partnerRecipientsLoading ? (
                          <p className="mt-3 text-xs text-muted-foreground">Loading partner recipients...</p>
                        ) : partnerRecipientsError ? (
                          <p className="mt-3 text-xs text-destructive">{partnerRecipientsError}</p>
                        ) : activePartnerRecipients.length === 0 ? (
                          <p className="mt-3 text-xs text-muted-foreground">
                            No active partner relationships found yet.
                          </p>
                        ) : (
                          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                            {activePartnerRecipients.map((partner) => (
                              <label
                                key={partner.id}
                                className="flex items-start gap-2 rounded border border-border px-2 py-1.5"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPartnerOrganizationIds.includes(partner.id)}
                                  onChange={() => togglePartnerRecipientSelection(partner.id)}
                                />
                                <span className="text-sm">
                                  <span className="font-medium text-foreground">{partner.name}</span>
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {partner.slug ? `/${partner.slug}` : "Partner workspace"}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                        <p className="mt-3 text-xs text-muted-foreground">
                          Selected: {partnerRecipientIdsForDelivery.length}
                        </p>
                        {pendingPartnerInvites.length > 0 ? (
                          <div className="mt-3 rounded-md border border-border bg-muted/20 p-2">
                            <p className="text-xs font-medium text-foreground">Pending partner invites</p>
                            <div className="mt-1 max-h-24 space-y-1 overflow-y-auto pr-1">
                              {pendingPartnerInvites.map((invite) => (
                                <p key={invite.id} className="text-xs text-muted-foreground">
                                  {invite.email}
                                </p>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-md border border-border p-3">
                        <p className="text-sm font-medium text-foreground">Delivery channels</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Workspace notifications are always on. Enable email for inbox delivery.
                        </p>
                        <div className="mt-2 space-y-2 text-sm">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked disabled />
                            <span>Workspace notifications (required)</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedDeliveryChannels.includes("email")}
                              onChange={(event) => setEmailDeliveryEnabled(event.target.checked)}
                            />
                            <span>Email</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
                      <p className="text-sm text-muted-foreground">
                        Partner delivery is turned off for this update. Configure and send the share link from
                        Review &amp; Publish.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {activeStep === "review" ? (
              <div className="rounded-lg border border-border bg-white p-5">
                <h2 className="text-base font-semibold text-foreground">Review & Publish</h2>
                <p className="text-sm text-muted-foreground">
                  Final check before go-live. Publish first, then choose how you want to share it.
                </p>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
                  <div>
                    <p className="text-xs text-muted-foreground">Kit items</p>
                    <p className="text-sm font-medium text-foreground">{sortedKitItems.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Partners selected</p>
                    <p className="text-sm font-medium text-foreground">{partnerRecipientIdsForDelivery.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Delivery path</p>
                    <p className="text-sm font-medium text-foreground">{deliveryModeSummaryLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Delivery methods</p>
                    <p className="text-sm font-medium text-foreground">
                      {partnerDeliveryEnabled ? deliverySummaryLabel : "Share link"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Promotions</p>
                    <p className="text-sm font-medium text-foreground">
                      {sortedKitItems.filter((i) => i.item_type === "email" || i.item_type === "social").length} item(s)
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {isPublished && shareUrl && shareLinkDeliveryEnabled ? (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                          <Check className="h-4 w-4 text-emerald-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-emerald-900">Live — Kit published</p>
                          <p className="mt-0.5 text-sm text-emerald-700">
                            {partnerDeliveryEnabled
                              ? `Notified ${partnerRecipientIdsForDelivery.length} partner${partnerRecipientIdsForDelivery.length !== 1 ? "s" : ""}. Share link is ready to copy.`
                              : "Your share link is active and ready to distribute."}
                          </p>
                          {shareUrl ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5">
                                <span className="truncate text-xs text-muted-foreground">{shareUrl}</span>
                              </div>
                              <Button
                                size="sm"
                                className="gap-1.5 shrink-0"
                                variant="secondary"
                                onClick={() => {
                                  void navigator.clipboard.writeText(shareUrl).then(() => {
                                    setShareCopyLabel("Copied!");
                                    setTimeout(() => setShareCopyLabel("Copy link"), 2000);
                                  });
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {shareCopyLabel}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                asChild
                              >
                                <a href={shareUrl} target="_blank" rel="noreferrer">Test link</a>
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {isPublished ? (
                        <div className="mt-3 flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveStep("analytics")}
                            className="gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                          >
                            View Analytics
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : isPublished ? (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0" />
                        <p>Live — {partnerDeliveryEnabled ? `Notified ${partnerRecipientIdsForDelivery.length} partner${partnerRecipientIdsForDelivery.length !== 1 ? "s" : ""}.` : "Share link is active."}</p>
                      </div>
                      <button
                        type="button"
                        className="mt-2 text-xs underline"
                        onClick={() => setActiveStep("analytics")}
                      >
                        View Analytics →
                      </button>
                    </div>
                  ) : null}

                  {!isPublished ? (
                    <Tabs
                      value={publishMode}
                      onValueChange={(value) => setPublishMode(value as "now" | "schedule")}
                    >
                      <TabsList aria-label="Publish options tabs">
                        <TabsTrigger value="now">Publish now</TabsTrigger>
                        <TabsTrigger value="schedule">Schedule</TabsTrigger>
                      </TabsList>

                      <TabsContent value="now" className="mt-4">
                        <p className="text-xs text-muted-foreground">
                          {partnerDeliveryEnabled
                            ? "Goes live immediately and starts delivery to selected partners."
                            : "Goes live immediately and makes your share link available."}
                        </p>
                        <div className="mt-3">
                          <Button
                            className="gap-2"
                            onClick={() => void runAction("publish")}
                            disabled={runningAction !== null || !canPublishOrSchedule}
                          >
                            <Send className="h-4 w-4" />
                            {runningAction === "publish" ? "Publishing..." : "Publish now"}
                          </Button>
                        </div>
                      </TabsContent>

                      <TabsContent value="schedule" className="mt-4">
                        <p className="text-xs text-muted-foreground">
                          {partnerDeliveryEnabled
                            ? "Set a date and time. This update will go live automatically and start partner delivery."
                            : "Set a date and time. This update will go live automatically and unlock your share link."}
                        </p>
                        <div className="mt-3 flex flex-wrap items-end gap-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Publish date & time</label>
                            <Input
                              type="datetime-local"
                              value={scheduleFor}
                              onChange={(event) => setScheduleFor(event.target.value)}
                            />
                          </div>
                          <Button
                            variant="secondary"
                            className="gap-2"
                            onClick={() => void runAction("schedule")}
                            disabled={runningAction !== null || !canPublishOrSchedule || !scheduleFor}
                          >
                            <CalendarClock className="h-4 w-4" />
                            {runningAction === "schedule" ? "Scheduling..." : "Schedule publish"}
                          </Button>
                        </div>
                      </TabsContent>
                    </Tabs>
                  ) : null}

                  {isScheduled ? (
                    <p className="text-xs text-muted-foreground">
                      Scheduled for:{" "}
                      <span className="font-medium text-foreground">{formatDate(update.scheduled_for)}</span>
                    </p>
                  ) : null}

                  {publishBlockingReason && !isPublished ? (
                    <p className="text-xs text-amber-700">{publishBlockingReason}</p>
                  ) : null}
                </div>

                {isLiveOrScheduled ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      {partnerDeliveryEnabled ? (
                        <div className="rounded-md border border-border p-3">
                          <p className="text-sm font-medium text-foreground">Partner sharing</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Send a follow-up reminder to currently selected partners.
                          </p>
                          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                            <p>
                              Selected partners:{" "}
                              <span className="font-medium text-foreground">
                                {partnerRecipientIdsForDelivery.length}
                              </span>
                            </p>
                            <p>
                              Delivery:{" "}
                              <span className="font-medium text-foreground">{deliverySummaryLabel}</span>
                            </p>
                          </div>
                          <div className="mt-3">
                            <Button
                              variant="secondary"
                              className="gap-2"
                              onClick={() => void runAction("remind")}
                              disabled={
                                runningAction !== null ||
                                !isPublished ||
                                partnerRecipientIdsForDelivery.length === 0
                              }
                            >
                              <Send className="h-4 w-4" />
                              {runningAction === "remind" ? "Sending..." : "Send reminder"}
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {shareAvailable ? (
                        <div className="rounded-md border border-border p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">Share link</p>
                            <p className="text-xs text-muted-foreground">
                              Copy and distribute this link through your own channels. Recipients will be prompted to sign up or log in.
                            </p>
                          </div>

                          <div className="mt-3">
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Link expiry</label>
                            <Input
                              type="datetime-local"
                              value={shareExpiresAt}
                              onChange={(event) => setShareExpiresAt(event.target.value)}
                              disabled={shareSaving || shareLoading}
                            />
                          </div>

                          <div className="mt-3 rounded-md border border-border p-3">
                            <p className="text-xs font-medium text-foreground">Onboarding Share Sets</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Applied only to new partners created via this link.
                            </p>

                            {onboardingShareSetLoading ? (
                              <p className="mt-2 text-xs text-muted-foreground">Loading Share Sets...</p>
                            ) : onboardingShareSetOptions.length === 0 ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                No Share Sets available. Create sets in Sharing Settings first.
                              </p>
                            ) : (
                              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                                {onboardingShareSetOptions.map((option) => {
                                  const checked = onboardingShareSetIds.includes(option.id);
                                  return (
                                    <label
                                      key={option.id}
                                      className="flex items-center justify-between gap-2 rounded border border-border/70 px-2 py-1.5 text-xs"
                                    >
                                      <span className="flex min-w-0 items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleOnboardingShareSet(option.id)}
                                          disabled={shareSaving || shareLoading}
                                        />
                                        <span className="truncate text-foreground">{option.name}</span>
                                      </span>
                                      <span className="shrink-0 text-muted-foreground">
                                        {option.moduleKey === "products" ? "Products" : "Assets"}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                            {onboardingShareSetError ? (
                              <p className="mt-2 text-xs text-destructive">{onboardingShareSetError}</p>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              onClick={() =>
                                void updateShareSettings({
                                  expiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : null,
                                  onboardingShareSetIds,
                                  successMessage: "Share settings saved.",
                                })
                              }
                              disabled={shareSaving || shareLoading}
                            >
                              {shareSaving ? "Saving..." : "Save Share Settings"}
                            </Button>
                            {showRegenerateConfirm ? (
                              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5">
                                <p className="text-xs text-amber-800">This will break any existing shared links. Continue?</p>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setShowRegenerateConfirm(false);
                                    void updateShareSettings({
                                      regenerateToken: true,
                                      successMessage: "Share link regenerated.",
                                    });
                                  }}
                                  disabled={shareSaving}
                                >
                                  Regenerate
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => setShowRegenerateConfirm(false)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="secondary"
                                className="gap-2"
                                onClick={() => setShowRegenerateConfirm(true)}
                                disabled={shareSaving || shareLoading}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Regenerate Link
                              </Button>
                            )}
                          </div>

                          {shareErrorMessage ? (
                            <p className="mt-3 text-sm text-destructive">{shareErrorMessage}</p>
                          ) : null}
                          {shareSuccessMessage ? (
                            <p className="mt-3 text-sm text-emerald-700">{shareSuccessMessage}</p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-md border border-border bg-muted/20 p-3">
                          <p className="text-sm text-muted-foreground">
                            External share links are unavailable for your current role.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
                {errorMessage ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {errorMessage}
                  </div>
                ) : null}
                {successMessage ? (
                  <p className="mt-3 text-sm text-emerald-700">{successMessage}</p>
                ) : null}
              </div>
            ) : null}

            {activeStep === "analytics" ? (
              <div className="rounded-lg border border-border bg-white overflow-hidden">
                {/* Header */}
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-base font-semibold text-foreground">Analytics</h2>
                </div>

                {/* Summary metrics table */}
                {metrics ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead className="bg-muted/50">
                        <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Recipients</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Open rate</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Acknowledge rate</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Activation rate</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Overdue</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Share opens</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Unique viewers</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{metrics.recipientCount}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{Math.round(metrics.openRate * 100)}%</td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{Math.round(metrics.acknowledgeRate * 100)}%</td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{Math.round(metrics.activationRate * 100)}%</td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{metrics.overdueRecipientCount}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{metrics.publicShareOpenCount || 0}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{metrics.uniquePublicViewerCount || 0}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 py-4 text-sm text-muted-foreground">Analytics not available.</p>
                )}

                {/* Per-recipient breakdown */}
                {analyticsRecipients.length > 0 ? (
                  <>
                    <div className="border-t border-border bg-muted/30 px-5 py-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Per-recipient breakdown</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead className="bg-muted/50">
                          <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Partner</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Opened</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Acknowledged</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Activated</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Due</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsRecipients.slice(0, 50).map((recipient) => (
                            <tr key={recipient.id} style={{ borderBottom: "1px solid #f3f4f6" }} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 text-sm text-foreground" title={recipient.partnerOrganizationId || undefined}>
                                {recipient.partnerOrganizationName?.trim() || recipient.partnerOrganizationId || "-"}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  recipient.status === "activated" ? "bg-emerald-50 text-emerald-700" :
                                  recipient.status === "acknowledged" ? "bg-blue-50 text-blue-700" :
                                  recipient.status === "opened" ? "bg-sky-50 text-sky-700" :
                                  "bg-muted/50 text-muted-foreground"
                                }`}>
                                  {recipient.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(recipient.openedAt)}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(recipient.acknowledgedAt)}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(recipient.activatedAt)}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(recipient.dueAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
      )}
      {/* Floating Kit / Close button */}
      {kitDrawerOpen ? (
        <button
          type="button"
          className="fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-accent-blue)] text-white shadow-xl transition-all hover:bg-[var(--color-accent-blue-hover)] active:scale-95 active:bg-[var(--color-accent-blue-active)]"
          onClick={() => setKitDrawerOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[var(--color-accent-blue)] px-4 py-2.5 text-sm font-medium text-white shadow-xl transition-all hover:bg-[var(--color-accent-blue-hover)] active:scale-95 active:bg-[var(--color-accent-blue-active)]"
          onClick={() => setKitDrawerOpen(true)}
        >
          <Files className="h-4 w-4" />
          Kit
          {sortedKitItems.length > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold text-white">
              {sortedKitItems.length}
            </span>
          ) : null}
        </button>
      )}

      {/* Kit Drawer */}
      <Sheet open={kitDrawerOpen} onOpenChange={setKitDrawerOpen}>
        <SheetContent side="right" className="w-[400px] sm:max-w-none">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Files className="h-4 w-4" />
              Kit
              {sortedKitItems.length > 0 ? (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                  {sortedKitItems.length}
                </span>
              ) : null}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4">
            {sortedKitItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40">
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No items yet</p>
                <p className="text-xs text-muted-foreground">Add products, assets, and promotions using the steps above.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {sortedKitItems.map((item) => {
                  const contentJson = (item.content_json || {}) as Record<string, unknown>;
                  const name = (() => {
                    const t = (item.title || "").trim();
                    if (t && t.toLowerCase() !== item.item_type) return t;
                    if (item.item_type === "product") return resolveProductLabel(item.product_id);
                    if (item.item_type === "asset") return resolveAssetLabel(item.asset_id);
                    if (item.item_type === "url") return item.url || "Link";
                    if (item.item_type === "email") return "Email";
                    if (item.item_type === "social") return "Social Post";
                    return getTextContent(contentJson).trim().split("\n")[0] || "Text";
                  })();
                  const subtitle = (() => {
                    if (item.item_type === "email") return typeof contentJson.subjectLine === "string" && contentJson.subjectLine ? `Email · ${String(contentJson.subjectLine).slice(0, 45)}` : "Email";
                    if (item.item_type === "social") return typeof contentJson.caption === "string" && contentJson.caption ? `Social · ${String(contentJson.caption).slice(0, 45)}` : "Social Post";
                    if (item.item_type === "product") return "Product";
                    if (item.item_type === "asset") return resolveAssetLabel(item.asset_id) ? "Asset" : "Asset";
                    if (item.item_type === "url") return item.url || "";
                    return "Text";
                  })();
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-6 py-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/20">
                        {item.item_type === "product" && item.product_id && productById.get(item.product_id)?.imageUrl ? (
                          <img src={productById.get(item.product_id)?.imageUrl || ""} alt={name} className="h-full w-full object-contain" />
                        ) : item.item_type === "asset" && item.asset_id && isImageAsset(assetById.get(item.asset_id)) ? (
                          <img src={assetPreviewPath(item.asset_id)} alt={name} className="h-full w-full object-contain" />
                        ) : item.item_type === "product" ? (
                          <Package className="h-4 w-4 text-muted-foreground" />
                        ) : item.item_type === "asset" ? (
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        ) : item.item_type === "email" ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        ) : item.item_type === "social" ? (
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{name}</p>
                        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </PageContentContainer>
  );
}





