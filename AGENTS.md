AGENTS.md
Project Overview

This is an existing project that may contain working code, configuration, assets, and dependencies.

The primary goal is to understand and preserve existing functionality before making changes.

Core Rules
1. Inspect Before Modifying

Before changing any code:

Inspect the project structure.
Read relevant source files.
Identify how components/modules interact.
Check configuration files and dependencies.
Determine whether the requested functionality already exists.
Do not make assumptions about how the project works.

For unfamiliar code, explain your understanding before making significant architectural changes.

2. Preserve Existing Functionality

Do not remove, replace, or rewrite working functionality unless explicitly requested.

When fixing a problem:

Make the smallest reasonable change.
Preserve existing APIs and behavior.
Avoid unnecessary refactoring.
Do not rewrite entire files when a targeted change is sufficient.
Preserve existing user-facing behavior unless the task requires changing it.
3. Do Not Delete Files Without Permission

Never delete files, directories, assets, configuration, dependencies, or functionality unless:

They are clearly unused and removal is explicitly requested, or
The user specifically authorizes their removal.

If something appears obsolete, explain why before removing it.

4. Preserve Configuration

Treat configuration files as important.

Do not unnecessarily modify:

.env
.env.example
package.json
lock files
build configuration
deployment configuration
Docker configuration
CI/CD configuration
PWA configuration
manifest files
service workers
database configuration

Only change configuration when it is required for the task.

5. Dependencies

Do not install new dependencies unless necessary.

Before adding a dependency:

Check whether the existing dependencies already provide the required functionality.
Prefer the existing project's technology stack.
Avoid adding large frameworks for small features.
Explain why a new dependency is needed.

Do not randomly upgrade dependencies.

Code Quality
6. Follow Existing Conventions

Before writing code, identify the project's existing:

Naming conventions
Directory structure
Formatting style
Programming patterns
Error-handling patterns
Component architecture
State-management approach

Follow the existing conventions unless they are clearly problematic.

7. Keep Changes Focused

Only modify files relevant to the task.

Avoid unrelated:

Refactoring
Formatting changes
Renaming
Dependency upgrades
Architecture changes
Code cleanup

A task should not become an excuse to rewrite the project.

8. Comments

Write comments only when they provide useful context.

Prefer clear code over excessive comments.

Do not add comments that merely restate what the code obviously does.

Debugging
9. Reproduce Problems First

When fixing a bug:

Reproduce or identify the failure.
Determine the likely root cause.
Inspect the relevant code.
Make the smallest appropriate fix.
Run the relevant tests/build.
Verify that the fix actually works.

Do not blindly change code until an error disappears.

10. Fix Root Causes

Prefer fixing the underlying problem rather than hiding symptoms.

Avoid solutions such as:

Disabling error handling
Suppressing warnings without justification
Removing failing tests
Adding arbitrary delays
Hardcoding values
Commenting out broken code
Ignoring errors
Testing
11. Always Validate Changes

After making changes, run the project's appropriate validation commands.

Examples:

npm test
npm run build
npm run lint

Use the commands defined by the project's documentation or configuration.

If tests are unavailable, perform an appropriate manual verification.

12. Do Not Claim Success Without Verification

Never say that something works unless it has been tested or there is sufficient evidence that it works.

If verification cannot be performed, clearly state that.

Security
13. Protect Secrets

Never expose, commit, or print:

API keys
Passwords
Access tokens
Private keys
Session tokens
Database credentials
.env secrets

Do not replace secrets with fake values inside real configuration files unless explicitly requested.

Use environment variables for sensitive configuration.

14. Avoid Unsafe Changes

Do not weaken security merely to make something work.

Do not:

Disable authentication unnecessarily.
Disable TLS/HTTPS unnecessarily.
Disable certificate verification.
Expose private services publicly.
Remove authorization checks.
Hardcode credentials.

If a security-related change is necessary, explain its implications.

Git
15. Preserve Git History

Do not run destructive Git commands unless explicitly requested.

Do not use commands such as:

git reset --hard
git clean -fd
git checkout -- .

unless the user explicitly asks for them.

Before making substantial changes, inspect the current Git status:

git status

Do not overwrite the user's uncommitted work.

16. Review Changes

After modifications, inspect:

git diff

Ensure that only intended changes were made.

Existing Projects

This project may be incomplete, partially broken, or inherited from another developer.

Do not assume that missing files or unusual code are mistakes.

If something appears incomplete:

Determine whether it is actually required.
Search the project for references.
Check configuration and build scripts.
Check documentation.
Only then propose or implement a replacement.

Never invent missing backend functionality merely because a frontend expects it.

HTML / CSS / JavaScript Projects

When working with an existing frontend:

Preserve existing HTML structure where possible.
Preserve existing CSS behavior.
Preserve JavaScript functionality.
Check all referenced assets before moving files.
Update relative paths when files are moved.
Preserve PWA functionality.
Preserve manifest.webmanifest.
Preserve service-worker registration and behavior.
Verify icons, fonts, images, and other assets after restructuring.

When splitting a large HTML file:

Separate HTML, CSS, and JavaScript logically.
Do not change application behavior unnecessarily.
Preserve event handlers and DOM relationships.
Update all relative paths correctly.
Verify that the application still loads without console errors.
PWA

If the project is a Progressive Web App:

Treat the following as critical:

manifest.webmanifest
service worker
icons
offline caching
service-worker registration

Do not remove or disable PWA functionality unless explicitly requested.

After modifying PWA-related files, verify:

Manifest loads successfully.
Icons resolve correctly.
Service worker registers successfully.
No service-worker errors occur.
Cached resources remain valid.
The application still loads normally.
Docker

When working with Docker:

Inspect existing Dockerfile and Compose configuration first.
Do not unnecessarily replace Docker with another deployment method.
Preserve existing volumes.
Preserve environment variables.
Preserve exposed ports unless the task requires changing them.
Check container logs when debugging.
Prefer fixing the configuration over recreating the entire environment.

Useful commands include:

docker compose config
docker compose ps
docker compose logs
docker compose up

Do not remove volumes unless explicitly authorized.

Before Major Changes

For major architectural changes, first provide:

What is currently happening.
What is causing the problem.
What you intend to change.
Which files will be affected.
Any risks or compatibility concerns.

Then implement the change.

Communication

When completing a task, provide a concise summary:

Changes Made
List the important changes.
Files Changed
List modified/created files.
Verification
List tests, builds, or commands executed.
Remaining Issues
Mention anything that could not be verified or still requires attention.

Do not claim that unresolved issues are fixed.

Priority

When rules conflict, follow this priority:

User's explicit instructions
Project-specific requirements
Existing project behavior
These general rules
Personal preference or unnecessary improvements

When uncertain, prefer preserving existing functionality and making the smallest safe change.