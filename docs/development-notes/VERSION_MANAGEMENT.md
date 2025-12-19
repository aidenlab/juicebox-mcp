# Version Management

This project uses **GitHub release tags** as the source of truth for versioning. All version files are automatically synchronized from the latest GitHub release tag.

## Version Files

The following files contain version information:

1. **`package.json`** - NPM package version (source for frontend builds)
2. **`manifest.json`** - MCP server package version
3. **`server.js`** - Hardcoded version in `McpServer` initialization
4. **`js/version.js`** - Frontend runtime version (auto-updated by Vite plugin from `package.json`)

## How It Works

### Source of Truth: GitHub Release Tags

The latest GitHub release tag (e.g., `v1.0.0` or `1.0.0`) is used as the authoritative version. The sync script fetches this tag and updates all version files.

### Version Sync Script

The `scripts/sync-version-from-github.js` script:

1. Fetches the latest release tag from GitHub API
2. Updates `package.json` version
3. Updates `manifest.json` version  
4. Updates `server.js` hardcoded version
5. `version.js` is automatically updated during Vite builds (via `vite-plugin-version.js`)

## Usage

### Sync from Latest GitHub Release

```bash
npm run version:sync
```

This will:
- Fetch the latest release tag from GitHub
- Update all version files to match

### Sync with Specific Version

```bash
npm run version:sync -- --tag 1.2.3
# or
node scripts/sync-version-from-github.js --tag 1.2.3
```

### Manual Sync (Offline)

If you need to set a version without fetching from GitHub:

```bash
node scripts/sync-version-from-github.js --tag 1.2.3
```

### Before Building

**Recommended workflow:**

1. Create a GitHub release with a tag (e.g., `v1.0.1`)
2. Run the sync script:
   ```bash
   npm run version:sync
   ```
3. Build your packages:
   ```bash
   npm run build          # Frontend build
   npm run build:netlify  # Netlify build
   npm run build:mcpb     # MCP server package
   ```

The `version.js` file will be automatically updated during Vite builds.

## Workflow Examples

### Creating a New Release

1. **Create GitHub Release:**
   - Go to GitHub → Releases → Draft a new release
   - Tag: `v1.0.1` (or `1.0.1`)
   - Title: `Version 1.0.1`
   - Publish the release

2. **Sync Versions Locally:**
   ```bash
   npm run version:sync
   ```

3. **Verify Changes:**
   ```bash
   git diff package.json manifest.json server.js
   ```

4. **Build and Test:**
   ```bash
   npm run build
   npm run build:mcpb
   ```

5. **Commit Version Updates:**
   ```bash
   git add package.json manifest.json server.js
   git commit -m "chore: sync versions to 1.0.1"
   ```

### Development Workflow

During development, you can work with local versions. The sync script is only needed when:
- Preparing for a release
- Syncing with an existing GitHub release
- Ensuring consistency across all version files

## Troubleshooting

### No Releases Found

If you get an error about no releases found:
- Ensure you've created at least one release on GitHub
- Check the repository name in the script (default: `aidenlab/juicebox-mcp`)
- Use `--repo owner/repo` to specify a different repository

### Network Errors

If GitHub API is unavailable:
- Use `--tag` flag to manually specify version
- The script will work offline with a provided tag

### Version Format

Versions should follow semantic versioning (X.Y.Z):
- ✅ Valid: `1.0.0`, `1.2.3`, `v1.0.0`
- ❌ Invalid: `1.0`, `latest`, `dev`

The script automatically strips `v` prefix if present.

## Integration with CI/CD

You can integrate version syncing into your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Sync version from release tag
  run: npm run version:sync
- name: Build
  run: npm run build
```

Or use the release tag directly in CI:

```yaml
- name: Sync version
  run: npm run version:sync -- --tag ${{ github.ref_name }}
```

## Architecture

```
GitHub Release Tag (v1.0.0)
         ↓
sync-version-from-github.js
         ↓
    ┌────┴────┬──────────────┬─────────────┐
    ↓         ↓              ↓             ↓
package.json manifest.json server.js   (version.js)
    ↓                                    (auto-updated
    ↓                                     by Vite plugin)
vite-plugin-version.js
    ↓
js/version.js
```

## Notes

- The `version.js` file is **not** updated by the sync script - it's automatically updated by `vite-plugin-version.js` during Vite builds
- The sync script reads from `package.json` to update `version.js` indirectly
- All version files should be committed to git after syncing
- The sync script is idempotent - safe to run multiple times

