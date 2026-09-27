# Single Master Prompt — Generate Full Project Documentation

```
You are acting as a product manager, software architect, designer, developer, tester and technical project manager in sequence. I will give you a single project statement. Your job is to expand it into a full set of planning documents for building this product, saved as six separate markdown files, generated in this exact order, and save these files into the /docs/:

1. prd.md
2. architecture.md
3. Rules.md
4. Design.md
5. Task.md
6. Memory.md

PROJECT STATEMENT:
[Look into the README.md an TECHNICAL_DOCUMENTATION.md file for the project statement]

---

Before writing anything, if the project statement is missing critical
information you cannot reasonably assume (target platform, rough scale/budget,
tech stack preference, or who the user is), ask me up to 3 short clarifying
questions first. Otherwise, proceed directly — make sensible, clearly-stated
assumptions rather than stalling.

Generate the files in order, each one reading the previous files as context.
Follow these specs exactly:

### 1. prd.md
Sections: Problem Statement, Goals & Non-Goals, Target Users & Use Cases
(as "As a ___, I want ___, so that ___" stories), Core Features (tagged
Must-Have v1 / Should-Have v1.1 / Nice-to-Have later), Success Metrics
(measurable), Assumptions & Risks, Open Questions.
Be concrete — no vague filler like "user-friendly interface." No code or
architecture here, product scope only.

### 2. architecture.md
Read prd.md. Sections: Tech Stack (with one-line justification per choice),
System Overview (text/ASCII/Mermaid diagram of components), Data Model
(entities, fields, relationships), API Design (key endpoints/interfaces),
Folder/Project Structure, Third-Party Integrations, Non-Functional
Requirements (performance/security/scale), Key Technical Decisions &
Tradeoffs. Every Must-Have feature in prd.md must map to something here.
Flag anything technically risky.

### 3. Rules.md
Read prd.md and architecture.md. Sections: Coding Standards, Architectural
Boundaries (explicit "never do X"), Testing Requirements, Git/Commit
Conventions, Error Handling & Logging, Security Baseline, When to Ask vs
When to Decide, Definition of Done (a checklist a task must pass to be
marked complete). Be specific and enforceable, not aspirational.

### 4. Design.md
Read prd.md. Sections: Design Principles (3-5, each explained in a
sentence), Visual System (colors with hex codes, type scale, spacing/grid,
iconography), Core Components (with states: default/hover/active/disabled/
error), Key Screens/Flows (one per Must-Have feature, described in enough
detail to build without guessing), Responsive Behavior, Accessibility
Requirements, Tone of Voice. Every Must-Have feature needs a matching
screen/flow.

### 5. Task.md
Read prd.md, architecture.md, Rules.md, Design.md. Break Must-Have (v1)
features into a sequential, buildable task list grouped into phases
(Phase 0: Setup, Phase 1: Core Data Layer, Phase 2: Core Features —
one group per Must-Have feature, Phase 3: Integration & Polish,
Phase 4: Testing & Launch Readiness). Each task needs: ID (T001...),
Title, Description, Depends On, Acceptance Criteria (tied to Rules.md's
Definition of Done), Status (Not Started/In Progress/Blocked/Done).
Tasks should be sized to ~1-4 hours each, ordered so dependencies come
first. Do not start any task — plan only.

### 6. Memory.md
Create this as an empty running log, ready for future updates. Include
just the header structure: a title, a one-line description of its purpose
("running log of completed work — updated after each task, newest entries
at top, never compress or delete old entries"), and an empty
"## Completed Tasks" section ready for the first entry.

---

Output each file clearly labeled and separated (e.g. "=== prd.md ===" as a
header before each file's content) so I can save them individually. After
all six are generated, give me a 3-5 sentence summary of the biggest
assumptions you made and any open questions I should resolve before
development starts.
```

