'use client';

import Link from 'next/link';

interface AttributeWorkflowChecklistProps {
  tenantSlug: string;
}

const buildWorkflowSteps = (tenantSlug: string) => [
  {
    title: 'Attributes',
    description: 'Define the attributes you want to capture on products.',
    href: `/${tenantSlug}/settings/product-fields`,
    action: 'Open Attributes'
  },
  {
    title: 'Attribute Groups',
    description: 'Group related attributes so they display together on products.',
    href: `/${tenantSlug}/settings/field-groups`,
    action: 'Open Groups'
  },
  {
    title: 'Product Models',
    description: 'Assign groups to build a product model.',
    href: `/${tenantSlug}/settings/product-models`,
    action: 'Open Models'
  },
  {
    title: 'Variant Axes',
    description: 'Inside a model, pick which attributes define variants.',
    href: `/${tenantSlug}/settings/product-models`,
    action: 'Configure Axes'
  },
  {
    title: 'Products',
    description: 'Create products and fill in required attributes.',
    href: `/${tenantSlug}/products`,
    action: 'Open Products'
  }
];

export default function AttributeWorkflowChecklist({
  tenantSlug
}: AttributeWorkflowChecklistProps) {
  const steps = buildWorkflowSteps(tenantSlug);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Attribute Workflow</h3>
          <p className="text-sm text-muted-foreground">
            Follow this checklist to connect attributes to products and variants.
          </p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Checklist
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className="flex items-start gap-3 rounded-md border border-border/60 bg-background px-4 py-3"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {index + 1}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <Link
                  href={step.href}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {step.action}
                </Link>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
