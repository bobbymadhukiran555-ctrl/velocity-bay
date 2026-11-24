// Draws the weather: rain streaks around the camera, a cloud layer, lightning flashes.
import * as THREE from 'three';
import { fbm } from './logic/map.js';

function cloudTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      // Tileable noise: blend four offset samples.
      const u = i / S, v = j / S, n = (x, y) => fbm(x * 6, y * 6);
      const t = n(u, v) * (1 - u) * (1 - v) + n(u - 1, v) * u * (1 - v) + n(u, v - 1) * (1 - u) * v + n(u - 1, v - 1) * u * v;
      const a = Math.max(0, Math.min(1, (t + 0.15) * 1.8));
      img.data.set([255, 255, 255, a * 255], (j * S + i) * 4);
    }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createWeatherFx(scene) {
  // Rain: line segments recycled around the camera inside a 90 m box (positions computed in the shader).
  const N = 7000, BOX = 90, H = 45;
  const seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = Math.random() * BOX, y = Math.random() * H, z = Math.random() * BOX;
    seed.set([x, y, z, x, y, z], i * 6);
    end[i * 2] = 0; end[i * 2 + 1] = 1;
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(seed, 3));
  rg.setAttribute('end', new THREE.BufferAttribute(end, 1));
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, wind: { value: new THREE.Vector2() }, opacity: { value: 0 }, light: { value: 1 } },
    vertexShader: `attribute float end; uniform float time; uniform vec3 cam; uniform vec2 wind;
      void main() {
        vec3 vel = vec3(wind.x, -24.0, wind.y);
        vec3 p = position + vel * time;
        p.x = mod(p.x - cam.x, ${BOX}.0) - ${BOX / 2}.0 + cam.x;
        p.z = mod(p.z - cam.z, ${BOX}.0) - ${BOX / 2}.0 + cam.z;
        p.y = mod(p.y - cam.y, ${H}.0) - ${H / 2}.0 + cam.y;
        p -= vel * 0.035 * end;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform float opacity; uniform float light; void main() { gl_FragColor = vec4(vec3(0.75, 0.8, 0.88) * light, opacity); }`,
    transparent: true, depthWrite: false,
  });
  const rain = new THREE.LineSegments(rg, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: cloudTexture() }, offset: { value: new THREE.Vector2() }, cover: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) }, cam: { value: new THREE.Vector3() } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D map; uniform vec2 offset; uniform float cover; uniform vec3 tint; uniform vec3 cam; varying vec2 vUv; varying vec3 vW;
      void main() {
        float n = texture2D(map, vW.xz / 2200.0 + offset).a * 0.65 + texture2D(map, vW.xz / 900.0 - offset * 1.7).a * 0.35;
        float a = smoothstep(1.0 - cover, 1.15 - cover * 0.7, n + cover * 0.35);
        float fade = 1.0 - smoothstep(1800.0, 3600.0, distance(vW.xz, cam.xz));
        gl_FragColor = vec4(tint * (0.75 + 0.25 * n), a * fade * min(1.0, cover * 1.4));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(Math.PI / 2), cloudMat);
  clouds.position.y = 520;
  clouds.renderOrder = -1;
  scene.add(clouds);

  let flash = 0, nextBolt = 5, t = 0;
  return {
    get flash() { return flash; },
    // w = weather params; returns 'thunder' when a bolt strikes.
    update(dt, w, camera, daylight) {
      t += dt;
      let bolt = null;
      rainMat.uniforms.time.value = t % 1000;
      rainMat.uniforms.cam.value.copy(camera.position);
      rainMat.uniforms.wind.value.set(w.wind * 6, w.wind * 2);
      rainMat.uniforms.opacity.value = Math.min(0.55, w.rain * 0.6);
      rainMat.uniforms.light.value = 0.35 + 0.65 * Math.max(daylight, flash);
      rg.setDrawRange(0, Math.floor(N * 2 * Math.min(1, w.rain)));
      rain.visible = w.rain > 0.02;
      const o = cloudMat.uniforms.offset.value;
      o.x += dt * 0.004 * (0.3 + w.wind); o.y += dt * 0.0015 * (0.3 + w.wind);
      cloudMat.uniforms.cover.value = w.cloud;
      cloudMat.uniforms.cam.value.copy(camera.position);
      const g = 0.08 + 0.85 * daylight * (1 - 0.45 * w.cloud);
      cloudMat.uniforms.tint.value.setRGB(g * (1 + flash), g * (1 + flash), g * 1.04 * (1 + flash));
      clouds.position.x = camera.position.x; clouds.position.z = camera.position.z;
      flash = Math.max(0, flash - dt * 4);
      if (w.lightning > 0.5 && (nextBolt -= dt) <= 0) { flash = 1.4; nextBolt = 4 + Math.random() * 12; bolt = 'thunder'; }
      return bolt;
    },
  };
}
