import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToastProps {
  id: string;
  title?: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: (id: string) => void;
}

export function Toast({ id, title, message, type = 'info', duration = 4000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onClose(id), 200); // Wait for exit animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, id, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 200);
  };

  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
    info: Info
  };

  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const iconStyles = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600'
  };

  const Icon = icons[type];

  return (
    <div
      className={cn(
        'pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border shadow-lg transition-all duration-200',
        styles[type],
        isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
      )}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <Icon className={cn('h-5 w-5', iconStyles[type])} />
          </div>
          <div className="ml-3 w-0 flex-1">
            {title && (
              <p className="text-sm font-medium">{title}</p>
            )}
            <p className={cn('text-sm', title ? 'mt-1' : '')}>{message}</p>
          </div>
          <div className="ml-4 flex flex-shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'inline-flex rounded-md p-1.5 transition-colors',
                'hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-2',
                type === 'success' && 'text-green-600 hover:bg-green-100 focus:ring-green-500',
                type === 'error' && 'text-red-600 hover:bg-red-100 focus:ring-red-500',
                type === 'warning' && 'text-yellow-600 hover:bg-yellow-100 focus:ring-yellow-500',
                type === 'info' && 'text-blue-600 hover:bg-blue-100 focus:ring-blue-500'
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ToastContextType {
  showToast: (toast: Omit<ToastProps, 'id' | 'onClose'>) => void;
}

// Toast container that manages multiple toasts
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { ...toast, id, onClose: removeToast }]);
  }, [removeToast]);

  // Expose showToast globally for easy access
  React.useEffect(() => {
    (window as any).showToast = showToast;
    return () => {
      delete (window as any).showToast;
    };
  }, [showToast]);

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} />
        ))}
      </div>
    </div>
  );
}

// Utility function for easy toast creation
export const toast = {
  success: (message: string, title?: string) => {
    if ((window as any).showToast) {
      (window as any).showToast({ message, title, type: 'success' });
    }
  },
  error: (message: string, title?: string) => {
    if ((window as any).showToast) {
      (window as any).showToast({ message, title, type: 'error' });
    }
  },
  warning: (message: string, title?: string) => {
    if ((window as any).showToast) {
      (window as any).showToast({ message, title, type: 'warning' });
    }
  },
  info: (message: string, title?: string) => {
    if ((window as any).showToast) {
      (window as any).showToast({ message, title, type: 'info' });
    }
  }
};
