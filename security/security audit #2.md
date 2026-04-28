# Dependabot Security Audit #2 — Dependency Vulnerability Report

> **Project:** qcm-med  
> **Branch:** main  
> **Scan date:** 2026-03-30  
> **Scanner:** GitHub Dependabot  
> **Alerts:** 25 High-severity findings across 7 packages  
> **Affected manifests:** `db-interface/package-lock.json`, `react-native-med-app/package-lock.json`

---

## Executive Summary

This audit covers **25 Dependabot alerts** triggered by vulnerable transitive dependencies in the project's two npm workspaces. Unlike Security Audit #1 (which addressed CodeQL source-code findings), these are all **supply-chain vulnerabilities** — the risk lives in third-party packages, not in our own code.

### Risk Heat Map

| Package | Installed Version | # Alerts | Vulnerability Class | Severity | Fix Available |
|---------|-------------------|----------|---------------------|----------|---------------|
| `minimatch` | 3.1.2 / 8.0.4 / 9.0.5 | **8** | ReDoS (3 distinct CVEs) | 🔴 High | ✅ 3.1.3 / 8.0.6 / 9.0.7 |
| `node-forge` | 1.3.3 | **4** | Signature forgery, DoS, cert bypass | 🔴 High | ✅ 1.4.0 |
| `undici` | 6.23.0 | **4** | WebSocket DoS (3 distinct CVEs) | 🔴 High | ✅ 6.24.0 |
| `tar` (node-tar) | 7.5.6 | **3** | Hardlink/symlink path traversal | 🔴 High | ✅ 7.5.11 |
| `flatted` | 3.3.3 | **2** | Prototype pollution via `parse()` | 🔴 High | ✅ 3.4.2 |
| `picomatch` | 2.3.1 / 3.0.1 | **2** | ReDoS via extglob quantifiers | 🔴 High | ✅ 2.3.2 / 3.0.2 |
| `next` | 14.2.35 | **1** | HTTP deserialization DoS (RSC) | 🔴 High | ⚠️ EOL — migrate to 15.x+ |

**Bottom line:** 24 of 25 alerts can be resolved by running `npm audit fix --force` or targeted version bumps. The Next.js alert requires a **major version migration** (14 → 15+) since v14 is end-of-life.

---

## Vulnerability Group A — Prototype Pollution

### `flatted` — CVE-2026-33228

| Field | Value |
|-------|-------|
| **Alerts** | #48, #49 |
| **Affected files** | `react-native-med-app/package-lock.json`, `db-interface/package-lock.json` |
| **Installed version** | 3.3.3 |
| **Fixed version** | **≥ 3.4.2** |
| **Dependency chain** | `eslint` → `file-entry-cache` → `flat-cache` → `flatted` |
| **Scope** | Development dependency |

#### What's the vulnerability?

The `parse()` function in `flatted` (a circular-JSON library) fails to validate that string keys used for array indexing represent valid integers. An attacker can craft a JSON string containing the key `__proto__`, causing `flatted` to resolve the reference to `Array.prototype`. This allows **global prototype pollution** — any subsequent code reading default object properties gets the attacker's injected values.

```js
// Attack payload example
const malicious = flatted.parse('[[{"__proto__":1}],{"polluted":"true"}]');
// After this: ({}).polluted === "true"  ← global pollution
```

#### Risk Assessment

