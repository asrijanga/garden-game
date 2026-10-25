import * as THREE from 'three';

/**
 * A soft, glowing ring on the lawn under the player's finger. It eases after the finger,
 * and blooms outward into a gentle ripple when the finger lifts.
 */
export class TouchMarker {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    uColor: { value: new THREE.Color('#fff2cf') },
    uOpacity: { value: 0 },
    uRipple: { value: 0 },
    uTime: { value: 0 },
  };
  private readonly target = new THREE.Vector3();
  private active = false;
  private ripple = 1;
  private radius = 0.9;

  constructor() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity, uRipple, uTime;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float ringR = mix(0.62, 0.98, uRipple);
          float ring = smoothstep(0.16, 0.0, abs(d - ringR));
          float fill = smoothstep(0.75, 0.0, d) * 0.1 * (1.0 - uRipple);
          float breathe = 0.9 + 0.1 * sin(uTime * 4.0);
          float a = (ring * breathe + fill) * uOpacity * (1.0 - uRipple * 0.9);
          gl_FragColor = vec4(uColor * 1.2, a);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mat);
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setColor(hex: string) {
    this.uniforms.uColor.value.set(hex);
  }

  down(p: THREE.Vector3) {
    this.active = true;
    this.ripple = 0;
    this.target.copy(p);
    this.mesh.position.copy(p);
    this.mesh.visible = true;
  }

  move(p: THREE.Vector3) {
    this.target.copy(p);
  }

  up() {
    this.active = false;
  }

  /** @param viewDistance camera distance, so the ring stays fingertip-sized at any zoom */
  update(dt: number, viewDistance: number) {
    if (!this.mesh.visible) return;
    this.radius = viewDistance * 0.042;
    this.uniforms.uTime.value += dt;
    this.mesh.position.lerp(this.target, 1 - Math.exp(-dt * 18));
    this.mesh.position.y = this.target.y + 0.04;
    const o = this.uniforms.uOpacity;
    if (this.active) {
      o.value += (1 - o.value) * Math.min(1, dt * 10);
    } else {
      this.ripple = Math.min(1, this.ripple + dt * 1.6);
      o.value = Math.max(0, o.value - dt * 1.4);
      if (o.value <= 0) this.mesh.visible = false;
    }
    this.uniforms.uRipple.value = this.active ? 0 : this.ripple;
    const s = this.radius * (1 + (this.active ? 0 : this.ripple * 0.6));
    this.mesh.scale.set(s, 1, s);
  }
}
