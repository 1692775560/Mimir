# Releasing Mimir

Both packages share one version. Before the first release, authenticate an npm owner for
`dsh-mimir` and `dsh-client-ui-mimir`, or configure npm trusted publishing for this
repository's `Release` workflow and `npm` GitHub environment.

1. Update both package versions together.
2. Run `pnpm install --frozen-lockfile && pnpm run build && pnpm run typecheck && pnpm test`.
3. Inspect both tarballs with `pnpm --filter dsh-mimir pack --dry-run` and
   `pnpm --filter dsh-client-ui-mimir pack --dry-run`.
4. Push a tag matching the package version, for example `v0.1.0`.

The tag workflow verifies the version, tests both packages, publishes the host package
first, then the client package, and records npm provenance.

## Browser E2E

Point `DSH_E2E_URL` at a running dsh Web instance with both Mimir packages mounted, then
run `pnpm test:e2e`. Configure the same URL as a GitHub Actions repository variable to
enable the CI E2E job. Reports, traces, and screenshots are uploaded as artifacts.
