# CI and deploy

Two long-lived branches, one environment each. A feature branch is a PR into
`develop`; `develop` merged into `main` is a production release.

```
commit ─▶ CI ─▶ docker build ─▶ registry ─▶ migrate ─▶ roll ─▶ smoke test
           │                    :sha                                      │
      pnpm verify               :staging | :production                    │
                                                         revert + push ◀──┘ on failure
```

| Workflow                | Runs on                    | Does                                             |
| ----------------------- | -------------------------- | ------------------------------------------------ |
| `ci.yml`                | every PR, weekly, dispatch | `pnpm verify` — lint, typecheck, test, build     |
| `deploy-staging.yml`    | push to `develop`          | CI, then **staging**                             |
| `deploy-production.yml` | push to `main`             | CI, then **production**                          |
| `deploy.yml`            | called with an environment | build → ECR → migrate → restart over SSH → smoke |
| `deploy-ghcr.yml`       | called with an environment | build → GHCR → migrate → restart → smoke test    |
| `deploy-ec2.yml`        | called with an environment | build → tarball → migrate → PM2 reload → smoke   |

Each deploy workflow calls the real `ci.yml` first, so only a commit that passed
ships — no second definition of "green". Each target takes the environment as an
**input**, so staging and production differ by one argument. A third environment
is a copy of `deploy-staging.yml` with a different branch and name; the deploy
itself is untouched.

The weekly `ci.yml` schedule exists because a new advisory against a dependency
you already have arrives without a commit — `pnpm audit` has to run on a clock,
not only on a push.

## Three deploy targets

Same trigger, same CI, same image — three ways to land it. `deploy.yml` is the
default; the other two are kept, and reached by changing one line in the caller:

```yaml
# .github/workflows/deploy-staging.yml
uses: ./.github/workflows/deploy.yml # or deploy-ghcr.yml, or deploy-ec2.yml
```

|                  | `deploy.yml`                      | `deploy-ghcr.yml`                 | `deploy-ec2.yml`                |
| ---------------- | --------------------------------- | --------------------------------- | ------------------------------- |
| Registry         | ECR                               | GHCR                              | none — tarball over SCP         |
| Runs on          | one EC2 host, `docker run`        | one EC2 host, `docker run`        | one EC2 host, PM2               |
| Auth to registry | **OIDC**, no stored AWS keys      | the run's own `GITHUB_TOKEN`      | n/a                             |
| Auth to host     | SSH key in `secrets.SSH_KEY`      | same SSH key                      | same SSH key                    |
| Rollout          | `rm -f` then `run` — seconds down | `rm -f` then `run` — seconds down | preflight port, then PM2 reload |
| Runtime config   | `/etc/enterprise-backend.env`     | `/etc/enterprise-backend.env`     | `shared/.env` on the box        |
| Host needs       | Docker                            | Docker                            | Node + PM2                      |
| `SSH_HOST` unset | the run fails                     | image ships, rollout skips        | build runs, rollout skips       |

All three land on **one host**. `deploy.yml` is the default — the image lives in
your own ECR and CI reaches AWS over OIDC, so no long-lived AWS key exists
anywhere. `deploy-ghcr.yml` is the same rollout for someone with no AWS account.
`deploy-ec2.yml` needs no registry at all.

**Migrations run the same way in all three** — as a release step against the new
build, while the old version still serves. On the two container targets that is
`docker run --rm --env-file … <image> pnpm migration:run:prod` against the image
just pulled; a non-zero exit stops the deploy with the previous version still up.

None of the three is zero-downtime: `docker rm -f` then `docker run` is a hard
cutover of a few seconds. Removing that window means more than one instance
behind a load balancer — see [Later](#later-when-you-want-it).

## Set these up

`develop` does not exist until you create it — `deploy-staging.yml` waits on it:

```bash
git switch -c develop && git push -u origin develop
```

Create a **staging** and a **production** environment (Settings → Environments).
Both take the same variable names with that environment's values: `APP_URL` (the
smoke-test target, e.g. `https://staging-api.example.com`), plus the block below
for whichever target you deploy with.

Protect both branches (Settings → Branches): require the CI check and a review
before merge. Add required reviewers to the `production` environment to make the
deploy itself an approval gate.

