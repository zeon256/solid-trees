# Security Policy

## Supported Versions

Security fixes are provided for the latest published version of `solid-trees`.

`@solid-trees/path-store` is a private workspace package bundled into
`solid-trees`; it is not published separately and is covered by the same policy.

Until the project reaches `1.0`, compatibility may change between minor
versions. Please test against the latest release before reporting an issue that
may already be fixed.

## Reporting a Vulnerability

Please do not open a public issue for a suspected security vulnerability.

Report privately by email to <me+security@inve.rs>, or through the
[repository owner account](https://github.com/zeon256) if email is not possible.
Include:

- affected package, version, or commit
- a minimal reproducer (path list, model options, or component usage as
  appropriate)
- expected behavior
- observed behavior
- impact assessment

You should receive an initial response within 7 days. If the report is accepted,
a fix and advisory will be coordinated before public disclosure where practical.

## Security Scope

Issues generally considered security-sensitive include:

- script injection (XSS) or DOM/attribute injection through untrusted paths,
  labels, git status data, or `icons.spriteSheet` content rendered by
  `<FileTree>`
- panics, hangs, or excessive resource usage triggered by untrusted path lists
  or model operations (`add`, `move`, `remove`, `batch`, `resetPaths`)
- prototype pollution or unexpected property access in the path store when paths
  contain names such as `__proto__` or `constructor`
- drag and drop, rename, or context-menu behavior that moves, overwrites, or
  deletes entries other than the ones the user acted on
- unsafe handling of values passed to `themeToTreeStyles` that allows style or
  CSS injection

Issues generally not considered vulnerabilities by themselves:

- application misuse of the library, such as rendering unsanitized HTML in your
  own `header` or `renderContextMenu` content
- trusting paths from a remote source without validating them in your own
  application
- file system access: `solid-trees` only models and renders paths, it never
  reads or writes files
- performance problems that only appear with trees far beyond documented or
  reasonable sizes, unless they can be triggered cheaply by an attacker
- vulnerabilities in upstream `@pierre/trees` that do not apply to this port
  (please report those upstream)

## Disclosure

Accepted vulnerabilities will be fixed in a patch release when possible. Public
disclosure should include the affected versions, fixed versions, impact, and
suggested mitigation.

## Build & Supply Chain Hardening

This project uses the following hardening techniques:

- **Trusted Publishing**: npm releases are published via GitHub Actions OIDC,
  eliminating the need for long-lived API tokens.
- **Pinned SHA**: all GitHub Actions dependencies reference specific commit SHAs
  rather than mutable version tags, mitigating supply chain attacks.
- **Minimum release age**: pnpm is configured with `minimumReleaseAge: 10080` (7
  days), so dependency versions published less than a week ago are not
  installed, giving the community time to catch compromised releases.
