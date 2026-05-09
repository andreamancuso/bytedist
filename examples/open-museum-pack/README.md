# Open Museum Pack Fixture

This example uses two public-domain works from the Art Institute of Chicago
public API and IIIF image service.

The committed fixture is intentionally small and deterministic. It does not
fetch live API data during the example run, so generated `.bytedist` and HTML
output stay stable across machines.

## Fixture Files

- `artworks.json`: curated metadata copied from the public API records.
- `fixtures/la-grande-jatte.jpg`: 843px IIIF derivative for artwork `27992`.
- `fixtures/the-bedroom.jpg`: 843px IIIF derivative for artwork `28560`.

## Sources

- API documentation: <https://api.artic.edu/docs/>
- Artwork `27992`: <https://www.artic.edu/artworks/27992/a-sunday-on-la-grande-jatte-1884>
- Artwork `28560`: <https://www.artic.edu/artworks/28560/the-bedroom>

ByteDist is only packaging the public fixture data into a runtime-readable
payload. It is not changing the underlying rights or access model.
