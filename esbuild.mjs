import * as esbuild from 'esbuild';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

/**
 * Custom plugin to inline .hbs template files as strings at build time.
 */
const hbsPlugin = {
    name: 'hbs-loader',
    setup(build) {
        build.onLoad({ filter: /\.hbs$/ }, (args) => {
            const contents = readFileSync(args.path, 'utf-8');
            return {
                contents: `export default ${JSON.stringify(contents)};`,
                loader: 'js',
            };
        });
    },
};

/**
 * Plugin to resolve TypeScript path aliases from tsconfig.json.
 * Maps @G/*, @U/*, @S/*, @E/*, @I/* to src/graph/*, src/utils/*, etc.
 */
const tsconfigPathsPlugin = {
    name: 'tsconfig-paths',
    setup(build) {
        const aliases = {
            '@/': join(__dirname, 'src/'),
            '@G/': join(__dirname, 'src/graph/'),
            '@U/': join(__dirname, 'src/utils/'),
            '@S/': join(__dirname, 'src/services/'),
            '@E/': join(__dirname, 'src/exceptions/'),
            '@I/': join(__dirname, 'src/interfaces/'),
        };

        build.onResolve({ filter: /^@[A-Z]?\// }, (args) => {
            for (const [prefix, dir] of Object.entries(aliases)) {
                if (args.path.startsWith(prefix)) {
                    const rest = args.path.slice(prefix.length);
                    const basePath = join(dir, rest);

                    // Try resolving with extensions and index files
                    const candidates = [
                        basePath + '.ts',
                        basePath + '.js',
                        join(basePath, 'index.ts'),
                        join(basePath, 'index.js'),
                        basePath, // as-is (for .hbs etc.)
                    ];

                    for (const candidate of candidates) {
                        if (existsSync(candidate)) {
                            return { path: candidate };
                        }
                    }

                    // Fallback: let esbuild try
                    return { path: basePath + '.ts' };
                }
            }
            return null;
        });
    },
};

/** @type {esbuild.BuildOptions} */
const buildOptions = {
    entryPoints: [join(__dirname, 'src/extension.ts')],
    bundle: true,
    outfile: join(__dirname, 'dist/extension.js'),
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    external: [
        'vscode',           // Provided by VS Code runtime
        'better-sqlite3',   // Native C++ addon - cannot be bundled
        'node-gyp',         // Used by @npmcli/run-script via require.resolve at runtime
    ],
    plugins: [tsconfigPathsPlugin, hbsPlugin],
    logLevel: 'info',
    minify: false,
};

if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
} else {
    await esbuild.build(buildOptions);
    console.log('[esbuild] Build complete');
}
