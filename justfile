set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

verify:
    pnpm run verify:all

doctor:
    pnpm run doctor

actions:
    actionlint

security-audit:
    osv-scanner scan source --allow-no-lockfiles --lockfile 'pnpm-lock.yaml'

security:
    just actions
    just security-audit
