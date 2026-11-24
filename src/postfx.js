// Post-processing: soft ambient shadows (GTAO, high only), bloom on lights, speed blur, depth of field in photo mode.
// Returns null on 'low' so phones keep the plain renderer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SpeedBlur = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){ vec2 d = (vUv - 0.5) * strength; vec4 c = vec4(0.0);
      for (int i = 0; i < 6; i++) c += texture2D(tDiffuse, vUv - d * float(i) / 6.0); gl_FragColor = c / 6.0; }`,
};

export function createPostFx(renderer, scene, camera, quality) {
  if (quality === 'low') return null;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const ao = quality === 'high' ? new GTAOPass(scene, camera, size.x, size.y) : null;
  if (ao) { ao.output = GTAOPass.OUTPUT.Default; ao.blendIntensity = 0.9; composer.addPass(ao); }
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.5, 2.3); // threshold above sunlit paint so only lights and the sun glow
  composer.addPass(bloom);
  const blur = new ShaderPass(SpeedBlur); blur.enabled = false; composer.addPass(blur);
  const dof = quality === 'high' ? new BokehPass(scene, camera, { focus: 8, aperture: 0.0004, maxblur: 0.012 }) : null;
  if (dof) { dof.enabled = false; composer.addPass(dof); }
  composer.addPass(new OutputPass()); // tone mapping + colour space
  return {
    composer,
    render() { composer.render(); },
    setSize(w, h) { composer.setSize(w, h); },
    // speed: 0..1 radial blur; photoFocus: distance in metres to blur around, or 0 for off.
    set(speed, photoFocus = 0) {
      blur.enabled = speed > 0.01; blur.uniforms.strength.value = speed * 0.07;
      if (dof) { dof.enabled = photoFocus > 0; if (photoFocus > 0) dof.uniforms.focus.value = photoFocus; }
    },
  };
}
