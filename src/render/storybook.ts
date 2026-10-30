import * as THREE from 'three';

/**
 * The storybook look (in the manner of a hand-painted animated film): the garden lit like a
 * watercolour painting rather than a photograph. It's drawn into the scene's own shading (so
 * nothing swims or boils as the camera moves), plus a steady ink line where one thing stands in
 * front of another (see the final pass in post.ts).
 *
 * Here: the light. Every lit material shares three.js's Lambert shading, so changing that one
 * piece changes them all at once (before any of them is compiled):
 * - soft light, as on a bright cloudy day or by a window: it wraps far round each form, so
 *   petals and leaves keep gentle gradients that show their shape (the world turns the sun down
 *   and the sky up to match);
 * - shade that's coloured, never grey: cool lavender-blue from the sky, a touch warmer where it
 *   faces the ground (light bounced off the grass and earth).
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
  // Soft light (a bright cloudy day, a window): it wraps a long way round each form, so every
  // petal and leaf keeps a gentle gradient that shows its shape, and nothing goes hard.
  float wrap = saturate( ( dotNL + 0.55 ) / 1.55 );
  vec3 irradiance = wrap * wrap * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}

void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  // Shade is coloured: cool from the sky above, a little warmer from the ground below.
  // (Normals here are in view space: back to the world's, to know which way is up.)
  float up = ( vec4( geometryNormal, 0.0 ) * viewMatrix ).y * 0.5 + 0.5;
  vec3 tint = mix( vec3( 1.06, 1.0, 0.9 ), vec3( 0.86, 0.93, 1.16 ), up );
  // (Strong colours keep their own hue in the shade, deepened rather than cooled.)
  vec3 dc = material.diffuseColor;
  float chroma = max( dc.r, max( dc.g, dc.b ) ) - min( dc.r, min( dc.g, dc.b ) );
  tint = mix( tint, vec3( 1.0 ), smoothstep( 0.15, 0.5, chroma ) * 0.75 );
  reflectedLight.indirectDiffuse += irradiance * tint * 1.12 * BRDF_Lambert( material.diffuseColor );
}

#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert
`;
}
