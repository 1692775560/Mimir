# Releasing Mimir

The host and UI packages can be released independently. Configure npm trusted publishing
for this repository's `Release` workflow and `npm` GitHub environment before pushing a
release tag.

1. Update the version of every package that changed.
2. Run `pnpm install --frozen-lockfile && pnpm run build && pnpm run typecheck && pnpm test`.
3. Inspect each changed tarball with `pnpm --filter <package> pack --dry-run`.
4. Push the tag for the package being released:

   - `dsh-mimir-vX.Y.Z` publishes only `dsh-mimir`.
   - `dsh-client-ui-mimir-vX.Y.Z` publishes only `dsh-client-ui-mimir`.
   - `vX.Y.Z` remains available for a coordinated release when both packages have the
     same version.

The tag workflow verifies the selected package version, runs the full repository checks,
publishes only the selected package (or both for a coordinated tag), and records npm
provenance.

## Browser E2E

Point `DSH_E2E_URL` at a running dsh Web instance with both Mimir packages mounted, then
run `pnpm test:e2e`. Configure the same URL as a GitHub Actions repository variable to
enable the CI E2E job. Reports, traces, and screenshots are uploaded as artifacts.
