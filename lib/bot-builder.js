'use strict';

const ApiBuilder = require('claudia-api-builder');
const telegramSetup = require('./telegram/setup');

let logError = function (err) {
  console.error(err);
};

module.exports = function botBuilder(messageHandler, optionalLogError) {
  logError = optionalLogError || logError;

  const api = new ApiBuilder(),
    messageHandlerPromise = function (message, originalApiBuilderRequest) {
      return Promise.resolve(message).then(message => messageHandler(message, originalApiBuilderRequest));
    };

  api.get('/', () => 'Ok');

  telegramSetup(api, messageHandlerPromise, logError);

  return api;
};
