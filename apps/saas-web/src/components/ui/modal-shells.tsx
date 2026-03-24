'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageContentContainer } from '@/components/ui/page-content-container';
import { cn } from '@/lib/utils';

export type ModalPresentation = 'centered' | 'fullscreen';

export function getModalPresentation(params: {
  fieldCount: number;
  isComplex?: boolean;
}): ModalPresentation {
  const { fieldCount, isComplex = false } = params;
  if (isComplex) return 'fullscreen';
  return fieldCount <= 3 ? 'centered' : 'fullscreen';
}

interface FullscreenFormModalProps {
  open: boolean;
  title: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
  backLabel?: string;
  headerContentClassName?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  primaryActionLoading?: boolean;
  primaryActionLoadingLabel?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  frameBody?: boolean;
}

export function FullscreenFormModal({
  open,
  title,
  onOpenChange,
  onBack,
  backLabel = '< Back',
  headerContentClassName,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled = false,
  primaryActionLoading = false,
  primaryActionLoadingLabel,
  children,
  className,
  bodyClassName,
  frameBody = true,
}: FullscreenFormModalProps) {
  const hasPrimaryAction = Boolean(primaryActionLabel && onPrimaryAction);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-white" />
        <DialogPrimitive.Content className={cn('fixed inset-0 z-50 bg-white', className)}>
          <div className="flex h-full flex-col">
            <div className="border-b border-border/60">
              <PageContentContainer
                mode="form"
                padding="compact"
                className={cn('flex items-center justify-between gap-3', headerContentClassName)}
              >
                <Button
                  variant="ghost"
                  onClick={onBack}
                  disabled={primaryActionLoading}
                  className="h-8 px-2.5 text-sm"
                >
                  {backLabel}
                </Button>
                <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                  {title}
                </DialogPrimitive.Title>
                {hasPrimaryAction ? (
                  <Button
                    variant="accent-blue"
                    onClick={onPrimaryAction}
                    disabled={primaryActionDisabled || primaryActionLoading}
                  >
                    {primaryActionLoading
                      ? primaryActionLoadingLabel || `${primaryActionLabel}...`
                      : primaryActionLabel}
                  </Button>
                ) : (
                  <div className="w-16" />
                )}
              </PageContentContainer>
            </div>

            <div className="flex-1 overflow-y-auto">
              <PageContentContainer mode="form" padding="page">
                <div
                  className={cn(
                    frameBody ? 'rounded-lg border border-border/60 bg-card p-4 sm:p-6' : '',
                    bodyClassName
                  )}
                >
                  {children}
                </div>
              </PageContentContainer>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface CenteredFormModalProps {
  open: boolean;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
  primaryActionDisabled?: boolean;
  primaryActionLoading?: boolean;
  primaryActionLoadingLabel?: string;
  cancelLabel?: string;
  children: React.ReactNode;
  contentClassName?: string;
}

export function CenteredFormModal({
  open,
  title,
  description,
  onOpenChange,
  onCancel,
  onPrimaryAction,
  primaryActionLabel,
  primaryActionDisabled = false,
  primaryActionLoading = false,
  primaryActionLoadingLabel,
  cancelLabel = 'Cancel',
  children,
  contentClassName,
}: CenteredFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-md', contentClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={primaryActionLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant="accent-blue"
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled || primaryActionLoading}
          >
            {primaryActionLoading
              ? primaryActionLoadingLabel || `${primaryActionLabel}...`
              : primaryActionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  confirmLoadingLabel?: string;
  cancelLabel?: string;
  variant?: 'accent-blue' | 'destructive';
  children?: React.ReactNode;
}

export function ConfirmActionModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
  confirmLoading = false,
  confirmLoadingLabel,
  cancelLabel = 'Cancel',
  variant = 'destructive',
  children,
}: ConfirmActionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ? <div className="space-y-3">{children}</div> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirmLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={confirmDisabled || confirmLoading}
          >
            {confirmLoading ? confirmLoadingLabel || `${confirmLabel}...` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
