# Production Functions and Triggers

**SOURCE:** Previously verified Production metadata

**EVIDENCE TYPE:** Production catalog metadata

**DATA ACCESS:** No business rows

**DATABASE MUTATION:** None

## Status

**Known object existence:** `VERIFIED`

**Complete function/trigger inventory:** `PARTIAL`

| Kind | Schema / table | Name | Status |
|---|---|---|---|
| Function | `public` | `update_updated_at_column()` | VERIFIED |
| Trigger | `public.parcel_packages` | `update_parcel_packages_updated_at` | VERIFIED |

The trigger is recorded by its fully qualified evidence identity as `public.parcel_packages.update_parcel_packages_updated_at` and invokes the verified update-timestamp behavior.

## Verified function definition

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
```

This fenced definition is catalog evidence only and must not be executed.

| Metadata | Status |
|---|---|
| Function owner and ACL | UNKNOWN |
| Trigger exact catalog definition and enabled state | UNKNOWN |
| Complete public function/trigger inventory beyond listed objects | UNKNOWN |