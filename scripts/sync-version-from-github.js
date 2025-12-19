#!/usr/bin/env node

/**
 * Sync version from GitHub release tag to all version files
 * 
 * This script:
 * 1. Fetches the latest GitHub release tag
 * 2. Updates package.json version
 * 3. Updates manifest.json version
 * 4. Updates server.js version (hardcoded)
 * 5. version.js will be auto-updated by vite-plugin-version.js during build
 * 
 * Usage:
 *   node scripts/sync-version-from-github.js [--tag v1.2.3] [--repo owner/repo]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Default repository (can be overridden)
const DEFAULT_REPO = 'aidenlab/juicebox-mcp';

/**
 * Fetch latest GitHub release tag
 */
async function fetchLatestReleaseTag(repo = DEFAULT_REPO) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'juicebox-mcp-version-sync'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`No releases found for repository ${repo}. Create a release on GitHub first.`);
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const tag = data.tag_name;
    
    // Remove 'v' prefix if present (e.g., 'v1.0.0' -> '1.0.0')
    return tag.startsWith('v') ? tag.slice(1) : tag;
  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to fetch release from GitHub. ${error.message}`);
    }
    throw error;
  }
}

/**
 * Update package.json version
 */
function updatePackageJson(version) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const oldVersion = packageJson.version;
  packageJson.version = version;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✓ Updated package.json: ${oldVersion} → ${version}`);
}

/**
 * Update manifest.json version
 */
function updateManifestJson(version) {
  const manifestPath = path.join(rootDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const oldVersion = manifest.version;
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ Updated manifest.json: ${oldVersion} → ${version}`);
}

/**
 * Update server.js version (hardcoded in McpServer initialization)
 */
function updateServerJs(version) {
  const serverPath = path.join(rootDir, 'server.js');
  let serverContent = fs.readFileSync(serverPath, 'utf-8');
  
  // Match the version line in McpServer initialization
  // Pattern: version: '1.0.0' or version: "1.0.0"
  const versionRegex = /(\s+version:\s+['"])([^'"]+)(['"])/;
  const match = serverContent.match(versionRegex);
  
  if (!match) {
    throw new Error('Could not find version field in server.js');
  }
  
  const oldVersion = match[2];
  serverContent = serverContent.replace(versionRegex, `$1${version}$3`);
  fs.writeFileSync(serverPath, serverContent, 'utf-8');
  console.log(`✓ Updated server.js: ${oldVersion} → ${version}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  let version = null;
  let repo = DEFAULT_REPO;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) {
      version = args[i + 1].startsWith('v') ? args[i + 1].slice(1) : args[i + 1];
      i++;
    } else if (args[i] === '--repo' && args[i + 1]) {
      repo = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node scripts/sync-version-from-github.js [options]

Options:
  --tag <version>    Use specific version instead of fetching from GitHub
                     (e.g., --tag 1.2.3 or --tag v1.2.3)
  --repo <owner/repo> GitHub repository (default: ${DEFAULT_REPO})
  --help, -h         Show this help message

Examples:
  # Sync from latest GitHub release
  node scripts/sync-version-from-github.js

  # Use specific version
  node scripts/sync-version-from-github.js --tag 1.2.3

  # Use different repository
  node scripts/sync-version-from-github.js --repo owner/repo
      `);
      process.exit(0);
    }
  }

  try {
    // Fetch version from GitHub if not provided
    if (!version) {
      console.log(`Fetching latest release from GitHub: ${repo}...`);
      version = await fetchLatestReleaseTag(repo);
      console.log(`Found release tag: ${version}`);
    } else {
      console.log(`Using provided version: ${version}`);
    }

    // Validate version format (semver-like)
    if (!/^\d+\.\d+\.\d+/.test(version)) {
      throw new Error(`Invalid version format: ${version}. Expected format: X.Y.Z`);
    }

    console.log(`\nSyncing version ${version} to all files...\n`);

    // Update all version files
    updatePackageJson(version);
    updateManifestJson(version);
    updateServerJs(version);

    console.log(`\n✅ Version sync complete!`);
    console.log(`\nNote: version.js will be auto-updated during the next Vite build.`);
    console.log(`Run 'npm run build' or 'npm run build:netlify' to update version.js.`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();

