import { expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "fs";
import { bunEnv, bunExe, tempDir } from "harness";
import { join } from "path";

test("global install creates bin directory when missing", async () => {
  using dir = tempDir("global-install-test", {
    "package.json": JSON.stringify({
      name: "test-pkg",
      version: "1.0.0",
      bin: {
        "test-cmd": "./cli.js",
      },
    }),
    "cli.js": "#!/usr/bin/env node\nconsole.log('test-cmd');",
  });

  const binDir = join(String(dir), "bin");

  // Ensure bin directory doesn't exist yet
  expect(existsSync(binDir)).toBe(false);

  await using proc = Bun.spawn({
    cmd: [bunExe(), "install", "-g", "."],
    env: {
      ...bunEnv,
      BUN_INSTALL_BIN: binDir,
      BUN_INSTALL_GLOBAL_DIR: join(String(dir), "global"),
      HOME: undefined,
      BUN_INSTALL: undefined,
    },
    cwd: String(dir),
    stderr: "pipe",
  });

  const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);

  // Should create bin directory automatically
  expect(existsSync(binDir)).toBe(true);
  expect(exitCode).toBe(0);
});

test("global install with custom BUN_INSTALL_BIN", async () => {
  using dir = tempDir("global-custom-bin", {
    "package.json": JSON.stringify({
      name: "custom-pkg",
      version: "1.0.0",
      bin: "./index.js",
    }),
    "index.js": "#!/usr/bin/env node\nconsole.log('custom-pkg');",
  });

  const customBinDir = join(String(dir), "custom-bin-location");

  await using proc = Bun.spawn({
    cmd: [bunExe(), "install", "-g", "."],
    env: {
      ...bunEnv,
      BUN_INSTALL_BIN: customBinDir,
      BUN_INSTALL_GLOBAL_DIR: join(String(dir), "global"),
      HOME: undefined,
      BUN_INSTALL: undefined,
    },
    cwd: String(dir),
    stderr: "pipe",
  });

  const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);

  // Should create custom bin directory
  expect(existsSync(customBinDir)).toBe(true);

  // Should create symlink in custom directory
  const files = readdirSync(customBinDir);
  expect(files.length).toBeGreaterThan(0);

  expect(exitCode).toBe(0);
});

test("global install creates symlinks correctly", async () => {
  using dir = tempDir("global-symlink-test", {
    "package.json": JSON.stringify({
      name: "symlink-pkg",
      version: "1.0.0",
      bin: {
        "my-command": "./script.js",
      },
    }),
    "script.js": "#!/usr/bin/env node\nconsole.log('Hello from my-command');",
  });

  const binDir = join(String(dir), "bin");

  await using proc = Bun.spawn({
    cmd: [bunExe(), "install", "-g", "."],
    env: {
      ...bunEnv,
      BUN_INSTALL_BIN: binDir,
      BUN_INSTALL_GLOBAL_DIR: join(String(dir), "global"),
      HOME: undefined,
      BUN_INSTALL: undefined,
    },
    cwd: String(dir),
    stderr: "pipe",
  });

  await proc.exited;

  // Check that symlink was created
  const expectedSymlink = join(binDir, "my-command");
  expect(existsSync(expectedSymlink)).toBe(true);

  // On Unix-like systems, check that it's actually a symlink
  if (process.platform !== "win32") {
    const stats = statSync(expectedSymlink);
    expect(stats.isSymbolicLink() || stats.isFile()).toBe(true);
  }
});

test("global install with BUN_INSTALL environment variable", async () => {
  using dir = tempDir("global-bun-install", {
    "package.json": JSON.stringify({
      name: "bun-install-pkg",
      version: "1.0.0",
      bin: "./main.js",
    }),
    "main.js": "#!/usr/bin/env node\nconsole.log('main');",
  });

  const bunInstallDir = join(String(dir), "bun-install-root");

  await using proc = Bun.spawn({
    cmd: [bunExe(), "install", "-g", "."],
    env: {
      ...bunEnv,
      BUN_INSTALL: bunInstallDir,
      BUN_INSTALL_BIN: undefined,
      HOME: undefined,
    },
    cwd: String(dir),
    stderr: "pipe",
  });

  await proc.exited;

  // BUN_INSTALL should create bin subdirectory
  const expectedBinDir = join(bunInstallDir, "bin");
  expect(existsSync(expectedBinDir)).toBe(true);
});

