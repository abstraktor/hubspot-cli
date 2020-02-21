const {
  HUBSPOT_API_KEY,
  HUBSPOT_CLIENT_ID,
  HUBSPOT_CLIENT_SECRET,
  HUBSPOT_PERSONAL_ACCESS_KEY,
  HUBSPOT_PORTAL_ID,
} = require('../constants/environmentVariables');
// const { updateDefaultPortal } = require('./portal');
// const { setConfig } = require('./file');
const { getUpdatedApiKeyPortalConfig } = require('./apiKey');
const { getUpdatedOauthPortalConfig } = require('./oauth2');
const {
  getUpdatedPersonalAccessKeyPortalConfig,
} = require('./personalAccessKey');

const ENVIRONMENT_VARIABLES_PORTAL_NAME = 'EnvironmentVariablesPortal';

const getEnvironmentVariableConfig = () => {
  const {
    [HUBSPOT_API_KEY]: apiKey,
    [HUBSPOT_CLIENT_ID]: clientId,
    [HUBSPOT_CLIENT_SECRET]: clientSecret,
    [HUBSPOT_PERSONAL_ACCESS_KEY]: personalAccessKey,
    [HUBSPOT_PORTAL_ID]: portalId,
  } = process.env;

  if (personalAccessKey) {
    console.log('Set up personalAccessKey');
    const personalAccessKeyPortalConfig = getUpdatedPersonalAccessKeyPortalConfig(
      {},
      {
        name: ENVIRONMENT_VARIABLES_PORTAL_NAME,
        apiKey,
      }
    );
    return {
      defaultPortal: ENVIRONMENT_VARIABLES_PORTAL_NAME,
      portals: [personalAccessKeyPortalConfig],
    };
  } else if (clientId && clientSecret) {
    console.log('Set up oauth2');
    const oauthPortalConfig = getUpdatedOauthPortalConfig(
      {},
      {
        name: ENVIRONMENT_VARIABLES_PORTAL_NAME,
        apiKey,
      }
    );
    return {
      defaultPortal: ENVIRONMENT_VARIABLES_PORTAL_NAME,
      portals: [oauthPortalConfig],
    };
  } else if (portalId && apiKey) {
    console.log('Set up apiKey');
    const apiKeyPortalConfig = getUpdatedApiKeyPortalConfig(
      {},
      {
        name: ENVIRONMENT_VARIABLES_PORTAL_NAME,
        portalId,
        apiKey,
      }
    );
    return {
      defaultPortal: ENVIRONMENT_VARIABLES_PORTAL_NAME,
      portals: [apiKeyPortalConfig],
    };
  } else {
    console.log('No env found');
    return;
  }
};

module.exports = {
  getEnvironmentVariableConfig,
};
