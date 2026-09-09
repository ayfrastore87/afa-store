# FASE 2.55 — Authorized Production Catalog Queries

**READ ONLY**
**SAFE FOR PRODUCTION SQL EDITOR**
**NO DATA MODIFICATION**

## Execution boundary

These statements are for an authorized user to run manually in **Supabase Dashboard → Production → SQL Editor**. Cline must not run them. Run each numbered query separately and return the complete result with its query label. The queries inspect catalog metadata only; they do not read business-table rows. Do not modify the statements or add mutation commands.

An empty result means only that the query returned no matching catalog row at execution time. Preserve it as evidence; do not independently reinterpret it as proof that a requested object is absent.

## Query Set A — `public.order_items`

### A1. All columns

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.datetime_precision
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'order_items'
ORDER BY c.ordinal_position;
```

### A2. Primary key, UNIQUE, foreign key, and CHECK constraints

The `local_columns` and `foreign_columns` arrays preserve composite-key order. FK actions are emitted by PostgreSQL's catalog definition as well as normalized action columns.

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'c' THEN 'CHECK'
  END AS constraint_type,
  ARRAY(
    SELECT a.attname
    FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_catalog.pg_attribute AS a
      ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    ORDER BY k.ord
  ) AS local_columns,
  fn.nspname AS foreign_table_schema,
  fc.relname AS foreign_table,
  CASE WHEN con.contype = 'f' THEN ARRAY(
    SELECT a.attname
    FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_catalog.pg_attribute AS a
      ON a.attrelid = con.confrelid AND a.attnum = k.attnum
    ORDER BY k.ord
  ) END AS foreign_columns,
  CASE con.confupdtype
    WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS update_action,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS delete_action,
  con.condeferrable AS is_deferrable,
  con.condeferred AS initially_deferred,
  con.convalidated AS is_validated,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS tc ON tc.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS tn ON tn.oid = tc.relnamespace
LEFT JOIN pg_catalog.pg_class AS fc ON fc.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace AS fn ON fn.oid = fc.relnamespace
WHERE tn.nspname = 'public'
  AND tc.relname = 'order_items'
  AND con.contype IN ('p', 'u', 'f', 'c')
ORDER BY constraint_type, constraint_name;
```

### A3. All indexes, including unique indexes

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  i.relname AS index_name,
  ix.indisunique AS is_unique,
  ix.indisprimary AS is_primary,
  ix.indisvalid AS is_valid,
  ix.indisready AS is_ready,
  am.amname AS access_method,
  pg_get_indexdef(i.oid) AS definition,
  pg_get_expr(ix.indpred, ix.indrelid, true) AS predicate
FROM pg_catalog.pg_index AS ix
JOIN pg_catalog.pg_class AS t ON t.oid = ix.indrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
JOIN pg_catalog.pg_class AS i ON i.oid = ix.indexrelid
JOIN pg_catalog.pg_am AS am ON am.oid = i.relam
WHERE n.nspname = 'public'
  AND t.relname = 'order_items'
ORDER BY i.relname;
```

### A4. Identity/generated status for every column

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  a.attnum AS ordinal_position,
  a.attname AS column_name,
  format_type(a.atttypid, a.atttypmod) AS physical_type,
  CASE a.attidentity WHEN 'a' THEN 'ALWAYS' WHEN 'd' THEN 'BY DEFAULT' ELSE 'NO' END AS identity_status,
  CASE a.attgenerated WHEN 's' THEN 'STORED' WHEN 'v' THEN 'VIRTUAL' ELSE 'NO' END AS generated_status,
  pg_get_expr(ad.adbin, ad.adrelid, true) AS default_or_generation_expression
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS t ON t.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS ad
  ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname = 'public'
  AND t.relname = 'order_items'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum;
```

### A5. Timestamp-name candidates with physical type

Names are candidates only. The result must not be classified as a timestamp without checking `physical_type`/`data_type`.

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.udt_name,
  c.datetime_precision,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'order_items'
  AND (
    lower(c.column_name) LIKE '%created%'
    OR lower(c.column_name) LIKE '%updated%'
    OR lower(c.column_name) LIKE '%time%'
    OR lower(c.column_name) LIKE '%date%'
    OR lower(c.column_name) LIKE '%at%'
  )
ORDER BY c.ordinal_position;
```

## Query Set B — `public.products`

### B1. All columns, including exact names and requested-name candidates

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.datetime_precision,
  CASE WHEN lower(c.column_name) IN ('id', 'stock', 'createdat', 'updatedat', 'created_at', 'updated_at')
    THEN 'REQUESTED CANDIDATE' ELSE NULL END AS requested_candidate
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'products'
ORDER BY c.ordinal_position;
```

### B2. Primary key, UNIQUE, foreign key, and CHECK constraints

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY' WHEN 'c' THEN 'CHECK'
  END AS constraint_type,
  ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_catalog.pg_attribute AS a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
        ORDER BY k.ord) AS local_columns,
  fn.nspname AS foreign_table_schema,
  fc.relname AS foreign_table,
  CASE WHEN con.contype = 'f' THEN ARRAY(
    SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_catalog.pg_attribute AS a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
    ORDER BY k.ord) END AS foreign_columns,
  CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS update_action,
  CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS delete_action,
  con.convalidated AS is_validated,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS tc ON tc.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS tn ON tn.oid = tc.relnamespace
