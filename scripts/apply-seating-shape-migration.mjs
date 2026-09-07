/** Exact additive migration only. Default is read-only inspection.
 * --apply uses a short transaction, bounded locks and unchanged-row proof.
 * Never prints database credentials or table/guest names. */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

config({ path: '.env.production.local', quiet: true });
const mode = process.argv[2] ?? '--inspect';
assert.ok(['--inspect', '--apply'].includes(mode), 'Use --inspect or --apply');
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
const migrationPath = new URL('../supabase/migrations/20260907210204_seating_table_shape.sql', import.meta.url);
const migration = readFileSync(migrationPath, 'utf8');
assert.equal(createHash('sha256').update(migration).digest('hex'),
  '04e4257f60d6485fe5275f3c757f7fa9205d033aaa5ad9df054dd0798e71d921',
  'Migration changed: review it and update its exact approved hash before applying');
const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require', prepare: false, max: 1, connect_timeout: 10,
});

async function snapshot(tx) {
  const [row] = await tx`SELECT count(*)::int AS count,
    md5(coalesce(jsonb_agg(to_jsonb(t) - 'shape' ORDER BY t.id)::text, '[]')) AS fingerprint
    FROM public.seating_tables t`;
  return row;
}

async function shapeColumn(tx) {
  const columns = await tx`SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'seating_tables' AND column_name = 'shape'`;
  if (columns.length) {
    assert.equal(columns.length, 1);
    assert.equal(columns[0].data_type, 'text');
    assert.equal(columns[0].is_nullable, 'YES');
    assert.equal(columns[0].column_default, null);
  }
  return columns[0] ?? null;
}

try {
  if (mode === '--inspect') {
    const result = await sql.begin('read only', async tx => {
      await tx`SET LOCAL statement_timeout = '5s'`;
      return { readOnly: true, rows: await snapshot(tx), shapeColumn: await shapeColumn(tx) };
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    const result = await sql.begin(async tx => {
      await tx`SET LOCAL lock_timeout = '2s'`;
      await tx`SET LOCAL statement_timeout = '5s'`;
      // The same lock ALTER TABLE needs. It also makes the before/after proof
      // independent of concurrent seating edits. No external calls while held.
      await tx`LOCK TABLE public.seating_tables IN ACCESS EXCLUSIVE MODE`;
      await shapeColumn(tx); // Fail closed on an incompatible existing column.
      const before = await snapshot(tx);
      await tx.unsafe(migration);
      const after = await snapshot(tx);
      assert.deepEqual(after, before, 'Existing seating rows changed; rollback');
      const column = await shapeColumn(tx);
      assert.ok(column, 'Expected shape column is missing; rollback');
      const constraints = await tx`SELECT convalidated,
        pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE conname = 'seating_tables_shape_check'
          AND conrelid = 'public.seating_tables'::regclass AND contype = 'c'`;
      assert.equal(constraints.length, 1, 'Expected shape constraint is missing; rollback');
      assert.equal(constraints[0].convalidated, true);
      assert.match(constraints[0].definition, /shape IS NULL/);
      assert.match(constraints[0].definition, /'round'::text, 'rectangular'::text, 'long'::text/);
      return { applied: true, rowsBefore: before.count, rowsAfter: after.count,
        existingRowsUnchanged: true, nullableTextColumn: true, shapeConstraintValidated: true };
    });
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  // Raw PG errors may contain row values or connection details.
  console.error(JSON.stringify({ ok: false, operation: mode,
    error: error instanceof assert.AssertionError ? error.message : 'Database operation failed; no success claimed' }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
