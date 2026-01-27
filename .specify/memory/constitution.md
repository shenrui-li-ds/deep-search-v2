# Athenius Search Constitution

<!--
Sync Impact Report
==================
Version change: 0.0.0 → 1.0.0
Added sections:
  - 8 Core Principles (User-Centric Design, Fast Iteration, Cost-Effective Operations,
    Responsive & Intuitive UI, Code Quality, Test-Driven Development, Secure & Robust
    Data Model, Clear Documentation)
  - Quality Gates section
  - Development Workflow section
  - Governance rules
Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ compatible (Constitution Check section exists)
  - .specify/templates/spec-template.md: ✅ compatible (requirements align with principles)
  - .specify/templates/tasks-template.md: ✅ compatible (test-first workflow supported)
Follow-up TODOs: None
-->

## Core Principles

### I. User-Centric Design

All features and changes MUST prioritize the end-user experience. Development decisions are driven by user needs, not technical convenience.

- Every feature MUST have a clear user benefit articulated before implementation begins
- User feedback MUST be actively sought and incorporated into the development cycle
- Performance degradation that negatively impacts user experience is NOT acceptable
- Accessibility MUST be considered for all UI components

**Rationale**: Athenius exists to serve users seeking fast, accurate search results. Technical excellence without user value is wasted effort.

### II. Fast Iteration

Development MUST favor rapid, incremental delivery over large, monolithic releases. Ship early, ship often, learn quickly.

- Features SHOULD be broken into independently deployable increments
- Feedback loops MUST be short—aim for same-day deployment of fixes
- Prototypes and experiments are encouraged to validate ideas before full implementation
- "Perfect" MUST NOT be the enemy of "shipped and improved"

**Rationale**: The AI search landscape evolves rapidly. Speed of iteration is a competitive advantage.

### III. Cost-Effective Operations

Infrastructure and API usage MUST be optimized for cost without sacrificing user experience. Every dollar spent MUST deliver measurable value.

- LLM API calls MUST use caching where appropriate (two-tier cache system)
- Provider fallback chains MUST prioritize cost-effective options (DeepSeek → others)
- Credit system MUST prevent abuse while remaining fair to legitimate users
- Unnecessary API calls MUST be eliminated through batching and deduplication

**Rationale**: Sustainable operations require cost discipline. Athenius uses paid APIs; waste directly impacts viability.

### IV. Responsive & Intuitive UI

The user interface MUST feel instant and self-explanatory. Users SHOULD accomplish their goals without reading documentation.

- Initial page load MUST feel immediate (no blocking API calls before navigation)
- Streaming responses MUST provide continuous visual feedback
- UI state changes MUST be smooth with appropriate loading indicators
- Error states MUST be clear, actionable, and non-technical
- Mobile and desktop experiences MUST both be first-class

**Rationale**: Search is a high-frequency interaction. Friction compounds into user abandonment.

### V. Code Quality

Code MUST be readable, maintainable, and adhere to established patterns. Consistency enables velocity.

- TypeScript strict mode is mandatory—no `any` types without explicit justification
- Functions MUST have single responsibilities and clear naming
- Complex logic MUST be accompanied by inline comments explaining intent
- Code duplication MUST be refactored into shared utilities
- Linting errors MUST be resolved before merge

**Rationale**: Technical debt slows iteration. Clean code enables the fast iteration principle.

### VI. Test-Driven Development

Critical paths MUST have automated test coverage. Tests SHOULD be written before or alongside implementation.

- API routes MUST have integration tests covering success and error paths
- Database functions MUST have unit tests
- UI components with complex logic SHOULD have component tests
- Tests MUST fail before implementation (red-green-refactor)
- Flaky tests MUST be fixed or removed—never ignored

**Rationale**: Tests provide confidence for fast iteration. Without tests, speed creates fragility.

### VII. Secure & Robust Data Model

Data integrity and security are non-negotiable. The database schema MUST enforce correctness at the lowest level.

- All database operations MUST use parameterized queries (no SQL injection)
- Row Level Security (RLS) MUST be enabled on all user-facing tables
- Sensitive operations MUST require authentication verification
- Rate limiting MUST protect against abuse at both API and database levels
- Schema migrations MUST be reversible and tested
- Input validation MUST occur at system boundaries (API routes, form submissions)

**Rationale**: Security breaches destroy user trust. Data corruption destroys user value. Both are existential risks.

### VIII. Clear Documentation

Code and systems MUST be documented for both current developers and future maintainers. Tribal knowledge is technical debt.

- CLAUDE.md files MUST be maintained in each major directory
- API routes MUST document request/response formats and error codes
- Database schema changes MUST update corresponding documentation
- Complex algorithms MUST have explanatory comments or linked documentation
- README and quickstart guides MUST enable new contributors to be productive quickly

**Rationale**: Documentation enables scaling the team and reduces onboarding friction.

## Quality Gates

All changes MUST pass these gates before merge:

| Gate | Requirement |
|------|-------------|
| Lint | `npm run lint` passes with no errors |
| TypeScript | `npm run build` compiles without type errors |
| Tests | All existing tests pass; new features include tests |
| Security | No new vulnerabilities introduced; secrets never committed |
| Documentation | CLAUDE.md updated if architecture changes |
| Review | At least one approval on non-trivial changes |

## Development Workflow

### For New Features

1. **Specify**: Define user stories and acceptance criteria before coding
2. **Plan**: Break down into incremental, deployable tasks
3. **Implement**: Follow test-driven approach; commit frequently
4. **Review**: Verify against constitution principles; update documentation
5. **Deploy**: Ship incrementally; monitor for issues

### For Bug Fixes

1. **Reproduce**: Confirm the issue exists and understand root cause
2. **Test**: Write a failing test that captures the bug
3. **Fix**: Implement the minimal change that fixes the issue
4. **Verify**: Ensure the test passes and no regressions occur
5. **Document**: Update relevant documentation if behavior changes

## Governance

This constitution supersedes all other development practices for the Athenius Search project. Compliance is mandatory.

### Amendments

- Constitution changes require documented rationale and explicit approval
- Version increments follow semantic versioning:
  - MAJOR: Principle removal or fundamental redefinition
  - MINOR: New principle or significant expansion
  - PATCH: Clarifications and wording improvements
- All team members MUST be notified of constitution changes

### Compliance

- Pull requests MUST verify alignment with constitution principles
- Complexity that violates principles MUST be explicitly justified
- Refer to CLAUDE.md files for runtime development guidance

**Version**: 1.0.0 | **Ratified**: 2026-01-26 | **Last Amended**: 2026-01-26
