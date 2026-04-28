# Dependabot Security Audit #3 — Moderate-Severity Dependency Vulnerabilities

> **Project:** qcm-med  
> **Branch:** main  
> **Scan date:** 2026-03-30  
> **Scanner:** GitHub Dependabot  
> **Alerts:** 11 Moderate-severity findings across 6 packages  
> **Affected manifests:** `db-interface/package-lock.json`, `react-native-med-app/package-lock.json`

---

## Executive Summary

This audit covers the **11 Moderate-severity** Dependabot alerts. While individually less critical than the High-severity findings in Audit #2, several of these — particularly the Next.js request smuggling and undici injection flaws — represent **real attack vectors** against the production `db-interface` application.

### Risk Heat Map

| Package | Installed Version | # Alerts | Vulnerability Class | Severity | Fix Available |
|---------|-------------------|----------|---------------------|----------|---------------|
| `next` | 14.2.35 | **3** | Image cache DoS, request smuggling, Image Optimizer DoS | 🟡 Moderate | ⚠️ EOL — migrate to 15.x+ |
| `picomatch` | 2.3.1 / 3.0.1 / 4.0.3 | **4** | Method injection via POSIX classes | 🟡 Moderate | ✅ 2.3.2 / 3.0.2 / 4.0.4 |
| `undici` | 6.23.0 | **2** | HTTP smuggling, CRLF injection | 🟡 Moderate | ✅ 6.24.0 |
| `brace-expansion` | 2.0.2 | **1** | Process hang via zero-step sequence | 🟡 Moderate | ✅ 2.0.3 |
| `ajv` | 6.12.6 / 8.12.0 / 8.17.1 | **1** | ReDoS via `$data` option | 🟡 Moderate | ✅ 6.14.0 / 8.18.0 |

**Bottom line:** 8 of 11 alerts resolve with simple version bumps. The 3 Next.js alerts require **major version migration** (14 → 15+) since v14 is end-of-life with no planned patches.

---

## Vulnerability Group A — HTTP Protocol Exploits

### Alert #47 — Next.js HTTP Request Smuggling in Rewrites
#### `db-interface/package-lock.json` — CVE-2026-29057

| Field | Value |
|-------|-------|
| **Installed version** | 14.2.35 |
| **Fixed version** | ⚠️ **15.5.13+ / 16.1.7+** (no v14 patch) |
| **Scope** | Direct dependency |
| **CVSS** | Moderate |

#### What's the vulnerability?

When Next.js is configured to rewrite traffic to an external backend, an attacker can send a crafted `DELETE` or `OPTIONS` request using `Transfer-Encoding: chunked`. This creates a **request boundary disagreement** between the Next.js proxy and the backend server.

```http
DELETE /api/rewritten-route HTTP/1.1
Host: target.example.com
Transfer-Encoding: chunked

0

GET /admin/internal-endpoint HTTP/1.1
Host: target.example.com
```

The Next.js proxy treats this as one request; the backend server sees **two**. The second "smuggled" request bypasses ACLs and hits internal endpoints directly.

#### Risk Assessment

- **Exploitability:** Requires that `db-interface` has rewrite rules pointing to an external backend. If all routes stay internal, the attack surface is reduced.
- **Impact:** ACL bypass, cache poisoning, credential hijacking via smuggled requests to internal endpoints.
- **Hosting note:** Applications hosted on Vercel are **not affected** — Vercel handles rewrites at the CDN level. Self-hosted deployments ARE vulnerable.
- **Verdict:** **Real vulnerability if self-hosted with rewrites.**

#### Remediation

**Short-term:**
```js
// middleware.ts — block chunked DELETE/OPTIONS on rewrite routes
import { NextResponse } from 'next/server';

export function middleware(request) {
  const method = request.method;
  const te = request.headers.get('transfer-encoding');
  
  if ((method === 'DELETE' || method === 'OPTIONS') && te?.includes('chunked')) {
    return new NextResponse('Bad Request', { status: 400 });
  }
  return NextResponse.next();
}
```

**Long-term:** Migrate to Next.js 15.5.13+.

---

### Alert #40 — Undici HTTP Request/Response Smuggling
#### `react-native-med-app/package-lock.json` — CVE-2026-1525

