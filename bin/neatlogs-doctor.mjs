#!/usr/bin/env node
/**
 * neatlogs-doctor — local linter for span log files.
 *
 * Usage: neatlogs-doctor <path> [--json] [--run-id ID] [--foreign-only]
 *
 * The dist/ files are produced by tsup with both .cjs and .mjs forms.
 * This bin script uses the .mjs form to match its own ESM shape.
 */
import { main } from '../dist/doctor/cli.mjs';
process.exit(main(process.argv.slice(2)));
