# Metadata and Manifests

ByteDist separates payload metadata from application manifests.

Payload metadata is generic descriptive JSON stored in the TOC. It is useful for
inspection, provenance, and tooling, but it is not a replacement for an
application-defined manifest chunk.

## Manifest Convention

The conventional manifest chunk name is:

```text
manifest.json
```

`createPayload({ manifest })` generates that chunk automatically and records
`toc.manifest.path` as `manifest.json`. Callers may also omit the `manifest`
option and provide their own chunks directly.

ByteDist does not define the manifest schema. Host applications should keep
their manifest app-specific and avoid including source paths, local filesystem
paths, user-private filenames, or other unnecessary build metadata.

## Payload Metadata

Payload-level metadata accepts these conventional optional string fields:

- `title`;
- `description`;
- `createdBy`;
- `createdAt`;
- `appId`;
- `appVersion`.

Custom JSON-compatible fields are also allowed.

```ts
const payload = await createPayload({
  manifest: { entry: "assets/main.json" },
  metadata: {
    title: "Example Artifact",
    appId: "example.viewer",
    appVersion: "1.2.3",
    buildProfile: "standalone"
  },
  files,
  integrity: "sha256"
});
```

ByteDist treats metadata as caller-owned JSON. For deterministic builds, callers
must normalize or omit changing fields such as timestamps, random IDs, machine
paths, or environment-dependent build labels.

## Reserved Namespace

The `.bytedist` chunk namespace is reserved for ByteDist-owned conventional
chunks. The currently reserved names are:

```text
.bytedist/metadata.json
.bytedist/signature
.bytedist/license.json
```

By default, `createPayload`, `collectDirectoryFiles`, and `packDirectory` reject
chunks named `.bytedist` or `.bytedist/*`. This prevents application chunks from
accidentally colliding with future ByteDist-owned metadata.

An explicit escape hatch exists for migration tools, tests, and advanced
callers:

```ts
await createPayload({
  allowReservedChunkNames: true,
  files: [{ name: ".bytedist/metadata.json", bytes }]
});
```

Using the escape hatch means the caller owns compatibility risk if a future
ByteDist version assigns behavior to one of those reserved names.
