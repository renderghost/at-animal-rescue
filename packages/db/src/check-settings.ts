import { checkProductionSettings } from './production-settings';

/**
 * Checks the production settings before migrations run (`homeward check` in the indexer
 * image). Exits non-zero on a problem, which stops the deploy.
 */
const { problems, warnings } = checkProductionSettings(process.env);
for (const warning of warnings) console.warn(`Warning: ${warning}`);
if (problems.length > 0) {
  console.error('Fix these in /opt/homeward/.env, then start again (docs/DEPLOY.md):');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Settings checked.');
}
