const expect = require('chai').expect;
const assign = require('lodash').assign;
const auth0Mock = require('../auth0');
const LogsApiStream = require('../../src/stream');
const Auth0Storage = require('../../src/storage');

const data = { checkpointId: null };

const auth0Options = {
  domain: 'foo.auth0.local',
  clientId: '1',
  clientSecret: 'secret'
};

const fakeStorage = {
  read: () => new Promise(resolve => resolve(data)),
  write: obj =>
    new Promise((resolve) => {
      data.logs = obj.logs;
      data.checkpointId = obj.checkpointId;
      data.auth0Token = obj.auth0Token;
      resolve();
    })
};

const storage = new Auth0Storage(fakeStorage);

describe('Auth0 Log Stream', () => {
  describe('#init', () => {
    it('should throw error if auth0Options is undefined', (done) => {
      const init = () => {
        const logger = new LogsApiStream();
      };

      expect(init).to.throw(Error, /auth0Options is required/);
      done();
    });

    it('should init logger', (done) => {
      const logger = new LogsApiStream(auth0Options, storage);

      expect(logger).to.be.an.instanceof(LogsApiStream);
      done();
    });
  });

  describe('#stream', () => {
    before((done) => {
      auth0Mock.token();

      done();
    });

    it('should read logs', (done) => {
      auth0Mock.logs();

      const logger = new LogsApiStream(auth0Options, storage);

      logger.on('data', (logs) => {
        expect(logs).to.be.an('array');
        expect(logs.length).to.equal(100);
        expect(logger.status).to.be.an('object');
        done();
      });

      logger.next();
    });

    it('should done reading logs', (done) => {
      auth0Mock.logs();

      const logger = new LogsApiStream(auth0Options, storage);

      logger.on('data', (logs) => {
        logger.done();
      });

      logger.on('end', () => {
        logger.batchSaved();
        expect(logger.status).to.be.an('object');
        expect(logger.status.logsProcessed).to.equal(100);
        expect(logger.lastCheckpoint).to.equal('100');
        done();
      });

      logger.next();
    });

    it('should done reading logs, if no more logs can be fount', (done) => {
      auth0Mock.logs();
      auth0Mock.logs({ empty: true });

      const logger = new LogsApiStream(auth0Options, storage);

      logger.on('data', () => logger.next());
      logger.on('end', () => {
        logger.batchSaved();
        expect(logger.status).to.be.an('object');
        expect(logger.status.logsProcessed).to.equal(100);
        expect(logger.lastCheckpoint).to.equal('100');
        done();
      });

      logger.next();
    });

    it('should done reading logs, if ratelimit reached', (done) => {
      auth0Mock.logs({ limit: 0 });

      const logger = new LogsApiStream(assign({ types: [ 'test' ] }, auth0Options), storage);

      logger.on('data', () => logger.next());
      logger.on('end', () => {
        logger.batchSaved();
        expect(logger.status).to.be.an('object');
        expect(logger.status.logsProcessed).to.equal(100);
        expect(logger.status.warning).to.equal('Auth0 Management API rate limit reached.');
        expect(logger.lastCheckpoint).to.equal('100');
        done();
      });

      logger.next();
    });

    it('should emit error', (done) => {
      auth0Mock.logs({ error: 'bad request' });

      const logger = new LogsApiStream(assign({ types: [ 'test' ] }, auth0Options), storage);

      logger.on('data', () => logger.next());
      logger.on('error', (error) => {
        expect(error.response.text).to.equal('bad request');
        done();
      });

      logger.next();
    });
  });
});