| Field | Value |
|-------|-------|
| **Installed version** | 6.23.0 |
| **Fixed version** | **≥ 6.24.0** |
| **Dependency chain** | `expo-router` → `@expo/server` → `undici` |

#### What's the vulnerability?

When HTTP headers are provided as an array with case-variant names (e.g., `Content-Length` and `content-length`), `undici` creates a malformed HTTP/1.1 request with **duplicate, conflicting `Content-Length` headers**. If an intermediary proxy and the backend interpret these inconsistently, an attacker can perform request smuggling.

```js
// Exploitable pattern:
fetch('http://backend.internal', {
  method: 'POST',
  headers: [
    ['Content-Length', '10'],
    ['content-length', '50']  // ← case-variant duplicate
  ],
  body: payload
});
```

#### Risk Assessment

- **Scope:** Used by `@expo/server` in the Expo development server. In production, `undici` is not directly user-facing in the React Native app.
- **Exploitability:** Requires attacker control over header arrays passed to `undici`. Low likelihood in current codebase.
- **Verdict:** **Real vulnerability, low practical risk in current usage.** Fix via version bump.

#### Remediation

```bash
npm update undici
# OR override:
{ "overrides": { "undici": ">=6.24.0" } }
```

---

### Alert #41 — Undici CRLF Injection via `upgrade` Option
#### `react-native-med-app/package-lock.json` — CVE-2026-1527

| Field | Value |
|-------|-------|
| **Installed version** | 6.23.0 |
| **Fixed version** | **≥ 6.24.0** |
| **Dependency chain** | `expo-router` → `@expo/server` → `undici` |

#### What's the vulnerability?

The `upgrade` option in `client.request()` does not validate for CRLF characters (`\r\n`). An attacker who can control this input can inject arbitrary HTTP headers or terminate the request prematurely.

```js
// Attack vector:
client.request({
  method: 'GET',
  path: '/endpoint',
  upgrade: 'websocket\r\nX-Injected-Header: malicious\r\n\r\nGET /admin HTTP/1.1'
});
```

This enables:
- **Header injection:** Add arbitrary headers to outgoing requests
- **Request smuggling:** Terminate the current request and start a new one
- **Data exfiltration:** Redirect responses to attacker-controlled endpoints

#### Risk Assessment

- **Scope:** Same as #40 — `undici` is used by Expo's server component.
- **Exploitability:** Requires attacker control over the `upgrade` option value. Unlikely in current codebase unless user input flows unsanitized into WebSocket upgrade requests.
- **Verdict:** **Real vulnerability, low practical risk.** Same fix as #40.

#### Remediation

Same as Alert #40 — upgrading `undici` to ≥ 6.24.0 fixes both #40 and #41.

---

## Vulnerability Group B — Denial of Service (Next.js)

### Alert #52 — Unbounded `next/image` Disk Cache Exhaustion
#### `db-interface/package-lock.json` — CVE-2026-27980

| Field | Value |
|-------|-------|
| **Installed version** | 14.2.35 |
| **Fixed version** | ⚠️ **16.1.7+** (no v14 patch) |
| **Scope** | Direct dependency |

#### What's the vulnerability?

The `/_next/image` endpoint optimizes images on-the-fly and caches results to disk. The cache has **no upper bound** and **no eviction policy**. An attacker can exhaust disk space by requesting many unique image optimization variants:

```
GET /_next/image?url=/photo.jpg&w=100&q=1
GET /_next/image?url=/photo.jpg&w=101&q=1
GET /_next/image?url=/photo.jpg&w=102&q=1
... (thousands of unique w/q combinations)
```

Each request generates a new cached file. Over time, this fills the server's disk.

#### Risk Assessment

- **Exploitability:** Trivial — requires only unauthenticated HTTP GET requests. No special tools needed.
- **Impact:** Disk exhaustion → application crash, potential data loss if disk is shared with database.
- **Verdict:** **Real, easily exploitable on self-hosted deployments.**

#### Remediation

**Short-term mitigations:**

1. **Periodic cache cleanup** (cron job):
```bash
# Clean image cache every 6 hours
0 */6 * * * rm -rf /path/to/app/.next/cache/images/*
```

2. **Restrict allowed image sizes** in `next.config.js`:
```js
module.exports = {
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200],  // limit to known sizes
    imageSizes: [16, 32, 48, 64, 96],
    formats: ['image/webp'],
    minimumCacheTTL: 60,
  }
}
```

