# Extraction Safety

ByteDist does not expose a public `extract` CLI command in the MVP. Extraction
safety primitives exist so future tools can share one conservative path and
overwrite policy.

Extraction is filesystem-sensitive. A payload chunk name must never be treated
as a trusted filesystem path.

## Path Rules

Future extraction tools must resolve every output path under the selected output
directory. A chunk is unsafe for extraction if it uses:

- absolute paths;
- Windows drive prefixes;
- `.` or `..` path segments;
- backslashes;
- NUL or control characters;
- non-NFC Unicode names;
- names that resolve outside the output directory.

The extraction safety helpers also reject Windows-unsafe filename characters:

```text
< > : " | ? *
```

Names with trailing spaces or dots are rejected, as are Windows reserved device
basenames such as `CON`, `NUL`, `COM1`, and `LPT1`, including names with
extensions.

## Collision Rules

Extraction planning treats target paths case-insensitively. If two chunk names
would map to the same output path on a case-insensitive filesystem, planning
fails before writing any files.

## Overwrite Rules

The default overwrite policy is conservative:

- existing files are not overwritten;
- parent directories may be created;
- existing directories, symlinks, and other non-regular targets are rejected;
- `overwrite: true` permits replacing existing regular files only.

Callers can request integrity verification before extraction. When verification
is requested, no files are written unless `archive.verify()` succeeds.

## Public CLI Status

Public extraction remains post-MVP. The current CLI intentionally keeps
`bytedist extract` absent so ByteDist's packaging and deterrence story can mature
before extraction is advertised as a user-facing workflow.
