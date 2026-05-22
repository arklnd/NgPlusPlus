# NgPlusPlus Roadmap

## Current State (v1.0.0)
VS Code extension with AI-powered Angular dependency resolution. Currently reads only `package.json` and `package-lock.json` from the project.

---

## Phase 1: Full File Structure Access (Planned)

### Goal
Read additional project files to give the LLM richer context about the Angular project structure, enabling smarter dependency resolution decisions.

### Files to Read

| File/Pattern | Purpose | Priority |
|---|---|---|
| `angular.json` | Workspace config, project targets, build options, library projects | High |
| `tsconfig*.json` | TypeScript config, path aliases, strict mode settings | High |
| `nx.json` / `project.json` | Nx monorepo config (if present) | Medium |
| `.browserslistrc` / `browserslist` in package.json | Browser target compatibility | Medium |
| `src/main.ts` / `src/main.server.ts` | Bootstrap config, SSR detection | Medium |
| `src/app/app.config.ts` / `src/app/app.module.ts` | Standalone vs NgModule detection, provider analysis | Medium |
| `*.component.ts` (sampling) | Component patterns, Angular API usage (signals, control flow, etc.) | Low |
| `.eslintrc*` / `eslint.config.*` | Lint rules affecting upgrade decisions | Low |
| `karma.conf.js` / `jest.config.*` | Test framework detection | Low |
| `Dockerfile` / `docker-compose.yml` | Deployment context | Low |

### Implementation Plan

1. **Workspace Analyzer Service** (`src/services/workspace-analyzer.service.ts`)
   - Use `vscode.workspace.findFiles()` to discover project files
   - Build a structured project profile (monorepo vs single, SSR, standalone vs modules, etc.)
   - Cache results per workspace session

2. **New Graph Node: `context-enrichment`**
   - Runs after `setup` and before `targetUpdate`
   - Reads project files via the workspace analyzer
   - Adds structured context to the graph state
   - Context flows to the `strategist` node for richer LLM prompts

3. **Enhanced Prompt Templates**
   - New template section: `[PROJECT CONTEXT]` in `strategic-prompt.hbs`
   - Include Angular version detection, project type, feature usage
   - Help LLM understand breaking changes relevant to this specific project

4. **State Extension**
   - Add `projectContext` field to `ResolverStateAnnotation`
   - Include: Angular version (current), project type, SSR, standalone, monorepo info

### API Design (Draft)

```typescript
interface ProjectContext {
    angularVersion: string;          // Current @angular/core version
    projectType: 'application' | 'library' | 'monorepo';
    isStandalone: boolean;           // Standalone components vs NgModule
    hasSSR: boolean;                 // Server-side rendering
    isNxWorkspace: boolean;          // Nx monorepo
    buildSystem: 'webpack' | 'esbuild' | 'unknown';
    testFramework: 'karma' | 'jest' | 'vitest' | 'unknown';
    browserTargets: string[];        // From browserslist
    tsconfigPaths: Record<string, string[]>; // Path aliases
    subProjects: string[];           // For monorepos
    detectedFeatures: string[];      // signals, control-flow, defer, etc.
}
```

---

## Phase 2: Interactive Resolution (Planned)

### Goal
Let users review and approve/modify AI suggestions before they are applied.

### Features
- **TreeView panel** showing current conflicts and proposed changes
- **Diff preview** of package.json changes before applying
- **Manual override** - user can edit suggested versions
- **Step-by-step mode** - pause after each resolution cycle for review
- **Rollback** - undo last applied suggestion

---

## Phase 3: Migration Guide Generation (Planned)

### Goal
Generate a migration checklist based on the Angular upgrade path.

### Features
- Parse Angular changelog/migration guide for breaking changes
- Cross-reference with project's actual file usage
- Generate a VS Code task list or markdown checklist
- Integrate with Angular CLI `ng update` schematics where possible

---

## Phase 4: Multi-Framework Support (Future)

### Goal
Extend beyond Angular to support React, Vue, and other frameworks.

### Considerations
- The core ERESOLVE resolution logic is framework-agnostic
- Framework-specific knowledge lives in prompt templates and ranking heuristics
- Could use separate template sets per framework
- Framework detection from package.json dependencies

---

## Technical Debt

- [ ] Add unit tests for VS Code extension commands (mock vscode API)
- [ ] Add integration tests with a sample Angular project
- [ ] Set up CI/CD for extension publishing to VS Code Marketplace
- [ ] Add telemetry (opt-in) for resolution success rates
- [ ] Improve error messages and user-facing diagnostics
- [ ] Add support for `pnpm` and `yarn` package managers (currently npm only)
- [ ] Handle workspace trust restrictions
