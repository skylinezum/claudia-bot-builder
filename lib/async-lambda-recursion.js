const aws = require('aws-sdk');
module.exports = function asyncLambdaRecursion (request) {
  var Lambda = new aws.Lambda();
  var params = {
    FunctionName: request.lambdaContext.functionName,
    InvocationType: 'Event',
    LogType: 'None',
    Payload: JSON.stringify(request),
    Qualifier: request.context.stage
  };
  return new Promise( (resolve, reject) => {
    Lambda.invoke(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};
