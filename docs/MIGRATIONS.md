# Data Migrations

Suitor applies additive profile-local SQLite migrations at startup. Back up the database from Settings before downgrading to an older release.

## Schema 3

Schema 3 adds the `captures` table for manual role capture. It includes normalized identity fields for deduplication, timestamps, and `deleted_at` for soft deletion. Existing jobs, applications, scan decisions, events, interviews, and contacts are unchanged.

The migration is idempotent: starting the same version again does not duplicate rows or rebuild existing tables.

## Compatibility

Markdown application trackers and scan-state JSON remain supported as compatibility inputs. SQLite is the durable application and decision store, while generated documents and uploaded files remain under the active profile root.
