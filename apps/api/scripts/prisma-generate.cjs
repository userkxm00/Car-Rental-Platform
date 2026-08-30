// Offline Prisma Client generation for the API workspace (01-C01).
//
// The standard `prisma generate` requires native engine downloads from
// binaries.prisma.sh, which is not reachable in every development
// environment. The client generator itself is pure JavaScript and ships
// inside the @prisma/client npm package, so this script drives it directly
// through Prisma's own generator JSON-RPC protocol:
//
//   1. parse the schema + build the DMMF with the bundled WASM schema parser;
//   2. spawn the bundled generator entry (its argv[1] guard registers the
//      JSON-RPC handler) as a child process;
//   3. invoke getManifest + generate with CLI-equivalent options.
//
// Output goes to apps/api/node_modules/.prisma/client (per the `output`
// configured in prisma/schema.prisma) so @prisma/client's
// `require('.prisma/client')` resolves it. Run `npm run db:generate`.
//
// On networked machines `npx prisma generate` remains the canonical command;
// both produce the same client from the same schema.

'use strict';

const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const internals = require('@prisma/internals');
const { getConfig, getDMMF, getGenerators } = internals;

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const schemaPath = path.join(REPO_ROOT, 'prisma', 'schema.prisma');

async function main() {
  const datamodel = fs.readFileSync(schemaPath, 'utf8');
  const config = await getConfig({ datamodel, schemaPath, ignoreEnvVarErrors: true });

  const previewFeatures = config.generators[0]?.previewFeatures ?? [];
  const dmmf = await getDMMF({ datamodel, previewFeatures });

  // The CLI resolves the output to an absolute path before invoking the
  // generator; replicate that so the generated client lands in a stable spot.
  const generatorConfig = config.generators[0];
  generatorConfig.output = {
    value: path.resolve(path.dirname(schemaPath), generatorConfig.output.value),
    fromEnvVar: null,
  };
  generatorConfig.isCustomOutput = true;

  const require = createRequire(__filename);
  const generatorEntry = require.resolve('@prisma/client/generator-build');

  const generators = await getGenerators({
    schemaPath,
    skipDownload: true,
    noEngine: true,
    printDownloadProgress: false,
    version: require('@prisma/client/package.json').version,
    ignoreEnvVarErrors: true,
    providerAliases: {
      'prisma-client-js': { generatorPath: generatorEntry, isNode: true },
    },
  });

  for (const generator of generators) {
    await generator.init();
    generator.setOptions({
      datamodel,
      schemaPath,
      generator: generatorConfig,
      dmmf,
      datasources: config.datasources,
      binaryPaths: {},
      dataProxy: false,
      envPaths: {},
      copyRuntime: false,
      copyRuntimeSourceMaps: false,
      runtimeSourcePath: undefined,
      clientVersion: require('@prisma/client/package.json').version,
      engineVersion: require('@prisma/engines-version/package.json').version,
      activeProvider: 'postgresql',
      postinstall: false,
      version: 'kavriqo-offline',
    });
    await generator.generate();
    await generator.stop();
    console.log(`Prisma Client generated to ${generatorConfig.output.value}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
