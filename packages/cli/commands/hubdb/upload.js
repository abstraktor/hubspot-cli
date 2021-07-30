const {
    loadConfig,
    validateConfig,
    checkAndWarnGitInclusion,
  } = require('@hubspot/cli-lib');
  const { logger } = require('@hubspot/cli-lib/logger');
  const { logErrorInstance } = require('@hubspot/cli-lib/errorHandlers');
  const { updateHubDbTable } = require('@hubspot/cli-lib/hubdb');
  
  const { validateAccount } = require('../../lib/validation');
  const { trackCommandUsage } = require('../../lib/usageTracking');
  
  const {
    addConfigOptions,
    addAccountOptions,
    addUseEnvironmentOptions,
    setLogLevel,
    getAccountId,
  } = require('../../lib/commonOpts');
  const { logDebugInfo } = require('../../lib/debugInfo');
  
  exports.command = 'upload <tableId> <src>';
  exports.describe = 'Upload a HubDB table';
  
  exports.handler = async options => {
    const { config: configPath, tableId, src } = options;
  
    setLogLevel(options);
    logDebugInfo(options);
    loadConfig(configPath, options);
    checkAndWarnGitInclusion();
  
    if (!(validateConfig() && (await validateAccount(options)))) {
      process.exit(1);
    }
    const accountId = getAccountId(options);
  
    trackCommandUsage('hubdb-upload', {}, accountId);
  
    try {
        const {
          updateCount,
          createCount,
          deleteCount,
          errors,
          ...rest
        } = await updateHubDbTable(accountId, tableId, src);

        logger.log(
          `Uploaded HubDB table ${tableId} from ${src}, updating ${updateCount} rows, creating ${createCount} rows, deleting ${deleteCount} rows`
        );
        if (errors && errors.length) {
          logger.error('Something went wrong: ', errors, rest);
          process.exit(1);
        }
    } catch (e) {
      logErrorInstance(e);
    }
  };
  
  exports.builder = yargs => {
    addAccountOptions(yargs, true);
    addConfigOptions(yargs, true);
    addUseEnvironmentOptions(yargs, true);
  
    yargs.positional('tableId', {
      describe: 'HubDB Table ID',
      type: 'string',
    });
  
    yargs.positional('src', {
      describe: 'Local path to uploaded file',
      type: 'string',
    });
  };
  