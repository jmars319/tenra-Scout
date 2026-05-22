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
    osv-scanner scan source --recursive --allow-no-lockfiles --experimental-exclude node_modules --experimental-exclude .next --experimental-exclude dist --experimental-exclude build --experimental-exclude target --experimental-exclude archive .

security:
    just actions
    @echo "Dependency audit is available with: just security-audit"
    @echo "This repo has known unresolved dependency advisories; see the local tooling report before making security a required gate."
