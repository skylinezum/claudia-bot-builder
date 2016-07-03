'use strict';

const crypto = require('crypto');
const prompt = require('souffleur');
const rp = require('minimal-request-promise');
const fbReply = require('./reply');
const fbParse = require('./parse');
const color = require('../console-colors');
const requireIfExists = require('./helpers/require-if-exists');
const isUrl = require('../is-url');
const breakText = require('../breaktext');

let pageAccessToken;

module.exports = function fbSetup(api, bot, logError, optionalParser, optionalResponder) {
  let parser = optionalParser || fbParse;
  let responder = optionalResponder || fbReply;

  api.get('/facebook', request => {
    if (request.queryString['hub.verify_token'] === request.env.facebookVerifyToken)
      return request.queryString['hub.challenge'];

    logError(`Facebook can't verify the token. It expected '${request.env.facebookVerifyToken}', but got '${request.queryString['hub.verify_token']}'. Make sure you are using the same token you set in 'facebookVerifyToken' stage env variable.`);
    return 'Error';
  }, {success: {contentType: 'text/plain'}});

  api.post('/facebook', request => {
    let arr = [].concat.apply([], request.body.entry.map(entry => entry.messaging));
    let fbHandle = parsedMessage => {
      if (parsedMessage) {
        var recipient = parsedMessage.sender;

        return Promise.resolve(parsedMessage).then(parsedMessage => bot(parsedMessage, request))
          .then(botResponse => responder(recipient, botResponse, request.env.facebookAccessToken))
          .catch(logError);
      }
    };

    return Promise.all(arr.map(message => parser(message)).map(fbHandle))
      .then(() => 'ok');
  });

  api.addPostDeployStep('facebook', (options, lambdaDetails, utils) => {
    return utils.Promise.resolve().then(() => {
      if (options['configure-fb-bot']) {
        let token;

        utils.Promise.promisifyAll(crypto);

        return utils.apiGatewayPromise.getStagePromise({
          restApiId: lambdaDetails.apiId,
          stageName: lambdaDetails.alias
        })
          .then(data => {
            if (data.variables && data.variables.facebookVerifyToken)
              return data.variables.facebookVerifyToken;

            return crypto.randomBytesAsync(8);
          })
          .then(rawToken => {
            token = rawToken.toString('base64').replace(/[^A-Za-z0-9]/g, '');
            return utils.apiGatewayPromise.createDeploymentPromise({
              restApiId: lambdaDetails.apiId,
              stageName: lambdaDetails.alias,
              variables: {
                facebookVerifyToken: token
              }
            });
          })
          .then(() => {
            console.log(`\n\n${color.green}Facebook Messenger setup${color.reset}\n`);
            console.log(`\nFollowing info is required for the setup, for more info check the documentation.\n`);
            console.log(`\nYour webhook URL is: ${color.cyan}${lambdaDetails.apiUrl}/facebook${color.reset}\n`);
            console.log(`Your verify token is: ${color.cyan}${token}${color.reset}\n`);

            return prompt(['Facebook access token']);
          })
          .then(results => {
            console.log('\n');
            pageAccessToken = results['Facebook access token'];
            const deployment = {
              restApiId: lambdaDetails.apiId,
              stageName: lambdaDetails.alias,
              variables: {
                facebookAccessToken: pageAccessToken
              }
            };

            return utils.apiGatewayPromise.createDeploymentPromise(deployment);
          })
          .then(() => rp({
            method: 'POST',
            hostname: 'graph.facebook.com',
            path: `/v2.6/me/subscribed_apps?access_token=${pageAccessToken}`,
            port: 443
          }));
      }
    })
      .then(() => {
        if (options['fb-config']) {
          const fbConfig = requireIfExists(options['fb-config']);

          if (typeof fbConfig === 'function')
            return fbConfig();

          if (typeof fbConfig === 'object')
            return proccessFbConfig(fbConfig);
        }

        return false;
      })
      .then(() => `${lambdaDetails.apiUrl}/facebook`);
  });
};

function sendThreadSettingsRequest(body, pageAccessToken) {
  return rp({
    method: 'POST',
    hostname: 'graph.facebook.com',
    path: `/v2.6/me/thread_settings?access_token=${pageAccessToken}`,
    port: 443,
    headers: {
      'Content-Type': 'application/json'
    },
    body: body
  });
}

function transformItem(item) {
  const menuItem = {
    title: item.title
  };

  if (isUrl(item.value)) {
    menuItem.type = 'web_url';
    menuItem.url = item.value;
  } else {
    menuItem.type = 'postback';
    menuItem.payload = item.value;
  }

  return menuItem;
}

function proccessFbConfig(config) {
  /* Proccess the object:
    {
      greetingMessage: 'string',
      getStartedButton: 'string or boolean',
      persistentMenu: [{
        title: 'buttonTitle',
        value: 'postback || url'
      }]
    }
  */
  if (config.greetingMessage && typeof config.greetingMessage === 'string')
    return sendThreadSettingsRequest({
      setting_type: 'greeting',
      greeting: {
        text: breakText(config.greetingMessage, 160)[0]
      }
    }, pageAccessToken)
      .then((response) => {
        console.log(response);
        console.log(`\nGreeting message is set.`);
        delete config.greetingMessage;
        proccessFbConfig(config);
      })
      .catch(console.error);

  if (config.getStartedButton)
    return sendThreadSettingsRequest({
      setting_type: 'call_to_actions',
      thread_state: 'new_thread',
      call_to_actions: [{
        payload: (typeof config.getStartedButton === 'string') ? config.getStartedButton : 'WELCOME'
      }]
    }, pageAccessToken)
      .then((response) => {
        console.log(response);
        console.log(`\nGet started button is activated.`);
        delete config.getStartedButton;
        proccessFbConfig(config);
      })
      .catch(console.error);

  if (config.persistentMenu && Array.isArray(config.persistentMenu)) {
    return sendThreadSettingsRequest({
      setting_type: 'call_to_actions',
      thread_state: 'existing_thread',
      call_to_actions: config.persistentMenu.map(item => transformItem(item))
    }, pageAccessToken)
      .then((response) => {
        console.log(response);
        console.log(`\nPersistent menu is activated.`);
        delete config.persistentMenu;
        proccessFbConfig(config);
      })
      .catch(console.error);
  }

  return Promise.resolve();
}
