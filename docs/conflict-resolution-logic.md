# Dependency Conflict Resolution Logic

This document explains the conflict resolution system used in NgPlusPlus to detect and resolve dependency conflicts when updating package versions.

## Overview

The conflict resolution system consists of two main functions:
1. **`analyzeConflicts`** - Detects potential conflicts between planned dependency updates and existing packages
2. **`resolveConflicts`** - Attempts to automatically resolve detected conflicts by finding compatible versions

## Data Structures

### ConflictInfo Interface
```typescript
interface ConflictInfo {
    packageName: string;           // The package that has the conflict
    currentVersion: string;        // Current version of the conflicting package
    conflictsWithPackageName: string; // The package being updated that causes conflict
    conflictsWithVersion: string;  // The version being updated to
    reason: string;               // Human-readable explanation of the conflict
}
```

### ConflictResolution Interface
```typescript
interface ConflictResolution {
    conflicts: ConflictInfo[];    // Array of detected conflicts
    resolutions: string[];        // Array of resolution messages/actions taken
}
```

## Conflict Analysis Process (`analyzeConflicts`)

### 1. Environment Preparation
```typescript
// Before analyzing conflicts, ensure node_modules is populated
await installDependencies(repoPath);
```
- Installs all dependencies to ensure complete dependency tree analysis
- Required for accurate conflict detection using the actual installed packages
- Throws error if installation fails, preventing incomplete analysis

### 2. Planned Update Processing
For each planned dependency update:

#### 2.1 Current Version Lookup
```typescript
const currentVersion = (packageJson.dependencies ?? {})[updateName];
```
- Checks if the package being updated exists in current dependencies
- Skips analysis if package not found (new dependency, no conflicts possible)

#### 2.2 Dependent Package Discovery
```typescript
const dependents = await getAllDependent(repoPath, updateName);
```
- Finds all packages that depend on the package being updated
- Returns a mapping: `{ [dependentOnVersion]: DependentPackage[] }`
- Uses actual installed packages in `node_modules` for accuracy

#### 2.3 Dependent Compatibility Check
For each dependent package:

1. **Version Data Retrieval**
   ```typescript
   const dependentVersionData = await getPackageVersionData(dependent.name, dependentVersionClean);
   ```
   - Fetches the dependent package's metadata from npm registry
   - Gets dependency requirements for the specific version

2. **Dependency Requirement Check**
   ```typescript
   const depVersion = dependentVersionData.dependencies[updateName];
   ```
   - Checks if the dependent has a dependency on the package being updated
   - Skips if no dependency relationship exists

3. **Version Compatibility Validation**
   ```typescript
   if (!satisfiesVersionRange(plannedVersion, depVersion)) {
       // Conflict detected!
   }
   ```
   - Uses semver logic to check if planned update version satisfies dependent's requirements
   - Creates `ConflictInfo` object if incompatible

### 3. Error Handling
- Individual package analysis failures don't stop the entire process
- Warnings are collected for packages that couldn't be analyzed
- Comprehensive logging at different levels (trace, debug, info, warn, error)

## Conflict Resolution Process (`resolveConflicts`)

### 1. Conflict Processing
For each detected conflict:

#### 1.1 Available Versions Discovery
```typescript
const versions = await getPackageVersions(conflict.packageName);
```
- Fetches all available versions of the conflicting package from npm registry
- Sorts versions in descending order (newest first) for optimal resolution

#### 1.2 Compatible Version Search
```typescript
for (const version of versions.sort((a, b) => b.localeCompare(a))) {
    const versionData = await getPackageVersionData(conflict.packageName, version);
    const peerDep = versionData.peerDependencies?.[updateName];
    if (peerDep && satisfiesVersionRange(updateVersionClean, peerDep)) {
        compatibleVersion = version;
        break;
    }
}
```

**Algorithm:**
1. Iterate through available versions (newest to oldest)
2. For each version, fetch its peer dependency requirements
3. Check if the planned update version satisfies the peer dependency
4. Select first compatible version found (newest compatible)

#### 1.3 Automatic Resolution
If compatible version found:
```typescript
const isDev = isDevDependency(packageJson, conflict.packageName);
updateDependency(packageJson, conflict.packageName, `^${compatibleVersion}`, isDev);
```
- Automatically updates `package.json` with compatible version
- Preserves dev/production dependency classification
- Uses caret range (`^`) for flexibility

#### 1.4 Fallback Strategies
If no compatible version found:
- Provides ecosystem-specific advice (Storybook, Angular)
- Suggests manual override options (`--force`, `--legacy-peer-deps`)
- Documents the unresolvable conflict


## Usage Example

```typescript
// Detect conflicts
const conflicts = await analyzeConflicts(repoPath, packageJson, [
    { name: '@angular/core', version: '18.0.0', isDev: false },
    { name: '@angular/common', version: '18.0.0', isDev: false }
]);

// Resolve conflicts automatically
const resolutions = await resolveConflicts(packageJson, conflicts.conflicts);

console.log('Conflicts found:', conflicts.conflicts.length);
console.log('Resolutions applied:', resolutions.length);
```

## Error Scenarios Handled

1. **Network/Registry Issues**: Continue with warnings when package data can't be fetched
2. **Invalid Versions**: Skip malformed version strings with logging
3. **Missing Dependencies**: Handle cases where expected dependencies don't exist
4. **Installation Failures**: Abort conflict analysis if `node_modules` can't be populated
5. **Unresolvable Conflicts**: Provide manual resolution guidance

## Performance Considerations

- **Caching**: Package registry data should be cached to avoid redundant API calls
- **Parallel Processing**: Individual package analyses are independent and could be parallelized
- **Early Termination**: Stops searching for compatible versions after finding the first (newest) match
- **Selective Analysis**: Only analyzes packages that actually exist in current dependencies

## Future Enhancements

1. **Peer Dependencies**: Enhanced support for peer dependency conflict resolution
2. **Version Pinning**: Option to pin specific versions instead of using caret ranges
3. **Interactive Mode**: User prompts for manual conflict resolution choices
4. **Conflict Visualization**: Dependency tree visualization showing conflict relationships
5. **Rollback Support**: Ability to undo automatic resolutions if they cause issues