module.exports = {
	root: true,
	env: {
		browser: true,
		es6: true,
		'jest/globals': true,
	},
	extends: [
		'standard',
		'plugin:security/recommended',
		'plugin:@typescript-eslint/recommended',
	],
	globals: {
		Atomics: 'readonly',
		SharedArrayBuffer: 'readonly',
	},
	parserOptions: {
		ecmaVersion: 2018,
		sourceType: 'module',
	},
	plugins: [
		'jest',
		'@typescript-eslint',
		'no-only-tests',
		'spellcheck',
	],
	rules: {
		indent: [ 'error', 'tab' ],
		'no-tabs': [ 'error', { allowIndentationTabs: true } ],
		'comma-dangle': [ 'error', 'always-multiline' ],
		'no-unused-vars': [ 'warn' ],
		'space-before-function-paren': [ 'error', {
			anonymous: 'never',
			named: 'never',
			asyncArrow: 'always',
		} ],
		'space-in-parens': [ 'error', 'always' ],
		'object-curly-spacing': [ 'error', 'always' ],
		'array-bracket-spacing': [ 'error', 'always' ],
		semi: [ 'error', 'always' ],
		'@typescript-eslint/no-var-requires': [ 'off' ],
		'no-only-tests/no-only-tests': 'error',
		'spellcheck/spell-checker': [ 'warn', {
			comments: true,
			strings: false,
			identifiers: false,
		} ],
	},
};
