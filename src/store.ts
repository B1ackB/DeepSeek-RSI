import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { attemptSchema, bindingSchema, commandSchema, fault, snapshotSchema, stateSchema, type Attempt, type State, type Snapshot } from './contracts.ts';
import { g1CommandSchema, g1StateSchema, initialG1State, receiptSchema, type G1State, type G1Command } from './g1-contracts.ts';

export function openStore(file: string) {
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	const db = new DatabaseSync(file);
	const openedAt = Date.now();
	const monotonicStart = performance.now();
	db.exec('PRAGMA busy_timeout=1000;');
	db.exec('PRAGMA locking_mode=EXCLUSIVE;');
	const schema = db.prepare('PRAGMA user_version').get()?.user_version;
	if (schema !== 0 && schema !== 1 && schema !== 2 && schema !== 3 && schema !== 4 && schema !== 5 && schema !== 6) { db.close(); throw fault('schema_version', 'Unsupported RSI database version'); }
	try { db.exec(`BEGIN IMMEDIATE;
		CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, command TEXT NOT NULL, result TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS bindings (session TEXT NOT NULL, skill TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session,skill));
		CREATE TABLE IF NOT EXISTS g1_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS g1_operations (id TEXT PRIMARY KEY, command TEXT NOT NULL, result TEXT NOT NULL);
		`);
		const previous = db.prepare('SELECT data FROM g1_state WHERE id=1').get();
		if (previous) {
			const value = g1StateSchema.parse(JSON.parse(String(previous.data)));
			if (schema !== 6) db.prepare('UPDATE g1_state SET data=? WHERE id=1').run(JSON.stringify(value));
		}
		if (schema !== 6) {
			for (const row of db.prepare('SELECT data FROM state').all()) stateSchema.parse(JSON.parse(String(row.data)));
			for (const row of db.prepare('SELECT data FROM attempts').all()) attemptSchema.parse(JSON.parse(String(row.data)));
			for (const row of db.prepare('SELECT data FROM bindings').all()) bindingSchema.parse(JSON.parse(String(row.data)));
			for (const row of db.prepare('SELECT command,result FROM operations').all()) { commandSchema.parse(JSON.parse(String(row.command))); snapshotSchema.parse(JSON.parse(String(row.result))); }
			for (const row of db.prepare('SELECT command,result FROM g1_operations').all()) { g1CommandSchema.parse(JSON.parse(String(row.command))); receiptSchema.parse(JSON.parse(String(row.result))); }
		}
		db.exec('PRAGMA user_version=6; COMMIT;');
	} catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); db.close(); throw error; }
	const initial: State = { schemaVersion: 1, probeId: randomUUID(), snapshotRevision: 1, updatedAt: Date.now(), marker: '', cancelled: false, budgetStartedAt: null };
	db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify(initial));
	db.prepare('INSERT OR IGNORE INTO g1_state VALUES (1, ?)').run(JSON.stringify(initialG1State()));
	let listeners = new Set<() => void>();
	const read = (): State => stateSchema.parse(JSON.parse(String(db.prepare('SELECT data FROM state WHERE id=1').get()?.data)));
	const attempts = (): Attempt[] => db.prepare('SELECT data FROM attempts ORDER BY rowid').all().map(row => attemptSchema.parse(JSON.parse(String(row.data))));
	const snapshot = (): Snapshot => snapshotSchema.parse({ ...read(), attempts: attempts() });
	const business = (): G1State => g1StateSchema.parse(JSON.parse(String(db.prepare('SELECT data FROM g1_state WHERE id=1').get()?.data)));
	// ponytail: G1 有界单机状态用一条 JSON；达到上限后迁移索引表，不能静默丢弃证据。
	function mutateBusiness(change: (state: G1State) => string | null | void, command?: G1Command) {
		return transaction(() => {
			if (command) {
				const previous = businessReceipt(command);
				if (previous) return previous;
			}
			const state = business();
			if (command && command.expectedRevision !== state.revision) throw fault('state_conflict', 'RSI 状态已变化，请刷新后重新确认');
			const before = JSON.stringify(state);
			const focusId = change(state) ?? null;
			if (JSON.stringify(state) !== before) {
				state.revision++;
				db.prepare('UPDATE g1_state SET data=? WHERE id=1').run(JSON.stringify(g1StateSchema.parse(state)));
				write(read());
			}
			const result = { revision: state.revision, focusId };
			if (command) db.prepare('INSERT INTO g1_operations VALUES (?, ?, ?)').run(command.operationId, JSON.stringify(command), JSON.stringify(result));
			return result;
		});
	}
	function businessReceipt(command: G1Command): { revision: number; focusId: string | null } | undefined {
		const row = db.prepare('SELECT command,result FROM g1_operations WHERE id=?').get(command.operationId);
		if (!row) return undefined;
		if (row.command !== JSON.stringify(command)) throw fault('operation_conflict', '操作 ID 已用于不同内容');
		return receiptSchema.parse(JSON.parse(String(row.result)));
	}
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
			if (attempt.purpose === 'probe') {
				const rows = attempts().filter(a => a.purpose === 'probe');
				if (state.cancelled) throw fault('cancelled', 'Probe is cancelled');
				if (rows.some(a => a.usageState !== 'confirmed' && a.state !== 'not_sent')) throw fault('usage_unknown', 'A previous RSI request is not settled');
				if (rows.length >= 8 || rows.reduce((sum, a) => sum + (a.tokens.total ?? 0), 0) >= 100000) throw fault('budget_exhausted', 'G0 request/token budget reached');
				state.budgetStartedAt ??= Date.now();
				const now = Math.max(Date.now(), openedAt + performance.now() - monotonicStart);
				if (Date.now() < state.updatedAt || now - state.budgetStartedAt >= 19 * 60_000) throw fault('budget_exhausted', 'G0 dispatch window ended or clock moved backwards; reserve final minute for cleanup');
			}
			if (attempt.owner === 'rsi' && attempt.purpose !== 'probe') {
				const stateBusiness = business();
				const flow = stateBusiness.mainflow.tasks.find(t => t.id === attempt.ownerId);
				const analysis = stateBusiness.analyses.find(a => a.id === attempt.ownerId);
				const comparison = stateBusiness.mainflow.tasks.find(t => t.comparison?.id === attempt.ownerId)?.comparison;
				const task = comparison ?? flow ?? analysis;
				if (!task || task.deadline === null || (comparison ? comparison.status !== 'running' || !comparison.runs.some(r => r.sessionId === attempt.sessionId && r.status === 'running' && attempt.purpose === (r.side === 'baseline' ? 'baseline' : 'evaluation')) : flow ? flow.status !== 'generating' || attempt.purpose !== 'generation' : analysis?.status !== 'running' || attempt.purpose !== 'analysis')) throw fault('not_authorized', '任务尚未确认或已停止');
				if (attempt.provider !== task.budget.provider || attempt.model !== task.budget.model) throw fault('budget_config', '模型路线与确认不符');
				const rows = attempts().filter(a => a.owner === 'rsi' && a.ownerId === task.id);
				if (rows.some(a => a.usageState !== 'confirmed' && a.state !== 'not_sent')) throw fault('usage_unknown', '本次任务用量尚未结算');
				if (comparison && rows.some(a => a.sessionId === attempt.sessionId)) throw fault('budget_exhausted', '每个版本只授权一次请求，不自动重试');
				if (rows.length >= task.budget.maxRequests || ((flow || comparison) && rows.reduce((sum, a) => sum + (a.tokens.total ?? 0), 0) >= (comparison ?? flow!).budget.tokenStopThreshold)) throw fault('budget_exhausted', '任务调用或 Token 停止阈值已到');
				if (Date.now() < state.updatedAt || Math.max(Date.now(), openedAt + performance.now() - monotonicStart) >= task.deadline) throw fault('budget_exhausted', '任务窗口已结束或系统时钟倒退');
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
	mutateBusiness(state => {
		for (const task of state.mainflow.tasks) {
			if (task.comparison?.status === 'running') { task.comparison.status = 'failed'; for (const run of task.comparison.runs) if (['pending', 'running'].includes(run.status)) { run.status = 'failed'; run.error = '宿主中断；不自动重放，耗时未知'; run.durationMs = null; } }
		}
		for (const task of state.mainflow.tasks) if (['confirming', 'generating', 'clarifying', 'checking', 'ready'].includes(task.status)) { task.status = 'failed'; task.error = '宿主中断；保留授权、候选和用量，不自动重放。可选择旧版或停止。'; }
		for (const analysis of state.analyses) if (analysis.status === 'running') { analysis.status = 'interrupted'; analysis.endedAt = Date.now(); analysis.error = '宿主中断；保留用量，不自动重放'; }
	});
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
	function binding(sessionId: string, skillId: string) { const row = db.prepare('SELECT data FROM bindings WHERE session=? AND skill=?').get(sessionId, skillId); return row ? bindingSchema.parse(JSON.parse(String(row.data))) : undefined; }
	return { binding, snapshot, command, reserve, settle, bind, transaction, business, mutateBusiness, businessReceipt, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, close() { listeners.clear(); db.close(); } };
}
export type Store = ReturnType<typeof openStore>;