### For `deploy.yml` — ECR over OIDC

| Name             | Kind     | Notes                                                        |
| ---------------- | -------- | ------------------------------------------------------------ |
| `AWS_ROLE_ARN`   | variable | Role the run assumes over OIDC. **No access keys anywhere.** |
| `AWS_REGION`     | variable | e.g. `ap-south-1`                                            |
| `ECR_REPOSITORY` | variable | Optional. Defaults to `enterprise-backend`.                  |

No secret is needed on the AWS side — that is the point of OIDC. The run trades
its GitHub token for a short-lived session, pushes the image, then pipes an ECR
password over SSH into `docker login` on the host. **The host holds no AWS
credential and needs no AWS CLI.** Runtime credentials never reach GitHub or AWS
at all: they live in the host's env file, below.

**The AWS side, once per account:**

1. **OIDC provider**, so a run can trade its GitHub token for an AWS session:

   ```bash
   aws iam create-open-id-connect-provider --client-id-list sts.amazonaws.com \
     --url https://token.actions.githubusercontent.com
   ```

2. **Deploy role** — `AWS_ROLE_ARN`. The trust policy is the security boundary:
   without the `sub` condition, any repository on GitHub could assume it.

   ```jsonc
   "Condition": { "StringEquals": {
     "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
     "token.actions.githubusercontent.com:sub": [
       "repo:ORG@<org-id>/REPO@<repo-id>:environment:staging",
       "repo:ORG@<org-id>/REPO@<repo-id>:environment:production"
     ]
   }}
   ```

   **Read the `sub` off a real token — do not assume the format.** Where an
   owner has immutable IDs enabled, the claim is
   `repo:ORG@<org-id>/REPO@<repo-id>:environment:ENV`, not the plain
   `repo:ORG/REPO:environment:ENV` in every tutorial — and a policy pinning the
   wrong one is denied with an error that says nothing about why. Print the real
   claim from a step before the credentials step:

   ```yaml
   - run: |
       TOKEN=$(curl -sH "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
         "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" | jq -r .value)
       python3 -c "import base64,json,sys;p=sys.argv[1].split('.')[1];print(json.loads(base64.urlsafe_b64decode(p+'='*(-len(p)%4)))['sub'])" "$TOKEN"
   ```

   One role can serve both apps and both environments — list all four `sub`
   values. Splitting production into its own role is tighter, and worth it once
   production data is real.

   Permissions: **ECR push on this repository, and nothing else.** No `ecs:*`,
   no `iam:PassRole` — the deploy calls no other AWS service.

   ```jsonc
   { "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
   { "Effect": "Allow",
     "Resource": "arn:aws:ecr:<region>:<account>:repository/enterprise-backend",
     "Action": ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"] }
   ```

3. **ECR repository** — created by hand; the deploy only pushes. `scanOnPush`
   enabled, tag mutability left **MUTABLE** (the deploy re-points a `:staging` /
   `:production` tag every run), and a lifecycle rule expiring untagged images
   after 14 days.

### The host — all three targets

| Name       | Kind     | Notes                                                |
| ---------- | -------- | ---------------------------------------------------- |
| `SSH_HOST` | variable | Public DNS or IP                                     |
| `SSH_USER` | variable | `ec2-user`, `ubuntu`, …                              |
| `APP_PORT` | variable | Host port to publish. Defaults to 4000.              |
| `SSH_KEY`  | secret   | Private key, whole PEM including the BEGIN/END lines |

`deploy-ghcr.yml` and `deploy-ec2.yml` **skip their rollout** when `SSH_HOST` is
unset, which is what lets you wire CI up before a server exists. `deploy.yml`
requires it and fails in preflight.

**The host, once per environment** — one instance each, nothing shared. Staging
and production must never share a database:

1. **A key pair** — the public half in the deploy user's `~/.ssh/authorized_keys`,
   the private half whole, BEGIN/END lines included, in `SSH_KEY`.
2. **Docker**, with the deploy user in the `docker` group — for `deploy.yml` and
   `deploy-ghcr.yml`. No registry credential to place: both pipe a password in
   over stdin from the runner, ECR's in one case, `GITHUB_TOKEN`'s in the other.
