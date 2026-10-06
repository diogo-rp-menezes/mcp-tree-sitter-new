# Branch Protection Configuration

This document defines the recommended branch protection rules for the `mcp-server-tree-sitter` repository. These rules should be configured in GitHub repository settings under **Settings → Branches → Branch protection rules**.

## Protected Branches

### `main` Branch

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Require a pull request before merging** | ✅ Enforced | All changes must go through PR review |
| **Require approvals** | 1 required | At least one review from CODEOWNERS |
| **Dismiss stale PR approvals when new commits are pushed** | ✅ Enforced | Prevents stale approvals on outdated code |
| **Require review from CODEOWNERS** | ✅ Enforced | Ensures domain experts review relevant changes |
| **Require status checks to pass before merging** | ✅ Enforced | CI must pass before merge |
| **Require branches to be up to date before merging** | ✅ Enforced | Prevents merge conflicts and ensures CI runs on latest code |
| **Status checks required** | `test (uv)`, `test (uvx)`, `verify-uvx` | All CI jobs must pass |
| **Require conversation resolution before merging** | ✅ Enforced | All review comments must be addressed |
| **Require signed commits** | ✅ Enforced | Verifies commit authorship |
| **Require linear history** | ✅ Enforced | No merge commits; use squash or rebase |
| **Include administrators** | ✅ Enforced | Rules apply to everyone |
| **Restrict who can push to matching branches** | ✅ Enforced | Only allow merges via PR |
| **Allow force pushes** | ❌ Disabled | Prevents history rewriting |
| **Allow deletions** | ❌ Disabled | Prevents accidental branch deletion |

### `release/*` Branches (if using release branches)

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Require a pull request before merging** | ✅ Enforced | Hotfixes must be reviewed |
| **Require approvals** | 1 required | |
| **Require status checks to pass before merging** | ✅ Enforced | |
| **Status checks required** | `test (uv)`, `test (uvx)` | |
| **Require conversation resolution before merging** | ✅ Enforced | |
| **Require signed commits** | ✅ Enforced | |
| **Require linear history** | ✅ Enforced | |
| **Include administrators** | ✅ Enforced | |
| **Restrict who can push to matching branches** | ✅ Enforced | |
| **Allow force pushes** | ❌ Disabled | |
| **Allow deletions** | ❌ Disabled | |

## Required Status Checks

The following CI jobs (from `.github/workflows/ci.yml`) must pass:

1. **`test (uv)`** - Tests with uv package manager
2. **`test (uvx)`** - Tests with uvx/pip installation
3. **`verify-uvx`** - Package build and installation verification

## CODEOWNERS Integration

The [CODEOWNERS](../CODEOWNERS) file defines:
- **Global owner**: `@diogocavilha` for all files
- **Python backend**: `/src/server/`, `/src/mcp_server_tree_sitter/`, `/tests/`, `pyproject.toml`, `uv.lock`
- **TypeScript frontend**: `/src/client/`, `vite.config.ts`, `package.json`, `bun.lock`
- **Configuration & CI/CD**: `/.github/`, `.gitignore`, `Makefile`
- **Documentation**: `/docs/`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`

When a PR modifies files matching these patterns, the corresponding owners are automatically requested for review.

## Merge Strategy

- **Squash and merge** (recommended): Creates a single commit on main with the PR title
- **Rebase and merge**: Alternative for preserving individual commits
- **Merge commit**: ❌ Not allowed (linear history required)

## Commit Signing

All commits to protected branches must be signed (GPG/SSH). Contributors should:

1. Generate a GPG key or use SSH signing
2. Add the public key to GitHub account settings
3. Configure git to sign commits:
   ```bash
   git config --global commit.gpgsign true
   git config --global user.signingkey <KEY_ID>
   ```

## Enforcement Notes

- **No exceptions**: Rules apply to administrators to prevent bypass
- **No force pushes**: History rewriting is prohibited on protected branches
- **No deletions**: Protected branches cannot be deleted via UI or API
- **Linear history**: Ensures clean, bisectable history; use `git rebase` locally before pushing

## Configuration via GitHub CLI

To apply these rules programmatically:

```bash
# Protect main branch
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["test (uv)","test (uvx)","verify-uvx"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":true}' \
  --field restrictions='{"users":[],"teams":[]}' \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field required_linear_history=true \
  --field required_signatures=true \
  --field required_conversation_resolution=true
```

## Related Documents

- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Contribution guidelines
- [CODEOWNERS](../CODEOWNERS) - Code ownership definitions
- [CI Workflow](../workflows/ci.yml) - Continuous integration configuration