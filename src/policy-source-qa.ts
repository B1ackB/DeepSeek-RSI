import { readFileSync } from 'node:fs';
import { fault } from './contracts.ts';
import { policyDigest, policyConditionsSchema } from './policy-contracts.ts';
import { policySourceCaseSchema } from './policy-inputs.ts';

// ponytail: one reviewed exact manifest, no inference; add another versioned pack only for a concrete repository.
const manifestDigest = '00001cab7a54e2cf1148be732f6723fa4c8e5ad2656dc41d04b7b156e5f51dc1';
export function sourceQaFiles() {
	const files = ['checkout.js', 'pricing.js', 'unused.js'].map(name => { const path = `fixtures/repository-qa-v1/${name}`; return { path, content: readFileSync(new URL(`../${path}`, import.meta.url), 'utf8') }; });
	if (!sourceQaAvailable(files)) throw fault('policy_qa_pack_changed', '预置问答包的示例源码已变化，请恢复原包；封存快照与标准答案不会随之改变');
	return files;
}
export function sourceQaAvailable(files: unknown) { try { return policyDigest(files) === manifestDigest; } catch { return false; } }
const checkout = 'fixtures/repository-qa-v1/checkout.js'; const pricing = 'fixtures/repository-qa-v1/pricing.js';
const questions = {
	symbol: {
		question: 'Locate the total implementation imported by checkout. Identify its defining file and exported symbol; distinguish unused same-name implementations.',
		reads: [pricing, checkout],
		claims: [{ fact: 'definition', value: 'pricing.js exports total', citations: [{ path: pricing, startLine: 1, endLine: 1 }, { path: checkout, startLine: 1, endLine: 4 }] }],
	},
	'call-chain': {
		question: 'Trace the successful call chain from submit to the numeric calculation. Name each call edge and explain the resulting calculation for submit(2).',
		reads: [checkout, pricing],
		claims: [
			{ fact: 'entry-call', value: 'submit -> checkout', citations: [{ path: checkout, startLine: 7, endLine: 9 }] },
			{ fact: 'calculation-call', value: 'checkout -> pricing.js:total', citations: [{ path: checkout, startLine: 1, endLine: 4 }, { path: pricing, startLine: 1, endLine: 5 }] },
			{ fact: 'result', value: 'submit(2) returns {ok:true,amount:3}', citations: [{ path: checkout, startLine: 9, endLine: 9 }, { path: pricing, startLine: 5, endLine: 5 }] },
		],
	},
	'error-path': {
		question: 'Trace submit(-1): identify the rejected-input guard, thrown error, propagation through checkout and the catch/return behavior in submit.',
		reads: [pricing, checkout],
		claims: [
			{ fact: 'guard', value: 'total rejects non-integer or negative quantity', citations: [{ path: pricing, startLine: 2, endLine: 2 }] },
			{ fact: 'throw', value: 'RangeError: INVALID_QUANTITY', citations: [{ path: pricing, startLine: 3, endLine: 3 }] },
			{ fact: 'propagation', value: 'checkout propagates the error from total to submit', citations: [{ path: checkout, startLine: 1, endLine: 4 }, { path: checkout, startLine: 9, endLine: 10 }] },
			{ fact: 'caught-result', value: 'submit(-1) returns {ok:false,error:INVALID_QUANTITY}', citations: [{ path: checkout, startLine: 10, endLine: 11 }] },
		],
	},
};
export function sourceQuestion(sourceId: string, input: unknown, caseInput: unknown) {
	const original = policyConditionsSchema.parse(input); const caseId = policySourceCaseSchema.parse(caseInput);
	if (!original.sourceSnapshot || !sourceQaAvailable(original.files)) throw fault('policy_qa_source_mismatch', '当前封存源码不匹配固定问答包，请选择完整的 repository-qa-v1 三文件快照');
	const item = structuredClone(questions[caseId]);
	const conditions = policyConditionsSchema.parse({ ...original, question: `${item.question}\nReturn JSON: {status: sufficient, claims: [{fact, value, citations: [{path, startLine, endLine}]}]}. Use these fact keys: ${item.claims.map(row => row.fact).join(', ')}.` });
	const answer = { status: 'sufficient', claims: item.claims };
	return { spec: { evaluator: 'repository-source-qa-v1' as const, sourceId, caseId, digest: policyDigest([sourceId, caseId, conditions, answer, item.reads]) }, conditions, answer, reads: item.reads };
}
export const sourceQaRuntime = () => policyDigest([sourceQuestion.toString(), sourceQaAvailable.toString(), questions, manifestDigest]);
