// The native esbuild executable cannot traverse Windows sandbox ancestors.
// Use the equivalent official WASM implementation on Windows only.
const Module = require('node:module');
if (process.platform === 'win32') {
  const load = Module._load;
  Module._load = function (name, ...args) {
    return name === 'esbuild' ? load.call(this, 'esbuild-wasm', ...args) : load.call(this, name, ...args);
  };
}
