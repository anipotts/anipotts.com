# admin native auth retirement archive

Verified remotely on 2026-09-28. This index adds recovery provenance; source
retirement was already complete at release
`8fca4127ff8e2dacc5f5c50dfc75ca599fcf4fae`.

| Evidence                           | Value                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Remote annotated tag               | `archive/admin-retired-auth-2026-09-22`                                |
| Tag object                         | `b8a586419a4419f18ac7e98d4ef04a29d471c780`                             |
| Peeled source commit               | `7fb33edb3ab84486d001d17053688256133fc582`                             |
| Per-file integrity and disposition | [JSON manifest](admin-native-auth-retirement-2026-09-22.json)          |
| Earlier preservation snapshot      | `79159a76398a7869e225d81e6f6c7e08bc42b4c2`, separate from this archive |

The manifest identifies removed native passkey/password and related source,
retired compatibility/control/MCP routes, the old admin content package and the
passkey proof tool by immutable Git blob. Original dependency manifests and
lockfile are available in the tagged tree. Active WebAuthn dependencies are
already absent. No executable archive copy enters active build/test discovery.

Historical migrations, authentication records and audits remain unchanged.
Independent service tokens, signed Access verification, lean `admin-auth.ts`
helpers and browser draft recovery remain active. No credential store or
password-manager deletion belongs to this archive.

Current dirty tracked and untracked work remains in its original checkout. The
September 14 snapshot excludes later work and does not certify its preservation.
This index archives only the source already retained by the remote retirement
tag; it does not copy concurrent or private writing drafts.

Inspect the original tree and manifests in an isolated checkout when recovering
historical code. Restoring it to production requires separate review, compatible
dependencies and the current Access/exact-owner boundary. The historical proof
scripts and SQL are reference material, not rollout instructions. Follow
[canonical requirements](../platform-architecture.md#authentication-and-production-boundaries).
