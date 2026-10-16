/* ============================================================
 * lopx-particles.js —— ReactBits <Particles /> 原生 JS 移植
 * 2026-10-12
 *
 * 来源：reactbits.dev Backgrounds / Particles（用户提供的完整源码）。
 * 移植方式：WebGL2 着色器与渲染管线 1:1 保留，仅做两处改造：
 *   1) 去掉 React 运行时（useRef/useEffect → 普通闭包）；
 *   2) 自管生命周期：只在存在 #lopx-home 的页面把容器挂到 <body>，
 *      pjax 切走即销毁（含 WEBGL_lose_context 释放），切回再重建。
 *
 * 为什么监听 pjax:complete 是安全的：
 *   本文件经 <script defer> 只在整页加载时执行一次（不在 .js-pjax
 *   重放列表里），所以监听器只会注册一次，不会累积 —— 与 memory 里
 *   「不要自己监听 pjax:complete」的告诫不冲突，那条针对的是会被
 *   pjax 反复重放的内联脚本。
 *
 * 挂载点选 <body> 直挂而非页面内：
 *   容器 position:fixed + z-index:-1，任何带 transform 的祖先
 *   （首页 section 的入场动画）都会把它变成 containing block；
 *   直挂 body 彻底避开，层叠位次：#web_bg(z:-999) → body::before(z:-1)
 *   → 本容器(z:-1，树序在后故在上) → 正常流内容。
 * ============================================================ */

