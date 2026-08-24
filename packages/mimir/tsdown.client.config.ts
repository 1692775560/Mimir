import { clientBundleOnly } from '../../build/client-preset/tsdown.client.ts'

// The single-package layout: dsh-mimir ships the research workbench under its
// own name, bundling ui-mimir's compiled client entry (`tsc -b` of
// packages/ui-mimir must run first — the root build script orders it). The
// banner id stays `dsh-mimir` so the host roster row doubles as the browser
// row (the ClientModuleRegistry scanner picks up this package's dsh.client
// declaration and serves this bundle at /plugins/dsh-mimir/client.js).
export default clientBundleOnly('dsh-mimir', '../ui-mimir/lib/types/client/index.js')
