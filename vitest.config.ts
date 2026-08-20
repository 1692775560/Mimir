import ts from 'typescript'
import { defineConfig, type Plugin } from 'vitest/config'

const decoratorSyntax = /^\s*@[A-Za-z_$][\w$]*/m

/**
 * Transform standard TypeScript decorators (the service's `@Remote` metadata)
 * before Vite's default parser sees source files — esbuild's loader rejects
 * the decorator syntax these sources use.
 * @returns a pre-transform Vite plugin for the test pipeline.
 */
function standardDecoratorPlugin(): Plugin {
  return {
    name: 'mimir-standard-decorators',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?', 1)[0]!
      if (!/\.[cm]?tsx?$/.test(file) || !decoratorSyntax.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          jsx: file.endsWith('x') ? ts.JsxEmit.ReactJSX : undefined,
          sourceMap: true,
        },
      })
      return {
        code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
        map: result.sourceMapText,
      }
    },
  }
}

export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  test: {
    include: ['packages/*/tests/**/*.spec.{ts,tsx}'],
  },
})
