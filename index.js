const assert = require('assert');
const Client = require('rtpengine-client').Client ;
const debug = require('debug')('jambonz:rtpengines-utils');
let timer;
const noopLogger = {info: () => {}, error: () => {}};
const selectClient = (engines) => engines.filter((c) => c.active).sort((a, b) => (a.calls - b.calls)).shift();

function testEngines(logger, engines, opts) {
  return setInterval(() => {
    debug('starting rtpengine pings');
    engines.forEach(async(engine) => {
      try {
        const res = await engine.list();
        if ('ok' === res.result) {
          engine.calls = res.calls.length;
          engine.active = true;
          logger.debug({res}, `rtpengine:list ${engine.host}:${engine.port} has ${engine.calls} calls`);
          return;
        }
        logger.info({rtpengine: engine.host, response: res}, 'Failure response from rtpengine');
        engine.active = false;
      } catch (err) {
        logger.info({rtpengine: engine.host, err}, 'Failure response from rtpengine');
      }
      engine.active = false;
    });
  }, opts.pingInterval || 5000);
}

/**
 * function that returns an object containing a function --
 * that returned function (getRtpEngine) can be called repeatedly
 * to get a set of bound functions (offer, answer, del) that
 * are associated with the rtpengine having fewest calls
 *
 * {Array} arr - an array of host:port of rtpengines and their ng control ports
 * {object} [opts] - configuration options
 * {number} [opts.timeout] - length of time in secs to wait for rtpengine to respond to a command
 * {number} [opts.pingInterval] - length of time in secs to ping rtpengines with a 'list' command
 */
module.exports = function(arr, opts) {
  assert.ok(Array.isArray(arr) && arr.length, 'jambonz-rtpengine-utils: missing array of host:port rtpengines');
  opts = opts || {};
  const client = new Client({timeout: opts.timeout || 1500});

  const engines = arr
    .map((hp) => {
      const arr = /^(.*):(.*)$/.exec(hp.trim());
      if (!arr) throw new Error('rtpengine-utils: must provide an array of host:port rtpengines');
      const engine = {
        active: true,
        calls: 0,
        host: arr[1],
        port: parseInt(arr[2])
      };
      [
        'offer',
        'answer',
        'delete',
        'list',
        'startRecording',
        'stopRecording'
      ].forEach((method) => engine[method] = client[method].bind(client, engine.port, engine.host));
      return engine;
    });
  assert.ok(engines.length > 0, 'rtpengine-utils: must provide an array of host:port rtpengines');
  debug(`engines: ${JSON.stringify(engines)}`);

  function getRtpEngine(logger) {
    logger = logger || noopLogger;
    if (!timer) timer = testEngines(logger, engines, opts);
    debug(`selecting rtpengine from array of ${engines.length}`);
    const engine = selectClient(engines);
    if (engine) {
      debug({engine}, 'selected engine');
      return {
        offer: engine.offer,
        answer: engine.answer,
        del: engine.delete
      };
    }
  }

  return {
    client,
    getRtpEngine
  };
};
