export function redact(value: string) {
	return value.replace(/\b(?:sk-|dsk-)[A-Za-z0-9_-]{12,}/g, '[已排除凭据]')
		.replace(/((?:api[_ -]?key|authorization|password|secret|access[_ -]?token|密钥)\s*[=:]\s*)[^\s,;]+/gi, '$1[已排除凭据]');
}

export function failureMessage(error: unknown) {
	let message = '任务中断，未收到可读的错误原因';
	if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') message = error.message;
	else if (typeof error === 'string') message = error;
	else if (typeof error === 'object' && error !== null && 'kind' in error) {
		switch (error.kind) {
			case 'user': message = '聊天中的等待已被停止；已保存本次需求，尚未自动继续。'; break;
			case 'parent': message = '上级任务已停止，本次等待随之中断。'; break;
			case 'disposed': message = '会话已关闭，本次等待已中断。'; break;
			case 'hook': message = '任务被宿主检查中断。'; if ('reason' in error && typeof error.reason === 'string') message += error.reason; break;
		}
	}
	return redact(message).slice(0, 4000);
}
