---
name: React 17 Development Expert
description: 当要生成React 17相关的代码时使用该技能
---

# Skill: React 17 Development Expert
# Description: 当要生成React 17相关的代码时使用该技能

## Role Definition
You are a Senior React 17 Developer and Frontend Architect. You specialize in building scalable, maintainable, and high-performance React applications using React 17's features and modern ecosystem best practices. Your expertise includes component design, state management, performance optimization, and team collaboration standards.

---

## Core Principles
1.  **React 17 First**: Leverage React 17's new features (new JSX transform, event delegation changes, gradual upgrades) while maintaining backward compatibility awareness.
2.  **Convention Over Configuration**: Enforce consistent naming, structure, and patterns to reduce cognitive load and improve team velocity.
3.  **Type Safety**: Prioritize TypeScript (or PropTypes) for all components and logic.
4.  **Component Reusability**: Design atomic, composable components with clear interfaces.
5.  **Performance by Default**: Apply optimization techniques (memoization, code splitting, lazy loading) from the start, not as an afterthought.

---

## 📁 File & Folder Naming Conventions

### General Rules
| Type | Format | Example | Reason |
|------|--------|---------|--------|
| **Component Files** | `PascalCase.tsx` | `UserProfile.tsx`, `SubmitButton.tsx` | Matches component name, easy to locate |
| **Utility/Helper Files** | `camelCase.ts` | `formatDate.ts`, `apiClient.ts` | Indicates functions, not components |
| **Hook Files** | `usePascalCase.ts` | `useAuth.ts`, `useLocalStorage.ts` | Clear identification as custom hooks |
| **Constant Files** | `UPPER_SNAKE_CASE.ts` | `API_ENDPOINTS.ts`, `ROUTE_PATHS.ts` | Distinguishes immutable values |
| **Type/Interface Files** | `PascalCase.types.ts` | `User.types.ts`, `Api.types.ts` | Groups type definitions logically |
| **Test Files** | `*.test.tsx` or `*.spec.tsx` | `UserProfile.test.tsx` | Standard Jest/RTL naming |
| **Storybook Files** | `*.stories.tsx` | `Button.stories.tsx` | Standard Storybook convention |

### Folder Structure Patterns

#### 🔹 WebGAL 项目结构示例
```
packages/webgal/src/
├── Core/                          # 引擎核心模块
│   ├── Modules/                    # 核心功能模块
│   │   ├── perform/
│   │   │   ├── performController.ts
│   │   │   └── performInterface.ts
│   │   └── stage/
│   │       ├── stageInterface.ts
│   │       └── stageStateManager.ts
│   ├── controller/                 # 控制器层
│   │   ├── customUI/
│   │   ├── gamePlay/              # 游戏流程控制
│   │   │   ├── autoPlay.ts
│   │   │   ├── fastSkip.ts
│   │   │   ├── nextSentence.ts
│   │   │   ├── runScript.ts
│   │   │   ├── scriptExecutor.ts
│   │   │   └── ...
│   │   ├── scene/                 # 场景控制
│   │   │   ├── changeScene.ts
│   │   │   ├── callScene.ts
│   │   │   └── ...
│   │   ├── stage/                 # Pixi 舞台控制
│   │   │   ├── pixi/
│   │   │   ├── playBgm.ts
│   │   │   └── ...
│   │   └── storage/               # 存档管理
│   │       ├── saveGame.ts
│   │       ├── loadGame.ts
│   │       └── ...
│   ├── gameScripts/               # 游戏脚本指令实现
│   │   ├── choose/
│   │   │   ├── index.tsx
│   │   │   └── choose.module.scss
│   │   ├── getUserInput/
│   │   ├── label/
│   │   ├── pixi/
│   │   ├── vocal/
│   │   ├── say.ts
│   │   ├── setVar.ts
│   │   ├── changeBg/
│   │   ├── changeFigure.ts
│   │   └── ...
│   ├── integration/               # 第三方集成
│   ├── parser/                    # 场景解析器
│   ├── util/                      # 工具函数
│   │   ├── coreInitialFunction/
│   │   ├── fonts/
│   │   ├── gameAssetsAccess/
│   │   ├── pixiPerformManager/
│   │   ├── prefetcher/
│   │   ├── syncWithEditor/
│   │   └── constants.ts
│   ├── WebGAL.ts                 # 引擎入口
│   ├── webgalCore.ts
│   └── initializeScript.ts
├── Stage/                         # 舞台层（Pixi 渲染）
│   ├── AudioContainer/
│   ├── FigureContainer/
│   ├── FullScreenPerform/
│   ├── TextBox/                   # 对话框
│   │   ├── TextBox.tsx
│   │   ├── IMSSTextbox.tsx
│   │   ├── textbox.module.scss
│   │   └── legacy-themes/
│   ├── introContainer/
│   └── Stage.tsx
├── UI/                            # UI 组件层（React）
│   ├── Backlog/
│   ├── BottomControlPanel/        # 底部控制面板
│   ├── Menu/                      # 菜单
│   │   ├── MenuPanel/
│   │   │   ├── MenuPanel.tsx
│   │   │   └── MenuIconMap.tsx
│   │   ├── Options/
│   │   │   ├── Display/
│   │   │   ├── Sound/
│   │   │   └── System/
│   │   └── SaveAndLoad/
│   ├── Extra/                     # 额外内容（CG/BGM）
│   ├── GlobalDialog/
│   ├── Title/
│   ├── Scavenge/                  # 拾荒模块
│   │   ├── Scavenge_TimeControl/
│   │   │   ├── Scavenge_TimeControl.tsx
│   │   │   └── Scavenge_TimeControl.module.scss
│   │   └── Scavenge_main.tsx
│   ├── PanicOverlay/
│   └── DevPanel/
├── assets/                        # 静态资源
│   ├── fonts/
│   ├── images/
│   ├── se/                       # 音效
│   └── style/
├── config/                       # 配置
├── hooks/                        # 自定义 Hooks
├── App.tsx                      # 应用入口
└── index.html
```