3. **For `deploy-ec2.yml`:** Node (the version in `.nvmrc`), pnpm and PM2, with
   `pm2 startup` run once so the app comes back after a reboot, and
   `/var/www/enterprise-backend` owned by the deploy user — the workflow writes
   releases there but does not create or chown it.
4. **The env file** — `/etc/enterprise-backend.env` for `deploy.yml` and
   `deploy-ghcr.yml`, `/var/www/enterprise-backend/shared/.env` for
   `deploy-ec2.yml`, holding `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
   `CORS_ORIGINS` and `NODE_ENV=production`. **Runtime credentials live there,
   not in GitHub and never in the repo.** Both the migration container and the
   app container mount it, so **create it before the first deploy** — `docker
run` refuses to start without it and the rollout fails at that line.

   **For AWS managed services (RDS + ElastiCache)** the env file needs these
   additional variables:

   ```bash
   # RDS PostgreSQL — SSL with CA verification
   DATABASE_URL=postgres://appuser:STRONG_PASSWORD@your-rds.REGION.rds.amazonaws.com:5432/enterprise
   DATABASE_SSL=true
   DATABASE_SSL_CA_PATH=/app/certs/rds-combined-ca-bundle.pem

   # ElastiCache Redis — TLS + AUTH
   REDIS_URL=rediss://:AUTH_TOKEN@your-elasticache.REGION.cache.amazonaws.com:6379
   REDIS_TLS=true
   ```

   The CA bundle is baked into the Docker image. For `deploy-ec2.yml` (no
   container), download it to the host and point `DATABASE_SSL_CA_PATH` there:
   `curl -o /etc/ssl/rds-combined-ca-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`

5. **The database must be reachable from this host** — the migration step runs
   there, not on the runner. For RDS this means the host is in the same VPC (or
   a peered one) and the RDS security group allows inbound on port 5432 from the
   host's SG.
6. **ElastiCache must be reachable from this host** — same VPC requirement.
   ElastiCache has no public endpoint; the host's SG must be allowed inbound on
   port 6379 in the ElastiCache SG.
7. **nginx or an ALB in front for TLS** — no target terminates it.

**When it fails.** `sts:AssumeRoleWithWebIdentity` denied — the `sub` in item 2
does not match the real claim; decode the token and compare byte for byte.
`docker login` says _cannot perform an interactive login from a non TTY device_ —
the password piped into it was empty, so look at the step that produced it.
`open /etc/enterprise-backend.env: no such file or directory` — item 4. The
migration step exits non-zero — read its output before touching anything: the
previous version is still serving, which is the whole point of migrating there.

## Staging vs production

Identical images, identical pipeline, different inputs — that is the whole point.

|                | Staging                          | Production                            |
| -------------- | -------------------------------- | ------------------------------------- |
| Branch         | `develop`                        | `main`                                |
| Approval       | none                             | required reviewers on the environment |
| Image tag      | `:<sha>` and `:staging`          | `:<sha>` and `:production`            |
| Database       | its own — never shares with prod | its own                               |
| Data           | seeded / anonymised              | real                                  |
| `CORS_ORIGINS` | the staging web origin           | the production web origin             |

Staging exists to run the **real** deploy path against a throwaway database.
A migration that has not run on staging has not been tested.

## What a deploy does

`deploy.yml`, step by step:

1. **CI** — `pnpm verify` on the exact commit. Nothing proceeds if it fails.
2. **Preflight** — the run fails immediately if any required variable is unset for
   that environment, naming the one to set.
3. **Credentials** — the run assumes the AWS role over OIDC: short-lived, and
   scoped by the trust policy to this repo and this environment.
4. **Build and push** — `docker build`, cached through GitHub Actions cache, into
   ECR with **two tags**: the commit SHA (what the host pulls) and the environment
   name (a pointer you can read to answer "what is on staging?").
5. **Log the host in** — the runner pipes an ECR password over SSH into
   `docker login` on the host. The credential is the runner's and lasts 12 hours;
   the host stores no AWS key of its own.
6. **Migrate** — `pnpm migration:run:prod` in a `--rm` container on the new image,
   **while the old container still serves**. Never at boot: replicas would race,
   and a schema failure would look like a restart loop. It loads the same
   `config/env.ts`, so it doubles as an env preflight — a deployment missing a
   variable fails here, with the previous version still up. A non-zero exit stops
   the deploy.
7. **Restart** — `docker rm -f`, then `docker run` with `--restart unless-stopped`
   so the container returns after a reboot, and `docker image prune -f` to stop
   the disk filling with old layers.
8. **Smoke test** — `curl` against `APP_URL/api/health/ready`.

**The other two** build the same image and swap only the registry half.
`deploy-ghcr.yml` publishes to GHCR and is otherwise identical. `deploy-ec2.yml`
uses no registry at all: it ships a tarball, installs and migrates in a fresh
release directory, boots it on a spare port as a preflight check, then symlinks
it live and reloads PM2.

## Rollout safety and rollback

**The window.** `docker rm -f` then `docker run` is a hard cutover on a single
instance — expect a few seconds of connection refusals, on all three targets.
`SIGTERM` drains in-flight requests and `enableShutdownHooks` is on, so the app
side is already fit for a rolling rollout; closing the window is a matter of
running more than one instance behind a load balancer, not a code change.

**Schema changes must survive a version skew.** During any rollout — and during
the entire migrate-then-restart window above — the **old code runs against the
new schema**. So:

- Expand → backfill → contract. Add the column nullable, backfill, deploy code
  that writes it, and only then make it `NOT NULL` or drop the old one, in a
  later release.
- Never rename or drop a column in the same release that stops using it.
- Every migration is reversible. `pnpm migration:revert` undoes exactly one.

**To roll back code**, revert the commit and push. The branch then still says
what is running, CI proves the revert, and the pipeline redeploys it the same
way it deployed the fault. That is the recovery path to reach for first.

**When you need it faster than a pipeline run**, the previous image is still in
the registry by SHA — on the instance:

```bash
docker rm -f enterprise-backend
docker run -d --name enterprise-backend --restart unless-stopped \
  --env-file /etc/enterprise-backend.env -p 4000:4000 \
  <account>.dkr.ecr.<region>.amazonaws.com/enterprise-backend:<previous-sha>
