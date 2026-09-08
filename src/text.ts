export function redact(value: string) {
	return value.replace(/\b(?:sk-|dsk-)[A-Za-z0-9_-]{12,}/g, '[已排除凭据]')
		.replace(/((?:api[_ -]?key|authorization|password|secret|access[_ -]?token|密钥)\s*[=:]\s*)[^\s,;]+/gi, '$1[已排除凭据]');
}
