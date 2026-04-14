import tseslint from 'typescript-eslint';
import globals from 'globals';
import configPrettier from 'eslint-config-prettier';
import unicorn from 'eslint-plugin-unicorn';
import oxlint from 'eslint-plugin-oxlint';

export default tseslint.config(
    {
        ignores: ['**/dist/**', '**/docs/**', '**/node_modules/**']
    },
    ...tseslint.configs.recommended,
    /*
     * Disable ESLint rules that overlap with oxlint to avoid duplication.
     * oxlint runs as a separate fast linter; these rules are delegated to it.
     */
    oxlint.configs['flat/recommended'],
    {
        files: ['**/*.ts'],
        plugins: {
            unicorn
        },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node
            },
            parserOptions: {
                projectService: {
                    /*
                     * Allow test files, vitest configs, and eslint config to
                     * use a default TypeScript project (they are intentionally
                     * excluded from tsconfig.json to avoid polluting the build).
                     *
                     * The count limit is raised to accommodate all current test
                     * files plus headroom for future additions.
                     */
                    allowDefaultProject: [
                        'tests/unit/*/*.test.ts',
                        'tests/unit/*/*/*.test.ts',
                        'tests/integration/*.test.ts',
                        'tests/evals/*.test.ts',
                        'tests/evals/*.eval.ts',
                        'vitest.config.ts',
                        'vitest.eval.config.ts'
                    ],

                    maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50
                },
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            'no-console': 'warn',
            'no-debugger': 'warn',
            'no-nested-ternary': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',

            /*
             * ── Plus-operands ────────────────────────────────────────────
             * Allow mixing numbers and strings in `+` expressions, which is
             * common for template-like string building without template literals.
             */
            '@typescript-eslint/restrict-plus-operands': [
                'error',
                {
                    allowNumberAndString: true
                }
            ],

            /*
             * ── Unicorn rules ────────────────────────────────────────────
             * A curated subset matching the boilerplate + vue-toolkit config.
             */
            'unicorn/better-regex': 'warn',
            'unicorn/consistent-destructuring': 'warn',
            'unicorn/catch-error-name': ['error', { name: 'error' }],
            'unicorn/prefer-top-level-await': 'off',
            'unicorn/no-nested-ternary': 'off',

            /*
             * Filename convention: kebab-case.
             * Covers both `tool-builder.ts` and dot-separated names like
             * `fs.read.ts` (each dot-separated segment is valid kebab-case).
             */
            'unicorn/filename-case': [
                'error',
                {
                    case: 'kebabCase',
                    ignore: [
                        // dot-separated tool filenames, e.g. fs.read.ts, csv.read.ts
                        /^[\da-z]+(?:\.[\da-z]+)*(?:-[\da-z]+)*\.ts$/
                    ]
                }
            ],

            /*
             * Prevent common abbreviations that reduce readability.
             * The replacements list matches boilerplate + vue-toolkit while
             * explicitly allowing the short forms that Manna uses legitimately.
             */
            'unicorn/prevent-abbreviations': [
                'warn',
                {
                    replacements: {
                        opts: { options: true }
                    },
                    allowList: {
                        i: true,
                        e: true,
                        len: true,
                        prop: true,
                        props: true,
                        prev: true,
                        ref: true,
                        req: true,
                        res: true,
                        dir: true,
                        env: true,
                        args: true,
                        Args: true
                    }
                }
            ],

            /*
             * ── Naming conventions ──────────────────────────────────────
             * Enforces consistent identifier casing across the codebase.
             * Severity raised to "error" to match boilerplate + vue-toolkit.
             */
            '@typescript-eslint/naming-convention': [
                'error',

                // Default: camelCase or PascalCase for any identifier not covered below
                {
                    selector: 'default',
                    format: ['camelCase', 'PascalCase'],
                    leadingUnderscore: 'allow',
                    trailingUnderscore: 'allow'
                },

                // Variables: camelCase or UPPER_CASE (module-level constants)
                {
                    selector: 'variable',
                    format: ['camelCase', 'UPPER_CASE'],
                    leadingUnderscore: 'allow',
                    trailingUnderscore: 'allow'
                },

                // Functions: camelCase
                {
                    selector: 'function',
                    format: ['camelCase']
                },

                // Parameters: camelCase (leading underscore for unused params)
                {
                    selector: 'parameter',
                    format: ['camelCase'],
                    leadingUnderscore: 'allow'
                },

                // All type-like identifiers (type aliases, classes): PascalCase
                {
                    selector: 'typeLike',
                    format: ['PascalCase']
                },

                // Interfaces: PascalCase with I prefix (e.g. ITool, IProcessor)
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                    prefix: ['I']
                },

                // Enums: PascalCase with E prefix (e.g. EProfile, ELogLevel)
                {
                    selector: 'enum',
                    format: ['PascalCase'],
                    prefix: ['E']
                },

                // Enum members: PascalCase or UPPER_CASE
                {
                    selector: 'enumMember',
                    format: ['PascalCase', 'UPPER_CASE']
                },

                // Import names: allow any format (third-party modules)
                {
                    selector: 'import',
                    format: null
                },

                // Object literal properties: no enforcement (external APIs, configs)
                {
                    selector: 'objectLiteralProperty',
                    format: null
                },

                // Class properties and methods: camelCase (private may use underscore)
                {
                    selector: 'classProperty',
                    format: ['camelCase', 'UPPER_CASE'],
                    leadingUnderscore: 'allow'
                },
                {
                    selector: 'classMethod',
                    format: ['camelCase'],
                    leadingUnderscore: 'allow'
                },

                // Type properties: camelCase (allow flexibility for schema shapes)
                {
                    selector: 'typeProperty',
                    format: ['camelCase'],
                    leadingUnderscore: 'allow'
                },

                // Member-like fallback: permissive to cover mixed codebases
                {
                    selector: 'memberLike',
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'],
                    leadingUnderscore: 'allow'
                }
            ]
        }
    },
    configPrettier
);