```

That reverts the **code** only. The migration the failed deploy already ran is
still applied — which is why expand → backfill → contract above is not optional.

Then revert the commit anyway, so the branch and the running container agree.

**Rolling back a migration is not automatic and not always safe** — a contract
step has already dropped data. This is why expand → backfill → contract matters:
each step alone is reversible.

**Deploy** can also be run by hand from the Actions tab (`workflow_dispatch`)
against a chosen environment.

## What the app needs from a host

`SIGTERM` drains in-flight requests; point liveness at `/api/health/live`,
readiness at `/api/health/ready`. Readiness checks the database and heap and
deliberately excludes Redis — one Redis blip must not deregister the fleet. The
boot line names the port and the **hosts** it connected to (never credentials),
so "is this pointed at the right database" needs no shell. The image runs as
`node` and ships `dist/` plus production dependencies only.

Nothing is EC2-specific — stateless, 12-factor config, binds `0.0.0.0`, `trust
proxy` set for ALB/ingress — so moving to ECS or Kubernetes changes the rollout
workflow and no code. Scaling out needs none either: rate-limit counters, the
cache and session revocation all live in Redis. Watch
`replicas × DATABASE_POOL_SIZE` against the server's `max_connections`.

## Later, when you want it

**More than one instance.** Everything above lands on a single host. An ECS
service or a Kubernetes deployment behind a load balancer buys a health-gated
rolling rollout and a circuit breaker that reverts a bad revision on its own —
and it replaces this one workflow file, plus `ecs:*` and `iam:PassRole` on the
deploy role and a task definition whose `secrets` block reads SSM instead of the
host env file. Nothing else moves: the app is already stateless and the migrate
step is already a separate release task.

Versioned GitHub Releases, release-please (auto version, CHANGELOG, tag) and a
PR-log comment all sit on top of this as a workflow that calls the deploy. Two
things make release automation fail quietly, so plan for both: a PR opened by the
default `GITHUB_TOKEN` **triggers no workflows** (use a PAT or GitHub App token,
or the release PR can never satisfy branch protection), and a tag pushed by that
token **raises no event** (so deploy must be _called_ by the release job, never
triggered by the tag).