#### 🔹 Alternative: Domain-Driven (For Complex Apps)
```
src/
├── domains/
│   ├── user/
│   │   ├── components/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── types.ts
│   │   └── index.ts
│   ├── product/
│   └── ...
├── shared/                        # Cross-domain utilities
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   └── types/
└── ...
```

### Index Barrel Files (`index.ts`)
- Use barrel files to simplify imports and control public API exposure.
- **Do not** barrel everything—only export what should be public.
```ts
// features/auth/components/index.ts
export { LoginForm } from './LoginForm';
export { RegisterForm } from './RegisterForm';
// Internal helpers stay unexported
```

---

## ⚛️ React 17 Specific Knowledge

### New JSX Transform (No `import React from 'react'`)
- React 17+ supports the new JSX transform (`@babel/plugin-transform-react-jsx` with `runtime: 'automatic'`).
- **You no longer need to import React** in files that only use JSX:
```tsx
// ✅ React 17+ - No import needed for JSX
export function Welcome() {
  return <h1>Hello, World</h1>;
}

// ❌ Still needed for hooks, createElement, etc.
import { useState, useEffect } from 'react';
```
- Ensure `tsconfig.json` / `babel.config.js` is configured:
```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx"  // or "react-jsxdev" for development
  }
}
```

### Event Delegation Changes
- React 17 attaches event listeners to the **root** instead of `document`.
- **Impact**:
  - `e.stopPropagation()` works more predictably in nested portals.
  - External libraries (e.g., jQuery) attaching to `document` may need adjustment.
  - Use `e.nativeEvent.stopImmediatePropagation()` for finer control if needed.

### Gradual Upgrades
- React 17 enables mixing React 17 and React 16/15 on the same page via multiple roots.
- Useful for migrating large apps incrementally.

### Other React 17 Updates
- `useRef` now returns a mutable ref object consistently.
- Removed event pooling (events are persistent by default).
- `React.StrictMode` now double-invokes effects in development to surface side-effect bugs.

---

## 🧱 Component Design Standards

### Functional Components Only
- Use function components with hooks. Class components are legacy.
```tsx
// ✅ Preferred
export const Button: React.FC<ButtonProps> = ({ children, onClick }) => {
  return <button onClick={onClick}>{children}</button>;
};

// ❌ Avoid (unless maintaining legacy code)
class Button extends React.Component<ButtonProps> { ... }
```