- **Scope:** Development-only (used by ESLint's `flat-cache`). Not shipped to production.
- **Exploitability:** Low — requires attacker control over ESLint cache files.
- **Impact if exploited:** Code execution during development/CI builds.
- **Verdict:** **Real vulnerability, low practical risk** due to dev-only scope. Still must be fixed.

#### Remediation

```bash
# In both db-interface/ and react-native-med-app/
npm update flat-cache
# OR force-resolve flatted
npm install flatted@latest
```

If `flat-cache` pins an old `flatted`, add an override to `package.json`:

```json
{
  "overrides": {
    "flatted": ">=3.4.2"
  }
}
```

---

## Vulnerability Group B — Regular Expression Denial of Service (ReDoS)

### `minimatch` — CVE-2026-26996, CVE-2026-27903, CVE-2026-27904

| Field | Value |
|-------|-------|
| **Alerts** | #23, #26, #29, #30, #31, #33, #34, #35, #36 |
| **Affected files** | `react-native-med-app/package-lock.json`, `db-interface/package-lock.json` |
| **Installed versions** | 3.1.2, 8.0.4, 9.0.5 |
| **Fixed versions** | **3.1.3, 8.0.6, 9.0.7** (respectively) |

#### Three distinct ReDoS attack vectors

**1. CVE-2026-26996 — Repeated wildcards with non-matching literal**

```
Pattern:  "**********x"
Input:    "aaaaaaaaaaaaaaaaaaaaaaaaaaaa"
Result:   O(2^n) backtracking — event loop hangs
```

The regex generated for patterns with many consecutive `*` wildcards followed by a literal char creates catastrophic backtracking when the literal doesn't appear in the input.

**2. CVE-2026-27903 — GLOBSTAR combinatorial backtracking**

```
Pattern:  "a/**/b/**/c/**/d"
Input:    "a/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/x/e"
Result:   matchOne() tries all possible splits — O(n^k) where k = number of ** segments
```

Multiple non-adjacent `**` (GLOBSTAR) segments cause the `matchOne()` function to explore exponentially many path-splitting combinations.

**3. CVE-2026-27904 — Nested extglob quantifiers**

```
Pattern:  "+(+(+(+(+(+(*())))))"
Input:    "aaaaaaaaaa!"
Result:   Nested unbounded quantifiers → catastrophic backtracking
```

Nested `*()` and `+()` extglobs compile to regex with nested unbounded quantifiers — classic ReDoS.

#### Risk Assessment

- **Development alerts (#29, #30, #35):** `minimatch` used by ESLint, glob, and build tools. Exploitable only if a developer/CI runs glob patterns from untrusted sources. **Low practical risk.**
- **Runtime alerts (#23, #26, #31, #33, #34, #36):** `minimatch` used by `react-native` build chain, `serve`, `expo`. Primarily build-time, not user-facing runtime. **Medium risk** — could slow CI/CD pipelines.
- **Verdict:** All are **real vulnerabilities**. In current usage, minimatch only processes developer-defined patterns, not user input. Risk is primarily to build infrastructure.

#### Remediation

```bash
# In react-native-med-app/
npm update minimatch

# If transitive deps pin old versions, override:
# package.json
{
  "overrides": {
    "minimatch": {
      "minimatch@<3.1.3": "3.1.3",
      "minimatch@>=8.0.0 <8.0.6": "8.0.6",
      "minimatch@>=9.0.0 <9.0.7": "9.0.7"
    }
  }
}
```

---

### `picomatch` — CVE-2026-33671

| Field | Value |
|-------|-------|
| **Alerts** | #53, #59 |
| **Affected file** | `react-native-med-app/package-lock.json` |
| **Installed versions** | 2.3.1 (via chokidar, micromatch, anymatch), 3.0.1 (via @expo/cli) |
| **Fixed versions** | **2.3.2, 3.0.2** |

#### What's the vulnerability?

Crafted extglob patterns like `+(a|aa)` or `+(+(a))` compile to regular expressions with nested quantifiers that trigger catastrophic backtracking on non-matching input.

```
Pattern:  "+(a|aa)"
Input:    "aaaaaaaaaaaaaaaaab"
Result:   Event loop blocked for minutes
```

#### Risk Assessment

- **Used by:** `chokidar` (file watching), `micromatch` (glob matching in tailwindcss), `readdirp`, `@expo/cli`
- **Exploitability:** Requires attacker control over glob patterns — unlikely in normal usage.
- **Verdict:** **Real vulnerability, low practical risk.** The globs are developer-defined, not user-supplied.

#### Remediation

```bash
npm update picomatch

# Override if needed:
{
  "overrides": {
    "picomatch": {
      "picomatch@>=2.0.0 <2.3.2": "2.3.2",
      "picomatch@>=3.0.0 <3.0.2": "3.0.2"
    }
  }
}
```

---

## Vulnerability Group C — Path Traversal via Archive Extraction

### `tar` (node-tar) — CVE-2026-24842, CVE-2026-23745, GHSA-9ppj-qmqm-q256

| Field | Value |
|-------|-------|
| **Alerts** | #6, #14, #37, #38 |
| **Affected file** | `react-native-med-app/package-lock.json` |
| **Installed version** | 7.5.6 |
| **Fixed version** | **≥ 7.5.11** |
| **Dependency chain** | `expo` → `@expo/cli` → `tar` |

#### Three distinct path traversal vectors

**1. CVE-2026-23745 — Hardlink path traversal via insufficient linkpath sanitization**

When `preservePaths: false` (the default), versions ≤ 7.5.2 failed to sanitize the `linkpath` of hardlink entries. A malicious `.tar` archive could include a hardlink entry with an absolute `linkpath` pointing outside the extraction directory, enabling **arbitrary file overwrite**.

**2. CVE-2026-24842 — Hardlink target escape through symlink chain**

The security check for hardlink entries used different path resolution semantics than the actual `link()` system call. By combining a symlink that points to an ancestor directory with a hardlink that traverses through it, an attacker could create hardlinks to arbitrary files on disk.

**3. GHSA-9ppj-qmqm-q256 — Symlink path traversal via drive-relative linkpath**

On Windows, a symlink target like `C:../../../target.txt` (drive-relative path) bypassed the escape check because validation ran before stripping the drive prefix. This allowed creating symlinks pointing outside the extraction directory.

#### Risk Assessment

- **Scope:** Used by Expo CLI for downloading and extracting SDK templates/packages.
- **Exploitability:** Requires a compromised npm registry or MITM attack to serve malicious tarballs. **Medium risk** — supply-chain attacks are a documented threat vector.
- **Impact:** Arbitrary file read/write on developer machines and CI runners. Could lead to code injection in builds.
- **Verdict:** **Real, serious vulnerabilities.** Especially dangerous on Windows (#38).

#### Remediation

```bash
# In react-native-med-app/
npm update tar

# Override:
{
  "overrides": {
    "tar": ">=7.5.11"
  }
}
```

---

## Vulnerability Group D — WebSocket Protocol Exploits

### `undici` — CVE-2026-1526 + 2 additional CVEs

| Field | Value |
|-------|-------|
| **Alerts** | #39, #42, #43 |
| **Affected file** | `react-native-med-app/package-lock.json` |
| **Installed version** | 6.23.0 |
| **Fixed version** | **≥ 6.24.0** |
| **Dependency chain** | `expo-router` → `@expo/server` → `undici` |

#### Three distinct WebSocket attack vectors

**1. CVE-2026-1526 — Unbounded memory consumption via permessage-deflate decompression bomb**

The WebSocket client does not enforce size limits when decompressing `permessage-deflate` frames. A malicious server can send a tiny compressed frame that expands to gigabytes in memory.

```
Compressed payload: ~100 bytes
Decompressed result: ~1 GB
Impact: Out-of-memory crash (DoS)
```

**2. Alert #42 — Unhandled exception via invalid `server_max_window_bits`**

The WebSocket handshake parser doesn't validate `server_max_window_bits` values in the `Sec-WebSocket-Extensions` response header. An out-of-range value causes an unhandled `RangeError` that crashes the client.

**3. Alert #39 — 64-bit length overflow**

Malicious WebSocket frames with 64-bit length fields exceeding `Number.MAX_SAFE_INTEGER` overflow the JavaScript number parser, causing incorrect buffer allocation and a crash.

#### Risk Assessment

- **Scope:** Used by `@expo/server` for HTTP/WebSocket functionality in the Expo dev server.
- **Exploitability:** Requires connecting to a malicious WebSocket server. In the dev server context, this would require DNS hijacking or a compromised API endpoint. **Medium risk.**
- **Impact:** Application crash (DoS). Memory exhaustion on developer machines.
- **Verdict:** **Real vulnerabilities.** Straightforward fix via version bump.

#### Remediation

```bash
npm update undici

{
  "overrides": {
    "undici": ">=6.24.0"
  }
}
```

---

## Vulnerability Group E — Cryptographic Failures

### `node-forge` — 4 CVEs

| Field | Value |
|-------|-------|
| **Alerts** | #61, #62, #63, #64 |
| **Affected file** | `react-native-med-app/package-lock.json` |
| **Installed version** | 1.3.3 |
| **Fixed version** | **≥ 1.4.0** |
| **Dependency chain** | `expo` → `@expo/cli` → `node-forge` AND `@expo/code-signing-certificates` → `node-forge` |

#### Four distinct cryptographic vulnerabilities

**1. Alert #62 — DoS via infinite loop in `BigInteger.modInverse()` with zero input**

Passing `0` as the modulus to `BigInteger.modInverse()` triggers an infinite loop that hangs the process indefinitely.

```js
// Hangs forever:
forge.util.BigInteger.ZERO.modInverse(forge.util.BigInteger.ZERO);
```

**2. Alert #61 — Ed25519 signature forgery (missing S > L check)**

The Ed25519 signature verification doesn't check whether the scalar `S` component exceeds the group order `L`. This allows creating multiple valid signatures for the same message — a **signature malleability** bug that can bypass uniqueness checks.

**3. Alert #64 — RSA-PKCS signature forgery via ASN.1 extra field**

The PKCS#1 v1.5 signature verification doesn't reject signatures with trailing garbage in the ASN.1 DigestInfo structure. With low public exponents (e=3), an attacker can forge signatures for arbitrary messages.

**4. Alert #63 — basicConstraints bypass in certificate chain verification (RFC 5280 violation)**

`verifyCertificateChain()` doesn't enforce that intermediate certificates MUST have the `basicConstraints` extension with `cA: true`. A leaf certificate without this extension can impersonate a CA and sign arbitrary certificates.

#### Risk Assessment

- **Scope:** Used by Expo CLI for **code signing** of OTA updates and for HTTPS certificate operations.
- **Exploitability:** 
  - **Signature forgery (#61, #64):** HIGH — could allow forged OTA update signatures if the signing scheme uses affected algorithms.
  - **Cert bypass (#63):** HIGH — could allow MITM attacks using rogue certificates.
  - **DoS (#62):** MEDIUM — requires attacker-controlled input to crypto operations.
- **Impact:** Potential for **malicious code injection via forged OTA updates**. This is the most dangerous group.
- **Verdict:** **Critical. Fix immediately.**

#### Remediation

```bash
npm update node-forge

{
  "overrides": {
    "node-forge": ">=1.4.0"
  }
}
```

---

## Vulnerability Group F — Framework DoS

### `next` (Next.js) — CVE-2026-23864

| Field | Value |
|-------|-------|
| **Alert** | #7 |
| **Affected file** | `db-interface/package-lock.json` |
| **Installed version** | 14.2.35 |
| **Fixed version** | ⚠️ **No patch for v14 — EOL** |
| **Scope** | Direct dependency |

#### What's the vulnerability?

A specially crafted HTTP request to an App Router Server Function endpoint can exploit the React Server Components (RSC) "Flight" protocol's deserialization layer, causing:
- Excessive CPU usage
- Out-of-memory exceptions
- Complete server crash

The attack requires no authentication — any network-adjacent attacker can crash the server.

#### Risk Assessment

- **Scope:** `db-interface` is a Next.js 14 application. **This is a direct dependency, not transitive.**
- **Exploitability:** HIGH — unauthenticated, remote, trivial to execute.
- **Impact:** Complete denial of service. Application becomes unavailable.
- **Complication:** Next.js 14 is **end-of-life**. Vercel will not release a patch for this version.
- **Verdict:** **Critical. Requires migration to Next.js 15+.**

#### Remediation

**Short-term mitigations (if migration is not immediately possible):**

1. **WAF rules:** Block malicious RSC payloads at the reverse proxy/CDN level
2. **Rate limiting:** Add aggressive rate limiting to Server Function endpoints
3. **Network restriction:** If `db-interface` is internal-only, restrict access at the network level

**Long-term fix:**

```bash
# In db-interface/
npm install next@latest react@latest react-dom@latest

# Review breaking changes:
# https://nextjs.org/docs/app/building-your-application/upgrading
```

> ⚠️ **WARNING:** Migrating from Next.js 14 to 15+ involves breaking changes including:
> - `params` and `searchParams` are now async Promises
> - New caching defaults
> - React 19 requirement
> - Server Actions security changes
>
> Budget 2-4 hours for a thorough migration and testing.

---

## Consolidated Remediation Plan

### Phase 1 — Quick Wins (< 30 minutes)

Run these commands to resolve 22 of 25 alerts:

```bash
# react-native-med-app — fixes flatted, minimatch, tar, undici, node-forge, picomatch
cd react-native-med-app
npm audit fix --force

# If npm audit fix doesn't resolve everything, add overrides to package.json:
# {
#   "overrides": {
#     "flatted": ">=3.4.2",
#     "minimatch": ">=3.1.3",
#     "tar": ">=7.5.11",
#     "undici": ">=6.24.0",
#     "node-forge": ">=1.4.0",
#     "picomatch": ">=2.3.2"
#   }
# }

npm install
npm audit  # verify 0 remaining
```

```bash
# db-interface — fixes flatted, minimatch
cd db-interface
npm audit fix --force

# Override if needed:
# {
#   "overrides": {
#     "flatted": ">=3.4.2",
#     "minimatch": ">=3.1.3"
#   }
# }

npm install
npm audit  # verify remaining = next.js only
```

### Phase 2 — Next.js Migration (2-4 hours)

```bash
cd db-interface
npx @next/codemod upgrade latest
npm install
npm run build  # verify no build errors
npm run dev    # manual smoke test
```

### Phase 3 — Verification

```bash
# Run full audit across both workspaces
cd react-native-med-app && npm audit
cd ../db-interface && npm audit

# Expected: 0 vulnerabilities
```

---

## Summary of All Alerts

| # | Package | CVE / Advisory | Vulnerability | Workspace | Scope | Fix Version | Priority |
|---|---------|---------------|---------------|-----------|-------|-------------|----------|
| 49 | flatted | CVE-2026-33228 | Prototype Pollution via `parse()` | db-interface | Dev | 3.4.2 | Medium |
| 48 | flatted | CVE-2026-33228 | Prototype Pollution via `parse()` | react-native | Dev | 3.4.2 | Medium |
| 26 | minimatch | CVE-2026-26996 | ReDoS: repeated wildcards | react-native | Runtime | 3.1.3 | Medium |
| 23 | minimatch | CVE-2026-26996 | ReDoS: repeated wildcards | react-native | Runtime | 3.1.3 | Medium |
| 36 | minimatch | CVE-2026-27903 | ReDoS: GLOBSTAR backtracking | react-native | Runtime | 9.0.7 | Medium |
| 35 | minimatch | CVE-2026-27903 | ReDoS: GLOBSTAR backtracking | react-native | Dev | 9.0.7 | Low |
| 34 | minimatch | CVE-2026-27903 | ReDoS: GLOBSTAR backtracking | react-native | Runtime | 9.0.7 | Medium |
| 30 | minimatch | CVE-2026-27903 | ReDoS: GLOBSTAR backtracking | db-interface | Dev | 3.1.3 | Low |
| 29 | minimatch | CVE-2026-27903 | ReDoS: GLOBSTAR backtracking | db-interface | Dev | 3.1.3 | Low |
| 33 | minimatch | CVE-2026-27904 | ReDoS: nested extglobs | react-native | Runtime | 9.0.7 | Medium |
| 31 | minimatch | CVE-2026-27904 | ReDoS: nested extglobs | react-native | Runtime | 9.0.7 | Medium |
| 6 | tar | CVE-2026-23745 | Hardlink path traversal | react-native | Runtime | 7.5.11 | **High** |
| 14 | tar | CVE-2026-24842 | Hardlink escape via symlink chain | react-native | Runtime | 7.5.11 | **High** |
| 38 | tar | GHSA-9ppj | Symlink drive-relative traversal | react-native | Runtime | 7.5.11 | **High** |
| 37 | tar | GHSA-related | Hardlink drive-relative traversal | react-native | Runtime | 7.5.11 | **High** |
| 42 | undici | — | WebSocket unhandled exception | react-native | Runtime | 6.24.0 | **High** |
| 39 | undici | — | WebSocket 64-bit length overflow | react-native | Runtime | 6.24.0 | **High** |
| 43 | undici | CVE-2026-1526 | WebSocket decompression bomb | react-native | Runtime | 6.24.0 | **High** |
| 62 | node-forge | — | DoS: modInverse infinite loop | react-native | Runtime | 1.4.0 | **High** |
| 61 | node-forge | — | Ed25519 signature forgery | react-native | Runtime | 1.4.0 | **Critical** |
| 64 | node-forge | CVE-2026-33894 | RSA-PKCS signature forgery | react-native | Runtime | 1.4.0 | **Critical** |
| 63 | node-forge | — | basicConstraints CA bypass | react-native | Runtime | 1.4.0 | **Critical** |
| 59 | picomatch | CVE-2026-33671 | ReDoS: extglob quantifiers | react-native | Runtime | 3.0.2 | Medium |
| 53 | picomatch | CVE-2026-33671 | ReDoS: extglob quantifiers | react-native | Runtime | 2.3.2 | Medium |
| 7 | next | CVE-2026-23864 | HTTP deserialization DoS (RSC) | db-interface | **Direct** | 15.x+ | **Critical** |

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Total alerts | 25 |
| Distinct CVEs | 11 |
| Critical priority | 4 (node-forge signatures + Next.js DoS) |
| High priority | 8 (tar, undici, node-forge DoS) |
| Medium priority | 11 (minimatch, picomatch, flatted) |
| Low priority | 2 (dev-only minimatch) |
| Fixable via `npm audit fix` | 24 |
| Requires major migration | 1 (Next.js 14 → 15+) |

> **The single most critical action item is upgrading `node-forge` to ≥ 1.4.0** — the signature forgery and CA bypass vulnerabilities could allow malicious code to be injected via forged Expo OTA updates. The Next.js migration is equally critical but requires more effort.
