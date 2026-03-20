<!--
Sync Impact Report
- Version change: template → 1.0.0
- Modified principles: N/A (initial creation)
- Added sections: Library-First, Test-First (NON-NEGOTIABLE), Additional Constraints, Development Workflow, Governance
- Removed sections: N/A (template placeholders replaced)
- Templates requiring updates:
  ✅ .specify/templates/plan-template.md (Constitution Check section aligns)
  ✅ .specify/templates/spec-template.md (scope/requirements alignment verified)
  ✅ .specify/templates/tasks-template.md (TDD task ordering matches)
  ✅ .opencode/command/speckit.constitution.md (this file - no outdated refs)
- Follow-up TODOs: None
-->

# Appoint Constitution

## Core Principles

### I. Library-First

Every feature starts as a standalone library.

- Libraries MUST be self-contained and independently testable.
- Libraries MUST be documented with clear purpose.
- No organizational-only libraries permitted; every library MUST deliver
  tangible, testable functionality.

**Rationale**: Modular libraries enable independent development, testing, and
reuse while preventing untestable monolithic structures.

### II. Test-First (NON-NEGOTIABLE)

TDD is mandatory for all development.

- Tests MUST be written before implementation.
- Tests MUST be reviewed and approved by the user before proceeding.
- Tests MUST fail initially (Red phase).
- Implementation proceeds only after Red-Green-Refactor cycle is followed.
- The Red-Green-Refactor cycle MUST be strictly enforced; no exceptions.

**Rationale**: Test-first development ensures correctness, prevents regression,
and validates requirements before committing to implementation.

## Additional Constraints

- Technology choices MUST be justified and documented in the implementation plan.
- External dependencies MUST be evaluated for necessity before adoption.

## Development Workflow

- All changes MUST pass constitution compliance review before merge.
- Code review MUST verify adherence to Library-First and Test-First principles.
- Implementation plans MUST include a Constitution Check gate.

## Governance

- This constitution supersedes all other development practices.
- Amendments require: documentation of change, approval, and migration plan.
- All pull requests and reviews MUST verify constitutional compliance.
- Complexity MUST be justified; simpler alternatives must be considered first.
- Use project guidance files for runtime development guidance.

**Version**: 1.0.0 | **Ratified**: 2026-03-20 | **Last Amended**: 2026-03-20
