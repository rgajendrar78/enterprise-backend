# Changelog

## [1.2.0](https://github.com/gajendra-devstree/enterprise-backend/compare/v1.1.0...v1.2.0) (2026-08-27)


### Features

* add support for TLS and CA certificate validation for PostgreSQL and Redis connections ([f49163e](https://github.com/gajendra-devstree/enterprise-backend/commit/f49163ef2a72b03f68089dd8c2a109ba518260fc))
* implement CdnUrlTransformer for profile imageUrl and update ([dfa2228](https://github.com/gajendra-devstree/enterprise-backend/commit/dfa2228fa6a8fadf58b0d759d99ccc06591d471d))
* implement user avatar upload service using AWS S3 and add imageUrl to user profile ([406462a](https://github.com/gajendra-devstree/enterprise-backend/commit/406462abbd28ae07cffa24168f20e2fab8952be7))

## [1.1.0](https://github.com/gajendra-devstree/enterprise-backend/compare/v1.0.0...v1.1.0) (2026-08-25)


### Features

* add debug step to output OIDC subject claim for AWS trust policy troubleshooting ([06fedf0](https://github.com/gajendra-devstree/enterprise-backend/commit/06fedf05b8cfebd839e54a5e47c85cb47cfeb332))

## 1.0.0 (2026-08-24)


### Features

* add deploy-ec2 workflow and update staging and production pipel… ([74d4f97](https://github.com/gajendra-devstree/enterprise-backend/commit/74d4f97bc6652f76648d99d8a023ab2736405cb8))
* add deploy-ec2 workflow and update staging and production pipelines to use it ([624692e](https://github.com/gajendra-devstree/enterprise-backend/commit/624692e36bce92aa3a6106835bd8cc490b4ebd9e))
* add deployment workflows for staging and production environments ([7a25b21](https://github.com/gajendra-devstree/enterprise-backend/commit/7a25b215e71f457f91b9739bc4ca886c1d5ae6e8))
* add GitHub Actions workflow to build, publish, and deploy via SSH ([f2f7ee2](https://github.com/gajendra-devstree/enterprise-backend/commit/f2f7ee28555c4eb772b6ac491d1a00a1fe9dbf37))
* add guidelines for Copilot usage and repository rules in new markdown files ([e58852a](https://github.com/gajendra-devstree/enterprise-backend/commit/e58852a12e77135333734f15dc44269847d45269))
* add seed:prod script to run database seeds in production enviro… ([123b8cb](https://github.com/gajendra-devstree/enterprise-backend/commit/123b8cb91da9d6eae17ce98cf55af272b3f0752a))
* add seed:prod script to run database seeds in production environment ([c57596f](https://github.com/gajendra-devstree/enterprise-backend/commit/c57596f2415f235bf50045fbddfbd20f2ae079e9))
* add staging and production deployment ([f5fc974](https://github.com/gajendra-devstree/enterprise-backend/commit/f5fc974a291d14e830470019cc941450ea4bd97e))
* implement atomic deployment with pre-flight health checks and automatic rollback for EC2 ([b2e07d4](https://github.com/gajendra-devstree/enterprise-backend/commit/b2e07d40ce466a99c53e168590b0d74647daa14b))
* update actions and dependencies in CI and deploy workflows ([7c169d0](https://github.com/gajendra-devstree/enterprise-backend/commit/7c169d04617bb6ba8e8d58f53f96a116780b4f4f))
* update Dependabot configuration for improved package management ([41c7dc5](https://github.com/gajendra-devstree/enterprise-backend/commit/41c7dc53c6e16ef24d856375a864ced4e9b1d799))


### Bug Fixes

* correct rsync syntax by removing trailing slash from scripts directory path ([eff05b3](https://github.com/gajendra-devstree/enterprise-backend/commit/eff05b3b2fe2bf00eb0d56130695778534ae9a42))
* replace pm2 restart with delete and start to ensure environment updates during deployment ([9acaf14](https://github.com/gajendra-devstree/enterprise-backend/commit/9acaf142ee43d09b3b66ab4d8ed2d1ce7643f64e))
