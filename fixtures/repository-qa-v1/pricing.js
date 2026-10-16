export function total(quantity) {
	if (!Number.isInteger(quantity) || quantity < 0) {
		throw new RangeError('INVALID_QUANTITY');
	}
	return quantity + 1;
}
