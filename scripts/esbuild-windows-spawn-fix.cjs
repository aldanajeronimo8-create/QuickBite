/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');

if (process.platform === 'win32') {
  const originalSpawn = childProcess.spawn;
  const originalExec = childProcess.exec;

  function isEsbuildBinary(command) {
    return typeof command === 'string' && command.toLowerCase().includes('esbuild');
  }

  childProcess.spawn = function spawnEsbuildThroughNode(command, args = [], options = {}) {
    if (isEsbuildBinary(command)) {
      const esbuildCli = require.resolve('esbuild/bin/esbuild');
      return originalSpawn.call(this, process.execPath, [esbuildCli, ...args], options);
    }

    return originalSpawn.call(this, command, args, options);
  };

  childProcess.exec = function skipWindowsDriveProbe(command, ...args) {
    if (command === 'net use') {
      const callback = args.find((argument) => typeof argument === 'function');
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => true;
      child.pid = 0;

      process.nextTick(() => {
        callback?.(null, '', '');
        child.emit('exit', 0);
        child.emit('close', 0);
      });

      return child;
    }

    return originalExec.call(this, command, ...args);
  };
}