(function () {
  'use strict';

  var MAX_BURSTS = 4;
  var DEPTH = 10;
  var FOCAL = 1 / Math.tan((7.5 * Math.PI) / 180);
  var NEAR = 0.1;
  var FAR = 100;
  var INTRO_SECONDS = 1.8;
  var BURST_SECONDS = 1.5;
  var BURST_SPEED = 520;
  var BURST_WIDTH = 46;
  var MAX_LINKED = 900;
  var MAX_LINES = 9000;

  var PARTICLE_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aPosition;
layout(location = 2) in vec4 aRandom;
layout(location = 3) in vec3 aColor;
uniform mat3 uRotation;
uniform vec3 uOffset;
uniform float uSpread;
uniform float uTime;
uniform float uCamera;
uniform float uAspect;
uniform vec2 uView;
uniform float uRatio;
uniform float uSize;
uniform float uRandomness;
uniform float uBlur;
uniform float uFocus;
uniform float uGlow;
uniform float uTwinkle;
uniform int uShape;
uniform int uDrift;
uniform float uTravel;
uniform vec4 uPointer;
uniform int uEffect;
uniform float uStrength;
uniform vec4 uBursts[${MAX_BURSTS}];
uniform int uBurstCount;
uniform float uReveal;
out vec2 vLocal;
out float vRadius;
out float vBlur;
out float vAlpha;
out float vHalo;
out float vSeed;
out vec3 vColor;

vec3 bob(vec4 r, float t) {
  return vec3(
    sin(t * r.z + 6.28 * r.w) * mix(0.1, 1.5, r.x),
    sin(t * r.y + 6.28 * r.x) * mix(0.1, 1.5, r.w),
    sin(t * r.w + 6.28 * r.y) * mix(0.1, 1.5, r.z)
  );
}

void main() {
  vec3 pos = aPosition * uSpread;
  pos.z *= ${DEPTH.toFixed(1)};
  vec3 wobble = bob(aRandom, uTime);
  vec3 world = uRotation * pos + uOffset + wobble;
  float edge = 1.0;
  if (uDrift == 1 || uDrift == 2) {
    float span = uSpread * 2.0 + 3.0;
    float k = mod(aRandom.w * span + uOffset.y + wobble.y + (uDrift == 1 ? uTravel : -uTravel), span);
    world.y = k - span * 0.5;
    edge = smoothstep(0.0, span * 0.12, k) * smoothstep(span, span * 0.88, k);
  } else if (uDrift == 3) {
    float span = uSpread * ${DEPTH.toFixed(1)} * 2.0 + 3.0;
    float k = mod(aRandom.y * span + uOffset.z + wobble.z + uTravel, span);
    world.z = k - span * 0.5;
    edge = smoothstep(0.0, span * 0.1, k);
  }
  vec3 view = world - vec3(0.0, 0.0, uCamera);
  float dist = length(view);
  float ahead = -view.z;
  if (ahead < ${NEAR.toFixed(2)} || ahead > ${FAR.toFixed(1)}) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  edge *= smoothstep(1.0, 4.0, ahead);
  vec2 ndc = vec2(view.x * ${FOCAL.toFixed(6)} / uAspect, view.y * ${FOCAL.toFixed(6)}) / ahead;
  vec2 screen = (ndc * 0.5 + 0.5) * uView;

  vec2 shift = vec2(0.0);
  float flash = 0.0;
  if (uEffect != 0 && uPointer.z > 0.001) {
    vec2 delta = screen - uPointer.xy;
    float reach = length(delta);
    float falloff = exp(-dot(delta, delta) / (uPointer.w * uPointer.w));
    vec2 away = reach > 0.001 ? delta / reach : vec2(0.0);
    shift += (uEffect == 1 ? away * uPointer.w * 0.5 : -delta * 0.6) * falloff * uStrength * uPointer.z;
  }
  for (int i = 0; i < ${MAX_BURSTS}; i++) {
    if (i >= uBurstCount) break;
    vec4 burst = uBursts[i];
    vec2 delta = screen - burst.xy;
    float reach = length(delta);
    float wave = exp(-pow((reach - burst.z * ${BURST_SPEED.toFixed(1)}) / ${BURST_WIDTH.toFixed(1)}, 2.0));
    vec2 away = reach > 0.001 ? delta / reach : vec2(0.0);
    float fade = (1.0 - burst.z) * (1.0 - burst.z) * burst.w;
    shift += away * wave * fade * 56.0 * smoothstep(0.0, 30.0, reach);
    flash += wave * fade;
  }
  screen += shift;

  float diameter = (uRandomness <= 0.0 ? uSize : uSize * (1.0 + uRandomness * (aRandom.x - 0.5)) / dist) * (1.0 + min(flash, 1.0) * 0.6);
  float device = diameter * uRatio;
  float radius = max(diameter, 1.0 / uRatio) * 0.5;
  float coverage = min(1.0, device * device);
  float blur = uBlur * max(uFocus - dist, 0.0) / max(dist, 1.0);
  float halo = uGlow > 0.0 ? radius * 2.5 + 2.0 : 0.0;
  float extent = radius * (uShape == 3 ? 1.6 : 1.0) + blur + halo + 1.5;

  float twinkle = 1.0 - uTwinkle * 0.6 * (0.5 + 0.5 * sin(uTime * (6.0 + aRandom.y * 14.0) + aRandom.w * 40.0));
  float far = smoothstep(${FAR.toFixed(1)}, ${(FAR * 0.9).toFixed(1)}, ahead);
  float focus = radius / (radius + blur);
  float reveal = clamp(uReveal * 1.6 - aRandom.z * 0.6, 0.0, 1.0);

  vLocal = aCorner * extent;
  vRadius = radius;
  vBlur = blur;
  vHalo = halo;
  vSeed = aRandom.y;
  vAlpha = min(1.0, coverage * twinkle * (1.0 + flash * 1.4)) * far * edge * max(focus, 0.35) * reveal * reveal;
  vColor = aColor;
  gl_Position = vec4((screen + aCorner * extent) / uView * 2.0 - 1.0, 0.0, 1.0);
}`;

  var PARTICLE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform int uShape;
uniform float uGlow;
uniform float uRatio;
uniform float uTime;
uniform float uSoft;
uniform float uShimmer;
uniform float uOpacity;
in vec2 vLocal;
in float vRadius;
in float vBlur;
in float vAlpha;
in float vHalo;
in float vSeed;
in vec3 vColor;
out vec4 outColor;

float ray(vec2 q, float aa) {
  float width = 0.14 * max(0.0, 1.0 - q.x);
  return (1.0 - smoothstep(width - aa, width + aa, q.y)) * step(q.x, 1.0);
}

void main() {
  float soft = vBlur + 0.7 / uRatio + vRadius * uSoft;
  float d = length(vLocal);
  float shape;
  if (uShape == 1) {
    float box = max(abs(vLocal.x), abs(vLocal.y));
    shape = 1.0 - smoothstep(vRadius * 0.86 - soft, vRadius * 0.86 + soft, box);
  } else if (uShape == 2) {
    float edge = max(vRadius * 0.22, 0.6 / uRatio);
    shape = 1.0 - smoothstep(edge - soft, edge + soft, abs(d - vRadius * 0.8));
  } else if (uShape == 3) {
    float reach = vRadius * 1.6;
    vec2 q = abs(vLocal) / max(reach, 0.0001);
    float aa = soft / max(reach, 0.0001);
    shape = max(max(ray(q, aa), ray(q.yx, aa)), 1.0 - smoothstep(vRadius * 0.32 - soft, vRadius * 0.32 + soft, d));
  } else {
    shape = 1.0 - smoothstep(vRadius - soft, vRadius + soft, d);
  }
  float halo = vHalo > 0.0 ? exp(-d / (vHalo * 0.35)) * uGlow * 0.4 : 0.0;
  float alpha = clamp(shape + halo * (1.0 - shape), 0.0, 1.0) * vAlpha * uOpacity * (1.0 - uSoft);
  if (alpha < 0.002) discard;
  vec2 uv = vLocal / max(vRadius * 2.0, 0.0001) + 0.5;
  vec3 color = clamp(vColor + uShimmer * 0.2 * sin(uv.yxx + uTime + vSeed * 6.28), 0.0, 1.0);
  outColor = vec4(color * alpha, alpha);
}`;

  var LINE_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aEnds;
layout(location = 2) in vec4 aTint;
uniform vec2 uView;
uniform float uRatio;
uniform float uWidth;
out float vAcross;
out float vHalf;
out vec4 vTint;

void main() {
  vec2 a = aEnds.xy;
  vec2 b = aEnds.zw;
  vec2 along = b - a;
  float span = max(length(along), 0.0001);
  vec2 normal = vec2(-along.y, along.x) / span;
  float reach = uWidth * 0.5 + 1.0 / uRatio;
  vec2 point = mix(a, b, aCorner.x * 0.5 + 0.5) + normal * aCorner.y * reach;
  vAcross = aCorner.y * reach;
  vHalf = uWidth * 0.5;
  vTint = aTint;
  gl_Position = vec4(point / uView * 2.0 - 1.0, 0.0, 1.0);
}`;

  var LINE_FRAGMENT = `#version 300 es
precision highp float;
uniform float uRatio;
uniform float uOpacity;
in float vAcross;
in float vHalf;
in vec4 vTint;
out vec4 outColor;

void main() {
  float edge = 0.6 / uRatio;
  float cover = 1.0 - smoothstep(vHalf - edge, vHalf + edge, abs(vAcross));
  float alpha = cover * vTint.a * uOpacity;
  outColor = vec4(vTint.rgb * alpha, alpha);
}`;

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  /* 数值兜底：ReactBits 原组件靠 defaultProps 兜底，移植后必须自己补 ——
     否则未传的数值 prop（如 depthOfField）会经 Math.max(0, undefined)
     变成 NaN，随 uniform 进着色器把顶点坐标整体污染成 NaN，
     GPU 静默丢弃全部图元且不报任何错误。 */
  function num(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  }

  function link(gl, vertexSource, fragmentSource) {
    var vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    var program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    var uniforms = {};
    var count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) {
      var info = gl.getActiveUniform(program, i);
      if (info) uniforms[info.name.replace('[0]', '')] = gl.getUniformLocation(program, info.name);
    }
    return { program: program, uniforms: uniforms };
  }

  function seeded(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
  function wrap(value, span) { return ((value % span) + span) % span; }

  /* ------------------------------------------------------------
   * create(host, canvas, opts) → instance | null
   * opts 与 ReactBits props 同名同义；本站的取值见下方 mount()。
   * ------------------------------------------------------------ */
  function create(host, canvas, opts) {
    var gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!host || !canvas || !gl) return null;

    var dots = link(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
    var lines = link(gl, LINE_VERTEX, LINE_FRAGMENT);
    if (!dots || !lines) return null;

    var corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    var positionBuffer = gl.createBuffer();
    var randomBuffer = gl.createBuffer();
    var colorBuffer = gl.createBuffer();
    var dotVao = gl.createVertexArray();
    gl.bindVertexArray(dotVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    function attach(buffer, location, width) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, width, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(location, 1);
    }
    attach(positionBuffer, 1, 3);
    attach(randomBuffer, 2, 4);
    attach(colorBuffer, 3, 3);

    var lineBuffer = gl.createBuffer();
    var lineData = new Float32Array(MAX_LINES * 8);
    var lineVao = gl.createVertexArray();
    gl.bindVertexArray(lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, lineData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    var probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

    var cache = new Map();
    function parse(value) {
      if (cache.has(value)) return cache.get(value);
      var rgb = [1, 1, 1];
      if (probe) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = '#ffffff';
        probe.fillStyle = value;
        probe.fillRect(0, 0, 1, 1);
        var data = probe.getImageData(0, 0, 1, 1).data;
        rgb = [data[0] / 255, data[1] / 255, data[2] / 255];
      }
      cache.set(value, rgb);
      return rgb;
    }

    var S = {
      count: clamp(Math.round(num(opts.particleCount, 200)), 1, 20000),
      spread: Math.max(0.1, num(opts.particleSpread, 10)),
      speed: num(opts.speed, 0.1),
      colors: (Array.isArray(opts.particleColors) ? opts.particleColors : [opts.particleColors]).filter(Boolean).map(String),
      mouse: opts.moveParticlesOnHover !== false,
      hoverFactor: num(opts.particleHoverFactor, 1),
      soft: !!opts.alphaParticles,
      size: Math.max(0, num(opts.particleBaseSize, 100)),
      randomness: Math.max(0, num(opts.sizeRandomness, 1)),
      camera: Math.max(1, num(opts.cameraDistance, 20)),
      rotate: !opts.disableRotation,
      dpr: num(opts.pixelRatio, 0),
      shape: { circle: 0, square: 1, ring: 2, sparkle: 3 }[opts.shape] || 0,
      glow: Math.max(0, num(opts.glow, 0.5)),
      twinkle: clamp(num(opts.twinkle, 0.3), 0, 1),
      depthOfField: Math.max(0, num(opts.depthOfField, 0)),
      connections: !!opts.connections,
      connectionDistance: Math.max(10, num(opts.connectionDistance, 110)),
      hoverEffect: { parallax: 0, repel: 1, attract: 2 }[opts.hoverEffect] || 0,
      hoverRadius: Math.max(20, num(opts.hoverRadius, 140)),
      clickBurst: !!opts.clickBurst,
      drift: { none: 0, up: 1, down: 2, forward: 3 }[opts.drift] || 0,
      driftSpeed: num(opts.driftSpeed, 1),
      variation: Math.max(0, Math.round(num(opts.variation, 0))),
      intro: opts.intro !== false,
      opacity: clamp(num(opts.opacity, 1), 0, 1),
      lightMode: !!opts.lightMode,
      paused: !!opts.paused
    };
    if (!S.colors.length) S.colors = ['#ffffff'];

    var view = { width: 1, height: 1, ratio: 1 };
    var pointer = { x: 0, y: 0, sx: 0, sy: 0, nx: 0, ny: 0, inside: false, active: 0 };
    var state = {
      clock: 0,
      spin: 0,
      travel: 0,
      offsetX: 0,
      offsetY: 0,
      reveal: S.intro && !reduce ? 0 : 1
    };
    var bursts = [];
    var packedBursts = new Float32Array(MAX_BURSTS * 4);
    var cloud = { key: '', count: 0, positions: new Float32Array(0), randoms: new Float32Array(0), colors: new Float32Array(0) };
    var screen = { x: new Float32Array(0), y: new Float32Array(0), ahead: new Float32Array(0), alpha: new Float32Array(0) };
    var raf = 0;
    var last = 0;
    var visible = true;
    var destroyed = false;

    /* 探针用调试句柄（生产无害：每帧仅一个计数器自增，getError/readPixels 均按需） */
    var dbg = { frames: 0, reveal: 0, clock: 0, wantSnap: false, snap: null };
    host.__lopxParticles = dbg;

    function rebuild() {
      var key = S.count + '|' + S.variation + '|' + S.colors.join(',') + '|' + (S.lightMode ? 1 : 0);
      if (key === cloud.key) return;
      cloud.key = key;
      var next = seeded(S.variation * 7919 + 1);
      var total = S.count;
      var positions = new Float32Array(total * 3);
      var randoms = new Float32Array(total * 4);
      var tints = new Float32Array(total * 3);
      var swatches = S.colors.map(function (value) { return S.lightMode ? ink(parse(value)) : parse(value); });
      for (var i = 0; i < total; i++) {
        var x, y, z, len;
        do {
          x = next() * 2 - 1;
          y = next() * 2 - 1;
          z = next() * 2 - 1;
          len = x * x + y * y + z * z;
        } while (len > 1 || len === 0);
        var r = Math.cbrt(next());
        positions.set([x * r, y * r, z * r], i * 3);
        randoms.set([next(), next(), next(), next()], i * 4);
        tints.set(swatches[Math.floor(next() * swatches.length)], i * 3);
      }
      cloud.count = total;
      cloud.positions = positions;
      cloud.randoms = randoms;
      cloud.colors = tints;
      var linked = Math.min(total, MAX_LINKED);
      screen.x = new Float32Array(linked);
      screen.y = new Float32Array(linked);
      screen.ahead = new Float32Array(linked);
      screen.alpha = new Float32Array(linked);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, randomBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, randoms, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, tints, gl.STATIC_DRAW);
    }

    /* lightMode 用的「墨水化」：亮底上把颜色压深。本站直接传目标色，用不到。 */
    function ink(rgb) {
      var linear = [Math.pow(rgb[0], 2.2), Math.pow(rgb[1], 2.2), Math.pow(rgb[2], 2.2)];
      var tone = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      var depth = Math.min(1, 0.06 / Math.max(tone, 0.0001));
      return linear.map(function (v) { return Math.pow(v * depth, 1 / 2.2); });
    }

    function rotationOf() {
      var elapsed = state.clock * 1000;
      var x = S.rotate ? Math.sin(elapsed * 0.0002) * 0.1 : 0;
      var y = S.rotate ? Math.cos(elapsed * 0.0005) * 0.15 : 0;
      var z = S.rotate ? state.spin : 0;
      var sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
      return [
        cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz,
        -cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz,
        sy * cx, -sx, cy * cx
      ];
    }

    function offsetOf() {
      return [state.offsetX, state.offsetY, -(1 - easeOut(state.reveal)) * 70];
    }

    function project(matrix) {
      var total = Math.min(cloud.count, MAX_LINKED);
      var off = offsetOf();
      var ox = off[0], oy = off[1], oz = off[2];
      var aspect = view.width / view.height;
      var time = state.clock;
      var radius = S.hoverRadius;
      var active = S.hoverEffect !== 0 ? pointer.active : 0;
      var spanY = S.spread * 2 + 3;
      var spanZ = S.spread * DEPTH * 2 + 3;
      for (var i = 0; i < total; i++) {
        var px = cloud.positions[i * 3] * S.spread;
        var py = cloud.positions[i * 3 + 1] * S.spread;
        var pz = cloud.positions[i * 3 + 2] * S.spread * DEPTH;
        var r0 = cloud.randoms[i * 4];
        var r1 = cloud.randoms[i * 4 + 1];
        var r2 = cloud.randoms[i * 4 + 2];
        var r3 = cloud.randoms[i * 4 + 3];
        var bobX = Math.sin(time * r2 + 6.28 * r3) * (0.1 + 1.4 * r0);
        var bobY = Math.sin(time * r1 + 6.28 * r0) * (0.1 + 1.4 * r3);
        var bobZ = Math.sin(time * r3 + 6.28 * r1) * (0.1 + 1.4 * r2);
        var wx = matrix[0] * px + matrix[3] * py + matrix[6] * pz + ox + bobX;
        var wy = matrix[1] * px + matrix[4] * py + matrix[7] * pz + oy + bobY;
        var wz = matrix[2] * px + matrix[5] * py + matrix[8] * pz + oz + bobZ;
        var edge = 1;
        if (S.drift === 1 || S.drift === 2) {
          var k1 = wrap(r3 * spanY + oy + bobY + (S.drift === 1 ? state.travel : -state.travel), spanY);
          wy = k1 - spanY / 2;
          var low = clamp(k1 / (spanY * 0.12), 0, 1);
          var high = clamp((spanY - k1) / (spanY * 0.12), 0, 1);
          edge = low * low * (3 - 2 * low) * high * high * (3 - 2 * high);
        } else if (S.drift === 3) {
          var k2 = wrap(r1 * spanZ + oz + bobZ + state.travel, spanZ);
          wz = k2 - spanZ / 2;
          var fresh = clamp(k2 / (spanZ * 0.1), 0, 1);
          edge = fresh * fresh * (3 - 2 * fresh);
        }
        var ahead = S.camera - wz;
        if (ahead < NEAR || ahead > FAR) {
          screen.alpha[i] = 0;
          continue;
        }
        var close = clamp((ahead - 1) / 3, 0, 1);
        edge *= close * close * (3 - 2 * close);
        var sx = ((wx * FOCAL) / aspect / ahead) * 0.5 * view.width + view.width / 2;
        var sy = ((wy * FOCAL) / ahead) * 0.5 * view.height + view.height / 2;
        var dx = 0;
        var dy = 0;
        if (active > 0.001) {
          var ex = sx - pointer.sx;
          var ey = sy - pointer.sy;
          var reach = Math.hypot(ex, ey);
          var falloff = Math.exp(-(ex * ex + ey * ey) / (radius * radius)) * S.hoverFactor * active;
          if (S.hoverEffect === 1 && reach > 0.001) {
            dx += (ex / reach) * radius * 0.5 * falloff;
            dy += (ey / reach) * radius * 0.5 * falloff;
          } else if (S.hoverEffect === 2) {
            dx -= ex * 0.6 * falloff;
            dy -= ey * 0.6 * falloff;
          }
        }
        for (var b = 0; b < bursts.length; b++) {
          var burst = bursts[b];
          var progress = burst.age / BURST_SECONDS;
          var bx = sx - burst.x;
          var by = sy - burst.y;
          var reachB = Math.hypot(bx, by);
          if (reachB < 0.001) continue;
          var wave = Math.exp(-Math.pow((reachB - progress * BURST_SPEED) / BURST_WIDTH, 2));
          var ramp = clamp(reachB / 30, 0, 1);
          var push = wave * (1 - progress) * (1 - progress) * 56 * ramp * ramp * (3 - 2 * ramp);
          dx += (bx / reachB) * push;
          dy += (by / reachB) * push;
        }
        sx += dx;
        sy += dy;
        var far = clamp((FAR - ahead) / (FAR - FAR * 0.9), 0, 1);
        var reveal = clamp(state.reveal * 1.6 - r2 * 0.6, 0, 1);
        screen.x[i] = sx;
        screen.y[i] = sy;
        screen.ahead[i] = ahead;
        screen.alpha[i] = far * far * (3 - 2 * far) * edge * reveal * reveal;
      }
      return total;
    }

    function buildLines(matrix) {
      var total = project(matrix);
      var reach = S.connectionDistance;
      var columns = Math.max(1, Math.ceil(view.width / reach) + 2);
      var buckets = new Map();
      for (var i = 0; i < total; i++) {
        if (screen.alpha[i] < 0.02) continue;
        var key = (Math.floor(screen.y[i] / reach) + 1) * columns + Math.floor(screen.x[i] / reach) + 1;
        var bucket = buckets.get(key);
        if (bucket) bucket.push(i);
        else buckets.set(key, [i]);
      }
      var lineCount = 0;
      var limit = reach * reach;
      var offsets = [0, 1, columns - 1, columns, columns + 1];
      var keys = Array.from(buckets.keys());
      outer:
      for (var k = 0; k < keys.length; k++) {
        var key2 = keys[k];
        var members = buckets.get(key2);
        for (var o = 0; o < offsets.length; o++) {
          var offset = offsets[o];
          var others = offset === 0 ? members : buckets.get(key2 + offset);
          if (!others) continue;
          for (var a = 0; a < members.length; a++) {
            var i2 = members[a];
            for (var b = offset === 0 ? a + 1 : 0; b < others.length; b++) {
              var j = others[b];
              var dx = screen.x[i2] - screen.x[j];
              var dy = screen.y[i2] - screen.y[j];
              var gap = dx * dx + dy * dy;
              if (gap > limit) continue;
              var layer = clamp(1 - Math.abs(screen.ahead[i2] - screen.ahead[j]) / 18, 0, 1);
              if (layer <= 0) continue;
              if (lineCount >= MAX_LINES) break outer;
              var fade = 1 - Math.sqrt(gap) / reach;
              var base = lineCount * 8;
              lineData[base] = screen.x[i2];
              lineData[base + 1] = screen.y[i2];
              lineData[base + 2] = screen.x[j];
              lineData[base + 3] = screen.y[j];
              lineData[base + 4] = (cloud.colors[i2 * 3] + cloud.colors[j * 3]) / 2;
              lineData[base + 5] = (cloud.colors[i2 * 3 + 1] + cloud.colors[j * 3 + 1]) / 2;
              lineData[base + 6] = (cloud.colors[i2 * 3 + 2] + cloud.colors[j * 3 + 2]) / 2;
              lineData[base + 7] = fade * fade * layer * 0.7 * Math.min(screen.alpha[i2], screen.alpha[j]);
              lineCount++;
            }
          }
        }
      }
      return lineCount;
    }

    function render() {
      if (destroyed) return;
      rebuild();
      var matrix = rotationOf();
      var off = offsetOf();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      if (S.connections) {
        var lineCount = buildLines(matrix);
        if (lineCount) {
          gl.useProgram(lines.program);
          gl.bindVertexArray(lineVao);
          gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData.subarray(0, lineCount * 8));
          gl.uniform2f(lines.uniforms.uView, view.width, view.height);
          gl.uniform1f(lines.uniforms.uRatio, view.ratio);
          gl.uniform1f(lines.uniforms.uWidth, 1);
          gl.uniform1f(lines.uniforms.uOpacity, S.opacity);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lineCount);
        }
      }

      var u = dots.uniforms;
      var burstCount = 0;
      for (var i = bursts.length - 1; i >= 0 && burstCount < MAX_BURSTS; i--) {
        packedBursts.set([bursts[i].x, bursts[i].y, bursts[i].age / BURST_SECONDS, 1], burstCount * 4);
        burstCount++;
      }
      gl.useProgram(dots.program);
      gl.bindVertexArray(dotVao);
      gl.uniformMatrix3fv(u.uRotation, false, matrix);
      gl.uniform3f(u.uOffset, off[0], off[1], off[2]);
      gl.uniform1f(u.uSpread, S.spread);
      gl.uniform1f(u.uTime, state.clock);
      gl.uniform1f(u.uCamera, S.camera);
      gl.uniform1f(u.uAspect, view.width / view.height);
      gl.uniform2f(u.uView, view.width, view.height);
      gl.uniform1f(u.uRatio, view.ratio);
      gl.uniform1f(u.uSize, S.size);
      gl.uniform1f(u.uRandomness, S.randomness);
      gl.uniform1f(u.uBlur, S.depthOfField * 14);
      gl.uniform1f(u.uFocus, S.camera + 14);
      gl.uniform1f(u.uGlow, S.lightMode ? S.glow * 0.3 : S.glow);
      gl.uniform1f(u.uTwinkle, S.twinkle);
      gl.uniform1i(u.uShape, S.shape);
      gl.uniform1i(u.uDrift, S.drift);
      gl.uniform1f(u.uTravel, state.travel);
      gl.uniform4f(u.uPointer, pointer.sx, pointer.sy, pointer.active, S.hoverRadius);
      gl.uniform1i(u.uEffect, S.hoverEffect);
      gl.uniform1f(u.uStrength, S.hoverFactor);
      gl.uniform4fv(u.uBursts, packedBursts);
      gl.uniform1i(u.uBurstCount, burstCount);
      gl.uniform1f(u.uReveal, state.reveal);
      gl.uniform1f(u.uSoft, S.soft ? 0.2 : 0);
      gl.uniform1f(u.uShimmer, S.lightMode ? 0 : 1);
      gl.uniform1f(u.uOpacity, S.opacity);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cloud.count);
      gl.bindVertexArray(null);
      dbg.frames++;
      dbg.reveal = state.reveal;
      dbg.clock = state.clock;
      if (dbg.wantSnap) {
        dbg.wantSnap = false;
        try {
          var px = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
          var lit = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, sumA = 0;
          for (var q = 0; q < px.length; q += 4) {
            if (px[q + 3] > 8) {
              lit++;
              var xx = (q / 4) % canvas.width;
              var yy = Math.floor(q / 4 / canvas.width);
              if (xx < minX) minX = xx;
              if (xx > maxX) maxX = xx;
              if (yy < minY) minY = yy;
              if (yy > maxY) maxY = yy;
              sumA += px[q + 3];
            }
          }
          dbg.snap = { lit: lit, cover: (100 * lit / (canvas.width * canvas.height)).toFixed(3) + '%', minX: minX, maxX: maxX, minY: minY, maxY: maxY, avgA: lit ? Math.round(sumA / lit) : 0, glErr: gl.getError() };
        } catch (e) { dbg.snap = 'err:' + e.message; }
      }
    }

    function frame(now) {
      raf = 0;
      if (destroyed || !visible || document.hidden) return;
      var dt = last ? clamp((now - last) / 1000, 0.0005, 0.05) : 1 / 60;
      last = now;
      if (S.paused) {
        state.reveal = 1;
        render();
        last = 0;
        return;
      }
      var motion = reduce ? 0 : 1;
      var pace = dt * S.speed * motion;
      state.clock += pace;
      if (S.rotate) state.spin += pace * 0.6;
      state.travel += dt * S.driftSpeed * motion * (S.drift === 3 ? 6 : 0.9);

      var engaged = S.mouse && pointer.inside && !reduce;
      var follow = 1 - Math.exp(-dt / 0.35);
      var parallax = engaged && S.hoverEffect === 0 ? S.hoverFactor : 0;
      state.offsetX += (-pointer.nx * parallax - state.offsetX) * follow;
      state.offsetY += (-pointer.ny * parallax - state.offsetY) * follow;
      pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt / 0.06));
      pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt / 0.06));
      pointer.active += ((engaged ? 1 : 0) - pointer.active) * (1 - Math.exp(-dt / 0.2));

      for (var i = bursts.length - 1; i >= 0; i--) {
        bursts[i].age += dt;
        if (bursts[i].age >= BURST_SECONDS) bursts.splice(i, 1);
      }

      if (!S.intro || reduce) state.reveal = 1;
      else if (state.reveal < 1) state.reveal = Math.min(1, state.reveal + dt / INTRO_SECONDS);

      render();
      raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (!raf && !destroyed && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    function resize() {
      if (destroyed) return;
      var width = Math.max(1, host.clientWidth);
      var height = Math.max(1, host.clientHeight);
      var ratio = Math.min(S.dpr || window.devicePixelRatio || 1, 2);
      view.width = width;
      view.height = height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      view.ratio = canvas.width / width;
      render();
      wake();
    }

    function locate(event) {
      var rect = host.getBoundingClientRect();
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;
      var wasInside = pointer.inside;
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      pointer.x = x;
      pointer.y = rect.height - y;
      pointer.nx = (x / Math.max(1, rect.width)) * 2 - 1;
      pointer.ny = -((y / Math.max(1, rect.height)) * 2 - 1);
      if (pointer.inside && !wasInside) {
        pointer.sx = pointer.x;
        pointer.sy = pointer.y;
      }
    }

    function onPointerMove(event) {
      locate(event);
      if (!S.paused) wake();
    }

    function onPointerDown(event) {
      locate(event);
      if (!pointer.inside || !S.clickBurst || S.paused || reduce) return;
      bursts.push({ x: pointer.x, y: pointer.y, age: 0 });
      if (bursts.length > MAX_BURSTS) bursts.shift();
      wake();
    }

    function onPointerUp(event) {
      if (event.pointerType !== 'mouse') pointer.inside = false;
    }

    function onPointerLeave() { pointer.inside = false; }

    function onVisibility() { last = 0; wake(); }

    var resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    var intersection = new IntersectionObserver(function (entries) {
      visible = entries.some(function (entry) { return entry.isIntersecting; });
      if (visible) { last = 0; wake(); }
    });
    intersection.observe(host);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    resize();

    return {
      destroy: function () {
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        resizeObserver.disconnect();
        intersection.disconnect();
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        document.documentElement.removeEventListener('pointerleave', onPointerLeave);
        document.removeEventListener('visibilitychange', onVisibility);
        gl.deleteProgram(dots.program);
        gl.deleteProgram(lines.program);
        [corners, positionBuffer, randomBuffer, colorBuffer, lineBuffer].forEach(function (buffer) { gl.deleteBuffer(buffer); });
        gl.deleteVertexArray(dotVao);
        gl.deleteVertexArray(lineVao);
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        if (host.parentNode) host.parentNode.removeChild(host);
      }
    };
  }

  /* ============================================================
   * 挂载控制器：仅在首页（存在 #lopx-home）时把容器挂到 <body>。
   * 整页加载与 pjax 切页都会触发 update()，幂等。
   * ============================================================ */

  var HOST_ID = 'lopx-bg-particles';
  var instance = null;

  function readColors(host) {
    var cs = getComputedStyle(host);
    var c1 = (cs.getPropertyValue('--lopx-particle-1') || '').trim() || 'rgba(47,107,143,0.95)';
    var c2 = (cs.getPropertyValue('--lopx-particle-2') || '').trim();
    return c2 ? [c1, c2] : [c1];
  }

  function mount() {
    if (instance) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('aria-hidden', 'true');
    var canvas = document.createElement('canvas');
    host.appendChild(canvas);
    document.body.appendChild(host);

    var colors = readColors(host);
    instance = create(host, canvas, {
      particleCount: 200,
      particleSpread: 10,
      speed: 0.1,
      particleColors: colors,
      particleBaseSize: 100,
      sizeRandomness: 1,
      cameraDistance: 20,
      shape: 'circle',
      glow: 0.5,
      twinkle: 0.3,
      moveParticlesOnHover: true,
      hoverEffect: 'parallax',
      particleHoverFactor: 1,
      hoverRadius: 140,
      /* 背景层是 pointer-events:none，点击落在正文链接上不该触发爆发，
         且爆发只对 canvas 自身有语义 → 关闭（官方默认 true）。 */
      clickBurst: false,
      connections: false,
      drift: 'none',
      intro: true,
      opacity: 1,
      lightMode: false
    });

    if (!instance) {
      /* WebGL2 不可用（老浏览器 / 硬件加速被禁）：容器已由 create 清场，
         这里兜底再删一次，保证不留空层。 */
      if (host.parentNode) host.parentNode.removeChild(host);
      return;
    }
    host.dataset.state = 'on';
  }

  function destroy() {
    if (!instance) return;
    instance.destroy();
    instance = null;
  }

  function update() {
    if (document.getElementById('lopx-home')) mount();
    else destroy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update);
  } else {
    update();
  }
  document.addEventListener('pjax:complete', update);
})();