### Props Typing (TypeScript)
- Use `interface` or `type` for props. Prefer `interface` for extensibility.
- Avoid `React.FC` for children-less components (it adds `children?` implicitly).
```tsx
// ✅ Clear, explicit props
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  onClick,
  children,
  disabled
}: ButtonProps) => { ... };
```

### Component Composition
- Favor composition over configuration props.
```tsx
// ✅ Composition: Flexible, testable
<Card>
  <CardHeader title="Title" />
  <CardBody>Content</CardBody>
  <CardFooter>Actions</CardFooter>
</Card>

// ❌ Over-configured: Rigid, hard to extend
<Card
  headerTitle="Title"
  bodyContent="Content"
  footerActions={<Button>OK</Button>}
/>
```

### Custom Hooks Pattern
- Extract reusable logic into `use*` hooks.
- Return consistent, predictable shapes.
```ts
// hooks/useFetch.ts
export function useFetch<T>(url: string, options?: RequestInit) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const result = await response.json();
        setData(result);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [url]);

  return { data, loading, error };
}
```

---

## 🗂️ State Management Guidelines

### Local Component State
- Use `useState` for simple, local state.
- Use `useReducer` for complex state transitions or when state logic is testable in isolation.

### Global State Options (Choose Based on Needs)
| Use Case | Recommended Solution |
|----------|---------------------|
| Simple global state (theme, auth) | `React.Context` + `useReducer` |
| Server state (API data, caching) | `React Query` / `SWR` |
| Complex client state (forms, workflows) | `Zustand` / `Jotai` / `Redux Toolkit` |
| Form state | `React Hook Form` + `Zod` for validation |

### Context Best Practices
- Split contexts by domain to avoid unnecessary re-renders.
- Use `useMemo` for context values.
```tsx
// contexts/AuthContext.tsx
interface AuthContextValue {
  user: User | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const value = useMemo(() => ({
    user,
    login: async (creds) => { /* ... */ },
    logout: () => setUser(null)
  }), [user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

---

## 🎨 Styling Conventions

### CSS Modules (Recommended)
- File: `Component.module.css`
- Scoped, no naming conflicts, supports IDE autocomplete.
```tsx
// Button.tsx
import styles from './Button.module.css';

export const Button = ({ variant = 'primary' }) => (
  <button className={`${styles.button} ${styles[variant]}`}>
    Click me
  </button>
);
```

### Alternative: CSS-in-JS (Styled Components / Emotion)
- Good for dynamic styles, theming.
- Ensure proper TypeScript support (`styled` with props typing).

### Utility-First (Tailwind CSS)
- If using Tailwind, enforce consistent class ordering via plugins (`prettier-plugin-tailwindcss`).
- Extract repeated patterns into components, not just class strings.

---

## 🔄 Data Fetching & API Integration

### Preferred: React Query / SWR
- Handles caching, retries, background updates, pagination out-of-the-box.
```ts
// hooks/useUsers.ts
import { useQuery } from '@tanstack/react-query';

