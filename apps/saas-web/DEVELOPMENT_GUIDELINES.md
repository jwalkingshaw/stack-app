# SaaS Web Development Guidelines

> **Essential patterns and practices for the TradeeTool SaaS application**

---

## 🏗️ Architecture Patterns

### ⚠️ CRITICAL: Tenant Page Structure

**ALL pages under `/[tenant]/` MUST follow this exact pattern:**

#### ✅ CORRECT Structure:
```typescript
"use client";
import { useParams } from "next/navigation";

export default function MyNewPage() {
  const params = useParams();
  const tenantSlug = params.tenant as string;
  
  return (
    <>  {/* Use fragment, NOT AppLayoutShell */}
      <div className="p-6">
        {/* Your page content */}
      </div>
    </>
  );
}
```

#### ❌ WRONG - Will cause performance issues:
```typescript
// DON'T DO THIS - causes double sidebar + slow auth calls
import { AppLayoutShell } from "@/components/AppLayoutShell";
import { useAuth } from "@/hooks/useAuth";

export default function MyNewPage() {
  const { user, isAuthenticated } = useAuth(); // ❌ Redundant
  
  return (
    <AppLayoutShell authContext={{...}}> {/* ❌ Double layout */}
      {/* content */}
    </AppLayoutShell>
  );
}
```

### 🔄 Server vs Client Components

#### Use **Server Components** for:
- ✅ Data fetching from database
- ✅ Authentication checks  
- ✅ Static content rendering
- ✅ Layout components

#### Use **Client Components** for:
- ✅ Interactive UI (forms, buttons)
- ✅ State management
- ✅ Event handlers
- ✅ Browser APIs

```typescript
// ✅ Server Component (default)
export default async function ServerPage() {
  const data = await fetchFromDB();
  return <div>{data}</div>;
}

// ✅ Client Component (with directive)
"use client";
export default function ClientPage() {
  const [state, setState] = useState();
  return <button onClick={() => setState()}>Click</button>;
}
```

### 📐 Layout Hierarchy

```
app/
├── layout.tsx              # Root layout (global)
├── [tenant]/
│   ├── layout.tsx         # Tenant layout (auth + sidebar)
│   ├── page.tsx           # Dashboard (fragment wrapper)
│   ├── assets/
│   │   ├── page.tsx       # Assets list (fragment wrapper)
│   │   └── upload/
│   │       └── page.tsx   # Upload page (fragment wrapper)
```

**Rule**: Only **one** layout should provide `AppLayoutShell`. Child pages use fragments.

---

## 🔐 Security & Auth

### 🛡️ Authentication Rules

1. **Never put auth logic in pages** - Always in layouts/middleware
2. **Server-side verification** - Auth happens in layout.tsx, not client components
3. **Cached auth functions** - Use React `cache()` for performance

```typescript
// ✅ Correct - Server-side auth in layout
export default async function TenantLayout({ children, params }) {
  const user = await getSafeUserData(); // Cached
  const org = await getSafeOrganizationData(); // Cached
  
  return <TenantLayoutClient user={user} org={org}>{children}</TenantLayoutClient>;
}

// ❌ Wrong - Client-side auth checks
"use client";
export default function MyPage() {
  const { isAuthenticated } = useAuth(); // Slow + redundant
  if (!isAuthenticated) return <Login />;
}
```

### 🏢 Tenant Isolation

- ✅ **Always verify tenant access** in server layouts
- ✅ **Use tenant slug validation** - Check user's org matches tenant
- ❌ **Never trust client-side tenant data**

```typescript
// ✅ Secure tenant verification
const organization = await db.getOrganizationBySlug(tenantSlug);
if (kindeOrg.orgCode !== organization.kindeOrgId) {
  redirect('/unauthorized');
}
```

### 🔑 Environment Variables

```bash
# ✅ Server-only secrets (.env.local)
SUPABASE_SERVICE_ROLE_KEY=sk_...
KINDE_CLIENT_SECRET=...

# ✅ Public variables (.env.local) 
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_KINDE_DOMAIN=...
```

**Rule**: Anything with `NEXT_PUBLIC_` is exposed to client. Keep secrets server-only.

---

## ⚡ Performance Rules

### 💾 Caching Strategies

```typescript
// ✅ Server-side caching with React cache()
export const getCurrentUser = cache(async () => {
  return await fetchUser(); // Cached per request
});

// ✅ Client-side request deduplication
const fetchUser = async () => {
  if (pendingRequest) return await pendingRequest;
  pendingRequest = fetch('/api/me');
  // ...
};

// ✅ HTTP cache headers in API routes
response.headers.set('Cache-Control', 'private, max-age=30');
```

### 🗄️ Database Query Patterns

```typescript
// ✅ Single query with joins
const assetsWithFolders = await db.query(`
  SELECT assets.*, folders.name as folder_name
  FROM assets 
  LEFT JOIN folders ON assets.folder_id = folders.id
  WHERE assets.org_id = $1
`, [orgId]);

// ❌ N+1 query problem
const assets = await db.getAssets(orgId);
for (const asset of assets) {
  asset.folder = await db.getFolder(asset.folderId); // Slow!
}
```

### 📦 Bundle Optimization

```typescript
// ✅ Dynamic imports for large components
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Skeleton />,
});

// ✅ Barrel exports for clean imports
export * from './components';
export * from './hooks';

// ✅ Tree-shaking friendly imports
import { Button } from '@/components/ui/button';
// ❌ import * as UI from '@/components/ui';
```

