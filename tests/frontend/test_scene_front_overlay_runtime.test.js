const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadThemeRuntime() {
  const context = {
    window: {},
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
  };
  context.window = context;
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'js', 'app-theme-runtime.js'),
    'utf8'
  );
  vm.runInNewContext(source, context, { filename: 'app-theme-runtime.js' });
  return context.window.StarOfficeThemeRuntime;
}

function loadThemeConfig() {
  return JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'themes', 'liangshan', 'theme.json'),
      'utf8'
    )
  );
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('buildRuntimeTheme normalizes front overlays for mainScene and subscenes', () => {
  const runtime = loadThemeRuntime();
  const themeConfig = loadThemeConfig();

  const runtimeTheme = runtime.buildRuntimeTheme(themeConfig);

  assert.deepEqual(toPlain(runtimeTheme.mainScene.frontOverlay), {
    enabled: true,
    framesPath: 'props/main/front',
    filePattern: 'Front_{index}.png',
    startIndex: 1,
    zeroPad: 3,
    frameCount: 4,
    fps: 10,
    loop: true,
    depth: 5000,
  });
  assert.deepEqual(toPlain(runtimeTheme.subscenes.writing.frontOverlay), {
    enabled: true,
    framesPath: 'subscenes/wuyong_writing/front',
    filePattern: 'Front_{index}.png',
    startIndex: 1,
    zeroPad: 3,
    frameCount: 4,
    fps: 10,
    loop: true,
    depth: 5000,
  });
});

test('buildRuntimeTheme applies frontOverlay defaults for sparse overlay definitions', () => {
  const runtime = loadThemeRuntime();

  const runtimeTheme = runtime.buildRuntimeTheme({
    mainScene: {
      frontOverlay: {
        enabled: true,
        framesPath: 'props/main/front',
        frameCount: 4,
        fps: 10,
      },
    },
    subscenes: {
      writing: {
        actorId: 'wuyong',
        x: 840,
        y: 520,
        frontOverlay: {
          enabled: true,
          framesPath: 'subscenes/wuyong_writing/front',
          frameCount: 6,
          fps: 12,
        },
      },
    },
  });

  assert.deepEqual(toPlain(runtimeTheme.mainScene.frontOverlay), {
    enabled: true,
    framesPath: 'props/main/front',
    filePattern: 'Front_{index}.png',
    startIndex: 1,
    zeroPad: 3,
    frameCount: 4,
    fps: 10,
    loop: true,
    depth: 5000,
  });
  assert.deepEqual(toPlain(runtimeTheme.subscenes.writing.frontOverlay), {
    enabled: true,
    framesPath: 'subscenes/wuyong_writing/front',
    filePattern: 'Front_{index}.png',
    startIndex: 1,
    zeroPad: 3,
    frameCount: 6,
    fps: 12,
    loop: true,
    depth: 5000,
  });
});

test('buildRuntimeTheme drops invalid frontOverlay definitions instead of leaking partial config', () => {
  const runtime = loadThemeRuntime();

  const runtimeTheme = runtime.buildRuntimeTheme({
    mainScene: {
      frontOverlay: {
        enabled: true,
        framesPath: '',
        filePattern: 'Front_{index}.png',
        frameCount: 0,
        fps: 0,
      },
    },
    subscenes: {
      writing: {
        actorId: 'wuyong',
        x: 840,
        y: 520,
        frontOverlay: {
          enabled: true,
          framesPath: 'subscenes/wuyong_writing/front',
          frameCount: 0,
          fps: 10,
        },
      },
    },
  });

  assert.equal(runtimeTheme.mainScene.frontOverlay, null);
  assert.equal(runtimeTheme.subscenes.writing.frontOverlay, null);
});

test('buildRuntimeTheme drops frontOverlay definitions with invalid explicit startIndex or zeroPad', () => {
  const runtime = loadThemeRuntime();

  const runtimeTheme = runtime.buildRuntimeTheme({
    mainScene: {
      frontOverlay: {
        enabled: true,
        framesPath: 'props/main/front',
        filePattern: 'Front_{index}.png',
        startIndex: 0,
        zeroPad: 3,
        frameCount: 4,
        fps: 10,
      },
    },
    subscenes: {
      writing: {
        actorId: 'wuyong',
        x: 840,
        y: 520,
        frontOverlay: {
          enabled: true,
          framesPath: 'subscenes/wuyong_writing/front',
          filePattern: 'Front_{index}.png',
          startIndex: 1,
          zeroPad: 0,
          frameCount: 4,
          fps: 10,
        },
      },
    },
  });

  assert.equal(runtimeTheme.mainScene.frontOverlay, null);
  assert.equal(runtimeTheme.subscenes.writing.frontOverlay, null);
});

