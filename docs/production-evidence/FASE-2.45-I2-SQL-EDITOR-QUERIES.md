# FASE 2.45-I.2 — Manual Production SQL Editor Evidence Queries

**Target:** Supabase Dashboard → SQL Editor → Production (`postgres`)
**Scope:** catalog metadata for schema `public`
**Operation:** read-only evidence collection; no business-row queries

Run each numbered block separately and preserve its complete result with the query number. These queries do not claim any result. Do not edit them into mutation statements. Query 21 reads only catalog metadata about cross-schema dependencies; it does not introspect `auth` business data.

## 1. Public base-table inventory

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

## 2. Complete column metadata

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT table_schema, table_name, ordinal_position, column_name,
       data_type, udt_schema, udt_name, is_nullable, column_default,
       character_maximum_length, numeric_precision, numeric_scale,
       datetime_precision, is_identity, identity_generation,
       identity_start, identity_increment, identity_maximum,
       identity_minimum, identity_cycle, is_generated,
       generation_expression
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

## 3. Primary-key constraints

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS table_schema, c.relname AS table_name,
       con.conname AS constraint_name, con.contype AS constraint_type,
       pg_get_constraintdef(con.oid, true) AS definition,
       ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             ORDER BY k.ord) AS columns,
       con.condeferrable AS is_deferrable,
       con.condeferred AS initially_deferred, con.convalidated AS validated
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'p'
ORDER BY c.relname, con.conname;
```

## 4. Unique constraints

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS table_schema, c.relname AS table_name,
       con.conname AS constraint_name, con.contype AS constraint_type,
       pg_get_constraintdef(con.oid, true) AS definition,
       ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             ORDER BY k.ord) AS columns,
       con.condeferrable AS is_deferrable,
       con.condeferred AS initially_deferred, con.convalidated AS validated
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'u'
ORDER BY c.relname, con.conname;
```

## 5. Foreign keys, referenced columns, and actions

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS table_schema, c.relname AS table_name,
       con.conname AS constraint_name, pg_get_constraintdef(con.oid, true) AS definition,
       ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             ORDER BY k.ord) AS columns,
       rn.nspname AS referenced_schema, rc.relname AS referenced_table,
       ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_catalog.pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
             ORDER BY k.ord) AS referenced_columns,
       CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update,
       CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
       con.condeferrable AS is_deferrable, con.condeferred AS initially_deferred,
       con.convalidated AS validated
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'f'
ORDER BY c.relname, con.conname;
```

## 6. Check constraints

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS table_schema, c.relname AS table_name,
       con.conname AS constraint_name, pg_get_constraintdef(con.oid, true) AS definition,
       ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             ORDER BY k.ord) AS columns,
       con.connoinherit AS no_inherit, con.convalidated AS validated
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'c'
ORDER BY c.relname, con.conname;
```

## 7. Complete index metadata

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT tn.nspname AS table_schema, t.relname AS table_name,
       i.relname AS index_name, am.amname AS index_method,
       ix.indisunique AS is_unique, ix.indisprimary AS is_primary,
       ix.indisvalid AS is_valid, ix.indisready AS is_ready,
       pg_get_indexdef(i.oid) AS index_definition,
       ARRAY(SELECT pg_get_indexdef(i.oid, k, true)
             FROM generate_series(1, ix.indnkeyatts) AS k) AS keys_or_expressions,
       pg_get_expr(ix.indexprs, ix.indrelid, true) AS expressions,
       pg_get_expr(ix.indpred, ix.indrelid, true) AS predicate
