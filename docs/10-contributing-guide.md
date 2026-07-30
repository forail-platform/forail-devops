# 10 — Contributing Guide

Git workflow, commit conventions, coding standards, and the PR process.

---

## Rules

1. **All development and testing inside the Vagrant VM** — never install dependencies on the host
2. **Every change must be understood** — if you can't explain why, don't commit it
3. **Author of all commits is Krstan Vjestica** — never attribute tools as authors
4. **Review the diff before committing** — always
5. **Everything must pass before you commit** — not `vagrant validate`, not a syntax
   check: the actual thing running. A change to the dev environment is proven by
   destroying the VM and building it again; a change to the platform is proven by
   a clean install plus the full Cypress regression

---

## Development environment

- **VirtualBox is the only supported provider.** libvirt/KVM must not be running
  on the same host — one hypervisor owns AMD-V per boot, and the loser's guests
  die with `Guru Meditation VERR_SVM_IN_USE` or wedge mid-boot. Keep `libvirtd`
  masked; `forail-dev-cluster/scripts/up.sh` refuses to start if it is active.
  Full root-cause writeup: `forail-dev-cluster/docs/TROUBLESHOOTING-vagrant.md`.
- **Bring the cluster up with `scripts/up.sh`**, not bare `vagrant up` — it goes
  node by node in dependency order and recreates any node whose boot wedges.
- **Start from a clean state when you are testing.** `vagrant up` on an existing
  VM only boots it; it does **not** re-provision. Mixing a freshly created node
  with previously provisioned ones gives two different cluster CAs and a control
  plane that never reaches quorum. Use `vagrant destroy -f` first.
- **The dev VMs collide on host ports.** `forail-backend` and `forail-deploy`
  both forward `8013` and `8080`, so only one of them can run at a time.

---

## Git Workflow

### Branch naming

```
feature/dynamic-surveys        # New feature
fix/job-stuck-pending          # Bug fix
refactor/split-serializers     # Refactoring
docs/wiki-task-engine          # Documentation
test/inventory-api-tests       # Tests
chore/update-dependencies      # Maintenance
```

### Standard flow

**`main` is the integration branch.** There is no `devel` branch in any Forail
repo — branch from `main` and target `main` in the PR.

```bash
# 1. Create branch from main
git checkout main
git pull github main
git checkout -b feature/my-feature

# 2. Make changes, test, commit
vagrant rsync
vagrant ssh -c "cd /awx_devel && forail-test"
git add forail/main/models/my_model.py
git commit -m "feat(models): add Policy model for governance"

# 3. Push and create PR
git push github feature/my-feature
gh pr create --base main
```

### Updating the branch

```bash
git checkout main && git pull github main
git checkout feature/my-feature
git rebase main
```

### Remotes

Most repos have two: `github` (github.com/forail-platform, the canonical one,
where CI and releases run) and `origin` (the GitLab mirror). Push branches and
tags to **both** when you are done, or the mirror silently falls behind.

---

## Commit Conventions

### Format

```
type(scope): short description
```

### Types

| Type       | When               | Example                                     |
| ---------- | ------------------ | ------------------------------------------- |
| `feat`     | New feature        | `feat(api): add /policies/ endpoint`        |
| `fix`      | Bug fix            | `fix(tasks): prevent job stuck in pending`  |
| `refactor` | Code restructuring | `refactor(serializers): split into modules` |
| `docs`     | Documentation      | `docs(wiki): add task engine documentation` |
| `test`     | Tests              | `test(api): add inventory CRUD tests`       |
| `chore`    | Maintenance        | `chore(deps): update Django to 4.2.18`      |

### Scopes

`models`, `api`, `tasks`, `ui`, `auth`, `rbac`, `deploy`, `ci`, `deps`

### Rules

- First line **under 72 characters**
- **Imperative mood:** "add feature" not "added feature"
- **No period** at the end of the first line
- **Never AI attribution** in commit messages

---

## Coding Standards

### Python

- Max line length: **160 characters** (configured in pyproject.toml)
- Imports: standard library → third party → local (separated by blank lines)
- Descriptive variable names: `running_jobs` not `x`
- f-strings for formatting: `f"Job {job.id} failed"`
- Never bare `except:` — always a specific exception type

### TypeScript/React

- Functional components with hooks (no class components)
- TypeScript interfaces for props
- TanStack Query for data fetching (not useEffect + fetch)
- `cn()` for conditional Tailwind classes
- Semantic colors (`bg-background`) not hardcoded (`bg-white`)
- Path alias `@/` instead of relative `../../..`

### Linting (run before every commit)

```bash
flake8 forail/ --count --statistics
cd forail/ui_next && npx tsc --noEmit
```

---

## Pull Request Process

### Before creating a PR

- [ ] All tests pass
- [ ] No lint errors
- [ ] Commit messages follow conventions
- [ ] Branch is rebased on latest `main`
- [ ] Changes are minimal and focused

### PR guidelines

- **Keep PRs small** — ideally under 500 lines. Large PRs are harder to review.
- **One concern per PR** — don't mix a bug fix with refactoring.
- **Include tests** — new features need tests, bug fixes need a regression test.
- **Target `main`** — all PRs merge into `main`.

### Review Checklist

**For the author:**

- [ ] Reviewed my own diff before requesting review
- [ ] No debug code, console.log, or print statements
- [ ] No hardcoded secrets or URLs
- [ ] Error handling is adequate
- [ ] New code has tests

**For the reviewer:**

- [ ] Code does what the PR description says
- [ ] Security: no SQL injection, XSS, credential exposure
- [ ] Edge cases are handled (empty lists, null, concurrent access)
- [ ] Follows existing patterns in the codebase
- [ ] Will this be easy to maintain in 6 months?

---

## Quick Reference — Common Development Tasks

### Add a new API endpoint

1. Model in `forail/main/models/` → register in `__init__.py`
2. Migration: `forail-manage makemigrations main`
3. Serializer in `forail/api/serializers/`
4. View in `forail/api/views/`
5. URL module in `forail/api/urls/` → register in `urls.py`
6. Access class in `forail/main/access.py`
7. Tests

### Add a new frontend page

1. TypeScript types in `src/api/types.ts`
2. API hooks in `src/api/hooks/`
3. Page in `src/pages/`
4. Route in `src/App.tsx`
5. Navigation in `src/components/layout/Sidebar.tsx`
6. Tests

### Add a management command

1. File in `forail/main/management/commands/`
2. Implement `Command` class with `handle()` method
3. Test: `forail-manage my_command --help`
