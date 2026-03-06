from sqlalchemy import inspect, text


def ensure_legacy_schema_compat(conn) -> None:  # noqa: ANN001
    inspector = inspect(conn)
    table_names = set(inspector.get_table_names())

    if "course_parts" in table_names:
        course_part_columns = {column["name"] for column in inspector.get_columns("course_parts")}
        if "audio_url" not in course_part_columns:
            conn.execute(text("ALTER TABLE course_parts ADD COLUMN audio_url VARCHAR(1024)"))

    if "podcasts" in table_names:
        podcast_columns = {column["name"] for column in inspector.get_columns("podcasts")}
        podcast_column_definitions = {
            "cover_image_url": "VARCHAR(1024)",
            "cover_image_source": "VARCHAR(32)",
        }

        for column_name, definition in podcast_column_definitions.items():
            if column_name in podcast_columns:
                continue
            conn.execute(text(f"ALTER TABLE podcasts ADD COLUMN {column_name} {definition}"))

    if "podcast_parts" not in table_names:
        return

    columns = {column["name"] for column in inspector.get_columns("podcast_parts")}
    indexes = {index["name"] for index in inspector.get_indexes("podcast_parts")}

    column_definitions = {
        "sort_order": "INTEGER NOT NULL DEFAULT 0",
        "queue_priority": "INTEGER NOT NULL DEFAULT 0",
        "source_asset_id": "VARCHAR(64)",
        "source_slice_index": "INTEGER NOT NULL DEFAULT 1",
        "source_slice_total": "INTEGER NOT NULL DEFAULT 1",
        "updated_at": "TIMESTAMP",
    }

    for column_name, definition in column_definitions.items():
        if column_name in columns:
            continue
        conn.execute(text(f"ALTER TABLE podcast_parts ADD COLUMN {column_name} {definition}"))

    if "ix_podcast_parts_podcast_id_sort_order" not in indexes:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_podcast_parts_podcast_id_sort_order "
                "ON podcast_parts (podcast_id, sort_order)"
            )
        )

    conn.execute(
        text(
            """
            WITH ordered AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (PARTITION BY podcast_id ORDER BY id) AS row_num,
                    COUNT(*) OVER (PARTITION BY podcast_id) AS total_parts
                FROM podcast_parts
            )
            UPDATE podcast_parts
            SET
                sort_order = CASE
                    WHEN sort_order IS NULL OR sort_order = 0
                        THEN (SELECT row_num FROM ordered WHERE ordered.id = podcast_parts.id)
                    ELSE sort_order
                END,
                source_slice_index = CASE
                    WHEN source_slice_index IS NULL OR source_slice_index = 0
                        THEN (SELECT row_num FROM ordered WHERE ordered.id = podcast_parts.id)
                    ELSE source_slice_index
                END,
                source_slice_total = CASE
                    WHEN source_slice_total IS NULL OR source_slice_total = 0
                        THEN (SELECT total_parts FROM ordered WHERE ordered.id = podcast_parts.id)
                    ELSE source_slice_total
                END,
                updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
            """
        )
    )
