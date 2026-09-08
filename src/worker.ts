import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-tools';

export function restrictWorker(ctx: Context, allowed: ReadonlySet<string>) {
	ctx.tools.restrict({ allow: [] });
	// restrict 只隐藏继承工具；guard 在最终派发时也拒绝作用域后来新增的能力。
	ctx.tools.guard(exec => allowed.has(exec.name) ? undefined : 'RSI G0 worker: tool is outside the allowed set');
}