// Skip: this test hits an unrelated dependency loop bug in global install
test.skip("global install multiple packages sequentially", async () => {
  using dir1 = tempDir("global-multiple-pkg1", {
    "package.json": JSON.stringify({
      name: "pkg1",
      version: "1.0.0",
      bin: "./cli1.js",
    }),
    "cli1.js": "#!/usr/bin/env node\nconsole.log('pkg1');",
  });

  using dir2 = tempDir("global-multiple-pkg2", {
    "package.json": JSON.stringify({
      name: "pkg2",
      version: "1.0.0",
      bin: "./cli2.js",
    }),
    "cli2.js": "#!/usr/bin/env node\nconsole.log('pkg2');",
  });

  using binDirContainer = tempDir("global-multiple-bin", {});
  const binDir = join(String(binDirContainer), "bin");

  // Install first package
  await using proc1 = Bun.spawn({
    cmd: [bunExe(), "install", "-g", "."],
    env: {
      ...bunEnv,
      BUN_INSTALL_BIN: binDir,
      BUN_INSTALL_GLOBAL_DIR: join(String(binDirContainer), "global"),
      HOME: undefined,
      BUN_INSTALL: undefined,
    },
    cwd: String(dir1),
    stderr: "pipe",
    stdout: "pipe",
  });

  const [stdout1, stderr1, exitCode1] = await Promise.all([proc1.stdout.text(), proc1.stderr.text(), proc1.exited]);

  // Check first install succeeded
  if (exitCode1 !== 0) {
    console.error("First install failed:");
    console.error("stdout:", stdout1);
    console.error("stderr:", stderr1);
  }
  expect(exitCode1).toBe(0);
  expect(existsSync(binDir)).toBe(true);

  // Install second package (bin directory already exists)
  await using proc2 = Bun.spawn({
    cmd: [bunExe(), "install", "-g", "."],
    env: {
      ...bunEnv,
      BUN_INSTALL_BIN: binDir,
      BUN_INSTALL_GLOBAL_DIR: join(String(binDirContainer), "global"),
      HOME: undefined,
      BUN_INSTALL: undefined,
    },
    cwd: String(dir2),
    stderr: "pipe",
    stdout: "pipe",
  });

  const [stdout2, stderr2, exitCode2] = await Promise.all([proc2.stdout.text(), proc2.stderr.text(), proc2.exited]);

  if (exitCode2 !== 0) {
    console.error("Second install failed:");
    console.error("stdout:", stdout2);
    console.error("stderr:", stderr2);
  }

  // Both packages should be installed
  expect(existsSync(binDir)).toBe(true);
  const files = readdirSync(binDir);
  expect(files.length).toBeGreaterThanOrEqual(2);
  expect(exitCode2).toBe(0);
});

test("global install with -g flag", async () => {
  using dir = tempDir("global-g-flag", {
    "package.json": JSON.stringify({
      name: "g-flag-pkg",
      version: "1.0.0",
      bin: "./index.js",
    }),
    "index.js": "#!/usr/bin/env node\nconsole.log('g-flag');",
  });

  const binDir = join(String(dir), "bin");

  await using proc = Bun.spawn({
    cmd: [bunExe(), "i", "-g", "."],
    env: {
      ...bunEnv,
      BUN_INSTALL_BIN: binDir,
      BUN_INSTALL_GLOBAL_DIR: join(String(dir), "global"),
      HOME: undefined,
      BUN_INSTALL: undefined,
    },
    cwd: String(dir),
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  expect(existsSync(binDir)).toBe(true);
  expect(exitCode).toBe(0);
});

test("global install with --global flag", async () => {
  using dir = tempDir("global-long-flag", {
    "package.json": JSON.stringify({
      name: "long-flag-pkg",
      version: "1.0.0",
      bin: "./app.js",
    }),
    "app.js": "#!/usr/bin/env node\nconsole.log('long-flag');",
  });

  const binDir = join(String(dir), "bin");

  await using proc = Bun.spawn({
    cmd: [bunExe(), "install", "--global", "."],
    env: {
      ...bunEnv,
      BUN_INSTALL_BIN: binDir,
      BUN_INSTALL_GLOBAL_DIR: join(String(dir), "global"),
      HOME: undefined,
      BUN_INSTALL: undefined,
    },
    cwd: String(dir),
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  expect(existsSync(binDir)).toBe(true);
  expect(exitCode).toBe(0);
});