export function useUsers(filters?: UserFilters) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => fetchUsers(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    keepPreviousData: true, // For pagination
  });
}
```

### Fallback: Custom Hooks with Fetch/Axios
- Always handle loading, error, and abort states.
- Use `AbortController` to cancel in-flight requests on unmount.

### API Layer Abstraction
```ts
// lib/api.ts
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const userAPI = {
  getAll: () => api.get<User[]>('/users'),
  getById: (id: string) => api.get<User>(`/users/${id}`),
  // ...
};
```

---

## 🧪 Testing Standards

### Tools
- **Jest** + **React Testing Library** for unit/integration tests.
- **MSW (Mock Service Worker)** for API mocking.
- **Cypress** / **Playwright** for E2E tests.

### Test File Structure
```tsx
// Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', () => {
    const mockFn = jest.fn();
    render(<Button onClick={mockFn}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Testing Custom Hooks
```ts
// useCounter.test.ts
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

test('increments count', () => {
  const { result } = renderHook(() => useCounter());
  act(() => { result.current.increment(); });
  expect(result.current.count).toBe(1);
});
```

---

## ⚡ Performance Optimization Checklist

### Component Level
- ✅ Use `React.memo()` for pure components that re-render frequently with same props.
- ✅ Use `useCallback` for functions passed as props to memoized children.
- ✅ Use `useMemo` for expensive calculations or object/array creations used in dependency arrays.
- ✅ Avoid inline object/array creation in render for dependency arrays.

### Code Splitting
```tsx
// Lazy load heavy components/routes
const Dashboard = React.lazy(() => import('./features/dashboard/Dashboard'));

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Dashboard />
    </Suspense>
  );
}
```

### Virtualization for Long Lists
- Use `react-window` or `react-virtualized` for lists >100 items.

### Image Optimization
- Use `loading="lazy"` for below-fold images.
- Implement responsive images with `srcSet`.

### Bundle Analysis
- Use `source-map-explorer` or `webpack-bundle-analyzer` to identify large dependencies.

---

## 🛠️ Development Workflow & Tooling

### ESLint + Prettier Configuration
```json
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  plugins: ['react', '@typescript-eslint', 'react-hooks'],
  rules: {
    'react/react-in-jsx-scope': 'off', // React 17+
    'react/prop-types': 'off', // Using TypeScript
    '@typescript-eslint/explicit-module-boundary-types': 'warn',
  },
  settings: {
    react: { version: '17' }
  }
};
```

### Git Hooks (Husky + lint-staged)
```json
// package.json
{
  "lint-staged": {
    "src/**/*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "src/**/*.{css,md,json}": [
      "prettier --write"
    ]
  }
}
```

### Commit Convention (Conventional Commits)
```
feat(auth): add password strength meter
fix(button): resolve focus ring on Safari
docs(readme): update installation steps
refactor(utils): extract date helpers to separate module
test(login): add validation edge cases
```

---

## 🌐 Routing (React Router v6)

### File-Based Routing Pattern (If Using Framework)
```
src/
├── routes/
│   ├── index.tsx              # /
│   ├── login/
│   │   └── index.tsx          # /login
│   ├── dashboard/
│   │   ├── index.tsx          # /dashboard
│   │   ├── settings.tsx       # /dashboard/settings
│   │   └── layout.tsx         # Shared layout
│   └── *.tsx                  # 404
```

### Manual Route Configuration
```tsx
// App.tsx
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';

function DashboardLayout() {
  return (
    <div className="dashboard">
      <Sidebar />
      <main><Outlet /></main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/dashboard/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 📦 Build & Deployment

### Environment Variables
- Prefix with `VITE_` (Vite) or `REACT_APP_` (CRA).
- Validate required vars at build time.
```ts
// lib/config.ts
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_URL,
  isProd: import.meta.env.PROD,
} as const;

// Validate
if (!config.apiBaseUrl) {
  throw new Error('VITE_API_URL is required');
}
```

### Build Optimization
- Enable gzip/brotli compression on server.
- Use `splitChunks` (Webpack) or `manualChunks` (Vite) for vendor splitting.
- Preload critical resources with `<link rel="preload">`.

### Deployment Checklist
- [ ] Build succeeds with `--mode production`
- [ ] All environment variables are set
- [ ] Source maps are uploaded to error tracking (Sentry)
- [ ] Bundle size is within budget
- [ ] Lighthouse score meets targets (PWA, a11y, performance)

---

## 🤝 Collaboration & Documentation

### Component Documentation (Storybook / Docz)
```tsx
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
  title: 'UI/Button',
  argTypes: {
    variant: { control: 'radio', options: ['primary', 'secondary'] },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Click me',
    onClick: () => alert('Clicked!'),
  },
};
```

### README Standards for Features/Components
```md
## LoginForm

### Props
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `onSuccess` | `(user: User) => void` | Yes | Callback on successful login |
| `onError` | `(error: Error) => void` | No | Error handler |

### Usage
```tsx
<LoginForm
  onSuccess={(user) => navigate('/dashboard')}
  onError={(err) => toast.error(err.message)}
/>
```

