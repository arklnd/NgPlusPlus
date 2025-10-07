import { ResolverAnalysis } from './dependency-analyzer.utils';

/**
 * Creates an enhanced system prompt for AI-driven dependency resolution
 */
export function createEnhancedSystemPrompt(): string {
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

/**
 * Creates a strategic prompt for AI analysis of dependency conflicts
 */
export function createStrategicPrompt(errorOutput: string, analysis: ResolverAnalysis, targetPackages: string[], attempt: number, maxAttempts: number): string {
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
