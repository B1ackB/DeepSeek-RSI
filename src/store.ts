import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { attemptSchema, bindingSchema, commandSchema, fault, snapshotSchema, stateSchema, type Attempt, type State, type Snapshot } from './contracts.ts';

export function openStore(file: string) {
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	const db = new DatabaseSync(file);
	const openedAt = Date.now();
	const monotonicStart = performance.now();
	db.exec('PRAGMA busy_timeout=1000;');
	db.exec('PRAGMA locking_mode=EXCLUSIVE;');
	const schema = db.prepare('PRAGMA user_version').get()?.user_version;
	if (schema !== 0 && schema !== 1) { db.close(); throw fault('schema_version', 'Unsupported RSI database version'); }
	try { db.exec(`CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, command TEXT NOT NULL, result TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS bindings (session TEXT NOT NULL, skill TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session,skill));
		PRAGMA user_version=1;`); } catch (error) { db.close(); throw error; }
	const initial: State = { schemaVersion: 1, probeId: randomUUID(), snapshotRevision: 1, updatedAt: Date.now(), marker: '', cancelled: false, budgetStartedAt: null };
	db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify(initial));
	let listeners = new Set<() => void>();
	const read = (): State => stateSchema.parse(JSON.parse(String(db.prepare('SELECT data FROM state WHERE id=1').get()?.data)));
	const attempts = (): Attempt[] => db.prepare('SELECT data FROM attempts ORDER BY rowid').all().map(row => attemptSchema.parse(JSON.parse(String(row.data))));
	const snapshot = (): Snapshot => snapshotSchema.parse({ ...read(), attempts: attempts() });
	function transaction<T>(action: () => T): T {
		db.exec('BEGIN IMMEDIATE');
		try { const result = action(); db.exec('COMMIT'); for (const notify of listeners) notify(); return result; }
		catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
	}
	function write(state: State) {
		db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(stateSchema.parse({ ...state, snapshotRevision: state.snapshotRevision + 1, updatedAt: Date.now() })));
	}
	function command(input: unknown): Snapshot {
		const cmd = commandSchema.parse(input);
		return transaction(() => {
			const encoded = JSON.stringify(cmd);
			const existing = db.prepare('SELECT command,result FROM operations WHERE id=?').get(cmd.operationId);
			if (existing) {
				if (existing.command !== encoded) throw fault('operation_conflict', 'Operation ID was used with different content');
				return snapshotSchema.parse(JSON.parse(String(existing.result)));
			}
			const state = read();
			if (cmd.probeId !== state.probeId || cmd.expectedRevision !== state.snapshotRevision) throw fault('state_conflict', 'Probe state changed; refresh before retrying');
			if (cmd.kind === 'set_marker') state.marker = cmd.payload.marker;
			else state.cancelled = true;
			write(state);
			const result = snapshot();
			db.prepare('INSERT INTO operations VALUES (?, ?, ?)').run(cmd.operationId, encoded, JSON.stringify(result));
			return result;
		});
	}
	function reserve(attempt: Attempt) {
		attemptSchema.parse(attempt);
		if (attempt.state !== 'reserved' || attempt.revision !== 1 || attempt.startedAt !== null || attempt.endedAt !== null) throw fault('state_conflict', 'New attempt must start at reserved revision 1');
		transaction(() => {
			const state = read();
			if (attempt.owner === 'rsi' || attempt.purpose === 'probe') {
				const rows = attempts().filter(a => a.owner === 'rsi' || a.purpose === 'probe');
				if (state.cancelled) throw fault('cancelled', 'Probe is cancelled');
				if (rows.some(a => a.usageState !== 'confirmed' && a.state !== 'not_sent')) throw fault('usage_unknown', 'A previous RSI request is not settled');
				if (rows.length >= 8 || rows.reduce((sum, a) => sum + (a.tokens.total ?? 0), 0) >= 100000) throw fault('budget_exhausted', 'G0 request/token budget reached');
				state.budgetStartedAt ??= Date.now();
				const now = Math.max(Date.now(), openedAt + performance.now() - monotonicStart);
				if (Date.now() < state.updatedAt || now - state.budgetStartedAt >= 19 * 60_000) throw fault('budget_exhausted', 'G0 dispatch window ended or clock moved backwards; reserve final minute for cleanup');
			}
			db.prepare('INSERT INTO attempts VALUES (?, ?)').run(attempt.attemptId, JSON.stringify(attempt));
			write(state);
		});
	}
	function settle(attempt: Attempt) {
		attemptSchema.parse(attempt);
		transaction(() => {
			const row = db.prepare('SELECT data FROM attempts WHERE id=?').get(attempt.attemptId);
			if (!row) throw fault('attempt_missing', 'Request attempt is not reserved');
			const before = attemptSchema.parse(JSON.parse(String(row.data)));
			if (JSON.stringify(before) === JSON.stringify(attempt)) return;
			if (attempt.revision !== before.revision + 1 || before.owner !== attempt.owner || before.ownerId !== attempt.ownerId) throw fault('state_conflict', 'Stale or reassigned request attempt');
			for (const key of ['sessionId', 'purpose', 'callKind', 'retryOfAttemptId', 'provider', 'model', 'createdAt'] as const) if (before[key] !== attempt[key]) throw fault('state_conflict', 'Attempt identity is immutable');
			const terminal = !['reserved', 'in_flight'].includes(before.state);
			if (terminal && attempt.state !== before.state) throw fault('state_conflict', 'Terminal request cannot re-enter another lifecycle state');
			db.prepare('UPDATE attempts SET data=? WHERE id=?').run(JSON.stringify(attempt), attempt.attemptId);
			write(read());
		});
	}
	// 崩溃后的请求不重放、不释放已占额度。
	for (const a of attempts()) if (a.state === 'reserved' || a.state === 'in_flight') settle({ ...a, revision: a.revision + 1, state: 'interrupted', endedAt: Date.now(), usageState: a.tokens.total === null ? 'unknown' : 'confirmed' });
	function bind(sessionId: string, skillId: string, versionDigest: string) {
		const binding = bindingSchema.parse({ schemaVersion: 1, sessionId, skillId, versionDigest, boundAt: Date.now() });
		return transaction(() => {
			const old = db.prepare('SELECT data FROM bindings WHERE session=? AND skill=?').get(sessionId, skillId);
			if (old) {
				const previous = bindingSchema.parse(JSON.parse(String(old.data)));
				if (previous.versionDigest !== versionDigest) throw fault('binding_conflict', 'Session is already bound to a different Skill version');
				return previous;
			}
			db.prepare('INSERT INTO bindings VALUES (?, ?, ?)').run(sessionId, skillId, JSON.stringify(binding));
			return binding;
		});
	}
	return { snapshot, command, reserve, settle, bind, transaction, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, close() { listeners.clear(); db.close(); } };
}
export type Store = ReturnType<typeof openStore>;
