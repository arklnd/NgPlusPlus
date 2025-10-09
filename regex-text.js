const npmError = `
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
npm ERR! 
npm ERR! While resolving: xstories@1.2.0
npm ERR! Found: typescript@4.1.5
npm ERR! node_modules/typescript
npm ERR! peer typescript@">=4.0 <4.2" from @angular/compiler-cli@11.2.0
npm ERR! node_modules/@angular/compiler-cli
npm ERR! peer @angular/compiler-cli@"^11.0.0" from @angular-devkit/build-angular@0.1100.7
npm ERR! node_modules/@angular-devkit/build-angular
npm ERR! peer @angular-devkit/build-angular@"^0.1100.0" from @ionic/angular-toolkit@3.0.0
npm ERR! node_modules/@ionic/angular-toolkit
npm ERR! @ionic/angular-toolkit@"3.0.0" from the root project
npm ERR! 1 more (ng-packagr)
npm ERR! peer typescript@">=4.0 <4.2" from ng-packagr@11.2.1
npm ERR! node_modules/ng-packagr
npm ERR! peerOptional ng-packagr@"^11.0.0" from @angular-devkit/build-angular@0.1100.7
npm ERR! node_modules/@angular-devkit/build-angular
npm ERR! peer typescript@"~4.0.0" from @angular-devkit/build-angular@0.1100.7
npm ERR! node_modules/@angular-devkit/build-angular
npm ERR! Could not resolve dependency:
npm ERR! peer typescript@"~4.0.0" from @angular-devkit/build-angular@0.1100.7
npm ERR! Fix the upstream dependency conflict, or retry
npm ERR! this command with --force, or --legacy-peer-deps
npm ERR! to accept an incorrect (and potentially broken) dependency resolution.

npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error
npm error While resolving: hyland-ui@9.0.4
npm error Found: typescript@5.5.4
npm error node_modules/typescript
npm error   dev typescript@"~5.5.4" from the root project
npm error   peer typescript@">=5.4 <5.6" from ng-packagr@18.2.1
npm error   node_modules/ng-packagr
npm error     dev ng-packagr@"18.2.1" from the root project
npm error
npm error Could not resolve dependency:
npm error peer typescript@">=5.8 <6.0" from @angular-devkit/build-angular@20.3.4
npm error node_modules/@angular-devkit/build-angular
npm error   dev @angular-devkit/build-angular@"^20.0.0" from the root project
npm error
npm error Fix the upstream dependency conflict, or retry
npm error this command with --no-strict-peer-deps, --force, or --legacy-peer-deps
npm error to accept an incorrect (and potentially broken) dependency resolution.

`;

// Parse project info
const project = npmError.match(/While resolving: ([^@\s]+)@([^\s]+)/);
console.log(`Project: ${project[1]}@${project[2]}`);

// Parse found package (the currently installed version causing conflict)
const found = npmError.match(/Found: ([^@\s]+)@([^\s]+)/);
const conflictingPackage = found[1];
const currentVersion = found[2];
console.log(`\nCurrent ${conflictingPackage}: ${currentVersion} (installed)`);

// Parse all dependencies for the conflicting package using generic regex
const genericRegex = /peer\s+((?:@[^\/\s]+\/)?[^@\s]+)@?((?:"[^"]*"|'[^']*'|[^\s]+)?)\s*from\s+((?:@[^\/\s]+\/)?[^@\s]+)(?:@([^\s]+))?/gi;
const allMatches = [...npmError.matchAll(genericRegex)];

// Filter dependencies for the conflicting package and remove duplicates
const conflictingDeps = [];
const seen = new Set();

allMatches.forEach(match => {
    const packageName = match[1];
    const requirement = match[2];
    const fromPackage = match[3];
    const fromVersion = match[4];
    
    // Only include dependencies for the conflicting package
    if (packageName === conflictingPackage) {
        const key = `${fromPackage}@${requirement}`;
        if (!seen.has(key)) {
            seen.add(key);
            conflictingDeps.push({
                requirement: requirement,
                packageName: fromPackage,
                packageVersion: fromVersion
            });
        }
    }
});

console.log(`\nFiltered for ${conflictingPackage}:`, conflictingDeps.length, 'dependencies');

// Function to check version compatibility
function isVersionCompatible(currentVersion, requirement) {
    try {
        // Handle range requirements like ">=4.0 <4.2"
        if (requirement.includes('>=') && requirement.includes('<')) {
            const rangeMatch = requirement.match(/>=([^\s<]+)\s*<([^\s]+)/);
            if (rangeMatch) {
                const minVersion = rangeMatch[1];
                const maxVersion = rangeMatch[2];
                return compareVersions(currentVersion, minVersion) >= 0 && compareVersions(currentVersion, maxVersion) < 0;
            }
        }
        
        // Handle tilde ranges like "~4.0.0"
        if (requirement.startsWith('~')) {
            const baseVersion = requirement.substring(1);
            const baseParts = baseVersion.split('.');
            const currentParts = currentVersion.split('.');
            return baseParts[0] === currentParts[0] && baseParts[1] === currentParts[1];
        }
        
        // Handle caret ranges like "^11.0.0"
        if (requirement.startsWith('^')) {
            const baseVersion = requirement.substring(1);
            const baseParts = baseVersion.split('.');
            const currentParts = currentVersion.split('.');
            return baseParts[0] === currentParts[0] && compareVersions(currentVersion, baseVersion) >= 0;
        }
        
        // Handle exact matches
        if (!requirement.includes('<') && !requirement.includes('>') && !requirement.startsWith('~') && !requirement.startsWith('^')) {
            return currentVersion === requirement;
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

// Simple version comparison function
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;
        
        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }
    return 0;
}

function getCompatibilityNote(requirement, currentVersion, isCompatible) {
    if (isCompatible) {
        return `(compatible with ${currentVersion})`;
    }
    
    if (requirement.startsWith('~')) {
        const baseVersion = requirement.substring(1);
        const baseParts = baseVersion.split('.');
        return `(wants exactly ${baseParts[0]}.${baseParts[1]}.x, not ${currentVersion})`;
    }
    
    if (requirement.startsWith('^')) {
        const baseVersion = requirement.substring(1);
        const baseParts = baseVersion.split('.');
        return `(wants ${baseParts[0]}.x.x with minimum ${baseVersion}, not ${currentVersion})`;
    }
    
    if (requirement.includes('>=') && requirement.includes('<')) {
        return `(${currentVersion} doesn't satisfy range ${requirement})`;
    }
    
    return `(${currentVersion} doesn't match ${requirement})`;
}

// Analyze dependencies for the conflicting package
console.log(`\n${conflictingPackage} Dependency Analysis:`);
conflictingDeps.forEach(dep => {
    const requirement = dep.requirement;
    const packageName = dep.packageName;
    const packageVersion = dep.packageVersion;
    const isCompatible = isVersionCompatible(currentVersion, requirement);
    const status = isCompatible ? '✅' : '❌';
    
    console.log(`[ ${packageName} ] requires: ${requirement} ${status} ${getCompatibilityNote(requirement, currentVersion, isCompatible)}`);
});

// Parse and display the specific conflict mentioned in "Could not resolve dependency"
const conflict = npmError.match(/Could not resolve dependency:\s*[\s\S]*?(peer|dev|peerOptional)\s+([^@\s]+)@"([^"]+)"\s+from\s+([@\w\-\/]+)@([^\s]+)/);
if (conflict) {
    console.log(`\nMain Conflict:`);
    console.log(`${conflict[4]} requires: ${conflict[2]}@${conflict[3]} ❌ (blocking resolution)`);
}