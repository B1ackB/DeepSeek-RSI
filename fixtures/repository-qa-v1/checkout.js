import { total } from './pricing.js';

export function checkout(quantity) {
	return total(quantity);
}

export function submit(quantity) {
	try {
		return { ok: true, amount: checkout(quantity) };
	} catch (error) {
		return { ok: false, error: error.message };
	}
}