3. **Rate limit** the `/_next/image` endpoint at the reverse proxy level.

**Long-term:** Migrate to Next.js 16.1.7+ which introduces `images.maximumDiskCacheSize` with automatic LRU eviction.

---

### Alert #5 — Image Optimizer DoS via `remotePatterns`
#### `db-interface/package-lock.json` — CVE-2025-59471

| Field | Value |
|-------|-------|
| **Installed version** | 14.2.35 |
| **Fixed version** | ⚠️ **15.5.10+ / 16.1.5+** (no v14 patch) |
| **Scope** | Direct dependency |

#### What's the vulnerability?

When `remotePatterns` is configured, the `/_next/image` endpoint loads external images **entirely into memory** before optimizing them. There is no maximum file size enforcement. An attacker can point the optimizer at an arbitrarily large image from an allowed domain:

```
GET /_next/image?url=https://allowed-domain.com/giant-100mb-image.png&w=1080&q=75
```

The server loads the full 100MB image into memory, triggering out-of-memory (OOM) crashes.

#### Risk Assessment

- **Exploitability:** Requires `remotePatterns` to be configured (check your `next.config.js`). If only local images are used, this is not exploitable.
- **Impact:** OOM crash → complete service outage.
- **Verdict:** **Real if remotePatterns is configured.** Check your config.

#### Remediation

**Short-term:**
```js
// next.config.js — tighten remotePatterns to only necessary domains
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'your-trusted-domain.com',
        pathname: '/images/**',
      }
      // Remove any overly broad patterns like { hostname: '**' }
    ],
  }
}
```

**Long-term:** Migrate to Next.js 15.5.10+ which adds `images.maximumResponseBody` config.

---

## Vulnerability Group C — Method Injection / Prototype Pollution

### Alerts #54, #55, #58, #60 — Picomatch POSIX Character Class Method Injection
#### CVE-2026-33672

| Field | Value |
|-------|-------|
| **Alerts** | #54 (react-native), #55 (db-interface, dev), #58 (db-interface, dev), #60 (react-native) |
| **Installed versions** | 2.3.1 (tailwindcss/chokidar), 3.0.1 (@expo/cli), 4.0.3 (tinyglobby) |
| **Fixed versions** | **2.3.2, 3.0.2, 4.0.4** |

#### What's the vulnerability?

The `POSIX_REGEX_SOURCE` object in `picomatch` inherits from `Object.prototype`. When a crafted POSIX bracket expression like `[[:constructor:]]` is used in a glob pattern, it resolves to the inherited `constructor` method on `Object.prototype`, which is then stringified and injected into the generated regular expression.

```js
const picomatch = require('picomatch');

// Attacker-controlled glob pattern:
const isMatch = picomatch('[[:constructor:]]');

// The generated regex contains the string representation of 
// Object.prototype.constructor, causing incorrect matching behavior
isMatch('malicious-file.js');  // ← may match when it shouldn't
```

This can lead to:
- **Incorrect glob matching:** Files that should be excluded/included are misclassified
- **Security logic bypass:** If picomatch is used for access control (e.g., file upload validation)

#### Risk Assessment

- **Alerts #55, #58 (db-interface, Development):** Used by `tailwindcss` → `micromatch` → `picomatch` and `eslint-import-resolver-typescript` → `tinyglobby` → `picomatch`. **No user input reaches these paths.** Dev-only risk.
- **Alerts #54, #60 (react-native):** Used by `@expo/cli`, `chokidar`, `tailwindcss`. **Build-time only**, no runtime exposure.
- **Verdict:** **Real vulnerability, low practical risk.** Glob patterns are developer-defined, not user-supplied. However, the fix is trivial — do it anyway.

#### Remediation

```bash
# In both workspaces:
npm update picomatch

# Override if needed:
{
  "overrides": {
    "picomatch": {
      "picomatch@>=2.0.0 <2.3.2": "2.3.2",
      "picomatch@>=3.0.0 <3.0.2": "3.0.2",
      "picomatch@>=4.0.0 <4.0.4": "4.0.4"
    }
  }
}
```

---

## Vulnerability Group D — Regular Expression Denial of Service

