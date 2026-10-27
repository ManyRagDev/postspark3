// Offline validation only. Test doubles may replace these functions explicitly.
// Do not load this preload in the application or an executor.
const deny = () => { throw new Error('POSTSPARK_OFFLINE_TEST_NETWORK_BLOCKED'); };
for (const name of ['http', 'https']) {
  const module = require(name);
  module.request = deny;
  module.get = deny;
}
require('net').connect = deny;
require('net').createConnection = deny;
require('tls').connect = deny;
globalThis.fetch = async () => deny();