LEFT JOIN pg_catalog.pg_class AS fc ON fc.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace AS fn ON fn.oid = fc.relnamespace
WHERE tn.nspname = 'public'
  AND tc.relname = 'products'
  AND con.contype IN ('p', 'u', 'f', 'c')
ORDER BY constraint_type, constraint_name;
```

### B3. All indexes, definitions, uniqueness, validity, and readiness

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  i.relname AS index_name,
  ix.indisunique AS is_unique,
  ix.indisprimary AS is_primary,
  ix.indisvalid AS is_valid,
  ix.indisready AS is_ready,
  am.amname AS access_method,
  pg_get_indexdef(i.oid) AS definition,
  pg_get_expr(ix.indpred, ix.indrelid, true) AS predicate
FROM pg_catalog.pg_index AS ix
JOIN pg_catalog.pg_class AS t ON t.oid = ix.indrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
JOIN pg_catalog.pg_class AS i ON i.oid = ix.indexrelid
JOIN pg_catalog.pg_am AS am ON am.oid = i.relam
WHERE n.nspname = 'public' AND t.relname = 'products'
ORDER BY i.relname;
```

### B4. Identity/generated status for every column

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  a.attnum AS ordinal_position,
  a.attname AS column_name,
  format_type(a.atttypid, a.atttypmod) AS physical_type,
  CASE a.attidentity WHEN 'a' THEN 'ALWAYS' WHEN 'd' THEN 'BY DEFAULT' ELSE 'NO' END AS identity_status,
  CASE a.attgenerated WHEN 's' THEN 'STORED' WHEN 'v' THEN 'VIRTUAL' ELSE 'NO' END AS generated_status,
  pg_get_expr(ad.adbin, ad.adrelid, true) AS default_or_generation_expression
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS t ON t.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname = 'public' AND t.relname = 'products'
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;
```

### B5. Timestamp-name candidates with physical type

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT c.column_name, c.ordinal_position, c.data_type, c.udt_name,
       c.datetime_precision, c.is_nullable, c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public' AND c.table_name = 'products'
  AND (lower(c.column_name) LIKE '%created%' OR lower(c.column_name) LIKE '%updated%'
       OR lower(c.column_name) LIKE '%time%' OR lower(c.column_name) LIKE '%date%'
       OR lower(c.column_name) LIKE '%at%')
ORDER BY c.ordinal_position;
```

## Query Set C — `public.stock_history`

### C1. All columns and physical types

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  c.column_name, c.ordinal_position, c.data_type, c.udt_schema, c.udt_name,
  c.is_nullable, c.column_default, c.character_maximum_length,
  c.numeric_precision, c.numeric_scale, c.datetime_precision,
  CASE WHEN lower(c.column_name) IN ('id', 'product_id', 'quantity', 'transaction_type', 'created_at', 'updated_at')
    THEN 'REQUESTED CANDIDATE' ELSE NULL END AS requested_candidate
FROM information_schema.columns AS c
WHERE c.table_schema = 'public' AND c.table_name = 'stock_history'
ORDER BY c.ordinal_position;
```

### C2. Primary key, UNIQUE, foreign key/actions, and CHECK constraints

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  con.conname AS constraint_name,
  CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY' WHEN 'c' THEN 'CHECK' END AS constraint_type,
  ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_catalog.pg_attribute AS a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
        ORDER BY k.ord) AS local_columns,
  fn.nspname AS foreign_table_schema,
  fc.relname AS foreign_table,
  CASE WHEN con.contype = 'f' THEN ARRAY(
    SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_catalog.pg_attribute AS a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
    ORDER BY k.ord) END AS foreign_columns,
  CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS update_action,
  CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS delete_action,
  con.convalidated AS is_validated,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS tc ON tc.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS tn ON tn.oid = tc.relnamespace
LEFT JOIN pg_catalog.pg_class AS fc ON fc.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace AS fn ON fn.oid = fc.relnamespace
WHERE tn.nspname = 'public' AND tc.relname = 'stock_history'
  AND con.contype IN ('p', 'u', 'f', 'c')
ORDER BY constraint_type, constraint_name;
```

### C3. All index definitions

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT i.relname AS index_name, ix.indisunique AS is_unique,
       ix.indisprimary AS is_primary, ix.indisvalid AS is_valid,
       ix.indisready AS is_ready, am.amname AS access_method,
       pg_get_indexdef(i.oid) AS definition,
       pg_get_expr(ix.indpred, ix.indrelid, true) AS predicate
