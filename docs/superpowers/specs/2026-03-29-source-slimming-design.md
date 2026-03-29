# Source Slimming Design

**Goal:** Preserve the currently working Brotherhood-UI build as the new clean baseline, then remove unmerged code, temporary branches, and redundant source/files that are no longer needed.

**Current State**

- The only branch containing the current working version is `codex/dialogue-bubble-readability-followup`.
- The repository is heavily dirty, with mixed source changes, docs, runtime/tooling changes, and large asset churn.
- The user wants an aggressive cleanup, but explicitly wants to keep the currently used version rather than reverting to an older `main`.

**Recommended Approach**

Use the current working branch as the source of truth, stabilize it into a single clean baseline commit, then make `main` match that baseline. After that, remove the now-redundant feature branch and any clearly temporary source/docs/assets that do not belong in the preserved version.

**Design**

1. Freeze the current working version as the target baseline.
   Only preserve files that are part of the actual runnable product and its supporting docs/tests. Runtime garbage has already been cleaned separately.

2. Promote the target baseline to `main`.
   Instead of trying to infer which old `main` files should survive, treat the current working version as authoritative because it is the version the user is actively using successfully.

3. Remove development-only leftovers.
   This includes temporary branch names, obsolete feature branches, and files that are clearly design/plan-only artifacts rather than product code or durable project docs.

**Scope Rules**

- Keep: runnable app code, required assets, launcher/runtime scripts, tests that validate retained behavior, durable user/developer docs.
- Remove: temporary feature branches, already-cleaned runtime output, and disposable planning/design residue if it is not needed as project documentation.
- Do not keep parallel implementations of the same feature when one preserved version is already chosen as baseline.

**Risks**

- The branch being preserved may include more than the specific bugfix the user last requested; once promoted to baseline, that broader state becomes the new product truth.
- Deleting unmerged source after baseline promotion is intentionally destructive. Recovery would rely on git reflog/history, not on the working tree.

**Validation**

- Confirm the app branch state is captured in git before cleanup.
- Verify branch topology after promotion so `main` points at the preserved baseline.
- Re-run the existing frontend tests after source cleanup to ensure the preserved version still behaves as expected.
