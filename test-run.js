#!/usr/bin/env node

/**
 * Test Guardian on itself and generate report
 */

const GuardianEngine = require('./guardian-engine');
const ToolDetector = require('./tool-detector');
const fs = require('fs-extra');
const path = require('path');

async function runTest() {
    console.log('🛡️  Testing Intelligent Cloud Guardian on itself...\n');

    const projectPath = process.cwd();

    // Configure Guardian
    const config = {
        projectName: 'intelligent-cloud-guardian',
        experienceLevel: 'advanced',
        // No AI keys for now - test without AI
    };

    console.log('═'.repeat(60));
    console.log('STEP 1: SECURITY SCAN');
    console.log('═'.repeat(60) + '\n');

    const engine = new GuardianEngine(projectPath, config);
    const securityResults = await engine.analyze({ aiExplanations: false });

    console.log(`\n📊 Security Scan Results:`);
    console.log(`   🔴 Critical: ${securityResults.issues.filter(i => i.severity === 'CRITICAL').length}`);
    console.log(`   🟠 High: ${securityResults.issues.filter(i => i.severity === 'HIGH').length}`);
    console.log(`   🟡 Medium: ${securityResults.issues.filter(i => i.severity === 'MEDIUM').length}`);
    console.log(`   ⚪ Warnings: ${securityResults.warnings.length}`);

    if (securityResults.issues.length > 0) {
        console.log('\n❌ Issues Found:\n');
        securityResults.issues.forEach((issue, idx) => {
            const icon = issue.severity === 'CRITICAL' ? '🔴' :
                        issue.severity === 'HIGH' ? '🟠' : '🟡';
            console.log(`${idx + 1}. ${icon} [${issue.severity}] ${issue.message}`);
            if (issue.file) console.log(`   📄 ${issue.file}`);
            if (issue.autoFixable) console.log(`   ✅ Auto-fixable`);
            console.log();
        });
    } else {
        console.log('\n✅ No security issues found!\n');
    }

    if (securityResults.warnings.length > 0) {
        console.log('⚠️  Warnings:\n');
        securityResults.warnings.slice(0, 5).forEach((warning, idx) => {
            console.log(`${idx + 1}. ⚪ ${warning.message}`);
        });
        console.log();
    }

    console.log('\n' + '═'.repeat(60));
    console.log('STEP 2: TOOL DETECTION');
    console.log('═'.repeat(60) + '\n');

    const detector = new ToolDetector(projectPath);
    const toolResults = await detector.analyze();

    console.log(`\n🔧 Tool Detection Results:`);
    console.log(`   ✅ Detected: ${toolResults.detected.length} tools/frameworks`);
    console.log(`   ❌ Missing: ${toolResults.missing.length} required tools`);
    console.log(`   💡 Recommendations: ${toolResults.recommendations.length}`);

    if (toolResults.detected.length > 0) {
        console.log('\n✅ Detected Tools & Frameworks:\n');

        const byCategory = toolResults.detected.reduce((acc, tool) => {
            if (!acc[tool.category]) acc[tool.category] = [];
            acc[tool.category].push(tool);
            return acc;
        }, {});

        for (const [category, tools] of Object.entries(byCategory)) {
            console.log(`📦 ${category.toUpperCase()}:`);
            tools.forEach(tool => {
                const name = tool.name || tool.provider || tool.package;
                console.log(`   ✓ ${name}`);
            });
            console.log();
        }
    }

    if (toolResults.missing.length > 0) {
        console.log('❌ Missing Tools:\n');
        toolResults.missing.forEach((tool, idx) => {
            console.log(`${idx + 1}. ${tool.name}`);
            console.log(`   Reason: ${tool.reason}`);
            if (tool.install) console.log(`   Install: ${tool.install}`);
            console.log();
        });
    }

    if (toolResults.recommendations.length > 0) {
        console.log('💡 Recommendations:\n');
        toolResults.recommendations.slice(0, 5).forEach((rec, idx) => {
            console.log(`${idx + 1}. ${rec.category}: ${rec.type || rec.tool || 'Setup'}`);
            console.log(`   ${rec.reason || rec.suggestion}`);
            console.log();
        });
    }

    console.log('\n' + '═'.repeat(60));
    console.log('STEP 3: PROJECT ANALYSIS');
    console.log('═'.repeat(60) + '\n');

    // Analyze package.json
    try {
        const pkg = await fs.readJson(path.join(projectPath, 'package.json'));
        console.log('📦 Package Analysis:');
        console.log(`   Name: ${pkg.name}`);
        console.log(`   Version: ${pkg.version}`);
        console.log(`   Dependencies: ${Object.keys(pkg.dependencies || {}).length}`);
        console.log(`   Dev Dependencies: ${Object.keys(pkg.devDependencies || {}).length}`);

        console.log('\n   Key Dependencies:');
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const important = Object.keys(deps).filter(d =>
            ['anthropic', 'generative-ai', 'commander', 'inquirer', 'chalk'].includes(d.split('/').pop())
        );
        important.forEach(dep => {
            console.log(`   • ${dep}: ${deps[dep]}`);
        });
    } catch (error) {
        console.log('⚠️  Could not analyze package.json');
    }

    // Check git status
    console.log('\n📁 Git Status:');
    try {
        const { execSync } = require('child_process');
        const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
        console.log(`   Branch: ${branch}`);

        const status = execSync('git status --porcelain', { encoding: 'utf-8' });
        const files = status.split('\n').filter(Boolean);
        console.log(`   Uncommitted changes: ${files.length}`);

        if (files.length > 0 && files.length < 10) {
            console.log('\n   Modified files:');
            files.slice(0, 5).forEach(file => {
                console.log(`   ${file}`);
            });
        }
    } catch (error) {
        console.log('   Not a git repository or git not available');
    }

    // File count
    console.log('\n📄 Project Structure:');
    const jsFiles = await getAllFiles(projectPath, ['.js']);
    const mdFiles = await getAllFiles(projectPath, ['.md']);
    console.log(`   JavaScript files: ${jsFiles.length}`);
    console.log(`   Documentation files: ${mdFiles.length}`);
    console.log(`   Core files: ${jsFiles.filter(f => !f.includes('node_modules')).length}`);

    console.log('\n' + '═'.repeat(60));
    console.log('FINAL REPORT');
    console.log('═'.repeat(60) + '\n');

    const criticalCount = securityResults.issues.filter(i => i.severity === 'CRITICAL').length;
    const highCount = securityResults.issues.filter(i => i.severity === 'HIGH').length;

    if (criticalCount === 0 && highCount === 0) {
        console.log('✅ OVERALL STATUS: HEALTHY');
        console.log('\n🎉 This project is well-configured and ready to use!');
    } else if (criticalCount > 0) {
        console.log('🔴 OVERALL STATUS: CRITICAL ISSUES DETECTED');
        console.log(`\n⚠️  ${criticalCount} critical issue(s) need immediate attention.`);
    } else {
        console.log('🟠 OVERALL STATUS: ISSUES DETECTED');
        console.log(`\n⚠️  ${highCount} high-priority issue(s) should be fixed.`);
    }

    console.log('\n📊 Summary:');
    console.log(`   Total issues: ${securityResults.issues.length}`);
    console.log(`   Auto-fixable: ${securityResults.issues.filter(i => i.autoFixable).length}`);
    console.log(`   Tools detected: ${toolResults.detected.length}`);
    console.log(`   Missing tools: ${toolResults.missing.length}`);
    console.log(`   Recommendations: ${toolResults.recommendations.length}`);

    console.log('\n💡 Next Steps:');
    if (securityResults.issues.filter(i => i.autoFixable).length > 0) {
        console.log('   1. Run: nimbus fix (to auto-fix issues)');
    }
    if (toolResults.missing.length > 0) {
        console.log('   2. Install missing tools (see above)');
    }
    console.log('   3. Launch dashboard: nimbus dashboard');
    console.log('   4. Try AI chat: nimbus chat\n');

    // Generate report file
    const report = {
        timestamp: new Date().toISOString(),
        project: 'intelligent-cloud-guardian',
        security: {
            critical: criticalCount,
            high: highCount,
            medium: securityResults.issues.filter(i => i.severity === 'MEDIUM').length,
            warnings: securityResults.warnings.length,
            issues: securityResults.issues
        },
        tools: {
            detected: toolResults.detected,
            missing: toolResults.missing,
            recommendations: toolResults.recommendations
        }
    };

    await fs.writeJson(path.join(projectPath, 'guardian-test-report.json'), report, { spaces: 2 });
    console.log('📄 Detailed report saved to: guardian-test-report.json\n');
}

async function getAllFiles(dir, extensions) {
    const files = [];

    async function scan(currentDir) {
        if (currentDir.includes('node_modules')) return;

        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    await scan(fullPath);
                } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        } catch {
            // Skip inaccessible directories
        }
    }

    await scan(dir);
    return files;
}

runTest().catch(console.error);