test('buildRuntimeTheme drops frontOverlay definitions whose filePattern omits the {index} token', () => {
  const runtime = loadThemeRuntime();

  const runtimeTheme = runtime.buildRuntimeTheme({
    mainScene: {
      frontOverlay: {
        enabled: true,
        framesPath: 'props/main/front',
        filePattern: 'Front.png',
        frameCount: 4,
        fps: 10,
      },
    },
    subscenes: {
      writing: {
        actorId: 'wuyong',
        x: 840,
        y: 520,
        frontOverlay: {
          enabled: true,
          framesPath: 'subscenes/wuyong_writing/front',
          filePattern: 'Overlay.png',
          frameCount: 4,
          fps: 10,
        },
      },
    },
  });

  assert.equal(runtimeTheme.mainScene.frontOverlay, null);
  assert.equal(runtimeTheme.subscenes.writing.frontOverlay, null);
});

test('buildRuntimeTheme drops frontOverlay definitions with fractional explicit numeric fields', () => {
  const runtime = loadThemeRuntime();

  const runtimeTheme = runtime.buildRuntimeTheme({
    mainScene: {
      frontOverlay: {
        enabled: true,
        framesPath: 'props/main/front',
        filePattern: 'Front_{index}.png',
        startIndex: 1.5,
        zeroPad: 3.5,
        frameCount: 4,
        fps: 10,
      },
    },
    subscenes: {
      writing: {
        actorId: 'wuyong',
        x: 840,
        y: 520,
        frontOverlay: {
          enabled: true,
          framesPath: 'subscenes/wuyong_writing/front',
          filePattern: 'Front_{index}.png',
          startIndex: 1,
          zeroPad: 3,
          frameCount: 4.5,
          fps: 10.5,
        },
      },
    },
  });

  assert.equal(runtimeTheme.mainScene.frontOverlay, null);
  assert.equal(runtimeTheme.subscenes.writing.frontOverlay, null);
});

test('buildRuntimeTheme trims frontOverlay filePattern before returning runtime config', () => {
  const runtime = loadThemeRuntime();

  const runtimeTheme = runtime.buildRuntimeTheme({
    mainScene: {
      frontOverlay: {
        enabled: true,
        framesPath: 'props/main/front',
        filePattern: '  Front_{index}.png  ',
        frameCount: 4,
        fps: 10,
      },
    },
  });

  assert.deepEqual(toPlain(runtimeTheme.mainScene.frontOverlay), {
    enabled: true,
    framesPath: 'props/main/front',
    filePattern: 'Front_{index}.png',
    startIndex: 1,
    zeroPad: 3,
    frameCount: 4,
    fps: 10,
    loop: true,
    depth: 5000,
  });
});

test('buildRuntimeTheme drops frontOverlay definitions with boolean explicit numeric fields', () => {
  const runtime = loadThemeRuntime();

  const runtimeTheme = runtime.buildRuntimeTheme({
    mainScene: {
      frontOverlay: {
        enabled: true,
        framesPath: 'props/main/front',
        filePattern: 'Front_{index}.png',
        startIndex: true,
        zeroPad: 3,
        frameCount: 4,
        fps: 10,
      },
    },
    subscenes: {
      writing: {
        actorId: 'wuyong',
        x: 840,
        y: 520,
        frontOverlay: {
          enabled: true,
          framesPath: 'subscenes/wuyong_writing/front',
          filePattern: 'Front_{index}.png',
          startIndex: 1,
          zeroPad: false,
          frameCount: true,
          fps: false,
        },
      },
    },
  });

  assert.equal(runtimeTheme.mainScene.frontOverlay, null);
  assert.equal(runtimeTheme.subscenes.writing.frontOverlay, null);
});

test('buildRuntimeTheme drops frontOverlay definitions with explicit non-string filePattern', () => {
  const runtime = loadThemeRuntime();

  const runtimeTheme = runtime.buildRuntimeTheme({
    mainScene: {
      frontOverlay: {
        enabled: true,
        framesPath: 'props/main/front',
        filePattern: true,
        frameCount: 4,
        fps: 10,
      },
    },
    subscenes: {
      writing: {
        actorId: 'wuyong',
        x: 840,
        y: 520,
        frontOverlay: {
          enabled: true,
          framesPath: 'subscenes/wuyong_writing/front',
          filePattern: 123,
          frameCount: 4,
          fps: 10,
        },
      },
    },
  });

  assert.equal(runtimeTheme.mainScene.frontOverlay, null);
  assert.equal(runtimeTheme.subscenes.writing.frontOverlay, null);
});
