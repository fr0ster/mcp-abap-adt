# Issue Roadmap System

## Overview

The Issue Roadmap System is a systematic approach to analyzing, tracking, and resolving test failures in the mcp-abap-adt project. It provides a structured workflow for problem identification, root cause analysis, solution development, and progress tracking.

## Purpose

The system was introduced to:
- **Systematically analyze test failures** instead of ad-hoc debugging
- **Document solutions** for future reference and knowledge sharing
- **Track progress** on fixing issues vs expected skips vs cloud limitations
- **Prevent duplicate work** by maintaining a history of resolved issues
- **Provide context** for similar problems encountered in the future

## File Structure

Issue roadmaps are stored in `doc/development/` directory with naming pattern:
```
TEST_ISSUES_ROADMAP_YYYY-MM-DD.md
```

Example: `TEST_ISSUES_ROADMAP_2025-11-27.md`

## Workflow

### 1. Test Run and Log Collection

When tests fail, run with debug logging enabled:
```bash
DEBUG_TESTS=true npm test 2>&1 | tee /tmp/test-debug-$(date +%Y-%m-%d_%H-%M-%S).log
```

Store logs outside git repository (in `/tmp/` or similar).

### 2. Issue Analysis

For each test failure:
1. **Extract error message** from test output
2. **Identify test file** and specific test case
3. **Check YAML configuration** for test parameters
4. **Review handler code** to understand the flow
5. **Classify the issue** (Simple vs Complex, Real Issue vs Expected Skip)

### 3. Issue Classification

#### Simple Issues (⚡)
- Quick fixes requiring no deep analysis
- Missing parameters
- Code bugs (wrong parameter passing, missing checks)
- Configuration issues

#### Complex Issues (🔍)
- Require investigation and analysis
- Parameters are correct but operation fails
- Unexpected behavior despite correct input
- Need to analyze response data, dependencies, or system state

#### Expected Skips (⏭️)
- Cloud system limitations (e.g., Programs not available on cloud)
- Missing dependencies (e.g., Behavior Definition doesn't exist)
- Disabled test cases (enabled: false in YAML)
- Known SAP API quirks that are acceptable

### 4. Issue Documentation

Each issue in the roadmap includes:

#### Issue Header
- **Issue number** (sequential: #1, #2, #3...)
- **Title** (descriptive, includes object type and handler level)
- **Status** (✅ Fixed, 🔴 Pending, ⏭️ Expected)
- **Type** (⚡ Simple or 🔍 Complex)
- **Category** (Validation, Parameter, Object State, etc.)

#### Issue Details
- **Test File** path
- **YAML Config** section and test case name
- **Error message** (snippet from logs)
- **Problem description** (what's happening and why)
- **Root cause analysis** (for complex issues)
- **Solution approach** (how it was/will be fixed)
- **Code references** (file paths and line numbers)
- **Test result** (current status)

### 5. Solution Implementation

When fixing an issue:
1. **Implement the fix** in code
2. **Update test configuration** if needed (YAML)
3. **Run tests** to verify the fix
4. **Update roadmap** with fix details
5. **Update statistics** (Fixed count, Pending count)

### 6. Progress Tracking

The roadmap maintains statistics:
- **Total Issues** (original + new)
- **Fixed** (✅) - resolved issues
- **Pending** (🔴) - issues needing attention
- **Skipped/Expected** (⏭️) - expected behavior, not real issues

## Roadmap Structure

### Summary Section
- Overview statistics
- Issues summary table with links
- Legend explaining status symbols

### Issues by Object Type
- Grouped by object type (Function, Domain, Package, etc.)
- Each issue has detailed analysis

### Analysis Priority
- Simple issues listed first (quick fixes)
- Complex issues with detailed analysis
- Expected skips documented separately

### Progress Tracking
- Historical record of fixes
- Test results with dates
- Links to test logs

## Best Practices

### When Creating a New Roadmap Entry

1. **Be specific** - Include exact error messages, file paths, line numbers
2. **Provide context** - Explain what the test is trying to do
3. **Document root cause** - Not just symptoms, but why it's happening
4. **Include code references** - Use proper code reference format:
   ```markdown
   ```startLine:endLine:filepath
   // code content
   ```
   ```
5. **Update status** - Keep status current as work progresses

### When Fixing Issues

1. **Update roadmap first** - Document the fix approach
2. **Implement fix** - Make code changes
3. **Verify fix** - Run tests to confirm
4. **Update roadmap** - Mark as fixed, add solution details
5. **Update statistics** - Increment fixed count

### When Analyzing Issues

1. **Don't assume** - Verify by checking code and logs
2. **Check dependencies** - Ensure required objects exist
3. **Review similar issues** - Check if this was fixed before
4. **Consider system limitations** - Cloud vs on-premise differences
5. **Document findings** - Even if it's an expected skip

## Integration with Development Workflow

The Issue Roadmap System is integrated into the development cycle:

1. **Test failures** → Analyze and document in roadmap
2. **Fix issues** → Update roadmap with solution
3. **Release** → Roadmap changes included in changelog
4. **Knowledge base** → Roadmap serves as historical reference

## Benefits

- **Faster problem resolution** - Structured approach reduces debugging time
- **Knowledge preservation** - Solutions documented for future reference
- **Progress visibility** - Clear view of test suite health
- **Prevents regression** - Historical context helps avoid similar issues
- **Team collaboration** - Shared understanding of problems and solutions

## Example Workflow

1. Test fails: `DomainHighHandlers - Update failed: Domain already exists`
2. Analyze: Check handler code, builder logic, test configuration
3. Classify: Complex issue - workflow detection problem
4. Document: Add to roadmap as Issue #10 with full analysis
5. Fix: Pass `packageName` to `lockDomain()`, remove validation
6. Verify: Run tests, confirm fix works
7. Update: Mark Issue #10 as Fixed, update statistics
8. Release: Include fix in changelog

## Maintenance

- **Update after each test run** - Keep roadmap current
- **Archive old roadmaps** - Keep historical versions for reference
- **Review periodically** - Ensure pending issues are being addressed
- **Clean up** - Remove resolved issues from active tracking if needed

## Related Documentation

- `TEST_ISSUES_ROADMAP_*.md` - Actual issue roadmaps
- `CHANGELOG.md` - Release notes including roadmap updates
- `BUILDER_TEST_PATTERN.md` - Test writing patterns
- `TEST_CONFIG_SCHEMA.md` - Test configuration structure

