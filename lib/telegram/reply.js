'use strict';

const rp = require('minimal-request-promise');

module.exports = function tlReply(messageObject, message, tlAccessToken) {

  var method, body;
  if (typeof message === 'string') {
    method = 'sendMessage';
    body = {
      chat_id: messageObject.sender,
      text: message,
    };
  } else {
    method = message.method;
    body = message.body;
  }


  const options = {
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };

  return rp.post(`https://api.telegram.org/bot${tlAccessToken}/${method}`, options);
};
