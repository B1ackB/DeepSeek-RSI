import { fault } from './contracts.ts';
import { policyDigest, policyConditionsSchema } from './policy-contracts.ts';
import { policySourceCaseSchema } from './policy-inputs.ts';
import { policyQaContentSchema } from './policy-qa-inputs.ts';

export function validateManualQa(input: unknown, conditions: unknown) {
	const content = policyQaContentSchema.parse(input); const source = policyConditionsSchema.parse(conditions);
	if (!source.sourceSnapshot || content.snapshotDigest !== source.sourceSnapshot.digest) throw fault('policy_qa_source_mismatch', '问答包与封存源码不符');
	for (const item of Object.values(content.questions)) for (const claim of item.answer.claims) for (const ref of claim.citations) {
		const file = source.files.find(file => file.path === ref.path);
		if (!file || ref.endLine > file.content.split('\n').length) throw fault('policy_qa_citation_invalid', '引用必须指向封存快照中存在的文件与行');
	}
	return content;
}
export function manualSourceQuestion(packId: string, input: unknown, sourceId: string, conditions: unknown, caseInput: unknown) {
	const content = validateManualQa(input, conditions); const caseId = policySourceCaseSchema.parse(caseInput);
	if (content.sourceId !== sourceId) throw fault('policy_qa_source_mismatch', '问答包属于另一份快照记录');
	const item = content.questions[caseId]; const packDigest = policyDigest(content);
	const fixed = policyConditionsSchema.parse({ ...policyConditionsSchema.parse(conditions), question: `${item.question}\nReturn JSON: {status: sufficient, claims: [{fact, value, citations: [{path, startLine, endLine}]}]}. Use these fact keys: ${item.answer.claims.map(row => JSON.stringify(row.fact)).join(', ')}.` });
	const reads = [...new Set(item.answer.claims.flatMap(claim => claim.citations.map(ref => ref.path)))].sort();
	return { spec: { evaluator: 'repository-source-qa-manual-v1' as const, sourceId, packId, packDigest, caseId, digest: policyDigest([packId, packDigest, caseId, fixed, item.answer, reads]) }, conditions: fixed, answer: item.answer, reads };
}
