# Source Slimming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the currently working branch into the new clean baseline, align `main` to it, and remove redundant source/branch residue.

**Architecture:** The cleanup is branch-first, not file-first. First capture the current working state as an explicit baseline commit, then move `main` to that baseline, then remove redundant branches and documentation/source leftovers that are outside the retained product snapshot.

**Tech Stack:** Git, PowerShell, existing Node-based frontend tests

---

### Task 1: Capture The Working Baseline

**Files:**
- Modify: working tree across current branch
- Test: `tests/frontend/test_bubble_layout.test.js`
- Test: `tests/frontend/test_dialogue_duration.test.js`

- [ ] **Step 1: Inspect the remaining dirty tree**

Run: `git status --short --branch`
Expected: current branch is `codex/dialogue-bubble-readability-followup` with tracked/untracked product files still present.

- [ ] **Step 2: Stage the preserved baseline**

Run: `git add -A`
Expected: all files that belong to the current working version are staged.

- [ ] **Step 3: Commit the preserved baseline**

Run: `git commit -m "chore: preserve current working baseline"`
Expected: one commit captures the version the user is actively using.

- [ ] **Step 4: Run frontend tests against the preserved baseline**

Run: `node --test tests/frontend/*.js`
Expected: PASS with 0 failures.

### Task 2: Promote The Baseline To Main

**Files:**
- Modify: git refs/branch topology

- [ ] **Step 1: Switch to `main`**

Run: `git checkout main`
Expected: branch changes to `main`.

- [ ] **Step 2: Fast-forward or hard-align `main` to the preserved baseline**

Run: `git merge --ff-only codex/dialogue-bubble-readability-followup`
Expected: `main` now points at the preserved baseline commit.

- [ ] **Step 3: Verify branch topology**

Run: `git branch -vv`
Expected: `main` and `codex/dialogue-bubble-readability-followup` reference the same preserved baseline commit.

### Task 3: Remove Redundant Branch Residue

**Files:**
- Modify: git refs only

- [ ] **Step 1: Delete the now-redundant feature branch**

Run: `git branch -d codex/dialogue-bubble-readability-followup`
Expected: branch deletes successfully because its content is now on `main`.

- [ ] **Step 2: Verify only durable branches remain**

Run: `git branch -vv`
Expected: temporary cleanup branches are gone and `main` remains.

### Task 4: Remove Disposable Planning Residue

**Files:**
- Modify: `docs/superpowers/specs/2026-03-29-source-slimming-design.md`
- Modify: `docs/superpowers/plans/2026-03-29-source-slimming.md`

- [ ] **Step 1: Decide whether cleanup planning docs should stay**

Run: `git status --short`
Expected: the newly added cleanup planning docs are visible.

- [ ] **Step 2: Remove them if they are considered disposable process artifacts**

Run: `git rm docs/superpowers/specs/2026-03-29-source-slimming-design.md docs/superpowers/plans/2026-03-29-source-slimming.md`
Expected: cleanup docs are removed from the product baseline if they are not desired as permanent documentation.

- [ ] **Step 3: Commit the final slimming cleanup**

Run: `git commit -m "chore: slim repository to preserved baseline"`
Expected: repository history reflects the cleanup after baseline promotion.

### Task 5: Final Verification

**Files:**
- Test: `tests/frontend/test_bubble_layout.test.js`
- Test: `tests/frontend/test_dialogue_duration.test.js`

- [ ] **Step 1: Run frontend tests again**

Run: `node --test tests/frontend/*.js`
Expected: PASS with 0 failures.

- [ ] **Step 2: Verify repository is clean**

Run: `git status --short --branch`
Expected: clean working tree on `main`.
