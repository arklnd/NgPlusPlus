import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { tmpdir } from 'os';
import { mkdtemp, cp, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { readPackageJson, writePackageJson, updateDependency, installDependencies } from '@U/package-json.utils';
import { getOpenAIService } from '@S/openai.service';
import { getLogger } from '@U/index';
import OpenAI from 'openai';

// Enhanced dependency analysis interfaces
interface DependencyConstraint {
    package: string;
    constraint: string;
    dependent: string;
    type: 'peer' | 'direct' | 'conflict' | 'version-mismatch';
    severity: 'blocking' | 'warning' | 'info';
}

interface UpgradeStrategy {
    blockers: string[];
    targetVersions: Map<string, string>;
    rationale: string;
    confidence: number;
    phase: 'blocker-upgrade' | 'target-upgrade' | 'cleanup';
}

interface ResolverAnalysis {
    constraints: DependencyConstraint[];
    blockers: string[];
    strategies: UpgradeStrategy[];
    recommendations: string[];
}

// Schema definitions
export const dependencyUpdateSchema = z.object({
    name: z.string().describe('Package name'),
    version: z.string().describe('Target version'),
    isDev: z.boolean().default(false).describe('Whether this is a dev dependency'),
});

export const dumbResolverInputSchema = z.object({
    repo_path: z.string().describe('Path to the repository/project root directory that contains package.json'),
    update_dependencies: z.array(dependencyUpdateSchema).describe('List of dependencies to update with their target versions'),
});

export type DumbResolverInput = z.infer<typeof dumbResolverInputSchema>;

const mkdtempAsync = promisify(mkdtemp);
const cpAsync = promisify(cp);

// Dependency analysis utilities
class DependencyAnalyzer {
    private static readonly PEER_DEP_REGEX = /peer\s+([^@\s]+)@?([^"'\s]*)\s*["']?\s*from\s+([^@\s]+)(?:@([^\s]+))?/gi;
    private static readonly CONFLICT_REGEX = /Found:\s+([^@\s]+)@([^\s]+).*?Could not resolve dependency:.*?peer\s+([^@\s]+)@([^\s]+)/gis;
    private static readonly VERSION_MISMATCH_REGEX = /([^@\s]+)@([^\s]+)\s+.*?requires\s+([^@\s]+)\s*@([^\s,]+)/gi;
    private static readonly UNMET_PEER_REGEX = /EBOX_UNMET_PEER_DEP.*?([^@\s]+)@([^\s]+).*?requires\s+a\s+peer\s+of\s+([^@\s]+)@([^\s]+)/gi;

    static analyzeDependencyConstraints(errorOutput: string): DependencyConstraint[] {
        const constraints: DependencyConstraint[] = [];

        // Reset regex global state
        this.PEER_DEP_REGEX.lastIndex = 0;
        this.CONFLICT_REGEX.lastIndex = 0;
        this.VERSION_MISMATCH_REGEX.lastIndex = 0;
        this.UNMET_PEER_REGEX.lastIndex = 0;

        // Parse peer dependency errors
        let match;
        while ((match = this.PEER_DEP_REGEX.exec(errorOutput)) !== null) {
            const [, packageName, constraint, dependent, dependentVersion] = match;
            constraints.push({
                package: packageName,
                constraint: constraint || '*',
                dependent: dependentVersion ? `${dependent}@${dependentVersion}` : dependent,
                type: 'peer',
                severity: this.assessConstraintSeverity(constraint),
            });
        }

        // Parse version conflict errors
        this.CONFLICT_REGEX.lastIndex = 0;
        while ((match = this.CONFLICT_REGEX.exec(errorOutput)) !== null) {
            const [, foundPackage, foundVersion, requiredPackage, requiredVersion] = match;
            constraints.push({
                package: requiredPackage,
                constraint: requiredVersion,
                dependent: `${foundPackage}@${foundVersion}`,
                type: 'conflict',
                severity: 'blocking',
            });
        }

        // Parse version mismatch errors
        this.VERSION_MISMATCH_REGEX.lastIndex = 0;
        while ((match = this.VERSION_MISMATCH_REGEX.exec(errorOutput)) !== null) {
            const [, dependent, dependentVersion, requiredPackage, requiredVersion] = match;
            constraints.push({
                package: requiredPackage,
                constraint: requiredVersion,
                dependent: `${dependent}@${dependentVersion}`,
                type: 'version-mismatch',
                severity: this.assessConstraintSeverity(requiredVersion),
            });
        }

        // Parse unmet peer dependency errors
        this.UNMET_PEER_REGEX.lastIndex = 0;
        while ((match = this.UNMET_PEER_REGEX.exec(errorOutput)) !== null) {
            const [, dependent, dependentVersion, requiredPackage, requiredVersion] = match;
            constraints.push({
                package: requiredPackage,
                constraint: requiredVersion,
                dependent: `${dependent}@${dependentVersion}`,
                type: 'peer',
                severity: 'blocking',
            });
        }

        return this.deduplicateConstraints(constraints);
    }

    static assessConstraintSeverity(constraint: string): 'blocking' | 'warning' | 'info' {
        if (!constraint) return 'info';

        // Upper bound constraints (< or <=) are typically blocking for upgrades
        if (constraint.includes('<') && !constraint.includes('>=')) {
            return 'blocking';
        }

        // Exact version requirements can be blocking
        if (!constraint.includes('^') && !constraint.includes('~') && !constraint.includes('>=')) {
            return 'blocking';
        }

        return 'warning';
    }

    static identifyBlockingPackages(constraints: DependencyConstraint[], targetPackages: string[]): string[] {
        const blockers = new Set<string>();

        constraints.forEach((constraint) => {
            if (constraint.severity === 'blocking') {
                // Extract package name from dependent string
                const dependentPackage = constraint.dependent.split('@')[0];

                // Check if this constraint affects any target package
                const affectsTarget = targetPackages.some((target) => constraint.package === target || this.isRelatedPackage(constraint.package, target));

                if (affectsTarget && !targetPackages.includes(dependentPackage)) {
                    blockers.add(dependentPackage);
                }
            }
        });

        return Array.from(blockers);
    }

    static isRelatedPackage(packageA: string, packageB: string): boolean {
        // Check if packages are from the same ecosystem
        const ecosystems = [
            ['@angular/', '@ngrx/', '@angular-devkit/', '@schematics/', 'ng-'],
            ['@storybook/', 'storybook'],
            ['@types/', 'typescript'],
            ['@babel/', 'babel-'],
            ['eslint', '@eslint/', 'eslint-'],
            ['webpack', 'webpack-', '@webpack/'],
        ];

        return ecosystems.some((ecosystem) => ecosystem.some((prefix) => packageA.startsWith(prefix)) && ecosystem.some((prefix) => packageB.startsWith(prefix)));
    }

    private static deduplicateConstraints(constraints: DependencyConstraint[]): DependencyConstraint[] {
        const seen = new Set<string>();
        return constraints.filter((constraint) => {
            const key = `${constraint.package}:${constraint.constraint}:${constraint.dependent}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}

// Strategy generation for proactive upgrades
class UpgradeStrategyGenerator {
    static async generateStrategies(constraints: DependencyConstraint[], blockers: string[], targetPackages: string[], currentPackageJson: any): Promise<UpgradeStrategy[]> {
        const strategies: UpgradeStrategy[] = [];

        // Strategy 1: Upgrade blockers first
        if (blockers.length > 0) {
            const blockerStrategy = await this.createBlockerUpgradeStrategy(blockers, constraints, targetPackages, currentPackageJson);
            if (blockerStrategy) strategies.push(blockerStrategy);
        }

        // Strategy 2: Find alternative target versions
        const alternativeStrategy = this.createAlternativeTargetStrategy(constraints, targetPackages, currentPackageJson);
        if (alternativeStrategy) strategies.push(alternativeStrategy);

        // Strategy 3: Ecosystem-wide upgrade
        const ecosystemStrategy = this.createEcosystemUpgradeStrategy(constraints, targetPackages, currentPackageJson);
        if (ecosystemStrategy) strategies.push(ecosystemStrategy);

        return strategies.sort((a, b) => b.confidence - a.confidence);
    }

    private static async createBlockerUpgradeStrategy(blockers: string[], constraints: DependencyConstraint[], targetPackages: string[], currentPackageJson: any): Promise<UpgradeStrategy | null> {
        const targetVersions = new Map<string, string>();
        const rationales: string[] = [];

        // Analyze each blocker and suggest upgrade versions
        for (const blocker of blockers) {
            const blockerConstraints = constraints.filter((c) => c.dependent.startsWith(blocker + '@'));

            // Find the minimum version needed to satisfy target upgrades
            const suggestedVersion = this.suggestBlockerUpgradeVersion(blocker, blockerConstraints, targetPackages);

            if (suggestedVersion) {
                targetVersions.set(blocker, suggestedVersion);
                rationales.push(`Upgrade ${blocker} to ${suggestedVersion} to unlock ${targetPackages.join(', ')} upgrades`);
            }
        }

        if (targetVersions.size === 0) return null;

        return {
            blockers,
            targetVersions,
            rationale: rationales.join('; '),
            confidence: 0.8,
            phase: 'blocker-upgrade',
        };
    }

    private static createAlternativeTargetStrategy(constraints: DependencyConstraint[], targetPackages: string[], currentPackageJson: any): UpgradeStrategy | null {
        const targetVersions = new Map<string, string>();
        const rationales: string[] = [];

        // For each target package, find a version that satisfies constraints
        for (const target of targetPackages) {
            const relevantConstraints = constraints.filter((c) => c.package === target);
            const compatibleVersion = this.findCompatibleVersion(target, relevantConstraints);

            if (compatibleVersion && compatibleVersion !== 'latest') {
                targetVersions.set(target, compatibleVersion);
                rationales.push(`Use ${target}@${compatibleVersion} to satisfy existing constraints`);
            }
        }

        if (targetVersions.size === 0) return null;

        return {
            blockers: [],
            targetVersions,
            rationale: rationales.join('; '),
            confidence: 0.6,
            phase: 'target-upgrade',
        };
    }

    private static createEcosystemUpgradeStrategy(constraints: DependencyConstraint[], targetPackages: string[], currentPackageJson: any): UpgradeStrategy | null {
        const targetVersions = new Map<string, string>();
        const ecosystemPackages = new Set<string>();

        // Identify ecosystem packages that need coordinated upgrades
        targetPackages.forEach((target) => {
            const relatedPackages = this.findEcosystemPackages(target, currentPackageJson);
            relatedPackages.forEach((pkg) => ecosystemPackages.add(pkg));
        });

        // Suggest coordinated versions for ecosystem packages
        ecosystemPackages.forEach((pkg) => {
            const suggestedVersion = this.suggestEcosystemVersion(pkg, targetPackages);
            if (suggestedVersion) {
                targetVersions.set(pkg, suggestedVersion);
            }
        });

        if (targetVersions.size <= 1) return null;

        return {
            blockers: [],
            targetVersions,
            rationale: `Coordinated ecosystem upgrade for ${Array.from(ecosystemPackages).join(', ')}`,
            confidence: 0.7,
            phase: 'cleanup',
        };
    }

    private static suggestBlockerUpgradeVersion(blocker: string, constraints: DependencyConstraint[], targetPackages: string[]): string | null {
        // Common blocker upgrade patterns
        const upgradePatterns: Record<string, Record<string, string>> = {
            '@storybook/angular': {
                '@angular/core@20': '^8.0.0',
                '@angular/core@19': '^8.0.0',
                '@angular/core@18': '^8.0.0',
            },
            typescript: {
                '@angular/core@20': '^5.6.0',
                '@angular/core@19': '^5.5.0',
                '@angular/core@18': '^5.4.0',
            },
        };

        for (const target of targetPackages) {
            const pattern = upgradePatterns[blocker]?.[`${target}@*`];
            if (pattern) return pattern;
        }

        // Fallback: suggest latest major version
        return 'latest';
    }

    private static findCompatibleVersion(packageName: string, constraints: DependencyConstraint[]): string | null {
        // Analyze constraints to find compatible version range
        const upperBounds = constraints.filter((c) => c.constraint.includes('<')).map((c) => c.constraint);

        if (upperBounds.length > 0) {
            // Find the most restrictive upper bound and suggest a version just below it
            const mostRestrictive = upperBounds.sort()[0];
            const version = mostRestrictive.replace(/[<>=]/g, '').trim();
            const majorVersion = parseInt(version.split('.')[0]) - 1;
            return `^${majorVersion}.0.0`;
        }

        return null;
    }

    private static findEcosystemPackages(target: string, packageJson: any): string[] {
        const allDeps = {
            ...(packageJson.dependencies || {}),
            ...(packageJson.devDependencies || {}),
        };

        return Object.keys(allDeps).filter((pkg) => DependencyAnalyzer.isRelatedPackage(pkg, target));
    }

    private static suggestEcosystemVersion(packageName: string, targetPackages: string[]): string | null {
        // Suggest compatible versions for ecosystem packages
        const ecosystemVersions: Record<string, string> = {
            '@angular/animations': '^20.0.0',
            '@angular/common': '^20.0.0',
            '@angular/compiler': '^20.0.0',
            '@angular/core': '^20.0.0',
            '@angular/forms': '^20.0.0',
            '@angular/platform-browser': '^20.0.0',
            '@angular/platform-browser-dynamic': '^20.0.0',
            '@angular/router': '^20.0.0',
            '@angular/cli': '^20.0.0',
            '@angular/compiler-cli': '^20.0.0',
        };

        return ecosystemVersions[packageName] || null;
    }
}

// Enhanced AI prompting system
function createEnhancedSystemPrompt(): string {
    return `You are an expert npm dependency resolver with STRATEGIC ANALYSIS capabilities and a PRIMARY GOAL of upgrading packages to newer versions.

CORE MISSION: Modernize dependency trees by intelligently resolving conflicts through strategic blocker upgrades.

STRATEGIC PRINCIPLES:
1. IDENTIFY BLOCKING PACKAGES: Analyze dependency constraints to find packages that prevent target upgrades
2. UPGRADE BLOCKERS FIRST: Prioritize upgrading blocking packages to versions that support target upgrades
3. NEWEST COMPATIBLE VERSIONS: Always choose the newest versions that resolve conflicts
4. ECOSYSTEM AWARENESS: Consider coordinated upgrades for related packages (Angular, Storybook, etc.)
5. PROGRESSIVE MODERNIZATION: Never downgrade target packages unless absolutely no alternative exists

ANALYSIS FRAMEWORK:
- Parse peer dependency constraints from error messages
- Identify which packages are blocking target upgrades
- Suggest strategic upgrades of blocking packages
- Recommend ecosystem-wide version coordination when beneficial

RESPONSE REQUIREMENTS:
- Always respond with valid JSON format
- Include rationale for each suggestion
- Prioritize blocker upgrades over target downgrades
- Explain the strategic reasoning behind version choices

Your role is to be a strategic dependency architect, not just a conflict resolver.`;
}

function createStrategicPrompt(errorOutput: string, analysis: ResolverAnalysis, targetPackages: string[], attempt: number, maxAttempts: number): string {
    const constraintSummary = analysis.constraints
        .filter((c) => c.severity === 'blocking')
        .map((c) => `- ${c.dependent} requires ${c.package} ${c.constraint}`)
        .join('\n');

    const blockerSummary = analysis.blockers.length > 0 ? `\nIDENTIFIED BLOCKERS: ${analysis.blockers.join(', ')}` : '\nNo specific blockers identified from error analysis.';

    const strategySummary = analysis.strategies.length > 0 ? `\nRECOMMENDED STRATEGIES:\n${analysis.strategies.map((s) => `- ${s.rationale} (confidence: ${s.confidence})`).join('\n')}` : '';

    return `STRATEGIC DEPENDENCY RESOLUTION - ATTEMPT ${attempt}/${maxAttempts}

TARGET UPGRADES: ${targetPackages.join(', ')}
${blockerSummary}

CONSTRAINT ANALYSIS:
${constraintSummary}
${strategySummary}

INSTALLATION ERROR:
${errorOutput}

STRATEGIC INSTRUCTIONS:
1. If blockers are identified, suggest upgrading them to newer versions that support target packages
2. For Angular/Storybook conflicts: Upgrade Storybook to latest version supporting Angular
3. For TypeScript conflicts: Upgrade to latest compatible version
4. Only suggest target package downgrades as LAST RESORT

Respond with JSON containing strategic upgrade suggestions:
{
  "suggestions": [
    {
      "name": "package-name",
      "version": "suggested-version",
      "isDev": true/false,
      "reason": "strategic rationale for this upgrade",
      "priority": "blocker|target|ecosystem"
    }
  ],
  "analysis": "strategic analysis of the conflict and resolution approach"
}`;
}

// Version compatibility utilities
class VersionCompatibilityChecker {
    private static readonly KNOWN_COMPATIBILITY: Record<string, Record<string, string[]>> = {
        '@angular/core': {
            '20': ['@storybook/angular@^8.0.0', 'typescript@^5.6.0', '@angular/cli@^20.0.0'],
            '19': ['@storybook/angular@^8.0.0', 'typescript@^5.5.0', '@angular/cli@^19.0.0'],
            '18': ['@storybook/angular@^8.0.0', 'typescript@^5.4.0', '@angular/cli@^18.0.0'],
        },
        typescript: {
            '5.6': ['@angular/core@>=18.0.0', '@types/node@*'],
            '5.5': ['@angular/core@>=17.0.0', '@types/node@*'],
            '5.4': ['@angular/core@>=16.0.0', '@types/node@*'],
        },
    };

    static checkCompatibility(
        packageName: string,
        version: string,
        dependencies: Array<{ name: string; version: string }>
    ): {
        compatible: boolean;
        conflicts: string[];
        recommendations: string[];
    } {
        const majorVersion = this.extractMajorVersion(version);
        const knownCompat = this.KNOWN_COMPATIBILITY[packageName]?.[majorVersion];

        if (!knownCompat) {
            return { compatible: true, conflicts: [], recommendations: [] };
        }

        const conflicts: string[] = [];
        const recommendations: string[] = [];

        dependencies.forEach((dep) => {
            const compatible = knownCompat.some((compat) => {
                if (compat.startsWith(dep.name + '@')) {
                    const compatVersion = compat.split('@')[1];
                    return this.isVersionCompatible(dep.version, compatVersion);
                }
                return false;
            });

            if (!compatible) {
                conflicts.push(`${dep.name}@${dep.version}`);
                const recommendedVersion = this.findRecommendedVersion(dep.name, knownCompat);
                if (recommendedVersion) {
                    recommendations.push(`Upgrade ${dep.name} to ${recommendedVersion}`);
                }
            }
        });

        return {
            compatible: conflicts.length === 0,
            conflicts,
            recommendations,
        };
    }

    private static extractMajorVersion(version: string): string {
        const match = version.match(/(\d+)/);
        return match ? match[1] : version;
    }

    private static isVersionCompatible(actual: string, required: string): boolean {
        // Simple compatibility check - in real implementation, use semver
        const actualMajor = this.extractMajorVersion(actual);
        const requiredMajor = this.extractMajorVersion(required);

        if (required.startsWith('^')) {
            return parseInt(actualMajor) >= parseInt(requiredMajor);
        }
        if (required.startsWith('~')) {
            return actualMajor === requiredMajor;
        }
        if (required.includes('>=')) {
            return parseInt(actualMajor) >= parseInt(requiredMajor);
        }

        return actualMajor === requiredMajor;
    }

    private static findRecommendedVersion(packageName: string, compatList: string[]): string | null {
        const recommendation = compatList.find((compat) => compat.startsWith(packageName + '@'));
        return recommendation ? recommendation.split('@')[1] : null;
    }
}

// Enhanced error handling and logging
class ResolverErrorHandler {
    private static readonly ERROR_PATTERNS = {
        PEER_DEPENDENCY: /peer.*dependency|EBOX_UNMET_PEER_DEP/i,
        VERSION_CONFLICT: /Could not resolve dependency|version conflict/i,
        PACKAGE_NOT_FOUND: /404.*not found|E404/i,
        NETWORK_ERROR: /network|timeout|ENOTFOUND/i,
        PERMISSION_ERROR: /EACCES|permission denied/i,
    };

    static categorizeError(error: string): {
        category: string;
        severity: 'low' | 'medium' | 'high';
        actionable: boolean;
        suggestions: string[];
    } {
        if (this.ERROR_PATTERNS.PEER_DEPENDENCY.test(error)) {
            return {
                category: 'peer-dependency',
                severity: 'high',
                actionable: true,
                suggestions: ['Analyze blocking packages and upgrade them', 'Check for newer versions that resolve peer conflicts', 'Consider using --force or --legacy-peer-deps as last resort'],
            };
        }

        if (this.ERROR_PATTERNS.VERSION_CONFLICT.test(error)) {
            return {
                category: 'version-conflict',
                severity: 'high',
                actionable: true,
                suggestions: ['Find compatible version ranges', 'Upgrade conflicting packages to compatible versions', 'Check for ecosystem-wide compatibility updates'],
            };
        }

        if (this.ERROR_PATTERNS.PACKAGE_NOT_FOUND.test(error)) {
            return {
                category: 'package-not-found',
                severity: 'high',
                actionable: true,
                suggestions: ['Verify package name spelling', 'Check if package has been renamed or deprecated', 'Try alternative package sources'],
            };
        }

        if (this.ERROR_PATTERNS.NETWORK_ERROR.test(error)) {
            return {
                category: 'network-error',
                severity: 'medium',
                actionable: false,
                suggestions: ['Check internet connection', 'Try different npm registry', 'Retry installation after delay'],
            };
        }

        return {
            category: 'unknown',
            severity: 'medium',
            actionable: false,
            suggestions: ['Review error output for specific issues'],
        };
    }

    static logStrategicAnalysis(logger: any, analysis: ResolverAnalysis, attempt: number): void {
        logger.info('Strategic Analysis Summary', {
            attempt,
            constraintsFound: analysis.constraints.length,
            blockingConstraints: analysis.constraints.filter((c) => c.severity === 'blocking').length,
            identifiedBlockers: analysis.blockers,
            strategiesGenerated: analysis.strategies.length,
            highConfidenceStrategies: analysis.strategies.filter((s) => s.confidence > 0.7).length,
        });

        if (analysis.constraints.length > 0) {
            logger.debug('Dependency Constraints', {
                constraints: analysis.constraints.map((c) => ({
                    package: c.package,
                    constraint: c.constraint,
                    dependent: c.dependent,
                    type: c.type,
                    severity: c.severity,
                })),
            });
        }

        if (analysis.strategies.length > 0) {
            logger.debug('Generated Strategies', {
                strategies: analysis.strategies.map((s) => ({
                    phase: s.phase,
                    confidence: s.confidence,
                    rationale: s.rationale,
                    blockers: s.blockers,
                    targetVersions: Object.fromEntries(s.targetVersions),
                })),
            });
        }
    }
}

export const dumbResolverHandler = async (input: DumbResolverInput) => {
    const { repo_path, update_dependencies } = input;
    const logger = getLogger().child('dumb-resolver');
    const maxAttempts = 50;
    let attempt = 0;
    let tempDir: string | null = null;

    try {
        logger.info('Starting dependency resolution', {
            repoPath: repo_path,
            dependencies: update_dependencies,
        });

        // Step 1: Create temporary directory and copy package.json
        tempDir = await mkdtempAsync(join(tmpdir(), 'dumb-resolver-'));
        logger.debug('Created temporary directory', { tempDir });

        const originalPackageJsonPath = join(resolve(repo_path), 'package.json');
        const tempPackageJsonPath = join(tempDir, 'package.json');
        const tempPackageLockPath = join(tempDir, 'package-lock.json');
        const originalPackageLockPath = join(resolve(repo_path), 'package-lock.json');

        if (!existsSync(originalPackageJsonPath)) {
            throw new Error(`package.json not found at ${originalPackageJsonPath}`);
        }

        // Copy package.json to temp directory
        await cpAsync(originalPackageJsonPath, tempPackageJsonPath);
        logger.debug('Copied package.json to temp directory');

        // Copy package-lock.json if it exists
        if (existsSync(originalPackageLockPath)) {
            await cpAsync(originalPackageLockPath, tempPackageLockPath);
            logger.debug('Copied package-lock.json to temp directory');
        }

        // Step 2: Read and update package.json with target dependencies
        let packageJson = readPackageJson(tempDir);
        const originalPackageJson = JSON.stringify(packageJson); // Deep clone for AI context

        for (const dep of update_dependencies) {
            updateDependency(packageJson, dep.name, dep.version, dep.isDev);
        }

        writePackageJson(tempDir, packageJson);
        logger.info('Updated dependencies in temp package.json');

        // Step 3: Attempt installation with retry logic
        const openai = getOpenAIService();
        openai.updateConfig({ model: 'copilot-gpt-4', baseURL: 'http://localhost:3000/v1/', maxTokens: 10000, timeout: 300000 });
        let installOutput = '';
        let installError = '';
        let success = false;

        // Initialize enhanced analysis
        let currentAnalysis: ResolverAnalysis = {
            constraints: [],
            blockers: [],
            strategies: [],
            recommendations: [],
        };

        // Initialize chat history for maintaining context across installation attempts
        const systemMessage = createEnhancedSystemPrompt();
        let chatHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemMessage },
            {
                role: 'user',
                content: `ORIGINAL PACKAGE.JSON DEPENDENCIES CONTEXT:
${originalPackageJson}

TARGET UPGRADE GOALS:
${update_dependencies.map((dep) => `- ${dep.name}@${dep.version} (${dep.isDev ? 'dev' : 'prod'})`).join('\n')}

This is the current state before any updates. Focus on achieving these target upgrades through strategic blocker resolution.`,
            },
        ];

        while (attempt < maxAttempts && !success) {
            attempt++;
            logger.info(`Installation attempt ${attempt}/${maxAttempts}`);

            try {
                // Run npm install using enhanced utility
                const { stdout, stderr, success: installSuccess } = await installDependencies(tempDir);
                installOutput = stdout;
                installError = stderr;
                success = installSuccess;

                if (success) {
                    logger.info('Installation successful', { attempt });
                    break;
                }
            } catch (error) {
                // installDependencies throws on failure, so we capture the error
                installError = error instanceof Error ? error.message : String(error);
                success = false;
                logger.warn('Installation failed', { attempt, error: installError });
            }

            // If installation failed and we have more attempts, perform strategic analysis
            if (!success && attempt < maxAttempts) {
                logger.info('Performing strategic dependency analysis');

                // Analyze the error output for constraints and blockers
                currentAnalysis.constraints = DependencyAnalyzer.analyzeDependencyConstraints(installError);
                currentAnalysis.blockers = DependencyAnalyzer.identifyBlockingPackages(
                    currentAnalysis.constraints,
                    update_dependencies.map((dep) => dep.name)
                );

                // Categorize error for better handling
                const errorAnalysis = ResolverErrorHandler.categorizeError(installError);

                // Generate strategic upgrade strategies
                currentAnalysis.strategies = await UpgradeStrategyGenerator.generateStrategies(
                    currentAnalysis.constraints,
                    currentAnalysis.blockers,
                    update_dependencies.map((dep) => dep.name),
                    packageJson
                );

                // Enhanced strategic logging
                ResolverErrorHandler.logStrategicAnalysis(logger, currentAnalysis, attempt);

                logger.info('Error categorization', {
                    category: errorAnalysis.category,
                    severity: errorAnalysis.severity,
                    actionable: errorAnalysis.actionable,
                    suggestions: errorAnalysis.suggestions,
                });

                // Add error analysis to recommendations
                currentAnalysis.recommendations = errorAnalysis.suggestions;

                // Create strategic prompt with analysis context
                const strategicPrompt = createStrategicPrompt(
                    installError,
                    currentAnalysis,
                    update_dependencies.map((dep) => dep.name),
                    attempt,
                    maxAttempts
                );

                // Add current failure and analysis to chat history
                chatHistory.push({ role: 'user', content: strategicPrompt });

                // Try to get valid suggestions from OpenAI (with retry on invalid structure)
                let aiRetryAttempt = 0;
                const maxAiRetries = 5;
                let validSuggestions = false;

                while (aiRetryAttempt < maxAiRetries && !validSuggestions) {
                    aiRetryAttempt++;
                    let response = '';
                    try {
                        response = await openai.generateTextWithHistory(chatHistory, {
                            temperature: 0.3,
                            maxTokens: 1000,
                        });

                        // Add successful assistant response to chat history for future context
                        chatHistory.push({ role: 'assistant', content: response });

                        // Extract JSON from markdown code blocks if present
                        let jsonString = response.trim();
                        const jsonMatch = jsonString.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
                        if (jsonMatch) {
                            jsonString = jsonMatch[1].trim();
                        }

                        // Parse and validate OpenAI response structure
                        const suggestions = JSON.parse(jsonString);

                        // Validate response structure
                        if (!suggestions || typeof suggestions !== 'object') {
                            throw new Error('Invalid response: not an object');
                        }

                        if (!suggestions.suggestions || !Array.isArray(suggestions.suggestions)) {
                            throw new Error('Invalid response: missing or invalid suggestions array');
                        }

                        // Validate each suggestion with enhanced format
                        const invalidSuggestions = suggestions.suggestions.filter((s: any) => !s || typeof s !== 'object' || !s.name || !s.version || typeof s.isDev !== 'boolean' || !s.reason);

                        if (invalidSuggestions.length > 0) {
                            throw new Error(`Invalid suggestions found: ${invalidSuggestions.length} items missing required fields (name, version, isDev, reason)`);
                        }

                        logger.info('Received valid strategic suggestions', {
                            suggestions: suggestions.suggestions.map((s: any) => ({
                                name: s.name,
                                version: s.version,
                                priority: s.priority || 'target',
                                reason: s.reason,
                            })),
                            attempt: aiRetryAttempt,
                        });
                        validSuggestions = true;

                        // Apply suggestions with strategic prioritization
                        packageJson = readPackageJson(tempDir);

                        // Sort suggestions by priority (blocker > target > ecosystem)
                        const priorityOrder = { blocker: 1, target: 2, ecosystem: 3 };
                        const sortedSuggestions = suggestions.suggestions.sort((a: any, b: any) => {
                            const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 2;
                            const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 2;
                            return aPriority - bPriority;
                        });

                        for (const suggestion of sortedSuggestions) {
                            // Check version compatibility before applying
                            const compatibilityCheck = VersionCompatibilityChecker.checkCompatibility(suggestion.name, suggestion.version, update_dependencies);

                            if (!compatibilityCheck.compatible) {
                                logger.warn('Compatibility issues detected', {
                                    package: suggestion.name,
                                    version: suggestion.version,
                                    conflicts: compatibilityCheck.conflicts,
                                    recommendations: compatibilityCheck.recommendations,
                                });
                            }

                            updateDependency(packageJson, suggestion.name, suggestion.version, suggestion.isDev);
                            const targetDep = update_dependencies.find((dep) => dep.name === suggestion.name);
                            if (targetDep) {
                                // Update existing dependency with suggested version
                                targetDep.version = suggestion.version;
                                logger.info('Applied strategic suggestion (updated existing)', {
                                    package: suggestion.name,
                                    version: suggestion.version,
                                    reason: suggestion.reason,
                                    priority: suggestion.priority || 'target',
                                    isDev: targetDep.isDev,
                                    compatibilityStatus: compatibilityCheck.compatible ? 'compatible' : 'potential-issues',
                                });
                            } else {
                                // Add new dependency suggested by strategic analysis
                                const newDep = {
                                    name: suggestion.name,
                                    version: suggestion.version,
                                    isDev: suggestion.isDev,
                                };
                                update_dependencies.push(newDep);
                                logger.info('Applied strategic suggestion (added new)', {
                                    package: suggestion.name,
                                    version: suggestion.version,
                                    reason: suggestion.reason,
                                    priority: suggestion.priority || 'target',
                                    isDev: suggestion.isDev,
                                    compatibilityStatus: compatibilityCheck.compatible ? 'compatible' : 'potential-issues',
                                });
                            }
                        }

                        writePackageJson(tempDir, packageJson);

                        // Add summary of applied changes to chat history for next iteration context
                        const appliedChanges = suggestions.suggestions.map((s: any) => `${s.name}@${s.version}`).join(', ');
                        chatHistory.push({
                            role: 'user',
                            content: `Applied suggestions: ${appliedChanges}. Will now attempt installation with these changes.`,
                        });
                    } catch (aiError) {
                        const errorMsg = aiError instanceof Error ? aiError.message : String(aiError);
                        logger.warn(`OpenAI attempt ${aiRetryAttempt} failed`, { error: errorMsg });

                        if (aiRetryAttempt < maxAiRetries) {
                            // Add assistant response and user retry message to chat history
                            // chatHistory.push({ role: 'assistant', content: response || 'Failed to generate response' });
                            const retryMessage = `IMPORTANT: Previous response was invalid. Please ensure your response is valid JSON with this exact structure:
{
  "suggestions": [
    {
      "name": "package-name",
      "version": "suggested-version",
      "isDev": true/false,
      "reason": "explanation for this version"
    }
  ],
  "analysis": "brief analysis of the conflict"
}

For each suggestion, set isDev to true if it's a development dependency (like typescript, @types/*, testing tools, build tools, linters, and definitely not limited to these only) or false if it's a production dependency.`;

                            chatHistory.push({ role: 'user', content: retryMessage });
                        } else {
                            logger.error('Failed to get valid OpenAI suggestions after retries', { error: errorMsg });
                        }
                    }
                }
            }
        }

        // Step 4: Handle final result
        if (success) {
            // Copy updated files back to original location
            await cpAsync(tempPackageJsonPath, originalPackageJsonPath);
            logger.info('Copied updated package.json back to original location');

            if (existsSync(tempPackageLockPath)) {
                await cpAsync(tempPackageLockPath, originalPackageLockPath);
                logger.info('Copied updated package-lock.json back to original location');
            }

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `✅ Successfully updated dependencies after ${attempt} attempt(s):\n\n` + `Updated packages:\n${update_dependencies.map((dep) => `- ${dep.name}@${dep.version}`).join('\n')}\n\n` + `Strategic Analysis Summary:\n` + `- Constraints analyzed: ${currentAnalysis.constraints.length}\n` + `- Blocking packages identified: ${currentAnalysis.blockers.join(', ') || 'None'}\n` + `- Strategies evaluated: ${currentAnalysis.strategies.length}\n\n` + `Installation output:\n${installOutput.slice(-500)}`, // Last 500 chars to avoid overflow
                    },
                ],
            };
        } else {
            const errorMessage = `❌ Failed to resolve dependencies after ${maxAttempts} attempts.\n\n` + `Strategic Analysis Summary:\n` + `- Constraints found: ${currentAnalysis.constraints.length}\n` + `- Blocking packages: ${currentAnalysis.blockers.join(', ') || 'None identified'}\n` + `- Strategies attempted: ${currentAnalysis.strategies.length}\n\n` + `Final error:\n${installError}\n\n` + `Recommendations:\n${currentAnalysis.recommendations.map((r) => `- ${r}`).join('\n')}\n\n` + `Please check the dependency versions and consider manual resolution.`;

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: errorMessage,
                    },
                ],
            };
        }
    } catch (error) {
        const errorMessage = `❌ Dependency resolution failed: ${error instanceof Error ? error.message : String(error)}`;
        logger.error('Dependency resolution failed', { error: errorMessage });

        return {
            content: [
                {
                    type: 'text' as const,
                    text: errorMessage,
                },
            ],
        };
    } finally {
        // Cleanup temporary directory
        if (tempDir) {
            try {
                rmSync(tempDir, { recursive: true, force: true });
                logger.debug('Successfully cleaned up temporary directory', { tempDir });
            } catch (cleanupError) {
                logger.warn('Failed to cleanup temporary directory', {
                    tempDir,
                    error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                });
            }
        }
    }
};

export function registerDumbTools(server: McpServer) {
    server.registerTool(
        'dumb_resolver',
        {
            title: 'Dependency Resolver Update',
            description: 'Update package dependencies to specific versions and resolve their transitive dependencies automatically',
            inputSchema: dumbResolverInputSchema.shape,
        },
        dumbResolverHandler
    );
}
