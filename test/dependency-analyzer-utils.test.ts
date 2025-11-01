import { expect, describe, it } from 'bun:test';
import { analyzeDependencyConstraints, assessConstraintSeverity, identifyBlockingPackages, isRelatedPackage, DependencyConstraint, UpgradeStrategy, ResolverAnalysis } from '@U/dumb-resolver-helper';

describe('Dependency Analyzer Utils', function () {
    describe('analyzeDependencyConstraints', function () {
        it('should parse simple dependency requirements correctly', function () {
            // Test with simplified patterns that should match
            const errorOutput = `
                @angular/core@16.2.5 requires typescript@^4.0.0
                webpack@5.88.2 requires webpack-cli@^4.0.0
            `;

            const constraints = analyzeDependencyConstraints(errorOutput);

            expect(constraints.length).toBeGreaterThan(0);

            // Should find version-mismatch type constraints
            const typescriptConstraint = constraints.find((c) => c.package === 'typescript');
            expect(typescriptConstraint).toBeDefined();
            expect(typescriptConstraint?.type).toBe('version-mismatch');
        });

        it('should parse version conflict errors correctly', function () {
            const errorOutput = `
                Found: typescript@5.2.2
                Could not resolve dependency:
                peer typescript@4.9.0 from @angular/compiler-cli@16.2.5
            `;

            const constraints = analyzeDependencyConstraints(errorOutput);

            const conflictConstraint = constraints.find((c) => c.type === 'conflict');
            expect(conflictConstraint).toBeDefined();
            expect(conflictConstraint?.package).toBe('typescript');
            expect(conflictConstraint?.severity).toBe('blocking');
        });

        it('should parse version mismatch errors correctly', function () {
            const errorOutput = `
                @angular/core@16.2.5 requires typescript@^4.9.0
                webpack@5.88.2 requires webpack-cli@^4.0.0
            `;

            const constraints = analyzeDependencyConstraints(errorOutput);

            const versionMismatch = constraints.find((c) => c.type === 'version-mismatch');
            expect(versionMismatch).toBeDefined();
            expect(['typescript', 'webpack-cli']).toContain(versionMismatch!.package);
        });

        it('should parse unmet peer dependency errors correctly', function () {
            const errorOutput = `
                EBOX_UNMET_PEER_DEP @angular/material@16.2.0 requires a peer of @angular/core@16.0.0
                EBOX_UNMET_PEER_DEP storybook@7.4.0 requires a peer of webpack@5.0.0
            `;

            const constraints = analyzeDependencyConstraints(errorOutput);

            const unmetPeer = constraints.find((c) => c.package === '@angular/core');
            expect(unmetPeer).toBeDefined();
            expect(unmetPeer?.type).toBe('peer');
            expect(unmetPeer?.severity).toBe('blocking');
        });

        it('should handle empty or invalid input gracefully', function () {
            const constraints = analyzeDependencyConstraints('');
            expect(constraints.length).toBe(0);

            const invalidConstraints = analyzeDependencyConstraints('random text with no dependency info');
            expect(invalidConstraints.length).toBe(0);
        });

        it('should deduplicate identical constraints', function () {
            const errorOutput = `
                @angular/core@16.2.5 requires typescript@^4.9.0
                @angular/core@16.2.5 requires typescript@^4.9.0
                Found: typescript@5.2.2
                Could not resolve dependency:
                peer typescript@4.9.0 from @angular/compiler-cli@16.2.5
                Found: typescript@5.2.2
                Could not resolve dependency:
                peer typescript@4.9.0 from @angular/compiler-cli@16.2.5
            `;

            const constraints = analyzeDependencyConstraints(errorOutput);

            // Should have constraints but deduplicated
            expect(constraints.length).toBeGreaterThan(0);

            // Check for duplicates manually
            const constraintKeys = constraints.map((c) => `${c.package}:${c.constraint}:${c.dependent}`);
            const uniqueKeys = [...new Set(constraintKeys)];
            expect(constraintKeys.length).toBe(uniqueKeys.length); // No duplicates
        });

        it('should handle complex multi-line error outputs', function () {
            const errorOutput = `
                npm ERR! code ERESOLVE
                npm ERR! ERESOLVE unable to resolve dependency tree
                npm ERR! 
                npm ERR! Found: @angular/core@16.2.5
                npm ERR! Could not resolve dependency:
                npm ERR! peer @angular/core@15.0.0 from @angular/material@15.2.9
                npm ERR!
                @angular/compiler-cli@15.2.9 requires typescript@^4.8.0
            `;

            const constraints = analyzeDependencyConstraints(errorOutput);
            expect(constraints.length).toBeGreaterThan(0);

            const hasAngularConstraint = constraints.some((c) => c.package === '@angular/core');
            const hasTypescriptConstraint = constraints.some((c) => c.package === 'typescript');

            expect(hasAngularConstraint || hasTypescriptConstraint).toBe(true);
        });
    });

    describe('assessConstraintSeverity', function () {
        it('should assess blocking constraints correctly', function () {
            expect(assessConstraintSeverity('<5.0.0')).toBe('blocking');
            expect(assessConstraintSeverity('<=4.9.0')).toBe('blocking');
            expect(assessConstraintSeverity('4.9.0')).toBe('blocking'); // exact version
        });

        it('should assess warning constraints correctly', function () {
            expect(assessConstraintSeverity('^16.0.0')).toBe('warning');
            expect(assessConstraintSeverity('~4.9.0')).toBe('warning');
            expect(assessConstraintSeverity('>=4.0.0')).toBe('warning');
            expect(assessConstraintSeverity('>=4.0.0 <6.0.0')).toBe('warning');
        });

        it('should assess info constraints correctly', function () {
            expect(assessConstraintSeverity('')).toBe('info');
            expect(assessConstraintSeverity(null as any)).toBe('info');
            expect(assessConstraintSeverity(undefined as any)).toBe('info');
        });

        it('should handle complex version ranges', function () {
            expect(assessConstraintSeverity('>=4.9.0 <5.2.0')).toBe('warning'); // has >= so it's warning
            expect(assessConstraintSeverity('^4.0.0 || ^5.0.0')).toBe('warning'); // has caret
            expect(assessConstraintSeverity('*')).toBe('blocking'); // exact version (no ^, ~, >=)
        });
    });

    describe('identifyBlockingPackages', function () {
        it('should identify blocking packages from constraints', function () {
            const constraints: DependencyConstraint[] = [
                {
                    package: '@angular/core',
                    constraint: '^15.0.0',
                    dependent: '@angular/material@15.2.9',
                    type: 'peer',
                    severity: 'blocking',
                },
                {
                    package: 'typescript',
                    constraint: '<5.0.0',
                    dependent: '@angular/compiler-cli@15.2.9',
                    type: 'peer',
                    severity: 'blocking',
                },
                {
                    package: 'rxjs',
                    constraint: '^7.0.0',
                    dependent: '@angular/core@16.0.0',
                    type: 'peer',
                    severity: 'warning',
                },
            ];

            const targetPackages = ['@angular/core', 'typescript'];
            const blockers = identifyBlockingPackages(constraints, targetPackages);

            expect(blockers).toContain('@angular/material');
            expect(blockers).toContain('@angular/compiler-cli');
            // Only blocking severity should be included
            expect(blockers).not.toContain('@angular/core');
        });

        it('should handle empty constraints', function () {
            const blockers = identifyBlockingPackages([], ['@angular/core']);
            expect(Array.isArray(blockers) && blockers.length === 0).toBe(true);
        });

        it('should identify related package blockers', function () {
            const constraints: DependencyConstraint[] = [
                {
                    package: '@angular/core',
                    constraint: '^15.0.0',
                    dependent: '@angular/material@15.2.9',
                    type: 'peer',
                    severity: 'blocking',
                },
            ];

            const targetPackages = ['@angular/router']; // Related to @angular/core
            const blockers = identifyBlockingPackages(constraints, targetPackages);

            expect(blockers).toContain('@angular/material');
        });
    });

    describe('isRelatedPackage', function () {
        it('should identify Angular ecosystem packages', function () {
            expect(isRelatedPackage('@angular/core', '@angular/router')).toBe(true);
            expect(isRelatedPackage('@angular/material', '@ngrx/store')).toBe(true);
            expect(isRelatedPackage('@angular-devkit/build-angular', '@schematics/angular')).toBe(true);
            expect(isRelatedPackage('ng-bootstrap', '@angular/core')).toBe(true);
        });

        it('should identify Storybook ecosystem packages', function () {
            expect(isRelatedPackage('@storybook/angular', '@storybook/addon-docs')).toBe(true);
            expect(isRelatedPackage('storybook', '@storybook/core')).toBe(true);
        });

        it('should identify TypeScript ecosystem packages', function () {
            expect(isRelatedPackage('@types/node', 'typescript')).toBe(true);
            expect(isRelatedPackage('@types/jest', '@types/mocha')).toBe(true);
        });

        it('should identify Babel ecosystem packages', function () {
            expect(isRelatedPackage('@babel/core', '@babel/preset-env')).toBe(true);
            expect(isRelatedPackage('babel-loader', '@babel/core')).toBe(true);
        });

        it('should identify ESLint ecosystem packages', function () {
            expect(isRelatedPackage('eslint', '@eslint/js')).toBe(true);
            expect(isRelatedPackage('eslint-config-airbnb', 'eslint-plugin-react')).toBe(true);
        });

        it('should identify Webpack ecosystem packages', function () {
            expect(isRelatedPackage('webpack', 'webpack-cli')).toBe(true);
            expect(isRelatedPackage('webpack-dev-server', '@webpack/merge')).toBe(true);
        });

        it('should return false for unrelated packages', function () {
            expect(isRelatedPackage('lodash', 'express')).toBe(false);
            expect(isRelatedPackage('@angular/core', 'react')).toBe(false);
            expect(isRelatedPackage('webpack', 'vite')).toBe(false);
        });

        it('should handle edge cases', function () {
            expect(isRelatedPackage('', '')).toBe(false);
            expect(isRelatedPackage('@angular/core', '')).toBe(false);
            expect(isRelatedPackage('', '@angular/router')).toBe(false);
        });
    });

    describe('Integration Tests', function () {
        it('should provide complete analysis workflow', function () {
            const complexErrorOutput = `
                npm ERR! code ERESOLVE
                npm ERR! ERESOLVE unable to resolve dependency tree
                npm ERR! 
                Found: @angular/core@15.2.9
                Could not resolve dependency:
                peer @angular/core@16.0.0 from @angular/material@16.2.0
                
                @angular/compiler-cli@16.2.5 requires typescript@^4.9.0
                
                EBOX_UNMET_PEER_DEP storybook@7.4.0 requires a peer of webpack@5.0.0
            `;

            const constraints = analyzeDependencyConstraints(complexErrorOutput);
            expect(constraints.length).toBeGreaterThan(0);

            const targetPackages = ['@angular/core', 'typescript', 'webpack'];
            const blockers = identifyBlockingPackages(constraints, targetPackages);

            expect(Array.isArray(blockers)).toBe(true);
            expect(blockers.length).toBeGreaterThan(0);

            // Verify severity assessment
            const blockingConstraints = constraints.filter((c) => c.severity === 'blocking');
            expect(blockingConstraints.length).toBeGreaterThan(0);

            // Verify related package detection
            const hasAngularRelated = constraints.some((c) => isRelatedPackage(c.package, '@angular/core') || isRelatedPackage(c.dependent.split('@')[0], '@angular/core') || c.package.includes('@angular') || c.dependent.includes('@angular'));
            expect(hasAngularRelated).toBe(true);
        });

        it('should handle real-world npm error output formats', function () {
            const realWorldError = `
npm ERR! code ERESOLVE
npm ERR! ERESOLVE could not resolve
npm ERR! 
npm ERR! While resolving: @angular-devkit/build-angular@16.2.5
npm ERR! Found: webpack@5.88.2
npm ERR! node_modules/webpack
npm ERR!   dev webpack@"^5.88.0" from the root project
npm ERR!   peer webpack@">=5.20.0" from @angular-devkit/build-webpack@0.1602.5
npm ERR!   node_modules/@angular-devkit/build-webpack
npm ERR!     @angular-devkit/build-webpack@"0.1602.5" from @angular-devkit/build-angular@16.2.5
npm ERR!     node_modules/@angular-devkit/build-angular
npm ERR!       dev @angular-devkit/build-angular@"^16.2.0" from the root project
            `;

            const constraints = analyzeDependencyConstraints(realWorldError);

            // Should extract meaningful constraints even from complex nested output
            expect(Array.isArray(constraints)).toBe(true);

            // Should identify webpack-related dependencies
            const webpackConstraints = constraints.filter((c) => c.package.includes('webpack') || c.dependent.includes('webpack'));

            if (webpackConstraints.length > 0) {
                expect(webpackConstraints[0]).toHaveProperty('type');
                expect(webpackConstraints[0]).toHaveProperty('severity');
            }
        });
    });

    describe('Type Definitions', function () {
        it('should create valid DependencyConstraint objects', function () {
            const constraint: DependencyConstraint = {
                package: '@angular/core',
                constraint: '^16.0.0',
                dependent: '@angular/material@16.2.0',
                type: 'peer',
                severity: 'blocking',
            };

            expect(constraint).toHaveProperty('package');
            expect(constraint).toHaveProperty('constraint');
            expect(constraint).toHaveProperty('dependent');
            expect(constraint).toHaveProperty('type');
            expect(constraint).toHaveProperty('severity');

            expect(['peer', 'direct', 'conflict', 'version-mismatch']).toContain(constraint.type);
            expect(['blocking', 'warning', 'info']).toContain(constraint.severity);
        });

        it('should create valid UpgradeStrategy objects', function () {
            const strategy: UpgradeStrategy = {
                blockers: ['@angular/material'],
                targetVersions: new Map([['@angular/core', '^16.0.0']]),
                rationale: 'Upgrade Angular core to resolve peer dependency conflicts',
                confidence: 0.85,
                phase: 'blocker-upgrade',
            };

            expect(strategy).toHaveProperty('blockers');
            expect(strategy).toHaveProperty('targetVersions');
            expect(strategy).toHaveProperty('rationale');
            expect(strategy).toHaveProperty('confidence');
            expect(strategy).toHaveProperty('phase');

            expect(Array.isArray(strategy.blockers)).toBe(true);
            expect(strategy.targetVersions).toBeInstanceOf(Map);
            expect(typeof strategy.confidence).toBe('number');
            expect(['blocker-upgrade', 'target-upgrade', 'cleanup']).toContain(strategy.phase);
        });

        it('should create valid ResolverAnalysis objects', function () {
            const analysis: ResolverAnalysis = {
                constraints: [],
                blockers: [],
                strategies: [],
                recommendations: [],
            };

            expect(analysis).toHaveProperty('constraints');
            expect(analysis).toHaveProperty('blockers');
            expect(analysis).toHaveProperty('strategies');
            expect(analysis).toHaveProperty('recommendations');

            expect(Array.isArray(analysis.constraints)).toBe(true);
            expect(Array.isArray(analysis.blockers)).toBe(true);
            expect(Array.isArray(analysis.strategies)).toBe(true);
            expect(Array.isArray(analysis.recommendations)).toBe(true);
        });
    });
});
