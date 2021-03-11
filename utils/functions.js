const Promise = require('bluebird');

const retry = async (fun, tries = 5) => {
  try {
    return await fun();
  } catch (err) {
    if (tries == 0) throw err;
    await Promise.delay(1000);
    return retry(fun, tries - 1);
  }
};

exports.retry = retry;