### Alert #19 — `ajv` ReDoS via `$data` Option
#### `react-native-med-app/package-lock.json` — CVE-2025-69873

| Field | Value |
|-------|-------|
| **Installed versions** | 6.12.6 (eslint), 8.12.0 (serve), 8.17.1 (expo-build-properties) |
| **Fixed versions** | **6.14.0, 8.18.0** |
| **Dependency chains** | `eslint` → `ajv`, `serve` → `ajv`, `expo-build-properties` → `ajv` |

#### What's the vulnerability?

When `ajv` is configured with `$data: true`, the `pattern` keyword can receive its value from a JSON Pointer (`$data` reference) pointing to user-controlled data. If an attacker supplies a malicious regex pattern through this mechanism, it triggers catastrophic backtracking:

```json
{
  "type": "object",
  "properties": {
    "userInput": { "type": "string" },
    "validationField": {
      "type": "string",
      "pattern": { "$data": "1/userInput" }
    }
  }
}
```

If `userInput` contains a ReDoS pattern like `(a+)+$`, validating a long string of `a`s will hang the process.

#### Risk Assessment

- **Scope:** `ajv` is used by ESLint (validation of config files), `serve` (CLI HTTP server), and `expo-build-properties` (build config validation).
- **Exploitability:** Requires that `$data: true` is enabled AND user input flows into `$data` references. In the current codebase, `ajv` validates developer-defined schemas, not user input. **Very low risk.**
- **Impact on v6.12.6:** ESLint's `ajv@6.12.6` is a devDependency and only processes `.eslintrc` files. **No runtime exposure.**
- **Verdict:** **Real vulnerability, negligible practical risk** in current usage. Fix is easy.

#### Remediation

```bash
npm update ajv

# Override:
{
  "overrides": {
    "ajv": {
      "ajv@>=6.0.0 <6.14.0": "6.14.0",
      "ajv@>=8.0.0 <8.18.0": "8.18.0"
    }
  }
}
```

---

## Vulnerability Group E — Process Hang / Memory Exhaustion

### Alert #65 — `brace-expansion` Zero-Step Sequence Hang
#### `react-native-med-app/package-lock.json` — CVE-2026-33750

| Field | Value |
|-------|-------|
| **Installed versions** | 1.1.12 (via minimatch@3.1.2), 2.0.2 (via minimatch@8/9) |
| **Fixed versions** | **1.1.13, 2.0.3** |
| **Dependency chains** | `minimatch` → `brace-expansion` (all instances) |

#### What's the vulnerability?

A brace pattern with a **zero-step value** causes an infinite loop in the sequence generator:

```js
const braceExpansion = require('brace-expansion');

// This hangs forever — the loop increments by 0, never reaching the end
braceExpansion('{1..100..0}');
// Expected: terminate or error
// Actual: infinite loop → memory exhaustion → process crash
```

The step value `0` in the range `{start..end..step}` means "increment by 0", so the loop runs forever, continuously allocating string results until memory is exhausted.

#### Risk Assessment

- **Scope:** `brace-expansion` is used by `minimatch` for glob pattern expansion. In the React Native app, it's used by Expo, ESLint, and build tools.
- **Exploitability:** Requires attacker control over brace patterns. Since patterns are developer-defined (in config files, not user input), **very low risk**.
- **Impact:** Process hang + memory exhaustion — effectively a DoS of the dev server or CI runner.
- **Verdict:** **Real vulnerability, very low practical risk.** Trivial fix.

#### Remediation

```bash
npm update brace-expansion

# Override:
{
  "overrides": {
    "brace-expansion": {
      "brace-expansion@>=1.0.0 <1.1.13": "1.1.13",
      "brace-expansion@>=2.0.0 <2.0.3": "2.0.3"
    }
  }
}
```

---

## Consolidated Remediation Plan

### Phase 1 — Quick Wins (< 15 minutes)

These version bumps resolve **8 of 11 alerts**:

```bash
# react-native-med-app — fixes undici, picomatch, ajv, brace-expansion
cd react-native-med-app

# Add overrides to package.json:
# {
#   "overrides": {
#     "undici": ">=6.24.0",
#     "picomatch": ">=2.3.2",
#     "ajv": ">=8.18.0",
#     "brace-expansion": ">=2.0.3"
#   }
# }

npm install
npm audit  # verify resolved
```

