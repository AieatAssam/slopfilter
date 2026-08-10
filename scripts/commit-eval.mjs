import { execFile as execFileCallback, spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const CHECK_TIMEOUT_MS = 300_000;
const usage = `usage: node scripts/commit-eval.mjs --baseline <commit> --shipped <commit> --command <check>
   or: node scripts/commit-eval.mjs --scenario <path>`;

const argumentValue = (args, name) => {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
};

const requireString = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${label} must be non-empty`);
  return value;
};

const loadConfig = async (args) => {
  const scenarioPath = argumentValue(args, '--scenario');
  if (scenarioPath) {
    const path = resolve(scenarioPath);
    const scenario = JSON.parse(await readFile(path, 'utf8'));
    return {
      name: typeof scenario.name === 'string' ? scenario.name : relative(process.cwd(), path),
      baseline: requireString(scenario.baseline, 'scenario.baseline'),
      shipped: requireString(scenario.shipped, 'scenario.shipped'),
      command: requireString(scenario.command, 'scenario.command'),
    };
  }

  return {
    name: 'commit evaluation',
    baseline: requireString(argumentValue(args, '--baseline'), '--baseline'),
    shipped: requireString(argumentValue(args, '--shipped'), '--shipped'),
    command: requireString(argumentValue(args, '--command'), '--command'),
  };
};

const git = async (repoRoot, args) => {
  const { stdout } = await execFile('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return stdout.trim();
};

const archiveCommit = async (repoRoot, commit, destination, archivePath) => {
  await execFile('git', ['archive', '--format=tar', `--output=${archivePath}`, commit], {
    cwd: repoRoot,
  });
  await execFile('tar', ['-xf', archivePath, '-C', destination], { cwd: repoRoot });
  try {
    await access(join(destination, '.git'));
    throw new Error(`archive for ${commit} unexpectedly contains .git`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
};

const runCheck = (command, cwd, commit, repoRoot, tempRoot) =>
  new Promise((resolveResult) => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      env: {
        ...process.env,
        SLOPFILTER_EVAL_COMMIT: commit,
        SLOPFILTER_EVAL_ROOT: cwd,
      },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, CHECK_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      const normalize = (value) =>
        value
          .replaceAll('\r\n', '\n')
          .replaceAll(tempRoot, '<temp>')
          .replaceAll(repoRoot, '<repo>')
          .trimEnd();
      resolveResult({
        exitCode,
        signal,
        timedOut,
        stdout: normalize(stdout),
        stderr: normalize(stderr),
      });
    });
  });

const sameOutcome = (left, right) =>
  left.exitCode === right.exitCode &&
  left.signal === right.signal &&
  left.timedOut === right.timedOut;

try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log(usage);
    process.exitCode = args.length === 0 ? 2 : 0;
  } else {
    const config = await loadConfig(args);
    const repoRoot = await git(process.cwd(), ['rev-parse', '--show-toplevel']);
    const baselineCommit = await git(repoRoot, [
      'rev-parse',
      '--verify',
      `${config.baseline}^{commit}`,
    ]);
    const shippedCommit = await git(repoRoot, [
      'rev-parse',
      '--verify',
      `${config.shipped}^{commit}`,
    ]);
    const tempRoot = await mkdtemp(join(tmpdir(), 'slopfilter-commit-eval-'));
    const baselineRoot = join(tempRoot, 'baseline');
    const shippedRoot = join(tempRoot, 'shipped');
    const baselineArchive = join(tempRoot, 'baseline.tar');
    const shippedArchive = join(tempRoot, 'shipped.tar');

    try {
      await Promise.all([mkdir(baselineRoot), mkdir(shippedRoot)]);
      await archiveCommit(repoRoot, baselineCommit, baselineRoot, baselineArchive);
      await archiveCommit(repoRoot, shippedCommit, shippedRoot, shippedArchive);
      const baseline = await runCheck(
        config.command,
        baselineRoot,
        baselineCommit,
        repoRoot,
        tempRoot,
      );
      const shipped = await runCheck(
        config.command,
        shippedRoot,
        shippedCommit,
        repoRoot,
        tempRoot,
      );
      const report = {
        name: config.name,
        command: config.command,
        baseline: { commit: baselineCommit, ...baseline },
        shipped: { commit: shippedCommit, ...shipped },
        sameOutcome: sameOutcome(baseline, shipped),
        shippedPassed: shipped.exitCode === 0 && shipped.signal === null && !shipped.timedOut,
      };
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.shippedPassed ? 0 : 1;
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.error(`${usage}\nerror: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
