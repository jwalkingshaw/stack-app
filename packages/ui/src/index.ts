export * from './components/button';
export * from './components/input';
export * from './components/badge';
export * from './components/card';
export * from './components/tabs';
export * from './components/dialog';
export * from './components/dropdown-menu';
export * from './components/separator';
export * from './components/tooltip';
export * from './components/file-upload';
export * from './components/asset-grid';
export * from './components/folder-tree';
export * from './components/asset-metadata-schema';
export * from './components/asset-metadata-table';
export * from './components/product-link-suggestions';
export * from './components/product-context-panel';
// Removed old sidebar components - now using shell/Sidebar

// New unified shell components
export * from './components/unified-header';
export * from './components/shell/Sidebar';
export * from './components/shell/LayoutShell';
export { AuthLayoutShell, AppLayoutShell, MarketingLayoutShell } from './components/shell/LayoutShell';

// Navigation system
export * from './lib/nav.config';
export * from './lib/nav';

export * from './lib/utils';
export * from './lib/product-linking';