import { ConflictAnalysis, ReasoningRecording, UpdateSuggestions, UpdateSuggestion, PackageVersionInfo } from '@/interfaces';
import * as semver from 'semver';

export function generateStaticSuggestions(conflictAnalysis: ConflictAnalysis, reasoningRecording: ReasoningRecording): UpdateSuggestions {
    const suggestions: UpdateSuggestion[] = [];
    const newReasoningUpdates = [...(reasoningRecording.updateMade || [])];

    // Strategic logic inspired by the strategic prompt

    // 1. Sort packages by rank (lowest rank first for upgrade priority)
    let allPackages = [...conflictAnalysis.notSatisfying, ...conflictAnalysis.satisfyingPackages, {
        packageName: conflictAnalysis.conflictingPackage,
        packageVersion: conflictAnalysis.conflictingPackageCurrentVersion,
        availableVersions: conflictAnalysis.conflictingPackageAvailableVersions,
        requiredVersionRange: '',
        rank: conflictAnalysis.rank,
        tier: conflictAnalysis.tier,
        isDevDependency: conflictAnalysis.isDevDependency,
    }];
    allPackages = allPackages.sort((a, b) => (a.rank || 0) - (b.rank || 0));

    const suggestion: UpdateSuggestion = {
        name: allPackages[0].packageName,
        version: allPackages[0].availableVersions ? allPackages[0].availableVersions[0] ?? '<NULL>' : '<NULL>',
        isDev: allPackages[0].isDevDependency,
        reason: 'static suggestion',
        fromVersion: allPackages[0].packageVersion,
    };
    suggestions.push(suggestion);
    newReasoningUpdates.push({
        package: {
            name: suggestion.name,
            rank: allPackages[0].rank,
        },
        fromVersion: allPackages[0].packageVersion,
        toVersion: suggestion.version,
        reason: {
            name: allPackages[allPackages.length - 1].packageName,
            rank: allPackages[allPackages.length - 1].rank,
        },
    });

    // 2. Generate upgrade suggestions for all packages
    // for (const packageInfo of allPackages) {
    //     const suggestedVersion = selectOptimalVersion(packageInfo, conflictAnalysis);

    //     if (suggestedVersion) {
    //         const suggestion: UpdateSuggestion = {
    //             name: packageInfo.packageName,
    //             version: suggestedVersion,
    //             isDev: packageInfo.tier === 'devDependencies',
    //             reason: generateUpgradeReason(packageInfo, conflictAnalysis),
    //             fromVersion: packageInfo.packageVersion,
    //         };

    //         suggestions.push(suggestion);

    //         // Record this upgrade decision in reasoning
    //         const higherRankedConflict = findHigherRankedConflict(packageInfo, conflictAnalysis);
    //         if (higherRankedConflict) {
    //             newReasoningUpdates.push({
    //                 package: {
    //                     name: packageInfo.packageName,
    //                     rank: packageInfo.rank || 0,
    //                 },
    //                 fromVersion: packageInfo.packageVersion,
    //                 toVersion: suggestedVersion,
    //                 reason: {
    //                     name: higherRankedConflict.packageName,
    //                     rank: higherRankedConflict.rank || 0,
    //                 },
    //             });
    //         }
    //     } else {
    //         // No suitable version found
    //         const suggestion: UpdateSuggestion = {
    //             name: packageInfo.packageName,
    //             version: '<NULL>',
    //             isDev: packageInfo.tier === 'devDependencies',
    //             reason: 'no suitable version found to resolve conflict with higher-ranked package',
    //             fromVersion: packageInfo.packageVersion,
    //         };

    //         suggestions.push(suggestion);
    //     }
    // }

    // 3. Generate analysis summary
    // const analysis = generateStrategicAnalysis(conflictAnalysis, suggestions);

    return {
        suggestions,
        analysis: 'static',
        reasoning: {
            updateMade: newReasoningUpdates,
        },
    };
}

/**
 * Select the optimal version from available versions that resolves conflicts
 */
function selectOptimalVersion(packageInfo: PackageVersionInfo, conflictAnalysis: ConflictAnalysis): string | null {
    const availableVersions = packageInfo.availableVersions || [];

    if (availableVersions.length === 0) {
        return null;
    }

    // Filter out invalid versions and sort in descending order (prefer newer stable versions)
    const validVersions = availableVersions
        .filter((version) => semver.valid(version))
        .sort((a, b) => {
            // Prefer stable versions over prerelease versions
            const aIsPrerelease = semver.prerelease(a) !== null;
            const bIsPrerelease = semver.prerelease(b) !== null;

            if (aIsPrerelease && !bIsPrerelease) return 1;
            if (!aIsPrerelease && bIsPrerelease) return -1;

            // Sort by version in descending order
            return semver.rcompare(a, b);
        });

    // Find the highest version that satisfies the required version range
    for (const version of validVersions) {
        if (semver.satisfies(version, packageInfo.requiredVersionRange)) {
            return version;
        }
    }

    // If no version satisfies the range, return the highest stable version
    return validVersions.find((v) => semver.prerelease(v) === null) || validVersions[0] || null;
}

/**
 * Generate strategic reason for upgrading a package
 */
function generateUpgradeReason(packageInfo: PackageVersionInfo, conflictAnalysis: ConflictAnalysis): string {
    const higherRankedConflict = findHigherRankedConflict(packageInfo, conflictAnalysis);

    if (higherRankedConflict) {
        return `upgraded to resolve conflict with higher-ranked package "${higherRankedConflict.packageName}" (rank ${higherRankedConflict.rank}) which requires compatible version`;
    }

    return `upgraded to resolve dependency conflict and maintain compatibility with core dependencies`;
}

/**
 * Find the higher-ranked package causing the conflict
 */
function findHigherRankedConflict(packageInfo: PackageVersionInfo, conflictAnalysis: ConflictAnalysis): PackageVersionInfo | null {
    // Look for satisfying packages with higher rank that might be causing the conflict
    const higherRankedPackages = conflictAnalysis.satisfyingPackages.filter((pkg) => (pkg.rank || 0) > (packageInfo.rank || 0)).sort((a, b) => (b.rank || 0) - (a.rank || 0));

    return higherRankedPackages[0] || null;
}

/**
 * Generate strategic analysis summary
 */
function generateStrategicAnalysis(conflictAnalysis: ConflictAnalysis, suggestions: UpdateSuggestion[]): string {
    const conflictingPackage = conflictAnalysis.conflictingPackage;
    const upgradedPackages = suggestions.filter((s) => s.version !== '<NULL>').length;
    const failedUpgrades = suggestions.filter((s) => s.version === '<NULL>').length;

    let analysis = `Strategic resolution for "${conflictingPackage}" conflicts: `;

    if (upgradedPackages > 0) {
        analysis += `${upgradedPackages} package(s) identified for upgrade to resolve version conflicts. `;
    }

    if (failedUpgrades > 0) {
        analysis += `${failedUpgrades} package(s) could not be resolved due to incompatible version requirements. `;
    }

    analysis += `Strategy prioritizes maintaining stability of higher-ranked core dependencies while upgrading lower-ranked packages to achieve compatibility.`;

    return analysis;
}