FROM pg_catalog.pg_index ix
JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid
JOIN pg_catalog.pg_namespace tn ON tn.oid = t.relnamespace
JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
JOIN pg_catalog.pg_am am ON am.oid = i.relam
WHERE tn.nspname = 'public'
ORDER BY t.relname, i.relname;
```

## 8. Identity and generated columns, including owned sequence

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS table_schema, c.relname AS table_name, a.attnum AS ordinal_position,
       a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attidentity AS identity_kind, a.attgenerated AS generated_kind,
       pg_get_expr(ad.adbin, ad.adrelid, true) AS default_or_generation_expression,
       sn.nspname AS sequence_schema, seq.relname AS owned_sequence
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
LEFT JOIN pg_catalog.pg_depend dep ON dep.refclassid = 'pg_class'::regclass
  AND dep.refobjid = c.oid AND dep.refobjsubid = a.attnum
  AND dep.classid = 'pg_class'::regclass AND dep.deptype IN ('a', 'i')
LEFT JOIN pg_catalog.pg_class seq ON seq.oid = dep.objid AND seq.relkind = 'S'
LEFT JOIN pg_catalog.pg_namespace sn ON sn.oid = seq.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND a.attnum > 0 AND NOT a.attisdropped
  AND (a.attidentity <> '' OR a.attgenerated <> '' OR seq.oid IS NOT NULL)
ORDER BY c.relname, a.attnum, seq.relname;
```

## 9. Public sequences and ownership relation

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT sn.nspname AS sequence_schema, s.relname AS sequence_name,
       pg_get_userbyid(s.relowner) AS owner,
       tn.nspname AS owned_by_table_schema, t.relname AS owned_by_table,
       a.attname AS owned_by_column,
       format_type(ps.seqtypid, NULL) AS data_type, ps.seqstart AS start_value,
       ps.seqincrement AS increment_by, ps.seqmin AS min_value,
       ps.seqmax AS max_value, ps.seqcache AS cache_size, ps.seqcycle AS cycle
FROM pg_catalog.pg_class s
JOIN pg_catalog.pg_namespace sn ON sn.oid = s.relnamespace
JOIN pg_catalog.pg_sequence ps ON ps.seqrelid = s.oid
LEFT JOIN pg_catalog.pg_depend d ON d.classid = 'pg_class'::regclass
  AND d.objid = s.oid AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
LEFT JOIN pg_catalog.pg_class t ON t.oid = d.refobjid
LEFT JOIN pg_catalog.pg_namespace tn ON tn.oid = t.relnamespace
LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
WHERE sn.nspname = 'public' AND s.relkind = 'S'
ORDER BY s.relname;
```

## 10. Public functions with complete definitions

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS function_schema, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_function_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS return_type, l.lanname AS language,
       CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END AS volatility,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       pg_get_userbyid(p.proowner) AS owner, p.proacl AS acl,
       pg_get_functiondef(p.oid) AS complete_definition
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public' AND p.prokind = 'f'
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
```

## 11. Public-table triggers

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS table_schema, c.relname AS table_name,
       tg.tgname AS trigger_name,
       CASE tg.tgenabled WHEN 'O' THEN 'ENABLED' WHEN 'D' THEN 'DISABLED' WHEN 'R' THEN 'REPLICA' WHEN 'A' THEN 'ALWAYS' END AS enabled_state,
       pn.nspname AS function_schema, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS function_arguments,
       pg_get_triggerdef(tg.oid, true) AS trigger_definition
FROM pg_catalog.pg_trigger tg
JOIN pg_catalog.pg_class c ON c.oid = tg.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_proc p ON p.oid = tg.tgfoid
JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
WHERE n.nspname = 'public' AND NOT tg.tgisinternal
ORDER BY c.relname, tg.tgname;
```

## 12. RLS and FORCE RLS state

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS table_schema, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls_enabled
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
```

## 13. RLS policies

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT schemaname AS table_schema, tablename AS table_name,
       policyname AS policy_name, permissive, roles, cmd AS command,
       qual AS using_expression, with_check AS with_check_expression
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## 14. Public views

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT schemaname AS view_schema, viewname AS view_name,
       viewowner AS owner, definition
FROM pg_catalog.pg_views
WHERE schemaname = 'public'
ORDER BY viewname;
```

## 15. Public materialized views

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT schemaname AS view_schema, matviewname AS materialized_view_name,
       matviewowner AS owner, tablespace, hasindexes, ispopulated, definition
FROM pg_catalog.pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;
```

## 16. Public enums and ordered labels

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS type_schema, t.typname AS enum_name,
       pg_get_userbyid(t.typowner) AS owner,
       e.enumsortorder AS label_order, e.enumlabel AS label
