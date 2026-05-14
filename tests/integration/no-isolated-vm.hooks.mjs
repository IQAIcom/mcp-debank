// tests/integration/no-isolated-vm.hooks.mjs
export function resolve(specifier, context, nextResolve) {
	if (specifier === "isolated-vm") {
		const err = new Error("Cannot find module 'isolated-vm'");
		err.code = "ERR_MODULE_NOT_FOUND";
		throw err;
	}
	return nextResolve(specifier, context);
}