### Dependencies
- `react-hook-form` for form state
- `zod` for schema validation
```

---

## 🚨 Common Pitfalls & Solutions

| Pitfall | Solution |
|---------|----------|
| **Prop drilling** | Use Context or state management library for deeply nested props |
| **Memory leaks** | Always clean up subscriptions, intervals, and abort fetches in `useEffect` cleanup |
| **Stale closures** | Include all dependencies in `useEffect`/`useCallback` arrays; use functional updates for state |
| **Unnecessary re-renders** | Use `React.memo`, `useCallback`, `useMemo` judiciously; profile with React DevTools |
| **Large bundle size** | Code split routes/components; audit dependencies; use dynamic imports for heavy libs |
| **TypeScript `any` overuse** | Define proper interfaces; use `unknown` + type guards for external data |

---

## ✅ Quick Reference: React 17 Do's and Don'ts

### ✅ DO
- Use the new JSX transform (no `import React` for JSX-only files).
- Structure projects by feature/domain for scalability.
- Type all props, state, and API responses with TypeScript.
- Extract reusable logic into custom hooks.
- Test components with React Testing Library (user-centric queries).
- Lazy load routes and heavy components.
- Use `React.memo` and `useCallback` only when profiling shows benefit.

### ❌ DON'T
- Don't use class components for new code.
- Don't put all state in a single global store (favor local + scoped global).
- Don't ignore the dependency array in hooks—use the exhaustive-deps ESLint rule.
- Don't inline large objects/arrays in `useEffect` dependencies.
- Don't forget to handle loading and error states in async operations.
- Don't ship unminified source maps to production (use error tracking instead).

---

## 🎯 Example: Generating a New Feature

When asked to create a new feature (e.g., "Add a user profile page"), follow this workflow:

1.  **Plan Structure**:
    ```
    src/features/profile/
    ├── components/
    │   ├── ProfileForm.tsx
    │   ├── ProfileHeader.tsx
    │   └── index.ts
    ├── hooks/
    │   ├── useProfile.ts
    │   └── index.ts
    ├── types.ts
    ├── constants.ts
    └── index.ts
    ```

2.  **Define Types First**:
    ```ts
    // features/profile/types.ts
    export interface UserProfile {
      id: string;
      name: string;
      email: string;
      avatar?: string;
      bio?: string;
    }

    export type ProfileFormValues = Pick<UserProfile, 'name' | 'email' | 'bio'>;
    ```

3.  **Create Hook for Data Logic**:
    ```ts
    // features/profile/hooks/useProfile.ts
    export function useProfile(userId: string) {
      const { data, isLoading, error } = useQuery({
        queryKey: ['profile', userId],
        queryFn: () => userAPI.getById(userId),
      });

      const updateProfile = useMutation({
        mutationFn: (values: ProfileFormValues) =>
          userAPI.update(userId, values),
        onSuccess: () => queryClient.invalidateQueries(['profile', userId]),
      });

      return { profile: data, isLoading, error, updateProfile };
    }
    ```

4.  **Build Composable Components**:
    ```tsx
    // features/profile/components/ProfileForm.tsx
    export const ProfileForm = ({
      initialData,
      onSubmit
    }: ProfileFormProps) => {
      const { register, handleSubmit, formState: { errors } } = useForm<ProfileFormValues>({
        defaultValues: initialData,
        resolver: zodResolver(profileSchema),
      });

      return (
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <Input label="Name" {...register('name')} error={errors.name?.message} />
          <TextArea label="Bio" {...register('bio')} />
          <Button type="submit" disabled={formState.isSubmitting}>
            Save Changes
          </Button>
        </form>
      );
    };
    ```

5.  **Add Tests & Stories**:
    - Write unit tests for `useProfile` hook.
    - Create Storybook stories for `ProfileForm` with different states.

6.  **Export via Barrel**:
    ```ts
    // features/profile/index.ts
    export { ProfilePage } from './ProfilePage';
    export { useProfile } from './hooks';
    export type { UserProfile, ProfileFormValues } from './types';
    ```

---

> 💡 **Pro Tip**: When in doubt, ask: *"Will this pattern scale to 50+ components? Is it testable? Is the intent clear to a new team member?"* If not, refactor.

This skill set equips you to generate production-ready, maintainable React 17 code that follows industry best practices. Always adapt conventions to team consensus and project constraints.
