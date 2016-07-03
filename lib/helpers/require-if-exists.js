'use strict';

const path = require('path');

module.exports = function requireIfExists(moduleName) {
  try {
    return require(path.join('.', moduleName));
  } catch (err) {
    return false;
  }
};
