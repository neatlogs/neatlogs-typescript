# Canonical telemetry fixtures

Fixtures under `valid/` are exact copies of the canonical golden envelopes at
`neatlogs/skills@5f43e64`. They are expected to satisfy telemetry schema v2.
Future `invalid/` fixtures should include a sibling manifest describing the
schema keyword expected to reject each document.

These fixtures are language-neutral contract inputs. SDK-specific normalized
span fixtures should be added here only after Python, TypeScript, and Go agree
on the expected canonical envelope.