---

## 📁 File Organization

### 🏗️ Folder Structure

```
src/
├── app/                    # Next.js app router
│   ├── (auth)/            # Route groups
│   ├── [tenant]/          # Dynamic tenant routes
│   └── api/               # API endpoints
├── components/            # Reusable UI components
│   ├── ui/               # Base UI components
│   └── features/         # Feature-specific components  
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions
└── types/                # TypeScript definitions
```

### 📝 Naming Conventions

- **Components**: `PascalCase` (UserProfile.tsx)
- **Files**: `kebab-case` (user-profile.ts)
- **Hooks**: `camelCase` starting with "use" (useUserProfile.ts)
- **Constants**: `SCREAMING_SNAKE_CASE`

### 📥 Import/Export Patterns

```typescript
// ✅ Barrel exports in index.ts
export { Button } from './button';
export { Dialog } from './dialog';
export type { ButtonProps } from './button';

// ✅ Absolute imports with path mapping
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

// ❌ Relative imports for distant files
import { Button } from '../../../components/ui/button';
```

---

## 🎨 UI/UX Standards

### 🎯 Design System Usage

```typescript
// ✅ Use design system components
import { Button, Card, Input } from '@tradetool/ui';

// ✅ Consistent spacing
<div className="p-6 space-y-4">
  <Card className="p-4">
    <Button size="lg" variant="primary">
      Upload Assets
    </Button>
  </Card>
</div>

// ❌ Custom styling that breaks design system
<button style={{ padding: '12px', background: 'blue' }}>
```

### 📱 Responsive Patterns

```typescript
// ✅ Mobile-first responsive design
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  <Card className="p-4 sm:p-6">
    {/* Content adapts to screen size */}
  </Card>
</div>
```

### ⏳ Loading States

```typescript
// ✅ Consistent loading patterns
{loading ? (
  <div className="animate-pulse space-y-4">
    <div className="h-4 bg-muted rounded w-3/4" />
    <div className="h-4 bg-muted rounded w-1/2" />
  </div>
) : (
  <ActualContent />
)}
```

---

## 🧪 Development Workflow

### 📘 TypeScript Patterns

```typescript
// ✅ Strong typing with interfaces
interface AssetMetadata {
  id: string;
  filename: string;
  assetScope: 'Product' | 'Campaign' | 'Brand' | 'Corporate';
  tags: string[];
}

// ✅ Utility types
type AssetWithoutId = Omit<AssetMetadata, 'id'>;
type PartialAsset = Partial<AssetMetadata>;

// ✅ Generic functions
function createAsset<T extends AssetMetadata>(asset: T): T {
  return { ...asset, id: generateId() };
}
```

### ✅ Testing Guidelines

```typescript
// ✅ Test user interactions, not implementation
test('uploads file when user clicks upload button', async () => {
  render(<UploadPage />);
  
  const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
  const input = screen.getByLabelText(/upload file/i);
  
  await user.upload(input, file);
  await user.click(screen.getByRole('button', { name: /upload/i }));
  
  expect(screen.getByText(/upload successful/i)).toBeInTheDocument();
});
```

### 🌿 Git Workflow

```bash
# ✅ Descriptive branch names
git checkout -b feature/asset-metadata-table
git checkout -b fix/double-sidebar-performance
git checkout -b refactor/auth-caching

# ✅ Conventional commit messages
git commit -m "feat: add metadata table with inline editing"
git commit -m "fix: remove duplicate auth calls causing slowness"
git commit -m "refactor: cache auth functions for performance"
```

---

## 🚨 Common Pitfalls to Avoid

### ❌ Double Layout Wrapping
```typescript
// ❌ This creates double sidebar + slow auth
export default function Page() {
  return (
    <AppLayoutShell> {/* Already provided by parent layout! */}
      <Content />
    </AppLayoutShell>
  );
}
```

### ❌ Client-Side Auth Checks
```typescript
// ❌ Slow + security risk
"use client";
export default function Page() {
  const { user } = useAuth(); // API call on every render
  if (!user) redirect('/login');
}
```

### ❌ Hardcoded Values
```typescript
// ❌ Hard to maintain
const API_URL = 'https://api.tradetool.com';

// ✅ Use environment variables
const API_URL = process.env.NEXT_PUBLIC_API_URL;
```

### ❌ Missing Error Boundaries
```typescript
// ✅ Wrap risky components
<ErrorBoundary fallback={<ErrorUI />}>
  <ComponentThatMightCrash />
</ErrorBoundary>
```

---

## 🎯 Quick Checklist

Before creating any new page in `/[tenant]/`:

- [ ] Using React fragment `<>`, not `AppLayoutShell`
- [ ] No `useAuth()` hook imported
- [ ] Getting `tenantSlug` from `useParams()`
- [ ] Following TypeScript interfaces
- [ ] Using design system components
- [ ] Adding proper loading states
- [ ] Testing the happy path

---

## 🆘 Need Help?

1. **Performance issues**: Check for double layouts or uncached auth calls
2. **Auth problems**: Verify server-side auth in layout, not pages  
3. **Routing issues**: Ensure proper tenant slug handling
4. **Type errors**: Check interface definitions in `/types`

Remember: **When in doubt, check existing working pages like `/assets` for the correct pattern!**