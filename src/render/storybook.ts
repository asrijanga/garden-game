import * as THREE from 'three';

/**
 * The storybook look (in the manner of a hand-painted animated film): the garden lit like a
 * watercolour painting rather than a photograph. It's drawn into the scene's own shading (so
 * nothing swims or boils as the camera moves), plus a steady ink line where one thing stands in
 * front of another (see the final pass in post.ts).
 *
 * Here: the light. Every lit material shares three.js's Lambert shading, so changing that one
 * piece changes them all at once (before any of them is compiled):
 * - a soft but definite terminator: a face is either in the light or in the shade, with a short
 *   painted blend between, instead of a long photographic falloff;
 * - shade that's coloured, never grey: cool lavender-blue from the sky, a touch warmer where it
 *   faces the ground (light bounced off the grass and earth);
 * - a faint warm glow on edges turned to the sun, as painters catch the light.
 */
export function useStorybookLight() {
  THREE.ShaderChunk.lights_lambert_pars_fragment = /* glsl */ `
varying vec3 vViewPosition;

struct LambertMaterial {
  vec3 diffuseColor;
  float specularStrength;
};

void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = dot( geometryNormal, directLight.direction );
  // Painted light: mostly lit or mostly shaded, with a short soft blend between.
  float lit = smoothstep( 0.0, 0.16, dotNL );
  float paint = lit * 0.88 + 0.12 * saturate( dotNL );
  vec3 irradiance = paint * directLight.color;
  // A faint warm catch-light where the surface turns away from the eye but towards the sun
  // (only a touch: thin petals are often seen edge-on, and more would make them shine).
  float rim = pow( 1.0 - abs( dot( geometryNormal, geometryViewDir ) ), 4.0 ) * lit * saturate( dotNL );
  irradiance += directLight.color * rim * vec3( 0.06, 0.045, 0.02 );
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}

void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  // Shade is coloured: cool from the sky above, a little warmer from the ground below.
  // (Normals here are in view space: back to the world's, to know which way is up.)
  float up = ( vec4( geometryNormal, 0.0 ) * viewMatrix ).y * 0.5 + 0.5;
  vec3 tint = mix( vec3( 1.06, 1.0, 0.9 ), vec3( 0.86, 0.93, 1.16 ), up );
  reflectedLight.indirectDiffuse += irradiance * tint * 1.12 * BRDF_Lambert( material.diffuseColor );
}

#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert
`;
}

/** Which look the garden is drawn in: from `?look=` (remembered), else the painted default. */
export type Look = 'painted' | 'storybook';
