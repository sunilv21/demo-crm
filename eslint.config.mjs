import next from 'eslint-config-next';

/** Flat ESLint config (Next.js 16). Run with `npm run lint`. */
export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'functions/lib/**',
      'functions/node_modules/**',
      'desktop/**',
      'next-env.d.ts',
    ],
  },
  ...next,
  {
    // Next 16 ships React-Compiler-adjacent hooks rules that flag many valid
    // patterns (shadcn hooks, Firebase memo helpers). Keep them as warnings so
    // `npm run lint` surfaces them without failing on non-bugs.
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/use-memo': 'warn',
      'react/no-unescaped-entities': 'warn',
      'import/no-anonymous-default-export': 'warn',
    },
  },
];