FROM pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = 'public' AND t.typtype = 'e'
ORDER BY t.typname, e.enumsortorder;
```

## 17. Public domains

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS domain_schema, t.typname AS domain_name,
       pg_get_userbyid(t.typowner) AS owner,
       format_type(t.typbasetype, t.typtypmod) AS base_type,
       t.typnotnull AS not_null, t.typdefault AS default_expression,
       c.conname AS constraint_name, pg_get_constraintdef(c.oid, true) AS constraint_definition
FROM pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_constraint c ON c.contypid = t.oid
WHERE n.nspname = 'public' AND t.typtype = 'd'
ORDER BY t.typname, c.conname;
```

## 18. Other public custom/composite types

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS type_schema, t.typname AS type_name,
       t.typtype AS type_kind, t.typcategory AS type_category,
       pg_get_userbyid(t.typowner) AS owner,
       a.attnum AS attribute_order, a.attname AS attribute_name,
       format_type(a.atttypid, a.atttypmod) AS attribute_type
FROM pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_class c ON c.oid = t.typrelid
LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public'
  AND t.typtype NOT IN ('e', 'd')
  AND t.typelem = 0
  AND (t.typrelid = 0 OR c.relkind = 'c')
ORDER BY t.typname, a.attnum;
```

## 19. Ownership of public relations and functions

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
WITH owned_objects AS (
  SELECT n.nspname AS object_schema, c.relname AS object_name,
         CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'PARTITIONED TABLE'
           WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' END AS object_type,
         pg_get_userbyid(c.relowner) AS owner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
  UNION ALL
  SELECT n.nspname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'FUNCTION', pg_get_userbyid(p.proowner)
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
)
SELECT object_schema, object_name, object_type, owner
FROM owned_objects
ORDER BY object_type, object_name;
```

## 20. ACL privileges for public relations and functions

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
WITH object_acls AS (
  SELECT n.nspname AS object_schema, c.relname AS object_name,
         CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'PARTITIONED TABLE'
           WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' END AS object_type,
         c.relowner AS owner_oid, c.relacl AS acl
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
  UNION ALL
  SELECT n.nspname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'FUNCTION', p.proowner, p.proacl
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
)
SELECT o.object_schema, o.object_name, o.object_type,
       pg_get_userbyid(o.owner_oid) AS owner,
       o.acl AS raw_acl, grantee.rolname AS grantee,
       grantor.rolname AS grantor, x.privilege_type, x.is_grantable
FROM object_acls o
LEFT JOIN LATERAL aclexplode(COALESCE(o.acl, acldefault(CASE o.object_type WHEN 'FUNCTION' THEN 'f'::"char" WHEN 'SEQUENCE' THEN 'S'::"char" ELSE 'r'::"char" END, o.owner_oid))) x ON true
LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = x.grantee
LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = x.grantor
ORDER BY o.object_type, o.object_name, grantee.rolname, x.privilege_type;
```

## 21. Cross-schema foreign-key dependencies from public

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS source_schema, c.relname AS source_table,
       con.conname AS constraint_name,
       ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             ORDER BY k.ord) AS source_columns,
       rn.nspname AS target_schema, rc.relname AS target_table,
       ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
             JOIN pg_catalog.pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
             ORDER BY k.ord) AS target_columns,
       CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update,
       CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
       pg_get_constraintdef(con.oid, true) AS definition,
       con.convalidated AS validated
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'f' AND rn.nspname <> 'public'
ORDER BY c.relname, con.conname;
```

## 22. `CheckoutIdempotency` existence

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS table_schema, c.relname AS table_name, c.relkind
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'CheckoutIdempotency';
```

## 23. `_prisma_migrations` existence

```sql
-- READ ONLY
-- SAFE FOR PRODUCTION SQL EDITOR
-- NO DATA MODIFICATION
SELECT n.nspname AS table_schema, c.relname AS table_name, c.relkind
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations';
```

## Collection note

An empty result is evidence only when the complete output and its corresponding numbered query are retained. Do not replace empty output with an assumed result. Before sharing evidence, verify that no browser-added context contains credentials, tokens, API keys, connection strings, or business-row data.