import Link from 'next/link'
import { ArrowLeft, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface BackLinkButtonProps {
  href: string
  label?: string
  className?: string
  fullWidth?: boolean
  icon?: 'arrow' | 'chevron'
}

export function BackLinkButton({
  href,
  label = 'Back',
  className,
  fullWidth = false,
  icon = 'arrow',
}: BackLinkButtonProps) {
  const Icon = icon === 'chevron' ? ChevronLeft : ArrowLeft

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn(
        "h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        fullWidth && "w-full justify-start px-3",
        className
      )}
    >
      <Link href={href}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
      </Link>
    </Button>
  )
}