FROM pg_catalog.pg_index AS ix
JOIN pg_catalog.pg_class AS t ON t.oid = ix.indrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
JOIN pg_catalog.pg_class AS i ON i.oid = ix.indexrelid
JOIN pg_catalog.pg_am AS am ON am.oid = i.relam
WHERE n.nspname = 'public' AND t.relname = 'stock_history'
ORDER BY i.relname;
```

### C4. Identity/generated status for every column

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT a.attnum AS ordinal_position, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS physical_type,
       CASE a.attidentity WHEN 'a' THEN 'ALWAYS' WHEN 'd' THEN 'BY DEFAULT' ELSE 'NO' END AS identity_status,
       CASE a.attgenerated WHEN 's' THEN 'STORED' WHEN 'v' THEN 'VIRTUAL' ELSE 'NO' END AS generated_status,
       pg_get_expr(ad.adbin, ad.adrelid, true) AS default_or_generation_expression
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS t ON t.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname = 'public' AND t.relname = 'stock_history'
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;
```

### C5. Timestamp-name candidates with physical type

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT c.column_name, c.ordinal_position, c.data_type, c.udt_name,
       c.datetime_precision, c.is_nullable, c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public' AND c.table_name = 'stock_history'
  AND (lower(c.column_name) LIKE '%created%' OR lower(c.column_name) LIKE '%updated%'
       OR lower(c.column_name) LIKE '%time%' OR lower(c.column_name) LIKE '%date%'
       OR lower(c.column_name) LIKE '%at%')
ORDER BY c.ordinal_position;
```

## Query Set D — referenced-key compatibility

### D1. Exact `order_items` foreign keys that reference `products`

This query does not assume a local column spelling. If no row is returned, report the requested FK as `UNKNOWN` until the complete output and execution context are reviewed; do not create an FK.

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  con.conname AS constraint_name,
  la.attname AS local_column,
  format_type(la.atttypid, la.atttypmod) AS local_physical_type,
  la.attnotnull AS local_not_null,
  fn.nspname AS foreign_table_schema,
  ft.relname AS foreign_table,
  fa.attname AS foreign_column,
  format_type(fa.atttypid, fa.atttypmod) AS foreign_physical_type,
  fa.attnotnull AS foreign_not_null,
  CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS update_action,
  CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS delete_action,
  con.convalidated AS is_validated,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS lt ON lt.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS ln ON ln.oid = lt.relnamespace
JOIN pg_catalog.pg_class AS ft ON ft.oid = con.confrelid
JOIN pg_catalog.pg_namespace AS fn ON fn.oid = ft.relnamespace
JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS keys(local_attnum, foreign_attnum, ord) ON true
JOIN pg_catalog.pg_attribute AS la ON la.attrelid = con.conrelid AND la.attnum = keys.local_attnum
JOIN pg_catalog.pg_attribute AS fa ON fa.attrelid = con.confrelid AND fa.attnum = keys.foreign_attnum
WHERE con.contype = 'f'
  AND ln.nspname = 'public' AND lt.relname = 'order_items'
  AND fn.nspname = 'public' AND ft.relname = 'products'
ORDER BY con.conname, keys.ord;
```

### D2. PK/UNIQUE support for every referenced `products` key

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
WITH referenced_attnums AS (
  SELECT DISTINCT unnest(con.confkey) AS attnum
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS lt ON lt.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS ln ON ln.oid = lt.relnamespace
  JOIN pg_catalog.pg_class AS ft ON ft.oid = con.confrelid
  JOIN pg_catalog.pg_namespace AS fn ON fn.oid = ft.relnamespace
  WHERE con.contype = 'f'
    AND ln.nspname = 'public' AND lt.relname = 'order_items'
    AND fn.nspname = 'public' AND ft.relname = 'products'
)
SELECT
  a.attname AS referenced_column,
  format_type(a.atttypid, a.atttypmod) AS referenced_physical_type,
  a.attnotnull AS referenced_not_null,
  con.conname AS key_constraint_name,
  CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' END AS key_constraint_type,
  pg_get_constraintdef(con.oid, true) AS key_definition
FROM referenced_attnums AS r
JOIN pg_catalog.pg_class AS t ON t.relname = 'products'
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace AND n.nspname = 'public'
JOIN pg_catalog.pg_attribute AS a ON a.attrelid = t.oid AND a.attnum = r.attnum
LEFT JOIN pg_catalog.pg_constraint AS con
  ON con.conrelid = t.oid AND con.contype IN ('p', 'u') AND r.attnum = ANY(con.conkey)
ORDER BY a.attname, con.conname;
```

## Query Set E — scoped catalog summary

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT
  c.table_name,
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('order_items', 'products', 'stock_history')
ORDER BY c.table_name, c.ordinal_position;
```

## Return instructions

Return complete, unedited output for **A1–A5, B1–B5, C1–C5, D1–D2, and E**, retaining the query labels and explicit empty results. CSV exports or pasted result tables are acceptable if exact case, types, defaults, definitions, booleans, and nulls are preserved. Do not include credentials, connection strings, business rows, screenshots containing secrets, or unrelated Production data.

Until those outputs are supplied and reviewed:

```text
AUTHORIZED PRODUCTION EVIDENCE RECEIVED = NO
CATALOG COMPLETION = INCOMPLETE
PRODUCTION DATA CHANGED = NO
PRODUCTION SCHEMA CHANGED = NO
MIGRATION EXECUTED = NO
MIGRATION B AUTHORED = NO
```