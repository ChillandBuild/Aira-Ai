# Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password login with Supabase Auth so that only authenticated users can access the dashboard and all API routes.

**Architecture:** Next.js middleware intercepts every `/dashboard/*` request, checks the Supabase session cookie, and redirects unauthenticated users to `/login`. The frontend stores the session in cookies via `@supabase/ssr`. Every API call from the frontend sends the JWT as a `Bearer` token. The FastAPI backend validates that token with PyJWT using the Supabase JWT secret — a local operation with no network round-trip. Webhook routes (`/webhook/*`) are exempt from auth since Meta and Twilio call them directly.

**Tech Stack:** Next.js 14 App Router, `@supabase/ssr`, Supabase Auth, FastAPI, PyJWT, Python-dotenv.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/lib/supabase/client.ts` | Create | Browser-side Supabase client (anon key) |
| `frontend/lib/supabase/server.ts` | Create | Server-side Supabase client with cookie store |
| `frontend/app/(auth)/login/page.tsx` | Create | Login form UI |
| `frontend/app/(auth)/layout.tsx` | Create | Minimal layout without sidebar for auth pages |
| `frontend/middleware.ts` | Create | Route protection — redirect to /login if no session |
| `frontend/app/dashboard/layout.tsx` | Modify | Server-side session check + pass user to children |
| `frontend/components/sidebar.tsx` | Modify | Add logout button |
| `frontend/lib/api.ts` | Modify | Read session token from Supabase client, send as Bearer |
| `backend/requirements.txt` | Modify | Add PyJWT |
| `backend/app/config.py` | Modify | Add `supabase_jwt_secret` setting |
| `backend/app/dependencies/auth.py` | Create | `get_current_user` FastAPI dependency |
| `backend/app/main.py` | Modify | Apply auth dependency to all `/api/v1/*` routers |

---

## Task 1: Install packages

**Files:**
- Modify: `frontend/package.json` (via npm install)
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Install `@supabase/ssr` in frontend**

```bash
cd frontend && npm install @supabase/ssr
```

Expected: `@supabase/ssr` appears in `frontend/package.json` dependencies.

- [ ] **Step 2: Add PyJWT to backend requirements**

In `backend/requirements.txt`, add:

```
PyJWT==2.9.0
```

- [ ] **Step 3: Install Python dependency**

```bash
cd backend && pip install PyJWT==2.9.0
```

Expected: `Successfully installed PyJWT-2.9.0`

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json backend/requirements.txt
git commit -m "chore: add @supabase/ssr and PyJWT for auth"
```

---

## Task 2: Frontend Supabase clients

**Files:**
- Create: `frontend/lib/supabase/client.ts`
- Create: `frontend/lib/supabase/server.ts`

- [ ] **Step 1: Create browser client**

Create `frontend/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create server client**

Create `frontend/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component — middleware handles refresh
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Add env vars to frontend `.env.local`**

If `frontend/.env.local` doesn't exist, create it. Add:

```
NEXT_PUBLIC_SUPABASE_URL=<your Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your Supabase anon/public key>
```

Get these from: Supabase dashboard → Project Settings → API.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/supabase/ frontend/.env.local
git commit -m "feat(auth): add Supabase browser and server clients"
```

---

## Task 3: Login page

**Files:**
- Create: `frontend/app/(auth)/layout.tsx`
- Create: `frontend/app/(auth)/login/page.tsx`

- [ ] **Step 1: Create auth layout (no sidebar)**

Create `frontend/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create login page**

Create `frontend/app/(auth)/login/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="card rounded-3xl p-8">
        <h1 className="font-display text-xl font-bold text-ink mb-1">Aira AI</h1>
        <p className="font-body text-sm text-ink-muted mb-6">Sign in to your account</p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 font-body text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-body text-sm font-medium text-ink mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="font-body text-sm font-medium text-ink mb-1.5 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify page renders**

Start the dev server (`npm run dev` in `frontend/`) and visit `http://localhost:3000/login`. You should see the login form with email + password fields.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(auth\)/
git commit -m "feat(auth): add login page"
```

---

## Task 4: Next.js middleware — route protection

**Files:**
- Create: `frontend/middleware.ts`

- [ ] **Step 1: Create middleware**

Create `frontend/middleware.ts` at the root of the `frontend/` folder (same level as `app/`):

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
```

- [ ] **Step 2: Test protection**

1. Clear all cookies in your browser.
2. Visit `http://localhost:3000/dashboard`.
3. Expected: redirected to `/login`.
4. Sign in with valid Supabase credentials.
5. Expected: redirected to `/dashboard`.

- [ ] **Step 3: Commit**

```bash
git add frontend/middleware.ts
git commit -m "feat(auth): protect dashboard routes via Next.js middleware"
```

---

## Task 5: Logout button in sidebar

**Files:**
- Modify: `frontend/components/sidebar.tsx`

- [ ] **Step 1: Read current sidebar to find the bottom section**

Read `frontend/components/sidebar.tsx` and find where the nav items list ends (typically near the bottom of the sidebar).

- [ ] **Step 2: Add logout button**

Import the client and add a logout button at the bottom of the sidebar nav. Find the closing `</nav>` or the bottom of the sidebar `<div>` and add before it:

```tsx
// At top of file, add imports:
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

// Add this component inside or below the nav items:
function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-3 px-4 py-2.5 w-full rounded-xl text-on-surface-muted hover:bg-surface-low hover:text-on-surface transition-colors font-label text-sm font-medium"
    >
      <LogOut size={16} />
      Sign out
    </button>
  );
}
```

Add `<LogoutButton />` at the bottom of the sidebar, below all nav items, before the closing `</div>`.

Note: `"use client"` directive must be at the top of the sidebar file since it now uses `useRouter` and the Supabase browser client. If the sidebar is a Server Component, convert it by adding `"use client"` at line 1.

- [ ] **Step 3: Test logout**

1. Sign in and confirm you're on `/dashboard`.
2. Click "Sign out" in the sidebar.
3. Expected: redirected to `/login`, session cleared.
4. Try navigating to `/dashboard` — expected: redirected back to `/login`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/sidebar.tsx
git commit -m "feat(auth): add logout button to sidebar"
```

---

## Task 6: Frontend API calls carry auth token

**Files:**
- Modify: `frontend/lib/api.ts`

**Context:** Currently `api.ts` calls the backend with no auth header. The backend will soon require a `Bearer` token on all `/api/v1/*` requests. This task makes every API call send the Supabase access token.

- [ ] **Step 1: Read the current fetch utility in api.ts**

Open `frontend/lib/api.ts`. Find how API calls are made — look for a base `fetch` wrapper or direct `fetch` calls with `API_URL`.

- [ ] **Step 2: Add a token helper and update the fetch wrapper**

At the top of `api.ts`, add:

```typescript
import { createClient } from "@/lib/supabase/client";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}
```

Then find the main fetch function (likely something like `apiFetch` or inline `fetch` calls) and update it to merge auth headers:

```typescript
async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}
```

If `api.ts` uses multiple different fetch patterns, update each one to include `authHeaders`.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(auth): send Bearer token on all API requests"
```

---

## Task 7: Backend — add JWT secret to config

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/.env` (or equivalent env file)

- [ ] **Step 1: Read current config.py**

Open `backend/app/config.py` and find the `Settings` class.

- [ ] **Step 2: Add JWT secret field**

Add to the `Settings` class:

```python
supabase_jwt_secret: str = ""
```

- [ ] **Step 3: Add the secret to `.env`**

Get your JWT secret from: Supabase dashboard → Project Settings → API → JWT Secret.

Add to `backend/.env`:

```
SUPABASE_JWT_SECRET=<your-jwt-secret>
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py
git commit -m "feat(auth): add supabase_jwt_secret to config"
```

---

## Task 8: Backend auth dependency

**Files:**
- Create: `backend/app/dependencies/__init__.py`
- Create: `backend/app/dependencies/auth.py`

- [ ] **Step 1: Create the dependencies package**

```bash
mkdir -p backend/app/dependencies
touch backend/app/dependencies/__init__.py
```

- [ ] **Step 2: Create auth.py**

Create `backend/app/dependencies/auth.py`:

```python
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

from app.config import settings

logger = logging.getLogger(__name__)
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return {"user_id": payload["sub"], "email": payload.get("email", "")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
```

- [ ] **Step 3: Manual test — verify dependency works**

Start the backend (`uvicorn app.main:app --reload` from `backend/`). Try calling a protected endpoint without a token:

```bash
curl -s http://localhost:8000/api/v1/leads | python3 -m json.tool
```

This should still work (auth not applied to routes yet — that's Task 9). We're just verifying the file imports without errors.

Expected: leads return normally (no crash on import).

- [ ] **Step 4: Commit**

```bash
git add backend/app/dependencies/
git commit -m "feat(auth): add JWT verification dependency"
```

---

## Task 9: Apply auth dependency to all API routes

**Files:**
- Modify: `backend/app/main.py`

**Context:** FastAPI allows adding a `dependencies` list to `include_router`. Adding `Depends(get_current_user)` there protects every route in that router with a single line change. Webhook routes (`/webhook/whatsapp`) must NOT be protected — Meta and Twilio call them directly without our JWT.

- [ ] **Step 1: Update main.py imports**

In `backend/app/main.py`, add at the top:

```python
from fastapi import Depends
from app.dependencies.auth import get_current_user
```

- [ ] **Step 2: Add dependency to all API routers**

Find every `app.include_router(...)` call that starts with `/api/v1/` and add `dependencies=[Depends(get_current_user)]`. The webhook router must NOT get this dependency.

Replace all `/api/v1/` router registrations with:

```python
_auth = [Depends(get_current_user)]

app.include_router(leads.router, prefix="/api/v1/leads", tags=["leads"], dependencies=_auth)
app.include_router(messages.router, prefix="/api/v1/messages", tags=["messages"], dependencies=_auth)
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"], dependencies=_auth)
app.include_router(upload.router, prefix="/api/v1/upload", tags=["upload"], dependencies=_auth)
app.include_router(segments.router, prefix="/api/v1/segments", tags=["segments"], dependencies=_auth)
app.include_router(calls.router, prefix="/api/v1/calls", tags=["calls"], dependencies=_auth)
app.include_router(callers.router, prefix="/api/v1/callers", tags=["callers"], dependencies=_auth)
app.include_router(ai_tune.router, prefix="/api/v1/ai-tune", tags=["ai-tune"], dependencies=_auth)
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["knowledge"], dependencies=_auth)
app.include_router(system.router, prefix="/api/v1/system", tags=["system"], dependencies=_auth)
app.include_router(follow_ups.router, prefix="/api/v1/follow-ups", tags=["follow-ups"], dependencies=_auth)
app.include_router(numbers.router, prefix="/api/v1/numbers", tags=["numbers"], dependencies=_auth)
app.include_router(incidents.router, prefix="/api/v1/incidents", tags=["incidents"], dependencies=_auth)
app.include_router(lead_notes.router, prefix="/api/v1/lead-notes", tags=["lead-notes"], dependencies=_auth)
app.include_router(voice_numbers.router, prefix="/api/v1/voice-numbers", tags=["voice-numbers"], dependencies=_auth)
app.include_router(app_settings.router, prefix="/api/v1/settings", tags=["settings"], dependencies=_auth)
app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"], dependencies=_auth)
```

Keep the webhook router as-is (no `dependencies=_auth`):

```python
app.include_router(webhook.router, prefix="/webhook/whatsapp", tags=["webhook"])
```

- [ ] **Step 3: Test — unauthenticated request is rejected**

```bash
curl -s http://localhost:8000/api/v1/leads | python3 -m json.tool
```

Expected:
```json
{"detail": "Not authenticated"}
```

- [ ] **Step 4: Test — authenticated request succeeds**

Get a valid token by signing in via the frontend login page, then opening DevTools → Application → Local Storage → find the Supabase token (key like `sb-<project-ref>-auth-token`). Extract `access_token`.

```bash
curl -s -H "Authorization: Bearer <access_token>" http://localhost:8000/api/v1/leads | python3 -m json.tool
```

Expected: leads array returned (not a 401).

- [ ] **Step 5: Test — webhook is still unprotected (Meta needs this)**

```bash
curl -s -X GET "http://localhost:8000/webhook/whatsapp?hub.mode=subscribe&hub.challenge=test&hub.verify_token=wrong"
```

Expected: `Forbidden` (from Meta verification logic) — NOT a 401. This confirms the webhook is exempt from JWT auth.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(auth): apply JWT auth dependency to all API routes"
```

---

## Task 10: End-to-end smoke test

- [ ] **Step 1: Full flow test**

1. Start backend (`uvicorn app.main:app --reload` from `backend/`)
2. Start frontend (`npm run dev` from `frontend/`)
3. Visit `http://localhost:3000` → should redirect to `/login`
4. Enter valid Supabase credentials → should redirect to `/dashboard/leads`
5. All dashboard pages should load data normally (no 401 errors in browser console)
6. Click "Sign out" → should redirect to `/login`
7. Visit `http://localhost:3000/dashboard` directly → should redirect to `/login`

- [ ] **Step 2: Create a test user in Supabase (if you don't have one)**

In Supabase dashboard → Authentication → Users → "Add user" → enter email + password.

Or via Supabase CLI:
```bash
# Not needed if you can create via dashboard
```

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(auth): smoke test fixes"
```

---

## Self-Review

**Spec coverage (Roadmap 0.1):**
- Email/password signup + login ✅ Task 3 (login) — signup can be added via Supabase dashboard for now
- Password reset flow ⚠️ Not included — Supabase has a hosted password reset flow; add `/forgot-password` page later
- Session management (HttpOnly cookies) ✅ Task 4 — `@supabase/ssr` uses HttpOnly cookies
- Brute-force protection ⚠️ Not included — Supabase Auth has built-in rate limiting
- Logout ✅ Task 5
- Auth on all API routes ✅ Task 9

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `createClient()` used consistently from `@/lib/supabase/client` (browser) and `@/lib/supabase/server` (server)
- `get_current_user` returns `dict` with `user_id` and `email` — consistent across Tasks 8 and 9
- `_auth` list defined once in Task 9 and reused for all routers
