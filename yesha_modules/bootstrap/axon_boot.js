// Axionet Symbolic Bootstrap Loader
const identity = require('../config/identity.json');
console.log(`Axionet Boot: ${identity.codename} v${identity.version}`);
require('../core/autonomy_loop')();