```bash
# db-interface — fixes picomatch
cd db-interface

# Add overrides to package.json:
# {
#   "overrides": {
#     "picomatch": ">=2.3.2"
#   }
# }

npm install
npm audit  # verify remaining = next.js only
```

### Phase 2 — Next.js Migration (2-4 hours)

All three Next.js alerts (#5, #47, #52) require migrating `db-interface` from v14 to v15.5.13+ or v16.1.7+. This is the **same migration** recommended in Security Audit #2 (Alert #7).

```bash
cd db-interface
npx @next/codemod upgrade latest
npm install
npm run build
npm run dev  # smoke test
```

**Combined Next.js alerts across all audits:**

| Audit | Alert # | CVE | Issue | Severity |
|-------|---------|-----|-------|----------|
| #2 | #7 | CVE-2026-23864 | RSC deserialization DoS | 🔴 High |
| #3 | #47 | CVE-2026-29057 | Request smuggling in rewrites | 🟡 Moderate |
| #3 | #52 | CVE-2026-27980 | Unbounded image cache | 🟡 Moderate |
| #3 | #5 | CVE-2025-59471 | Image Optimizer DoS | 🟡 Moderate |

**One migration fixes all four.** This should be prioritized.

### Phase 3 — Verification

```bash
cd react-native-med-app && npm audit
cd ../db-interface && npm audit
# Expected: 0 vulnerabilities
```

---

## Summary of All Alerts

| # | Package | CVE | Vulnerability | Workspace | Scope | Fix Version | Priority |
|---|---------|-----|---------------|-----------|-------|-------------|----------|
| 52 | next | CVE-2026-27980 | Unbounded `next/image` disk cache DoS | db-interface | Direct | 16.1.7+ | **Medium-High** |
| 47 | next | CVE-2026-29057 | HTTP request smuggling in rewrites | db-interface | Direct | 15.5.13+ | **Medium-High** |
| 5 | next | CVE-2025-59471 | Image Optimizer memory DoS | db-interface | Direct | 15.5.10+ | **Medium-High** |
| 40 | undici | CVE-2026-1525 | HTTP request smuggling | react-native | Transitive | 6.24.0 | Medium |
| 41 | undici | CVE-2026-1527 | CRLF injection via `upgrade` | react-native | Transitive | 6.24.0 | Medium |
| 60 | picomatch | CVE-2026-33672 | POSIX method injection | react-native | Transitive | 3.0.2 | Low |
| 58 | picomatch | CVE-2026-33672 | POSIX method injection | db-interface | Dev | 4.0.4 | Low |
| 55 | picomatch | CVE-2026-33672 | POSIX method injection | db-interface | Dev | 2.3.2 | Low |
| 54 | picomatch | CVE-2026-33672 | POSIX method injection | react-native | Transitive | 2.3.2 | Low |
| 65 | brace-expansion | CVE-2026-33750 | Zero-step infinite loop | react-native | Transitive | 2.0.3 | Low |
| 19 | ajv | CVE-2025-69873 | ReDoS via `$data` | react-native | Transitive | 8.18.0 | Low |

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Total alerts | 11 |
| Distinct CVEs | 7 |
| Medium-High priority | 3 (all Next.js — requires migration) |
| Medium priority | 2 (undici smuggling + CRLF) |
| Low priority | 6 (picomatch, brace-expansion, ajv) |
| Fixable via `npm audit fix` | 8 |
| Requires major migration | 3 (Next.js 14 → 15+) |

---

## Cross-Audit Summary (Audits #1 + #2 + #3)

| Audit | Scope | Total Alerts | Critical | High | Moderate |
|-------|-------|-------------|----------|------|----------|
| #1 (CodeQL) | Source code patterns | 5 | 1 | 4 | 0 |
| #2 (Dependabot) | High-severity deps | 25 | 4 | 8 | 0 |
| #3 (Dependabot) | Moderate-severity deps | 11 | 0 | 0 | 11 |
| **Total** | | **41** | **5** | **12** | **11** |

> **The single biggest bang-for-buck action is migrating `db-interface` from Next.js 14 to 15+.** This one change resolves **4 Dependabot alerts** (1 High + 3 Moderate) across Audits #2 and #3. Combined with `npm audit fix --force` in both workspaces, the project can go from 41 open findings to near-zero.
