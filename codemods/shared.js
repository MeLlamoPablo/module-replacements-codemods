/**
 * type definition for return type object
 * @typedef {Object} RemoveImport
 * @property {string} identifier - the name of the module as it was imported or required. for example, `keys` in `import keys from 'object-keys'`
 * @typedef {Object} ReplaceDefaultImport
 * @property {string} identifier - the name of the module as it was imported or required. for example, `keys` in `import keys from 'object-keys'`
 */

/**
 * @param {string} name - package name to remove import/require calls for
 * @param {import("jscodeshift").Collection} root - package name to remove import/require calls for
 * @param {import("jscodeshift").JSCodeshift} j - jscodeshift instance
 * @returns {RemoveImport}
 */
export function removeImport(name, root, j) {
	// Find the import or require statement for 'is-boolean-object'
	const importDeclaration = root.find(j.ImportDeclaration, {
		source: {
			value: name,
		},
	});

	const requireDeclaration = root.find(j.VariableDeclarator, {
		init: {
			callee: {
				name: 'require',
			},
			arguments: [
				{
					value: name,
				},
			],
		},
	});

	// Require statements without declarations like `Object.is = require("object-is");`
	const requireAssignment = root.find(j.AssignmentExpression, {
		operator: '=',
		right: {
			callee: {
				name: 'require',
			},
			arguments: [
				{
					value: name,
				},
			],
		},
	});

	// Side effect requires statements like `require("error-cause/auto");`
	const sideEffectRequireExpression = root.find(j.ExpressionStatement, {
		expression: {
			callee: {
				name: 'require',
			},
			arguments: [
				{
					value: name,
				},
			],
		},
	});

	// Return the identifier name, e.g. 'fn' in `import { fn } from 'is-boolean-object'`
	// or `var fn = require('is-boolean-object')`
	const identifier =
		importDeclaration.paths().length > 0
			? importDeclaration.get().node.specifiers[0].local.name
			: requireDeclaration.paths().length > 0
				? requireDeclaration.find(j.Identifier).get().node.name
				: requireAssignment.paths().length > 0
					? requireAssignment.find(j.Identifier).get().node.name
					: null;

	importDeclaration.remove();
	requireDeclaration.remove();
	requireAssignment.remove();
	sideEffectRequireExpression.remove();

	return { identifier };
}

/**
 * Replaces import declarations that use default specifiers
 * Finds and replaces:
 * - `import React from 'react';`
 * - `var React = require('react');`
 *
 * Todo: This function does not handle `Object.React = require('react)` yet
 *
 * @param {string} name - old package name to replace import/require calls for
 * @param {string} newSpecifier - new specifier name
 * @param {string} newName - new package name
 * @param {import("jscodeshift").Collection} root - package name to replace import/require calls for
 * @param {import("jscodeshift").JSCodeshift} j - jscodeshift instance
 * @returns {ReplaceDefaultImport}
 */
export function replaceDefaultImport(name, newSpecifier, newName, root, j) {
	const importDeclaration = root.find(j.ImportDeclaration, {
		source: {
			value: name,
		},
	});

	const requireDeclaration = root.find(j.VariableDeclarator, {
		init: {
			callee: {
				name: 'require',
			},
			arguments: [
				{
					value: name,
				},
			],
		},
	});

	const identifier =
		importDeclaration.paths().length > 0
			? importDeclaration.get().node.specifiers[0].local.name
			: requireDeclaration.paths().length > 0
				? requireDeclaration.find(j.Identifier).get().node.name
				: null;

	importDeclaration.forEach((path) => {
		j(path).replaceWith(
			j.importDeclaration(
				[j.importDefaultSpecifier(j.identifier(newSpecifier))],
				j.stringLiteral(newName),
			),
		);
	});

	requireDeclaration.forEach((path) => {
		const newExpression = j.assignmentExpression(
			'=',
			j.identifier(newSpecifier),
			j.callExpression(j.identifier('require'), [j.literal(newName)]),
		);
		j(path).replaceWith(newExpression);
	});

	return { identifier };
}

/**
 * @param {string} method - e.g. `array.prototype.flatMap`
 * @param {string} identifierName - e.g. `flatMap`
 * @param {import("jscodeshift").Collection} root - package name to remove import/require calls for
 * @param {import("jscodeshift").JSCodeshift} j - jscodeshift instance
 * @returns
 */
export function transformArrayMethod(method, identifierName, root, j) {
	const { identifier } = removeImport(method, root, j);

	let dirtyFlag = false;
	root
		.find(j.CallExpression, {
			callee: {
				type: 'Identifier',
				name: identifier,
			},
		})
		.forEach((path) => {
			const [arrayArg, ...otherArgs] = path.node.arguments;
			if (j.Identifier.check(arrayArg) || j.ArrayExpression.check(arrayArg)) {
				path.replace(
					j.callExpression(
						j.memberExpression(arrayArg, j.identifier(identifierName)),
						otherArgs,
					),
				);
				dirtyFlag = true;
			}
		});

	return dirtyFlag;
}
