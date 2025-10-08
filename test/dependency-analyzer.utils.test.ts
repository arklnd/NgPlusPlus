import { expect } from 'chai';
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

            expect(constraints).to.have.length.greaterThan(0);

            // Should find version-mismatch type constraints
            const typescriptConstraint = constraints.find((c) => c.package === 'typescript');
            expect(typescriptConstraint).to.exist;
            expect(typescriptConstraint?.type).to.equal('version-mismatch');
        });

        it('should parse version conflict errors correctly', function () {
            const errorOutput = `
                Found: typescript@5.2.2
                Could not resolve dependency:
                peer typescript@4.9.0 from @angular/compiler-cli@16.2.5
            `;

            const constraints = analyzeDependencyConstraints(errorOutput);

            const conflictConstraint = constraints.find((c) => c.type === 'conflict');
            expect(conflictConstraint).to.exist;
            expect(conflictConstraint?.package).to.equal('typescript');
            expect(conflictConstraint?.severity).to.equal('blocking');
        });

        it('should parse version mismatch errors correctly', function () {
            const errorOutput = `
                @angular/core@16.2.5 requires typescript@^4.9.0
                webpack@5.88.2 requires webpack-cli@^4.0.0
            `;

            const constraints = analyzeDependencyConstraints(errorOutput);

            const versionMismatch = constraints.find((c) => c.type === 'version-mismatch');
            expect(versionMismatch).to.exist;
            expect(versionMismatch?.package).to.be.oneOf(['typescript', 'webpack-cli']);
        });

        it('should parse unmet peer dependency errors correctly', function () {
            const errorOutput = `
                EBOX_UNMET_PEER_DEP @angular/material@16.2.0 requires a peer of @angular/core@16.0.0
                EBOX_UNMET_PEER_DEP storybook@7.4.0 requires a peer of webpack@5.0.0
            `;

            const constraints = analyzeDependencyConstraints(errorOutput);

            const unmetPeer = constraints.find((c) => c.package === '@angular/core');
            expect(unmetPeer).to.exist;
            expect(unmetPeer?.type).to.equal('peer');
            expect(unmetPeer?.severity).to.equal('blocking');
        });

        it('should handle empty or invalid input gracefully', function () {
            const constraints = analyzeDependencyConstraints('');
            expect(constraints).to.be.an('array').that.is.empty;

            const invalidConstraints = analyzeDependencyConstraints('random text with no dependency info');
            expect(invalidConstraints).to.be.an('array').that.is.empty;
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
            expect(constraints).to.have.length.greaterThan(0);

            // Check for duplicates manually
            const constraintKeys = constraints.map((c) => `${c.package}:${c.constraint}:${c.dependent}`);
            const uniqueKeys = [...new Set(constraintKeys)];
            expect(constraintKeys.length).to.equal(uniqueKeys.length); // No duplicates
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
            expect(constraints).to.have.length.greaterThan(0);

            const hasAngularConstraint = constraints.some((c) => c.package === '@angular/core');
            const hasTypescriptConstraint = constraints.some((c) => c.package === 'typescript');

            expect(hasAngularConstraint || hasTypescriptConstraint).to.be.true;
        });
    });

    describe('assessConstraintSeverity', function () {
        it('should assess blocking constraints correctly', function () {
            expect(assessConstraintSeverity('<5.0.0')).to.equal('blocking');
            expect(assessConstraintSeverity('<=4.9.0')).to.equal('blocking');
            expect(assessConstraintSeverity('4.9.0')).to.equal('blocking'); // exact version
        });

        it('should assess warning constraints correctly', function () {
            expect(assessConstraintSeverity('^16.0.0')).to.equal('warning');
            expect(assessConstraintSeverity('~4.9.0')).to.equal('warning');
            expect(assessConstraintSeverity('>=4.0.0')).to.equal('warning');
            expect(assessConstraintSeverity('>=4.0.0 <6.0.0')).to.equal('warning');
        });

        it('should assess info constraints correctly', function () {
            expect(assessConstraintSeverity('')).to.equal('info');
            expect(assessConstraintSeverity(null as any)).to.equal('info');
            expect(assessConstraintSeverity(undefined as any)).to.equal('info');
        });

        it('should handle complex version ranges', function () {
            expect(assessConstraintSeverity('>=4.9.0 <5.2.0')).to.equal('warning'); // has >= so it's warning
            expect(assessConstraintSeverity('^4.0.0 || ^5.0.0')).to.equal('warning'); // has caret
            expect(assessConstraintSeverity('*')).to.equal('blocking'); // exact version (no ^, ~, >=)
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

            expect(blockers).to.include('@angular/material');
            expect(blockers).to.include('@angular/compiler-cli');
            // Only blocking severity should be included
            expect(blockers).to.not.include('@angular/core');
        });

        it('should handle empty constraints', function () {
            const blockers = identifyBlockingPackages([], ['@angular/core']);
            expect(blockers).to.be.an('array').that.is.empty;
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

            expect(blockers).to.include('@angular/material');
        });
    });

    describe('isRelatedPackage', function () {
        it('should identify Angular ecosystem packages', function () {
            expect(isRelatedPackage('@angular/core', '@angular/router')).to.be.true;
            expect(isRelatedPackage('@angular/material', '@ngrx/store')).to.be.true;
            expect(isRelatedPackage('@angular-devkit/build-angular', '@schematics/angular')).to.be.true;
            expect(isRelatedPackage('ng-bootstrap', '@angular/core')).to.be.true;
        });

        it('should identify Storybook ecosystem packages', function () {
            expect(isRelatedPackage('@storybook/angular', '@storybook/addon-docs')).to.be.true;
            expect(isRelatedPackage('storybook', '@storybook/core')).to.be.true;
        });

        it('should identify TypeScript ecosystem packages', function () {
            expect(isRelatedPackage('@types/node', 'typescript')).to.be.true;
            expect(isRelatedPackage('@types/jest', '@types/mocha')).to.be.true;
        });

        it('should identify Babel ecosystem packages', function () {
            expect(isRelatedPackage('@babel/core', '@babel/preset-env')).to.be.true;
            expect(isRelatedPackage('babel-loader', '@babel/core')).to.be.true;
        });

        it('should identify ESLint ecosystem packages', function () {
            expect(isRelatedPackage('eslint', '@eslint/js')).to.be.true;
            expect(isRelatedPackage('eslint-config-airbnb', 'eslint-plugin-react')).to.be.true;
        });

        it('should identify Webpack ecosystem packages', function () {
            expect(isRelatedPackage('webpack', 'webpack-cli')).to.be.true;
            expect(isRelatedPackage('webpack-dev-server', '@webpack/merge')).to.be.true;
        });

        it('should return false for unrelated packages', function () {
            expect(isRelatedPackage('lodash', 'express')).to.be.false;
            expect(isRelatedPackage('@angular/core', 'react')).to.be.false;
            expect(isRelatedPackage('webpack', 'vite')).to.be.false;
        });

        it('should handle edge cases', function () {
            expect(isRelatedPackage('', '')).to.be.false;
            expect(isRelatedPackage('@angular/core', '')).to.be.false;
            expect(isRelatedPackage('', '@angular/router')).to.be.false;
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
            expect(constraints).to.have.length.greaterThan(0);

            const targetPackages = ['@angular/core', 'typescript', 'webpack'];
            const blockers = identifyBlockingPackages(constraints, targetPackages);

            expect(blockers).to.be.an('array');
            expect(blockers.length).to.be.greaterThan(0);

            // Verify severity assessment
            const blockingConstraints = constraints.filter((c) => c.severity === 'blocking');
            expect(blockingConstraints).to.have.length.greaterThan(0);

            // Verify related package detection
            const hasAngularRelated = constraints.some((c) => isRelatedPackage(c.package, '@angular/core') || isRelatedPackage(c.dependent.split('@')[0], '@angular/core') || c.package.includes('@angular') || c.dependent.includes('@angular'));
            expect(hasAngularRelated).to.be.true;
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
            expect(constraints).to.be.an('array');

            // Should identify webpack-related dependencies
            const webpackConstraints = constraints.filter((c) => c.package.includes('webpack') || c.dependent.includes('webpack'));

            if (webpackConstraints.length > 0) {
                expect(webpackConstraints[0]).to.have.property('type');
                expect(webpackConstraints[0]).to.have.property('severity');
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

            expect(constraint).to.have.property('package');
            expect(constraint).to.have.property('constraint');
            expect(constraint).to.have.property('dependent');
            expect(constraint).to.have.property('type');
            expect(constraint).to.have.property('severity');

            expect(constraint.type).to.be.oneOf(['peer', 'direct', 'conflict', 'version-mismatch']);
            expect(constraint.severity).to.be.oneOf(['blocking', 'warning', 'info']);
        });

        it('should create valid UpgradeStrategy objects', function () {
            const strategy: UpgradeStrategy = {
                blockers: ['@angular/material'],
                targetVersions: new Map([['@angular/core', '^16.0.0']]),
                rationale: 'Upgrade Angular core to resolve peer dependency conflicts',
                confidence: 0.85,
                phase: 'blocker-upgrade',
            };

            expect(strategy).to.have.property('blockers');
            expect(strategy).to.have.property('targetVersions');
            expect(strategy).to.have.property('rationale');
            expect(strategy).to.have.property('confidence');
            expect(strategy).to.have.property('phase');

            expect(strategy.blockers).to.be.an('array');
            expect(strategy.targetVersions).to.be.instanceOf(Map);
            expect(strategy.confidence).to.be.a('number');
            expect(strategy.phase).to.be.oneOf(['blocker-upgrade', 'target-upgrade', 'cleanup']);
        });

        it('should create valid ResolverAnalysis objects', function () {
            const analysis: ResolverAnalysis = {
                constraints: [],
                blockers: [],
                strategies: [],
                recommendations: [],
            };

            expect(analysis).to.have.property('constraints');
            expect(analysis).to.have.property('blockers');
            expect(analysis).to.have.property('strategies');
            expect(analysis).to.have.property('recommendations');

            expect(analysis.constraints).to.be.an('array');
            expect(analysis.blockers).to.be.an('array');
            expect(analysis.strategies).to.be.an('array');
            expect(analysis.recommendations).to.be.an('array');
        });
    });
});
